<script setup lang="ts">
import { LIMITS, MESSAGE_PAGE_SIZE, MESSAGE_POLL_INTERVAL_MS } from '@revy/shared/constants'
import type { ConversationDetail, Message } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'
import { ApiError } from '~/composables/useApi'

/**
 * One conversation (SPEC 12).
 *
 * The thread polls for anything after the newest message it holds, which is a
 * keyset request rather than a page fetch -- an idle conversation costs one
 * indexed lookup returning nothing. SPEC 49.7 rules out realtime for now, and
 * at four seconds in a two-person thread the difference is not one you notice.
 *
 * Scrolling up pages backwards through history from the oldest message on
 * screen. The two directions never interfere because both are cursors into the
 * same `(createdAt, id)` ordering, so a message arriving mid-scroll cannot
 * shift a page the way an OFFSET would.
 */
const route = useRoute()
const api = useApi()
const auth = useAuthStore()
const { t } = useI18n()

const conversationId = computed(() => String(route.params.id))

const messages = ref<Message[]>([])
const hasMore = ref(false)
const loadingMore = ref(false)
const sending = ref(false)
const draft = ref('')
const sendError = ref<string | null>(null)

const { data, status, error } = await useAsyncData(
  () => `conversation-${conversationId.value}`,
  async () => {
    const [conversation, page] = await Promise.all([
      api.conversations.get(conversationId.value),
      api.conversations.messages(conversationId.value, { limit: MESSAGE_PAGE_SIZE }),
    ])
    return { conversation: conversation.conversation, page }
  },
  { watch: [conversationId] },
)

watchEffect(() => {
  messages.value = data.value?.page.messages ?? []
  hasMore.value = data.value?.page.hasMore ?? false
})

const conversation = computed<ConversationDetail | null>(() => data.value?.conversation ?? null)

const newest = computed(() => messages.value[messages.value.length - 1] ?? null)
const oldest = computed(() => messages.value[0] ?? null)

const remaining = computed(() => LIMITS.messageContent.max - draft.value.trim().length)
const canSubmit = computed(
  () => !sending.value && draft.value.trim().length > 0 && remaining.value >= 0,
)

/* ------------------------------------------------------------------ *
 * Scrolling
 * ------------------------------------------------------------------ */

const scroller = ref<HTMLElement | null>(null)

/**
 * Whether the reader is at the bottom, within a tolerance.
 *
 * Checked before auto-scrolling on a new message: yanking someone back down
 * while they are reading history is the single most irritating thing a chat
 * can do, so a new message only pulls the view when they were already there.
 */
function atBottom(threshold = 80): boolean {
  const element = scroller.value
  if (!element) return true
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold
}

async function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior })
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * Tells the server how far the reader has got.
 *
 * Sent for the newest message actually rendered, and only when it is not
 * already the one we last reported -- otherwise every poll would write a row
 * for a thread nobody is touching.
 *
 * Skipped while the tab is hidden. A background tab receiving messages has not
 * had them read by anybody, and marking them read there is how a notification
 * disappears before it was ever seen.
 */
let lastReported: string | null = null

async function reportRead() {
  const message = newest.value
  if (!message || message.id === lastReported) return
  if (document.visibilityState !== 'visible') return

  lastReported = message.id
  try {
    // The response carries the viewer's new total, so the shell's badge is set
    // to a number the server computed rather than one the client subtracted.
    const result = await api.conversations.markRead(conversationId.value, message.id)
    auth.setUnreadMessages(result.unreadMessages)
  } catch {
    // Not worth surfacing: the reader has still read the thread, and clearing
    // this retries on the next poll rather than leaving the position stuck.
    lastReported = null
  }
}

/* ------------------------------------------------------------------ *
 * Polling and paging
 * ------------------------------------------------------------------ */

const polling = usePolling(
  async () => {
    const after = newest.value?.id
    const result = await api.conversations.messages(conversationId.value, {
      ...(after ? { after } : {}),
    })
    if (result.messages.length === 0) return

    const stick = atBottom()
    appendNew(result.messages)
    if (stick) await scrollToBottom('smooth')
    await reportRead()
  },
  { interval: MESSAGE_POLL_INTERVAL_MS, immediate: false },
)

/**
 * Appends messages the thread does not already hold.
 *
 * The id check is not paranoia: sending adds the message optimistically from
 * the POST response, and the poll that follows would otherwise add it a second
 * time before the cursor caught up.
 */
function appendNew(incoming: Message[]) {
  const known = new Set(messages.value.map((message) => message.id))
  const fresh = incoming.filter((message) => !known.has(message.id))
  if (fresh.length) messages.value = [...messages.value, ...fresh]
}

