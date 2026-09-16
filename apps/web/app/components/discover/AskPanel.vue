<script setup lang="ts">
import { toContentLanguage } from '@revy/shared/constants'
import type { DiscoveryAnswer, DiscoveryExchange } from '@revy/shared/types'

/**
 * "What are you in the mood for?" (SPEC 40).
 *
 * An overlay rather than a screen, and that is the product decision rather
 * than a layout one. Nobody navigates to not knowing what to watch -- it is a
 * thought you have halfway down a page of things you have already rejected.
 * A route would make you leave that page to admit it.
 *
 * Everything the model writes is rendered as text. Never `v-html`, on any
 * branch: the sentence that produced it was typed by a stranger, and the model
 * is asked to ignore instructions inside it but is not a security boundary.
 * Escaping is.
 */
const open = defineModel<boolean>({ default: false })

const { t, locale } = useI18n()
const api = useApi()

const term = ref('')
const pending = ref(false)
const answer = ref<DiscoveryAnswer | null>(null)
const failure = ref<string | null>(null)
const field = ref<HTMLTextAreaElement | null>(null)

/*
 * The conversation so far (SPEC 40).
 *
 * Held here and resent with every turn rather than stored server-side. Most of
 * these are abandoned halfway -- somebody asks, reads the question, and closes
 * the panel -- and a transcript that lives on the client leaves nothing behind
 * when that happens.
 *
 * `term` stays as the original request for the whole conversation. Each answer
 * narrows it rather than replacing it, which is why the field is hidden once
 * the first question comes back: editing the sentence underneath a question
 * about it would leave the two disagreeing.
 */
const exchanges = ref<DiscoveryExchange[]>([])

/** The question on screen, if the model asked one instead of answering. */
const question = computed(() => answer.value?.question ?? null)

/** True once there are picks to read: the end of the conversation. */
const hasResults = computed(() => (answer.value?.results.length ?? 0) > 0)

/** Free-text reply to a question, for an answer the chips do not cover. */
const reply = ref('')

/**
 * Openers, and they are examples rather than buttons that run.
 *
 * Tapping one fills the field instead of submitting it. The hard part of this
 * feature is believing you can type a whole sentence at it, and a chip that
 * fires immediately teaches the opposite -- that there is a small set of
 * blessed questions and you should pick one.
 */
const OPENERS = computed(() => [
  t('ask.opener1'),
  t('ask.opener2'),
  t('ask.opener3'),
  t('ask.opener4'),
])

/*
 * What the wait says, as it goes on.
 *
 * The answer takes ten seconds or so -- long enough that one static line and a
 * dot reads as a hang. These are not reassurance: each one is true at roughly
 * the moment it appears, and together they describe a thing being done rather
 * than a thing being awaited. The last is deliberately the vaguest, because by
 * then the honest statement is that it is taking longer than usual.
 */
const WAITING = computed(() => [
  t('ask.waiting1'),
  t('ask.waiting2'),
  t('ask.waiting3'),
  t('ask.waiting4'),
])

const waitingStep = ref(0)
let waitingTimer: ReturnType<typeof setInterval> | null = null

function startWaiting() {
  waitingStep.value = 0
  stopWaiting()
  waitingTimer = setInterval(() => {
    if (waitingStep.value < WAITING.value.length - 1) waitingStep.value += 1
  }, 3500)
}

function stopWaiting() {
  if (waitingTimer) clearInterval(waitingTimer)
  waitingTimer = null
}

onBeforeUnmount(stopWaiting)

async function submit(options: { decideNow?: boolean } = {}) {
  const value = term.value.trim()
  if (value.length < 3 || pending.value) return

  pending.value = true
  failure.value = null
  startWaiting()

  try {
    const { answer: result } = await api.discover.ask({
      request: value,
      // The reader's language, so the answer comes back in it. Narrowed to
      // the set we publish in -- the locale is already one of them, but the
      // schema is what guarantees that to the server.
      language: toContentLanguage(locale.value),
      answers: exchanges.value,
      ...(options.decideNow ? { decideNow: true } : {}),
    })
    answer.value = result
    reply.value = ''
  } catch (error) {
    /*
     * The message is shown as given.
     *
     * Every one of them was written for this case -- busy, unreachable, over
     * your limit for the hour -- and each implies a different next move.
     * Replacing them with one generic line is what turns "try again in a
     * moment" into "this is broken".
     */
    failure.value = error instanceof ApiError ? error.message : t('ask.failed')
  } finally {
    pending.value = false
    stopWaiting()
  }
}

