<script setup lang="ts">
import { MEDIA_TYPES, MOODS } from '@revy/shared/constants'
import type { MediaType, SeedTitle } from '@revy/shared/types'

/**
 * The four questions asked once, at signup (SPEC 21).
 *
 * This exists for one reason: a reader with no ratings overlaps with no other
 * reader, so every personalised surface degrades to "what is popular" for
 * exactly the people who have not yet been given a reason to come back. Fifteen
 * ratings is the difference between a recommender that can find taste
 * neighbours and one that cannot.
 *
 * Three steps, and they are in this order because each one narrows the next:
 * the kinds decide which moods are worth offering, and the moods decide which
 * titles are worth putting in front of somebody to rate. Asking for ratings
 * first would mean offering a grid of romantic comedies to someone who only
 * plays strategy games.
 *
 * Skippable at every step, and that is not a courtesy -- a wall between signup
 * and the product is the single most reliable way to lose the signup. A skip
 * is recorded rather than ignored, so nobody is asked twice.
 */
definePageMeta({ layout: 'auth' })

const api = useApi()
const auth = useAuthStore()
const { t } = useI18n()

/** How many titles to show, and how many make the exercise worth having. */
const SEED_LIMIT = 24
const ENOUGH_RATINGS = 5

type Step = 'kinds' | 'moods' | 'rate'
const step = ref<Step>('kinds')

const kinds = ref<MediaType[]>([])
const moods = ref<string[]>([])

/** Scores given so far, by media id. Posted as they are given, not at the end. */
const scores = ref<Record<string, number>>({})
const rated = computed(() => Object.keys(scores.value).length)

const saving = ref(false)

/*
 * Moods offered are narrowed to the kinds chosen.
 *
 * "One more episode" is about television; showing it to somebody who picked
 * books only is a question they cannot answer, and a question nobody can
 * answer is worse than one fewer question.
 */
const availableMoods = computed(() =>
  MOODS.filter(
    (mood) => !mood.mediaTypes || mood.mediaTypes.some((type) => kinds.value.includes(type)),
  ),
)

/*
 * One toggle per list rather than a generic one taking a `Ref`.
 *
 * A template auto-unwraps refs, so `toggle(kinds, kind)` in the markup hands
 * over the array, not the ref -- it typechecks in the script and silently
 * mutates nothing from the template.
 */
function toggleKind(kind: MediaType) {
  kinds.value = kinds.value.includes(kind)
    ? kinds.value.filter((value) => value !== kind)
    : [...kinds.value, kind]
}

function toggleMood(key: string) {
  moods.value = moods.value.includes(key)
    ? moods.value.filter((value) => value !== key)
    : [...moods.value, key]
}

/*
 * The seed grid is fetched when the reader reaches the rating step, not on
 * every keystroke of the two before it. `immediate: false` plus an explicit
 * execute is what keeps a reader who changes their mind twice on step one from
 * firing three catalogue queries nobody will read.
 */
const {
  data: seeds,
  status: seedStatus,
  execute: loadSeeds,
} = await useAsyncData(
  'onboarding-seeds',
  () => api.taste.seeds(kinds.value, moods.value, SEED_LIMIT),
  { immediate: false, default: () => ({ titles: [] as SeedTitle[] }) },
)

const titles = computed(() => seeds.value?.titles ?? [])

async function next() {
  if (step.value === 'kinds') {
    step.value = 'moods'
    return
  }
  if (step.value === 'moods') {
    step.value = 'rate'
    await loadSeeds()
  }
}

/**
 * Posts one score the moment it is given.
 *
 * Per rating rather than batched at the end, because each one is independently
 * useful: somebody who rates six titles and closes the tab has still taught the
 * recommender six things, where a batch would have taught it nothing.
 */
async function rate(title: SeedTitle, score: number | null) {
  if (score === null) return
  scores.value = { ...scores.value, [title.id]: score }
  try {
    await api.ratings.upsert(title.id, score)
  } catch {
    // Put the star back rather than showing a score that was never stored.
    const { [title.id]: _dropped, ...rest } = scores.value
    scores.value = rest
  }
}

/** Records the answers and leaves. `skipped` distinguishes "no" from "not asked". */
async function finish(skipped: boolean) {
  if (saving.value) return
  saving.value = true
  try {
    await api.taste.save({
      mediaTypes: skipped ? [] : kinds.value,
      moodKeys: skipped ? [] : moods.value,
      skipped,
    })
    // The badge and rating counts in the shell are stale after a rating run.
    await auth.refreshBadges?.()
  } finally {
    saving.value = false
    await navigateTo('/')
  }
}

