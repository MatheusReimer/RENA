<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import type { ExploreSummary, MediaType, MoodRow } from '@revy/shared/types'

/**
 * Explore (SPEC 21).
 *
 * Rebuilt from a stack of ranked rails into a screen with an argument: a
 * statement, six moods, what people are talking about, what people are saying,
 * and something nobody has told you about yet.
 *
 * The rails it replaced were not wrong, they were undifferentiated -- eight
 * headings over eight identical rows of posters, every one of them a ranking
 * of the same catalogue. This asks a question first, because somebody on this
 * screen usually does not have a title in mind.
 */

/*
 * No `definePageMeta({ layout: ... })` any more, and no `<NuxtLayout>` in the
 * template either.
 *
 * This screen used to pick its own shell -- the sidebar for a member, the top
 * bar for a visitor -- and fetch the sidebar's counters itself so it could
 * hand them down as a prop. Both jobs have moved into the default layout,
 * which is the sidebar for everyone now. A page should not have to know what
 * frame it is in.
 */
const api = useApi()
const { t } = useI18n()
const { absolute } = useShareLink()
const route = useRoute()

const TYPES = ['movie', 'series', 'book', 'game'] as const
function typeFromQuery(value: unknown): MediaType | null {
  return TYPES.find((type) => type === value) ?? null
}

/**
 * The type filter lives in the URL.
 *
 * The landing screen's four category cards link straight here with a `type`,
 * and a filter that only existed in component state would have nowhere for
 * them to point -- as well as no way to be bookmarked or shared.
 */
const mediaType = ref<MediaType | null>(typeFromQuery(route.query.type))
watch(
  () => route.query.type,
  (value) => {
    mediaType.value = typeFromQuery(value)
  },
)

watch(mediaType, (value) => {
  // `replace`, so flipping between types does not bury the previous screen
  // under a stack of history entries for the same one.
  navigateTo(
    { path: '/discover', query: value ? { type: value } : {} },
    { replace: true },
  )
})

const EMPTY: ExploreSummary = { discussed: [], gems: [], reviews: [] }
const { data, status, error, refresh } = await useAsyncData(
  'explore',
  () => api.explore.summary(mediaType.value ?? undefined),
  { watch: [mediaType], default: () => EMPTY },
)

const summary = computed(() => data.value ?? EMPTY)

/*
 * Hidden gems used to be a featured panel plus a rail of the rest.
 *
 * The panel gave the first one a frame of its own, which put the whole weight
 * of the section on whichever title happened to sort first and left the other
 * eleven as thumbnails beside it. The carousel treats every one of them as the
 * subject in turn, which is the right shape for a row whose argument is "you
 * have not heard of these" -- there is no reason the first should be the one
 * you see properly.
 */

/**
 * One order, the server's.
 *
 * The design had four sort chips beside the type chips and they came out: two
 * of the four -- "Recently Reviewed" and "Hidden Gems" -- were already whole
 * sections further down the page, so choosing them reordered a row into a
 * duplicate of something the reader was about to scroll past. A control whose
 * options overlap the page it sits on makes the page feel bigger than it is.
 */
const discussed = computed(() => summary.value.discussed)

/* ------------------------------------------------------------------ *
 * Moods
 * ------------------------------------------------------------------ */

/**
 * Fetched only when somebody opens one.
 *
 * Six moods at a dozen titles each is seventy-two rows nobody asked for, on a
 * screen whose first impression is six photographs.
 */
const openMood = ref<string | null>(null)
const moodRow = ref<MoodRow | null>(null)
const moodPending = ref(false)
async function openMoodRow(key: string) {
  // A second press closes it. The card is a toggle, and its pressed state
  // already says so.
  if (openMood.value === key) {
    openMood.value = null
    moodRow.value = null
    return
  }
  openMood.value = key
  moodPending.value = true
  try {
    moodRow.value = await api.explore.mood(key)
  } catch {
    // A mood that will not load closes itself rather than leaving a card
    // pressed over an empty row.
    openMood.value = null
    moodRow.value = null
  } finally {
    moodPending.value = false
  }
}

useHead({ title: () => t('nav.explore') })
useSeoMeta({
  description: BRAND.description,
  ogTitle: () => `Explore · ${BRAND.name}`,
  ogDescription: BRAND.description,
  ogType: 'website',
  ogUrl: () => absolute('/discover'),
})

</script>

<template>
  <div class="page">
    <ExploreHero v-model:media-type="mediaType" />
    <ExploreMoodGrid :active="openMood" @open="openMoodRow" />
    <!--
      The answer to the mood card above it, directly underneath.
      Wrapped in a transition because it appears and disappears under the
      reader's own click: a row that pops into existence shoves everything
      below it down a screen with no warning, and the same row sliding open
      reads as the card unfolding rather than as the page jumping.
      `grid-template-rows` from 0fr to 1fr is what makes that animatable
      without knowing the row's height in advance -- `height: auto` is not
      interpolable and a fixed height would be a guess that is wrong at every
      width except one.
    -->
    <Transition name="mood-row">
      <div v-if="moodRow && moodRow.items.length" class="mood-row">
        <div class="mood-row__inner">
          <ExploreCardRow
            :title="moodRow.title"
            :subtitle="moodRow.tags.join(' · ')"
            :items="moodRow.items"
          />
        </div>
      </div>
    </Transition>
    <!-- Its own condition rather than `v-else-if`: the row above it is now
         wrapped in a `<Transition>`, so the two are no longer siblings in the
         same chain. -->
    <UiEmptyState
      v-if="openMood && !moodPending && !moodRow?.items.length"
      :title="$t('explore.empty')"
      :description="$t('explore.moodEmptyBody')"
    />
    <UiEmptyState
      v-if="error"
      :title="$t('explore.failed')"
      :description="$t('explore.failedBody')"
    >