function reset() {
  term.value = ''
  answer.value = null
  failure.value = null
  exchanges.value = []
  reply.value = ''
  nextTick(() => field.value?.focus())
}

/**
 * Answers the question on screen and asks for the next turn.
 *
 * The question text is recorded alongside the answer because the model needs
 * both to carry on -- "not too heavy" means nothing without the question it
 * replies to.
 */
function answerQuestion(value: string, skipped = false) {
  const current = question.value
  const text = value.trim()
  if (!current || !text || pending.value) return

  exchanges.value = [
    ...exchanges.value,
    {
      question: current.question,
      answer: text,
      // Echoed back so the server can close this axis. Without it the model
      // asks about tone again one turn after being told the tone.
      ...(current.dimension ? { dimension: current.dimension } : {}),
      ...(skipped ? { skipped: true } : {}),
    },
  ]
  void submit()
}

/**
 * "Just show me something."
 *
 * An escape from the conversation at any point, and it is not optional: a
 * feature that keeps asking until it is satisfied is one people learn to
 * avoid. The server is told to answer this turn whatever it would rather do.
 */
function decideNow() {
  if (pending.value) return
  void submit({ decideNow: true })
}

function close() {
  open.value = false
}

/*
 * Enter sends, shift-Enter breaks the line.
 *
 * A textarea rather than an input because requests run to two lines and a
 * single-line field that scrolls sideways hides the beginning of what you
 * wrote -- exactly when you are trying to read it back.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

watch(open, (value) => {
  if (value) {
    nextTick(() => field.value?.focus())
  } else {
    // Cleared on close rather than on open, so reopening is instant and the
    // frame you see first is never the previous answer.
    term.value = ''
    answer.value = null
    failure.value = null
    exchanges.value = []
    reply.value = ''
  }
})

/*
 * Escape closes, and the page behind stops scrolling.
 *
 * Bound to the document while open only. A permanently bound key handler on a
 * component that renders on every dashboard page is how Escape quietly stops
 * working for a dialog somebody adds later.
 */
onMounted(() => {
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && open.value) close()
  }
  document.addEventListener('keydown', onKey)
  onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
})

watchEffect(() => {
  if (!import.meta.client) return
  document.body.style.overflow = open.value ? 'hidden' : ''
})

onBeforeUnmount(() => {
  if (import.meta.client) document.body.style.overflow = ''
})

const hasAnswer = computed(() => answer.value !== null)
</script>