useHead({ title: t('onboarding.title') })
</script>

<template>
  <div class="onboard">
    <header class="onboard__head">
      <p class="onboard__step">{{ t(`onboarding.step.${step}`) }}</p>
      <h1 class="onboard__title">{{ t(`onboarding.${step}Title`) }}</h1>
      <p class="onboard__sub">{{ t(`onboarding.${step}Sub`) }}</p>
    </header>

    <!-- 1. Kinds -->
    <div v-if="step === 'kinds'" class="chips">
      <button
        v-for="kind in MEDIA_TYPES"
        :key="kind"
        type="button"
        class="chip"
        :class="{ 'chip--on': kinds.includes(kind) }"
        :aria-pressed="kinds.includes(kind)"
        @click="toggleKind(kind)"
      >
        {{ t(`mediaType.${kind}_plural`) }}
      </button>
    </div>

    <!-- 2. Moods -->
    <div v-else-if="step === 'moods'" class="moods">
      <button
        v-for="mood in availableMoods"
        :key="mood.key"
        type="button"
        class="mood"
        :class="{ 'mood--on': moods.includes(mood.key) }"
        :aria-pressed="moods.includes(mood.key)"
        @click="toggleMood(mood.key)"
      >
        <img class="mood__art" :src="`/moods/${mood.key}.webp`" alt="" loading="lazy" />
        <span class="mood__name">{{ t(`mood.${mood.key}`) }}</span>
      </button>
    </div>

    <!-- 3. Rate -->
    <div v-else class="rate">
      <div v-if="seedStatus === 'pending'" class="grid">
        <UiSkeletonBlock v-for="i in 12" :key="i" height="9rem" radius="var(--radius-md)" />
      </div>

      <UiEmptyState
        v-else-if="titles.length === 0"
        :title="t('onboarding.noTitles')"
        :description="t('onboarding.noTitlesBody')"
      />

      <div v-else class="grid">
        <div v-for="title in titles" :key="title.id" class="seed">
          <UiMediaPoster
            sizes="120px"
            :src="title.coverImageUrl"
            :title="title.title"
            :media-type="title.mediaType"
          />
          <p class="seed__title clamp-2">{{ title.title }}</p>
          <UiStarInput
            :model-value="scores[title.id] ?? null"
            @update:model-value="(value: number | null) => rate(title, value)"
          />
        </div>
      </div>
    </div>

    <footer class="onboard__foot">
      <UiAppButton variant="ghost" :disabled="saving" @click="finish(true)">
        {{ t('onboarding.skip') }}
      </UiAppButton>

      <UiAppButton
        v-if="step !== 'rate'"
        variant="primary"
        :disabled="step === 'kinds' && kinds.length === 0"
        @click="next()"
      >
        {{ t('common.continue') }}
      </UiAppButton>

      <UiAppButton v-else variant="primary" :disabled="saving" @click="finish(false)">
        {{
          rated >= ENOUGH_RATINGS
            ? t('onboarding.done')
            : t('onboarding.doneCount', { count: rated, target: ENOUGH_RATINGS })
        }}
      </UiAppButton>
    </footer>
  </div>
</template>

<style scoped>
.onboard {
  width: min(56rem, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.onboard__head {
  text-align: center;
}

.onboard__step {
  font-size: var(--text-2xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.onboard__title {
  margin-block: var(--space-2) var(--space-1);
  font-size: var(--text-2xl);
}

.onboard__sub {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
}

.chip {
  padding: var(--space-3) var(--space-5);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  background: var(--surface-overlay);
  color: var(--text-primary);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: var(--cursor-hand);
}

.chip--on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.moods {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: var(--space-3);
}

.mood {
  position: relative;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  padding: 0;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-overlay);
  cursor: var(--cursor-hand);
}

.mood--on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.mood__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.55;
}

.mood__name {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  padding: var(--space-3);
  background: linear-gradient(to top, rgb(10 10 12 / 0.9), transparent);
  color: var(--text-primary);
  font-size: var(--text-sm);
  font-weight: 600;
  text-align: left;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: var(--space-4);
}

.seed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

.seed__title {
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  /*
   * Two lines' worth of space whether the title needs it or not.
   *
   * Without it a one-line title and a two-line one put their stars at
   * different heights, and a grid of twenty-four rating controls that do not
   * line up reads as broken rather than as varied.
   */
  min-height: calc(2 * var(--text-2xs) * var(--leading-snug));
  line-height: var(--leading-snug);
}

.onboard__foot {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  padding-top: var(--space-2);
}
</style>