<template #action>
        <UiAppButton variant="secondary" @click="refresh()">{{ $t('common.tryAgain') }}</UiAppButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <ExploreCardRow
        v-if="discussed.length"
        icon="flame"
        :title="$t('landing.trendingEyebrow', { brand: BRAND.name })"
        :subtitle="$t('explore.trendingSub')"
        :items="discussed"
        see-all-to="/search"
      />
      <ExploreCommunitySay v-if="summary.reviews.length" :reviews="summary.reviews" />
      <UiPosterCarousel
        v-if="summary.gems.length"
        :items="summary.gems"
        :title="$t('explore.gems')"
        :scale="0.65"
        :subtitle="$t('explore.gemsSub')"
      />
      <div v-if="status === 'pending' && !discussed.length" class="loading">
        <UiSkeletonBlock width="40%" height="1.5rem" />
        <div class="loading__rail">
          <UiSkeletonBlock
            v-for="i in 6"
            :key="i"
            width="10.5rem"
            height="15.75rem"
            radius="var(--radius-md)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  padding-bottom: var(--space-16);
}

/* ------------------------------------------------------------------ *
 * The mood row's open and close
 * ------------------------------------------------------------------ */
.mood-row {
  display: grid;
  grid-template-rows: 1fr;
}

.mood-row__inner {
  min-height: 0;
  overflow: hidden;
}
.mood-row-enter-active,
.mood-row-leave-active {
  transition:
    grid-template-rows 520ms var(--ease-out),
    opacity 380ms var(--ease-out);
}
.mood-row-enter-from,
.mood-row-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

/* A row that resizes under the pointer is motion however smoothly it is
   done, so under reduced motion it simply appears at full height. */
@media (prefers-reduced-motion: reduce) {
  .mood-row-enter-active,
  .mood-row-leave-active {
    transition: none;
  }
}

/* ------------------------------------------------------------------ *
 * Hidden gems
 * ------------------------------------------------------------------ */
.gems {
  padding-top: var(--space-12);
}

.gems__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  max-width: var(--page-max);
  margin-inline: auto;
  margin-bottom: var(--space-5);
  padding-inline: var(--space-6);
}

/* The section mark, in the accent. One per heading, and only on the two rows
   that are editorial rather than ranked -- it is a voice, not a bullet. */
.gems__mark {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  color: var(--accent-text);
}

.gems__mark svg {
  width: 1.35rem;
  height: 1.35rem;
}

.gems__sub {
  margin: 0.25rem 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

@media (min-width: 64rem) {
  .gems__head {
    padding-inline: var(--space-10);
  }
}

.gems__title {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(1.6rem, 3vw, 2.25rem);
  letter-spacing: -0.03em;
}

.gems__body {
  display: grid;
  gap: var(--space-4);
  max-width: var(--page-max);
  margin-inline: auto;
  padding-inline: var(--space-6);
}

@media (min-width: 64rem) {
  .gems__body {

    /*
     * The feature takes a fixed share and the row takes the rest.
     *
     * `minmax(0, 1fr)` on the second track is load-bearing: a scrolling rail
     * in an `auto` track sizes itself to its *content*, which is every poster
     * laid end to end, and the grid then stretches far past the window.
     */
    grid-template-columns: minmax(0, 28rem) minmax(0, 1fr);
    align-items: stretch;
    padding-inline: var(--space-10);
  }
}

/* The row inside the panel already sits under the section's own heading, so
   its internal spacing and gutters come off. */
.gems__row {
  padding-top: 0;
}

.gems__row :deep(.row__head) {
  display: none;
}

.gems__row :deep(.rail) {
  padding-inline: 0;
}

.feature {
  position: relative;
  display: block;

  /* `--mx`/`--my` come from `v-magnetic`, and are 0 until a cursor is near. */
  transform: translate(var(--mx, 0px), var(--my, 0px));
  min-height: 14rem;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  isolation: isolate;
  transition:
    transform 260ms var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.feature:hover {
  border-color: var(--border-default);
}

.feature__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 25%;
  opacity: 0.55;
  transition: opacity var(--duration-slow) var(--ease-out);
}

.feature:hover .feature__art {
  opacity: 0.72;
}

.feature__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to right,
    rgb(6 6 8 / 0.96) 0%,
    rgb(6 6 8 / 0.72) 55%,
    rgb(6 6 8 / 0.3) 100%
  );
}

.feature__body {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  height: 100%;
  padding: var(--space-6);
}

.feature__name {
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.feature__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.feature__score {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.feature__score svg {
  width: 0.85rem;
  height: 0.85rem;
  fill: var(--star);
}

.feature__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: auto;
  padding: var(--space-3) var(--space-5);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background-color var(--duration-base) var(--ease-out);
}

.feature__cta svg {
  width: 0.95rem;
  height: 0.95rem;
  transition: transform var(--duration-base) var(--ease-out);
}

.feature:hover .feature__cta {
  background: rgb(255 255 255 / 0.12);
}

.feature:hover .feature__cta svg {
  transform: translateX(3px);
}

.loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-12) var(--space-6) 0;
}

.loading__rail {
  display: flex;
  gap: var(--space-4);
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .feature,
  .feature__art,
  .feature__cta,
  .feature__cta svg {
    transition: none;
  }
  .feature:hover .feature__cta svg {
    transform: none;
  }
  .feature {
    transform: none;
  }
}
</style>