<template>
  <Teleport to="body">
    <Transition name="ask">
      <div v-if="open" class="ask" role="dialog" aria-modal="true" :aria-label="$t('ask.dialogLabel')">
        <button type="button" class="ask__scrim" :aria-label="$t('ask.close')" @click="close" />

        <div class="ask__panel" :class="{ 'ask__panel--answered': hasAnswer }">
          <button type="button" class="ask__close" :aria-label="$t('ask.close')" @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <header class="ask__head">
            <span class="ask__orb" aria-hidden="true" />
            <h2 class="ask__title">{{ $t("ask.title") }}</h2>
            <p class="ask__lede">{{ $t('ask.lede') }}</p>
          </header>

          <!-- The composer disappears once a question is on screen: editing
               the original sentence underneath a question about it would leave
               the two disagreeing, and there is no good answer to which wins. -->
          <form v-if="!question && !hasResults" class="ask__form" @submit.prevent="submit()">
            <textarea
              ref="field"
              v-model="term"
              class="ask__input"
              rows="2"
              maxlength="300"
              :placeholder="$t('ask.placeholder')"
              :disabled="pending"
              @keydown="onKeydown"
            />

            <UiAppButton
              type="submit"
              variant="primary"
              :loading="pending"
              :disabled="term.trim().length < 3"
            >
              {{ pending ? $t("ask.thinking") : $t("ask.submit") }}
            </UiAppButton>
          </form>

          <ul v-if="!hasAnswer && !pending" class="openers">
            <li v-for="opener in OPENERS" :key="opener">
              <button type="button" class="openers__chip" @click="term = opener; field?.focus()">
                {{ opener }}
              </button>
            </li>
          </ul>

          <!-- Reading, not spinning. The call takes ten seconds or so, and a
               spinner makes that feel like a stall; naming what is happening,
               and changing what it says as it goes, makes it feel like work.
               `aria-live` so it is narrated rather than silently redrawn. -->
          <p v-if="pending" class="ask__working" aria-live="polite">
            <span class="ask__pulse" aria-hidden="true" />
            <Transition name="waiting" mode="out-in">
              <span :key="waitingStep">{{ WAITING[waitingStep] }}</span>
            </Transition>
          </p>

          <p v-if="failure" class="ask__error" role="alert">{{ failure }}</p>

          <!-- ---------------------------------------------------------- *
               Narrowing it down (SPEC 40)
               ---------------------------------------------------------- -->
          <div v-if="question && !pending" class="refine">
            <p class="refine__asked">
              <span class="refine__label">{{ $t('ask.understood') }}</span>
              {{ answer?.understood }}
            </p>

            <!-- Each answered question stays visible. Without the trail the
                 reader cannot tell what they have already ruled out, and the
                 chips start looking like the same question twice. -->
            <ol v-if="exchanges.length" class="refine__trail">
              <li v-for="(exchange, index) in exchanges" :key="index">
                <span class="refine__trail-q">{{ exchange.question }}</span>
                <span class="refine__trail-a">{{ exchange.answer }}</span>
              </li>
            </ol>

            <p class="refine__question">{{ question.question }}</p>

            <ul class="refine__options">
              <li v-for="option in question.options" :key="option">
                <button type="button" class="refine__chip" @click="answerQuestion(option)">
                  {{ option }}
                </button>
              </li>
              <!-- Added by the interface, never by the model: "doesn't matter"
                   is an answer that must always be available, and a model
                   asked to include it will sometimes forget. -->
              <li>
                <button
                  type="button"
                  class="refine__chip refine__chip--skip"
                  @click="answerQuestion($t('ask.noPreference'), true)"
                >
                  {{ $t('ask.noPreference') }}
                </button>
              </li>
            </ul>

            <form class="refine__own" @submit.prevent="answerQuestion(reply)">
              <input
                v-model="reply"
                type="text"
                class="refine__input"
                maxlength="120"
                :placeholder="$t('ask.replyPlaceholder')"
                :aria-label="question.question"
              />
              <UiAppButton type="submit" variant="secondary" size="sm" :disabled="!reply.trim()">
                {{ $t('ask.send') }}
              </UiAppButton>
            </form>

            <button type="button" class="refine__skip-all" @click="decideNow">
              {{ $t('ask.decideNow') }}
            </button>
          </div>

          <div v-if="answer && !question" class="result">
            <p class="result__understood">
              <span>{{ $t("ask.understood") }}</span>
              {{ answer.understood }}
            </p>

            <p v-if="answer.nothingFits" class="result__gap">{{ answer.nothingFits }}</p>

            <ul v-if="answer.results.length" class="result__list">
              <li
                v-for="(item, index) in answer.results"
                :key="item.id"
                class="pick"
                :style="{ '--i': index }"
              >
                <MediaQuickLink :media-id="item.id" :title="item.title" :cover-image-url="item.coverImageUrl" class="pick__link" @click="close">
                  <UiMediaPoster
                    :src="item.coverImageUrl"
                    :title="item.title"
                    :media-type="item.mediaType"
                    class="pick__art"
                  />

                  <div class="pick__body">
                    <div class="pick__meta">
                      <UiMediaTypeTag :media-type="item.mediaType" size="sm" />
                      <span v-if="item.releaseYear" class="pick__year">{{ item.releaseYear }}</span>
                    </div>

                    <p class="pick__title">{{ item.title }}</p>
                    <p class="pick__because">{{ item.because }}</p>

                    <p class="pick__scores">
                      <span v-if="item.ratingAverage !== null">
                        <strong>{{ item.ratingAverage.toFixed(1) }}</strong> on RENA
                        <span class="pick__dim">&middot; {{ item.ratingCount }} ratings</span>
                      </span>
                      <span v-else-if="item.externalRating">
                        <strong>{{ item.externalRating.score.toFixed(1) }}</strong> on
                        {{ item.externalRating.source }}
                      </span>
                      <span v-else class="pick__dim">{{ $t('ask.notRated') }}</span>
                    </p>
                  </div>
                </MediaQuickLink>
              </li>
            </ul>

            <button type="button" class="result__again" @click="reset">{{ $t("ask.again") }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 200);
  display: grid;
  place-items: start center;
  /* Clear of the status bar and home indicator once a long answer scrolls
     the panel to the top of a phone screen. */
  padding: calc(var(--space-6) + env(safe-area-inset-top, 0px)) var(--space-4)
    calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ask__scrim {
  position: fixed;
  inset: 0;
  border: 0;
  background: rgb(4 4 6 / 0.72);
  backdrop-filter: blur(18px) saturate(0.8);
  cursor: var(--cursor-arrow);
}

