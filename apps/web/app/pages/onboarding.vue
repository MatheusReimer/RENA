<script setup lang="ts">
import { MEDIA_TYPES } from '@revy/shared/constants'
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
 * Two screens, and only two questions: which kinds, then rate a few.
 *
 * A mood picker sat between them once -- "what are you usually after?" -- and
 * was cut. Its own subtitle conceded it only decided what got put in front of
 * you, and a self-reported mood is a far weaker signal than a single rating;
 * once somebody has rated fifteen things it is noise. Moods still exist as a
 * way to browse (`components/explore/MoodGrid.vue`), which is where a question
 * about mood actually pays for itself -- asked when it is wanted, rather than
 * charged as a toll on the way in.
 *
 * `moodKeys` stays in the payload and in `user_taste`, written empty. The
 * column and the prompt slot in `recommend.service.ts` both handle that, so
 * offering the question somewhere later is a screen, not a migration.
 *
 * The rating grid comes second because it is the part that actually feeds the
 * recommender. Asking for ratings first would mean offering romantic comedies
 * to somebody who only plays strategy games.
 *
 * Skippable at every step, and that is not a courtesy -- a wall between signup
 * and the product is the single most reliable way to lose the signup. A skip
 * is recorded rather than ignored, so nobody is asked twice.
 */
definePageMeta({ layout: 'auth' })

const api = useApi()
const notice = useNotice()
const auth = useAuthStore()
const { t } = useI18n()

/** How many titles to show, and how many make the exercise worth having. */
const SEED_LIMIT = 24
const ENOUGH_RATINGS = 5

type Step = 'kinds' | 'rate'
const step = ref<Step>('kinds')

const kinds = ref<MediaType[]>([])

/** Scores given so far, by media id. Posted as they are given, not at the end. */
const scores = ref<Record<string, number>>({})
const rated = computed(() => Object.keys(scores.value).length)

const saving = ref(false)

/**
 * Somebody who has already answered does not get asked again.
 *
 * This screen used to be reachable from exactly one place -- the moment after
 * sign-up -- so it could assume a reader who had never seen it. It is now
 * where a confirmation link lands, and those are followed by people who
 * confirmed late: an account created under the old soft gate could have
 * answered these questions months ago and only be confirming the address now.
 *
 * `taste` is null only while the question has never been put, and a recorded
 * skip counts as an answer -- which is the whole point of recording it.
 *
 * Client-side, and lazily: the answer cannot change what the server renders,
 * and holding SSR for a request whose only outcome is a redirect would make
 * every arrival wait on it.
 */
onMounted(async () => {
  try {
    const { taste } = await api.taste.get()
    if (taste) await navigateTo('/')
  } catch {
    // Asking again is a wasted minute; refusing to render the screen because
    // one request failed is a reader stuck on a blank page.
  }
})

function toggleKind(kind: MediaType) {
  kinds.value = kinds.value.includes(kind)
    ? kinds.value.filter((value) => value !== kind)
    : [...kinds.value, kind]
}

/*
 * The seed grid is fetched when the reader reaches the rating step, not on
 * every keystroke of the two before it. `immediate: false` plus an explicit
 * execute is what keeps a reader who changes their mind twice on step one from
 * firing three catalogue queries nobody will read.
 */
/*
 * Not awaited: there is nothing here to wait for.
 *
 * `immediate: false` means no request starts at setup, so the awaited promise
 * resolves on the spot -- all a top-level `await` buys is making the page an
 * async component, which delays its mount behind Suspense for no data. The
 * other pages in this app await theirs because they fetch immediately and want
 * SSR to hold for the result; this one fetches from `loadSeeds()` on the way
 * to the rating step instead.
 */
const {
  data: seeds,
  status: seedStatus,
  error: seedError,
  execute: loadSeeds,
} = useAsyncData(
  'onboarding-seeds',
  () => api.taste.seeds(kinds.value, [], SEED_LIMIT),
  /*
   * The default is what an *empty* answer looks like, and the error is kept
   * separately on purpose.
   *
   * Without reading `error`, a request that 401s or 500s renders through the
   * same `titles.length === 0` branch as a genuine no-match, and the screen
   * says "nothing for that combination" -- blaming the reader's choices for a
   * server fault. That is precisely how a broken registration hid behind this
   * page in production: the sign-up 500'd, there was no session, the seed
   * request 401'd, and this said the catalogue had nothing.
   */
  { immediate: false, default: () => ({ titles: [] as SeedTitle[] }) },
)

const titles = computed(() => seeds.value?.titles ?? [])

async function next() {
  if (step.value !== 'kinds') return
  step.value = 'rate'
  await loadSeeds()
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
  } catch (error) {
    // Put the star back rather than showing a score that was never stored --
    // and say why, or the star simply un-fills under the reader's thumb and
    // looks like the tap missed.
    const { [title.id]: _dropped, ...rest } = scores.value
    scores.value = rest
    notice.fromError(error)
  }
}

/** Records the answers and leaves. `skipped` distinguishes "no" from "not asked". */
async function finish(skipped: boolean) {
  if (saving.value) return
  saving.value = true
  try {
    await api.taste.save({
      mediaTypes: skipped ? [] : kinds.value,
      // Nothing asks for these any more; the column stays, written empty.
      moodKeys: [],
      skipped,
    })
    // The badge and rating counts in the shell are stale after a rating run.
    await auth.refreshBadges?.()
  } catch (error) {
    /*
     * Reported, and then left anyway.
     *
     * Onboarding is skippable by design -- a wall between sign-up and the
     * product is the most reliable way to lose the sign-up -- so a failed save
     * must not trap somebody on this screen. But it did mean the answers were
     * discarded in silence. The notice store outlives the navigation, so the
     * explanation arrives on the screen they land on.
     */
    notice.fromError(error)
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

    <!-- 2. Rate -->
    <div v-else class="rate">
      <div v-if="seedStatus === 'pending'" class="grid">
        <UiSkeletonBlock v-for="i in 12" :key="i" height="9rem" radius="var(--radius-md)" />
      </div>

      <UiEmptyState
        v-else-if="seedError"
        :title="t('onboarding.loadFailed')"
        :description="t('onboarding.loadFailedBody')"
      >
        <template #action>
          <UiAppButton variant="secondary" @click="loadSeeds()">
            {{ t('common.tryAgain') }}
          </UiAppButton>
        </template>
      </UiEmptyState>

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
            compact
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

  /*
   * Stars scaled to the cell.
   *
   * At the default 2rem a rating control is about 220px wide and the column is
   * about 136px, so every one of them overlapped its neighbours -- twenty-four
   * controls running together into one unreadable row. `compact` drops the
   * numeric readout as well; between them the control fits inside its own
   * poster's width at every column count the grid produces.
   */
  --star-size: 1.25rem;
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