async function loadOlder() {
  const cursor = oldest.value
  if (!cursor || loadingMore.value || !hasMore.value) return

  loadingMore.value = true
  const element = scroller.value
  const previousHeight = element?.scrollHeight ?? 0

  try {
    const result = await api.conversations.messages(conversationId.value, {
      before: cursor.id,
      limit: MESSAGE_PAGE_SIZE,
    })
    messages.value = [...result.messages, ...messages.value]
    hasMore.value = result.hasMore

    /*
     * Hold the reader's place.
     *
     * Prepending rows pushes everything down by exactly the height added, so
     * without this the view jumps to a different part of the conversation the
     * moment older messages load.
     */
    await nextTick()
    if (element) element.scrollTop = element.scrollHeight - previousHeight
  } finally {
    loadingMore.value = false
  }
}

function onScroll() {
  if (scroller.value && scroller.value.scrollTop < 120) void loadOlder()
}

/* ------------------------------------------------------------------ *
 * Sending
 * ------------------------------------------------------------------ */

async function send() {
  if (!canSubmit.value) return

  const content = draft.value.trim()
  sending.value = true
  sendError.value = null

  try {
    const result = await api.conversations.send(conversationId.value, content)
    appendNew([result.message])
    draft.value = ''
    await scrollToBottom('smooth')
    lastReported = result.message.id
  } catch (cause) {
    // The draft is deliberately left in the box: losing what somebody typed
    // because a request failed is worse than the failure.
    sendError.value =
      cause instanceof ApiError ? cause.message : t('messages.sendFailed')
  } finally {
    sending.value = false
  }
}

/**
 * Enter sends, Shift+Enter breaks the line.
 *
 * The convention everywhere else, and the textarea is multi-line precisely so
 * the second half of that is possible.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void send()
}

/* ------------------------------------------------------------------ *
 * Hiding
 * ------------------------------------------------------------------ */

/** The message whose hide control is armed, so there is no modal dialog. */
const confirmingHide = ref<string | null>(null)

async function hide(message: Message) {
  confirmingHide.value = null
  messages.value = messages.value.filter((item) => item.id !== message.id)
  try {
    await api.conversations.hideMessage(conversationId.value, message.id)
  } catch {
    // Put it back rather than leaving the screen disagreeing with the server.
    await refreshThread()
  }
}