.ask__panel {
  position: relative;
  width: min(54rem, 100%);
  margin-block: auto;
  padding: var(--space-8) var(--space-6) var(--space-6);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl, 1.25rem);
  background:
    radial-gradient(120% 70% at 50% 0%, rgb(200 16 46 / 0.14), transparent 62%),
    var(--surface-raised, #111114);
  box-shadow: 0 2.5rem 6rem rgb(0 0 0 / 0.6);
  transition: max-width var(--dur-slow, 480ms) var(--ease-out);
}

/* The panel grows once there is something to read in it, rather than opening
   at the width the answer will eventually need and looking empty. */
.ask__panel--answered {
  width: min(68rem, 100%);
}

.ask__close {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  color: var(--text-tertiary);
  transition: color var(--dur-fast, 160ms), background var(--dur-fast, 160ms);
}

.ask__close:hover {
  background: var(--surface-sunken, rgb(255 255 255 / 0.06));
  color: var(--text-primary);
}

.ask__close svg {
  width: 1.1rem;
  height: 1.1rem;
}

.ask__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}

/* The wordmark's dot, lit and breathing. The same object the sidebar promo
   carries, so the overlay reads as that card having opened. */
.ask__orb {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-full);
  background: radial-gradient(circle at 35% 30%, #ff8095, var(--accent) 55%, #5e0816);
  box-shadow: 0 0 2rem rgb(200 16 46 / 0.6);
  animation: orb-breathe 4s var(--ease-inout, ease-in-out) infinite;
}

@keyframes orb-breathe {
  0%, 100% { transform: scale(1); box-shadow: 0 0 2rem rgb(200 16 46 / 0.6); }
  50% { transform: scale(1.06); box-shadow: 0 0 3rem rgb(200 16 46 / 0.75); }
}

.ask__title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.ask__lede {
  max-width: 32rem;
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-secondary);
}

.ask__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-6);
}

.ask__input {
  width: 100%;
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-sunken, rgb(0 0 0 / 0.35));
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-base);
  line-height: 1.5;
  resize: none;
  transition: border-color var(--dur-fast, 160ms), box-shadow var(--dur-fast, 160ms);
}

.ask__input::placeholder {
  color: var(--text-tertiary);
}

.ask__input:focus {
  outline: none;
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.openers {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: center;
  margin: var(--space-5) 0 0;
  padding: 0;
  list-style: none;
}

.openers__chip {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  transition: border-color var(--dur-fast, 160ms), color var(--dur-fast, 160ms),
    transform var(--dur-fast, 160ms);
}

.openers__chip:hover {
  border-color: var(--accent-border);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.ask__working {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin: var(--space-6) 0 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.ask__pulse {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--radius-full);
  background: var(--accent);
  animation: pulse 1.2s var(--ease-inout, ease-in-out) infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.15); }
}

/* One line replaces another rather than the text mutating in place, which
   would read as a glitch at this size. */
.waiting-enter-active,
.waiting-leave-active {
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}

.waiting-enter-from {
  opacity: 0;
  transform: translateY(0.4rem);
}

.waiting-leave-to {
  opacity: 0;
  transform: translateY(-0.4rem);
}

.ask__error {
  margin: var(--space-5) 0 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--accent-text);
}

/* ------------------------------------------------------------------ *
 * Narrowing it down
 * ------------------------------------------------------------------ */

.refine {
  margin-top: var(--space-7);
}

.refine__asked {
  margin: 0 0 var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.refine__label {
  margin-right: var(--space-2);
  color: var(--text-tertiary);
}

.refine__trail {
  margin: 0 0 var(--space-5);
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-left: 2px solid var(--border-subtle);
  padding-left: var(--space-4);
}

.refine__trail-q {
  display: block;
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

.refine__trail-a {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.refine__question {
  margin: 0 0 var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  line-height: var(--leading-snug);
}

.refine__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.refine__chip {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: var(--surface-raised);
  color: var(--text-primary);
  font-size: var(--text-sm);
  text-align: left;
  transition: border-color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.refine__chip:hover {
  border-color: var(--accent-border);
  background: var(--accent-wash);
}

/* The skip reads as the quieter option without being hidden: it has to be
   obviously available, and obviously not the expected answer. */
.refine__chip--skip {
  border-style: dashed;
  color: var(--text-tertiary);
}

.refine__own {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.refine__input {
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-input);
}

.refine__input:focus {
  outline: none;
  border-color: var(--accent-border);
}

.refine__input::placeholder {
  color: var(--text-tertiary);
}

.refine__skip-all {
  padding: 0;
  background: none;
  border: none;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.refine__skip-all:hover {
  color: var(--text-secondary);
}

/* ------------------------------------------------------------------ *
 * The answer
 * ------------------------------------------------------------------ */

.result {
  margin-top: var(--space-7);
}

.result__understood {
  margin: 0 0 var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  font-size: var(--text-base);
  line-height: 1.5;
  color: var(--text-primary);
}

.result__understood span {
  display: block;
  margin-bottom: var(--space-1);
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.result__gap {
  margin: 0 0 var(--space-5);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-secondary);
}

.result__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

/*
 * Staggered entrance.
 *
 * Fifty milliseconds apart, which reads as the answers arriving rather than
 * the list being decorated. Long enough to see, short enough that the eighth
 * pick is not still animating when you have finished reading the first.
 */
.pick {
  animation: pick-in var(--dur-slow, 480ms) var(--ease-out) backwards;
  animation-delay: calc(var(--i) * 50ms);
}

@keyframes pick-in {
  from { opacity: 0; transform: translateY(0.75rem); }
  to { opacity: 1; transform: none; }
}

.pick__link {
  display: grid;
  grid-template-columns: 4.75rem 1fr;
  gap: var(--space-4);
  padding: var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  transition: background var(--dur-fast, 160ms), border-color var(--dur-fast, 160ms);
}

.pick__link:hover {
  border-color: var(--border-subtle);
  background: var(--surface-sunken, rgb(255 255 255 / 0.04));
}

.pick__art {
  width: 4.75rem;
  border-radius: var(--radius-sm);
}

.pick__body {
  min-width: 0;
}

.pick__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.pick__year {
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

.pick__title {
  margin: 0 0 var(--space-1);
  font-size: var(--text-base);
  font-weight: 600;
  line-height: 1.3;
}

/* The sentence is the product. It gets the readable size, and the scores --
   which every other card on the site already leads with -- sit under it. */
.pick__because {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-secondary);
}

.pick__scores {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
}

.pick__dim {
  color: var(--text-tertiary);
}

.result__again {
  display: block;
  margin: var(--space-6) auto 0;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  transition: border-color var(--dur-fast, 160ms), color var(--dur-fast, 160ms);
}

.result__again:hover {
  border-color: var(--accent-border);
  color: var(--text-primary);
}

/* ------------------------------------------------------------------ *
 * Open and close
 * ------------------------------------------------------------------ */

.ask-enter-active .ask__panel,
.ask-leave-active .ask__panel {
  transition: opacity var(--dur-slow, 480ms) var(--ease-out),
    transform var(--dur-slow, 480ms) var(--ease-out);
}

.ask-enter-active .ask__scrim,
.ask-leave-active .ask__scrim {
  transition: opacity var(--dur-slow, 480ms) var(--ease-out);
}

.ask-enter-from .ask__panel,
.ask-leave-to .ask__panel {
  opacity: 0;
  /* Rising and settling, rather than a box appearing. It is opening from a
     card at the bottom of the sidebar, and the motion should agree. */
  transform: translateY(1.5rem) scale(0.97);
}

.ask-enter-from .ask__scrim,
.ask-leave-to .ask__scrim {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ask__orb,
  .ask__pulse,
  .pick {
    animation: none;
  }

  .ask-enter-from .ask__panel,
  .ask-leave-to .ask__panel {
    transform: none;
  }
}

@media (max-width: 40rem) {
  .ask {
    padding: var(--space-3);
  }

  .ask__panel {
    padding: var(--space-6) var(--space-4) var(--space-5);
  }

  .pick__link {
    grid-template-columns: 2.75rem 1fr;
    gap: var(--space-3);
  }
}
</style>