async function refreshThread() {
  const result = await api.conversations.messages(conversationId.value, {
    limit: MESSAGE_PAGE_SIZE,
  })
  messages.value = result.messages
  hasMore.value = result.hasMore
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

onMounted(async () => {
  await scrollToBottom()
  await reportRead()
  polling.start()
})

useHead(() => ({
  title: conversation.value ? `${conversation.value.participant.displayName} · Messages` : 'Messages',
}))
</script>

<template>
  <div class="thread">
    <!-- ------------------------------------------------------------ *
         Header
         ------------------------------------------------------------ -->
    <header class="thread__header">
      <NuxtLink to="/messages" class="thread__back" :aria-label="$t('messages.backToMessages')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </NuxtLink>

      <NuxtLink
        v-if="conversation"
        :to="`/u/${conversation.participant.username}`"
        class="thread__who"
      >
        <UiUserAvatar :user="conversation.participant" size="sm" />
        <span class="thread__names">
          <span class="thread__name">{{ conversation.participant.displayName }}</span>
          <span class="thread__handle">@{{ conversation.participant.username }}</span>
        </span>
      </NuxtLink>
    </header>

    <!-- ------------------------------------------------------------ *
         Messages
         ------------------------------------------------------------ -->
    <div ref="scroller" class="thread__scroll" @scroll.passive="onScroll">
      <div v-if="status === 'pending'" class="thread__loading">
        <UiSkeletonBlock v-for="i in 5" :key="i" width="60%" height="2.5rem" />
      </div>

      <UiEmptyState
        v-else-if="error"
        :title="$t('messages.openFailed')"
        :description="$t('messages.openFailedBody')"
      >
        <template #action>
          <UiAppButton variant="secondary" @click="navigateTo('/messages')">
            {{ $t('messages.backToMessages') }}
          </UiAppButton>
        </template>
      </UiEmptyState>

      <template v-else>
        <div v-if="loadingMore" class="thread__more">{{ $t('messages.loadingEarlier') }}</div>
        <p v-else-if="!hasMore && messages.length" class="thread__start">
          {{ $t('messages.threadStart') }}
        </p>

        <p v-if="messages.length === 0" class="thread__empty">
          {{ $t('messages.threadEmpty') }}
        </p>

        <div
          v-for="message in messages"
          :key="message.id"
          class="bubble"
          :class="{ 'bubble--mine': message.sender.id === auth.user?.id }"
        >
          <div class="bubble__body">
            <!--
              Interpolated, never v-html. User text is stored raw and escaped
              at render (SPEC 39); this is the line that keeps that true.
            -->
            <p class="bubble__text">{{ message.content }}</p>
            <time class="bubble__time" :datetime="message.createdAt">
              {{ relativeTime(message.createdAt) }}
            </time>
          </div>

          <!--
            Two-step rather than a confirm dialog: a native confirm() blocks
            the page, and this only hides the message from one person.
          -->
          <button
            v-if="confirmingHide !== message.id"
            type="button"
            class="bubble__hide"
            :aria-label="$t('messages.hideMessage')"
            @click="confirmingHide = message.id"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <button
            v-else
            type="button"
            class="bubble__confirm"
            @click="hide(message)"
            @blur="confirmingHide = null"
          >
            {{ $t('messages.hideForMe') }}
          </button>
        </div>
      </template>
    </div>

    <!-- ------------------------------------------------------------ *
         Composer
         ------------------------------------------------------------ -->
    <footer v-if="conversation" class="composer">
      <p v-if="!conversation.canSend" class="composer__closed">
        {{ $t('messages.closed') }}
      </p>

      <template v-else>
        <p v-if="sendError" class="composer__error" role="alert">{{ sendError }}</p>

        <div class="composer__row">
          <textarea
            v-model="draft"
            class="composer__input"
            rows="1"
            :maxlength="LIMITS.messageContent.max"
            :placeholder="$t('messages.composePlaceholder')"
            :aria-label="$t('messages.composeLabel')"
            @keydown="onKeydown"
          />
          <UiAppButton
            variant="primary"
            size="sm"
            :loading="sending"
            :disabled="!canSubmit"
            @click="send"
          >
            {{ $t('messages.send') }}
          </UiAppButton>
        </div>

        <!-- Only once it is close enough to matter; a counter on an empty box
             is noise. -->
        <p v-if="remaining < 200" class="composer__count" :class="{ 'composer__count--over': remaining < 0 }">
          {{ remaining }}
        </p>
      </template>
    </footer>
  </div>
</template>

<style scoped>
.thread {
  display: flex;
  flex-direction: column;
  /* The shell owns the chrome; this fills what is left so the composer sits
     at the bottom and only the message list scrolls. */
  height: calc(100dvh - var(--topbar-height, 0px));
  max-width: var(--content-max);
  margin-inline: auto;
  width: 100%;
}

.thread__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.thread__back {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  color: var(--text-secondary);
}

.thread__back:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.thread__back svg {
  width: 1.125rem;
  height: 1.125rem;
}

.thread__who {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.thread__names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.thread__name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.thread__handle {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.thread__scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.thread__loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.thread__more,
.thread__start,
.thread__empty {
  padding-block: var(--space-3);
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.bubble {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  max-width: min(78%, 34rem);
  align-self: flex-start;
}

.bubble--mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.bubble__body {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
}

.bubble--mine .bubble__body {
  background: var(--accent-wash);
  border-color: var(--accent-border);
}

.bubble__text {
  /* Honours the line breaks somebody typed without letting a long unbroken
     string push the bubble past its max width. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.bubble__time {
  display: block;
  margin-top: var(--space-1);
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

.bubble__hide,
.bubble__confirm {
  flex-shrink: 0;
  border-radius: var(--radius-full);
  color: var(--text-tertiary);
  /* Revealed on hover or keyboard focus. `opacity` rather than `display` so
     the row does not reflow when it appears, and focus-within keeps it
     reachable without a mouse. */
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.bubble:hover .bubble__hide,
.bubble:focus-within .bubble__hide,
.bubble__confirm {
  opacity: 1;
}

.bubble__hide {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
}

.bubble__hide svg {
  width: 0.75rem;
  height: 0.75rem;
}

.bubble__hide:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.bubble__confirm {
  padding: 0.15rem var(--space-2);
  background: var(--surface-hover);
  font-size: var(--text-2xs);
  white-space: nowrap;
  color: var(--danger);
}

.composer {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-subtle);
  /* Keeps the composer clear of the iOS home indicator and the mobile tab
     bar, which the shell fixes to the bottom of the viewport. */
  padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
}

.composer__row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
}

.composer__input {
  flex: 1;
  min-width: 0;
  /* Grows with the text up to a ceiling, then scrolls: a composer that can
     eat the whole screen is worse than one that scrolls. */
  min-height: 2.5rem;
  max-height: 8rem;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-sm);
  resize: none;
  field-sizing: content;
}

.composer__input:focus {
  outline: none;
  border-color: var(--accent-border);
}

.composer__input::placeholder {
  color: var(--text-tertiary);
}

.composer__closed,
.composer__error,
.composer__count {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.composer__error {
  margin-bottom: var(--space-2);
  color: var(--danger);
}

.composer__count {
  margin-top: var(--space-2);
  text-align: right;
}

.composer__count--over {
  color: var(--danger);
}
</style>
