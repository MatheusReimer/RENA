<script setup lang="ts">
import { MEDIA_STATUS_LABELS, MEDIA_TYPE_LABELS } from '@revy/shared/constants'
import type { DiscussionThread, MediaStatus, Review } from '@revy/shared/types'
import { formatAverage, formatRatingCount, formatRuntime, releaseYear } from '@revy/shared/utils'

/**
 * Media detail (SPEC 19).
 *
 * Ordered exactly as SPEC 19 prioritises: the media itself, then the viewer's
 * own rating and status, then friends, then community and reviews, with the
 * aggregate score alongside.
 */
const route = useRoute()
const api = useApi()
const auth = useAuthStore()

const mediaId = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAsyncData(
  () => `media:${mediaId.value}`,
  () => api.media.getById(mediaId.value),
  { watch: [mediaId] },
)

const media = computed(() => data.value?.media ?? null)

const tab = ref<'overview' | 'reviews' | 'discussions' | 'friends'>('overview')

const tabs = computed(() => [
  { value: 'overview', label: 'Overview' },
  { value: 'reviews', label: 'Reviews', badge: media.value?.reviewCount || undefined },
  {
    value: 'discussions',
    label: 'Discussions',
    badge: media.value?.discussionCount || undefined,
  },
  { value: 'friends', label: 'Friends', badge: media.value?.friendRatings.length || undefined },
])

/** Metadata line: 2024 · Movie · Sci-Fi, Drama · 2h 46m */
const metaLine = computed(() => {
  if (!media.value) return ''
  const parts: string[] = []

  const year = releaseYear(media.value.releaseDate)
  if (year) parts.push(year)

  parts.push(MEDIA_TYPE_LABELS[media.value.mediaType])

  const genres = media.value.metadata.genres
  if (genres?.length) parts.push(genres.slice(0, 2).join(', '))

  const runtime = formatRuntime(media.value.metadata.runtimeMinutes)
  if (runtime) parts.push(runtime)

  const authors = media.value.metadata.authors
  if (authors?.length) parts.push(authors[0]!)

  return parts.join(' · ')
})

/* ------------------------------------------------------------------ *
 * Rating (SPEC 10)
 * ------------------------------------------------------------------ */

const rateOpen = ref(false)
const draftScore = ref<number | null>(null)
const savingRating = ref(false)
const rateError = ref<string | null>(null)

function openRating() {
  if (!auth.isSignedIn) return navigateTo('/signin')
  draftScore.value = media.value?.viewerState?.score ?? null
  rateError.value = null
  rateOpen.value = true
}

async function saveRating() {
  if (draftScore.value === null || !media.value) return
  savingRating.value = true
  rateError.value = null

  try {
    await api.ratings.upsert(media.value.id, draftScore.value)
    rateOpen.value = false
    await refresh()
  } catch (err) {
    rateError.value = err instanceof ApiError ? err.message : 'Could not save your rating.'
  } finally {
    savingRating.value = false
  }
}

/* ------------------------------------------------------------------ *
 * Consumption status (SPEC 9)
 * ------------------------------------------------------------------ */

const savingStatus = ref(false)

const statusOptions = computed<MediaStatus[]>(() => ['planned', 'in_progress', 'completed'])

async function setStatus(next: MediaStatus) {
  if (!auth.isSignedIn) return navigateTo('/signin')
  if (!media.value || savingStatus.value) return

  savingStatus.value = true
  try {
    // Tapping the active status clears it, so there is no separate "remove".
    const value = media.value.viewerState?.status === next ? null : next
    await api.ratings.setStatus(media.value.id, value)
    await refresh()
  } finally {
    savingStatus.value = false
  }
}

/* ------------------------------------------------------------------ *
 * Reviews (SPEC 11)
 * ------------------------------------------------------------------ */

const reviews = ref<Review[]>([])
const reviewsLoaded = ref(false)
const reviewsLoading = ref(false)

const composeOpen = ref(false)

/* ------------------------------------------------------------------ *
 * Lists (SPEC 15)
 * ------------------------------------------------------------------ */

const addToListOpen = ref(false)

function openAddToList() {
  if (!auth.isSignedIn) return navigateTo('/signin')
  addToListOpen.value = true
}

/* ------------------------------------------------------------------ *
 * Discussions (SPEC 14)
 * ------------------------------------------------------------------ */

const threads = ref<DiscussionThread[]>([])
const threadsLoaded = ref(false)
const threadsLoading = ref(false)
const threadComposerOpen = ref(false)

async function loadThreads() {
  if (!media.value) return
  threadsLoading.value = true
  try {
    const page = await api.media.discussions(media.value.id)
    threads.value = page.items
    threadsLoaded.value = true
  } finally {
    threadsLoading.value = false
  }
}

// Both lists load on first visit to their tab rather than with the page, so
// opening a media item is one request instead of three.
watch(tab, async (value) => {
  if (!media.value) return

  if (value === 'reviews' && !reviewsLoaded.value) {
    reviewsLoading.value = true
    try {
      const page = await api.media.reviews(media.value.id)
      reviews.value = page.items
      reviewsLoaded.value = true
    } finally {
      reviewsLoading.value = false
    }
    return
  }

  if (value === 'discussions' && !threadsLoaded.value) {
    await loadThreads()
  }
})

useHead(() => ({ title: media.value?.title ?? 'Loading' }))
</script>

<template>
  <div class="page">
    <div v-if="status === 'pending' && !media" class="loading">
      <UiSkeletonBlock width="100%" height="18rem" radius="0" />
      <div class="loading__body">
        <UiSkeletonBlock width="60%" height="2rem" />
        <UiSkeletonBlock width="40%" height="1rem" />
        <UiSkeletonBlock width="100%" height="4rem" />
      </div>
    </div>

    <UiEmptyState
      v-else-if="error || !media"
      icon="🎬"
      title="We couldn't load this title."
      description="It may have been removed, or the catalogue is unavailable."
    >
      <template #action>
        <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <!-- Hero (SPEC 30: large media artwork) -->
      <header class="hero">
        <div class="hero__art">
          <img
            v-if="media.backdropImageUrl"
            :src="media.backdropImageUrl"
            :alt="`${media.title} artwork`"
            class="hero__backdrop"
            fetchpriority="high"
          />
          <div v-else-if="media.coverImageUrl" class="hero__cover-bg">
            <img :src="media.coverImageUrl" alt="" aria-hidden="true" class="hero__blur" />
            <img :src="media.coverImageUrl" :alt="`${media.title} cover`" class="hero__cover" />
          </div>
          <div class="hero__scrim" />
        </div>

        <button type="button" class="hero__back" aria-label="Go back" @click="$router.back()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 class="hero__title">{{ media.title }}</h1>
      </header>

      <div class="body">
        <p class="meta">{{ metaLine }}</p>

        <!-- Aggregate score (SPEC 19) -->
        <div class="score">
          <span class="score__value">{{ formatAverage(media.ratingSummary.average) }}</span>
          <div class="score__detail">
            <UiStarRating :score="media.ratingSummary.average" size="lg" />
            <span class="score__count">
              {{ formatRatingCount(media.ratingSummary.count) }}
              {{ media.ratingSummary.count === 1 ? 'rating' : 'ratings' }}
            </span>
          </div>
        </div>

        <!-- The viewer's own state comes before everything social (SPEC 19) -->
        <div class="actions">
          <UiAppButton variant="primary" size="lg" @click="openRating">
            <UiStarRating
              v-if="media.viewerState?.score"
              :score="media.viewerState.score"
              size="sm"
            />
            {{ media.viewerState?.score ? `Your rating · ${media.viewerState.score.toFixed(1)}` : 'Rate this' }}
          </UiAppButton>

          <UiAppButton variant="secondary" size="lg" @click="openAddToList">
            <span class="actions__plus" aria-hidden="true">+</span>
            {{ media.viewerState?.inListIds.length ? 'In your lists' : 'Add to list' }}
          </UiAppButton>
        </div>

        <div class="statuses" role="group" aria-label="Your status">
          <button
            v-for="option in statusOptions"
            :key="option"
            type="button"
            class="status-chip"
            :class="{ 'status-chip--active': media.viewerState?.status === option }"
            :disabled="savingStatus"
            :aria-pressed="media.viewerState?.status === option"
            @click="setStatus(option)"
          >
            {{ MEDIA_STATUS_LABELS[media.mediaType][option] }}
          </button>
        </div>

        <UiTabNav v-model="tab" :tabs="tabs" class="body__tabs" />

        <!-- Overview -->
        <section v-if="tab === 'overview'" class="section">
          <p v-if="media.description" class="description">{{ media.description }}</p>
          <p v-else class="description description--empty">
            No description available for this title yet.
          </p>

          <!-- Friends (SPEC 19) -->
          <div v-if="media.friendRatings.length" class="friends">
            <h2 class="section__heading">Your friends</h2>
            <NuxtLink
              v-for="friend in media.friendRatings.slice(0, 5)"
              :key="friend.user.id"
              :to="`/u/${friend.user.username}`"
              class="friend"
            >
              <UiUserAvatar :user="friend.user" size="md" />
              <span class="friend__name">{{ friend.user.displayName }}</span>
              <UiStarRating :score="friend.score" size="sm" />
              <span class="friend__score">{{ friend.score?.toFixed(1) }}</span>
            </NuxtLink>
          </div>
        </section>

        <!-- Reviews (SPEC 11) -->
        <section v-else-if="tab === 'reviews'" class="section">
          <div class="section__actions">
            <UiAppButton
              v-if="!media.viewerState?.hasReview"
              variant="secondary"
              size="sm"
              @click="auth.isSignedIn ? (composeOpen = true) : navigateTo('/signin')"
            >
              Write a review
            </UiAppButton>
          </div>

          <div v-if="reviewsLoading" class="section__loading">
            <UiSkeletonBlock v-for="i in 3" :key="i" width="100%" height="5rem" />
          </div>

          <UiEmptyState
            v-else-if="reviews.length === 0"
            icon="✍️"
            title="No reviews yet."
            description="Be the first person to share what you thought."
          />

          <MediaReviewCard
            v-for="review in reviews"
            v-else
            :key="review.id"
            :review="review"
          />
        </section>

        <!-- Discussions (SPEC 14) -->
        <section v-else-if="tab === 'discussions'" class="section">
          <div class="section__actions">
            <UiAppButton
              variant="secondary"
              size="sm"
              @click="auth.isSignedIn ? (threadComposerOpen = true) : navigateTo('/signin')"
            >
              Start a discussion
            </UiAppButton>
            <UiAppButton
              variant="ghost"
              size="sm"
              @click="navigateTo(`/community/${media.id}`)"
            >
              Open community
            </UiAppButton>
          </div>

          <div v-if="threadsLoading" class="section__loading">
            <UiSkeletonBlock v-for="i in 3" :key="i" width="100%" height="3.5rem" />
          </div>

          <UiEmptyState
            v-else-if="threads.length === 0"
            icon="💬"
            title="Be the first person to start a discussion."
            description="Ask a question, share a theory, or argue about the ending."
          />

          <DiscussionThreadRow
            v-for="thread in threads"
            v-else
            :key="thread.id"
            :thread="thread"
          />
        </section>

        <!-- Friends tab -->
        <section v-else class="section">
          <UiEmptyState
            v-if="!auth.isSignedIn"
            icon="👥"
            title="Sign in to see what your friends thought."
          />
          <UiEmptyState
            v-else-if="media.friendRatings.length === 0"
            icon="👥"
            title="None of your friends have rated this yet."
            description="Add friends to see their ratings here."
          />
          <NuxtLink
            v-for="friend in media.friendRatings"
            v-else
            :key="friend.user.id"
            :to="`/u/${friend.user.username}`"
            class="friend"
          >
            <UiUserAvatar :user="friend.user" size="md" />
            <span class="friend__name">{{ friend.user.displayName }}</span>
            <UiStarRating :score="friend.score" size="sm" />
            <span class="friend__score">{{ friend.score?.toFixed(1) }}</span>
          </NuxtLink>
        </section>
      </div>

      <!-- Rating sheet -->
      <MediaRatingSheet
        v-model:open="rateOpen"
        v-model:score="draftScore"
        :title="media.title"
        :saving="savingRating"
        :error="rateError"
        @save="saveRating"
      />

      <!-- Add to list -->
      <ListAddToListSheet
        v-if="addToListOpen"
        :media-id="media.id"
        :media-title="media.title"
        :in-list-ids="media.viewerState?.inListIds ?? []"
        @close="addToListOpen = false"
        @changed="refresh"
      />

      <!-- New discussion -->
      <DiscussionThreadComposer
        v-if="threadComposerOpen"
        :media-id="media.id"
        :media-title="media.title"
        @close="threadComposerOpen = false"
        @created="(threadId) => navigateTo(`/discussions/${threadId}`)"
      />

      <!-- Review composer -->
      <MediaReviewComposer
        v-if="composeOpen"
        :media-id="media.id"
        :media-title="media.title"
        :initial-score="media.viewerState?.score ?? null"
        @close="composeOpen = false"
        @created="
          () => {
            composeOpen = false
            reviewsLoaded = false
            tab = 'reviews'
            refresh()
          }
        "
      />
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
}

.loading__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-4);
}

/* ------------------------------------------------------------------ *
 * Hero
 * ------------------------------------------------------------------ */

.hero {
  position: relative;
}

.hero__art {
  position: relative;
  aspect-ratio: 4 / 3;
  max-height: 24rem;
  overflow: hidden;
  background: var(--surface-raised);
}

.hero__backdrop {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Books have no backdrop art. Rather than inventing one, the cover is shown
   over a blurred copy of itself -- honest about the source material. */
.hero__cover-bg {
  position: relative;
  display: grid;
  place-items: center;
  height: 100%;
}

.hero__blur {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(30px) saturate(1.4);
  transform: scale(1.2);
  opacity: 0.5;
}

.hero__cover {
  position: relative;
  height: 80%;
  width: auto;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-float);
}

.hero__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgb(10 10 12 / 0.35) 0%,
    rgb(10 10 12 / 0) 35%,
    rgb(10 10 12 / 0.75) 82%,
    var(--surface-base) 100%
  );
}

.hero__back {
  position: absolute;
  top: calc(var(--space-4) + env(safe-area-inset-top, 0px));
  left: var(--space-4);
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-full);
  background: var(--scrim-strong);
  color: var(--text-primary);
}

.hero__back svg {
  width: 1.125rem;
  height: 1.125rem;
}

.hero__title {
  position: absolute;
  inset-inline: var(--space-4);
  bottom: var(--space-3);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
}

/* ------------------------------------------------------------------ *
 * Body
 * ------------------------------------------------------------------ */

.body {
  padding: var(--space-4);
}

.meta {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.score {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-block: var(--space-5);
}

.score__value {
  font-size: var(--text-4xl);
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--tracking-tight);
}

.score__detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.score__count {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.actions {
  display: flex;
  gap: var(--space-3);
}

.actions > * {
  flex: 1;
}

.actions__plus {
  font-size: var(--text-lg);
  line-height: 1;
}

.statuses {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.status-chip {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.status-chip:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.status-chip--active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
}

.status-chip:disabled {
  opacity: 0.6;
}

.body__tabs {
  margin-top: var(--space-6);
}

.section {
  padding-top: var(--space-5);
}

.section__heading {
  margin-bottom: var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}

.section__actions {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.section__loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.description {
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
}

.description--empty {
  color: var(--text-tertiary);
  font-style: italic;
}

.friends {
  margin-top: var(--space-8);
}

.friend {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.friend__name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 600;
}

.friend__score {
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--star);
}

@media (min-width: 60rem) {
  .hero__art {
    max-height: 28rem;
    border-radius: 0 0 var(--radius-xl) var(--radius-xl);
  }

  .hero__title {
    font-size: var(--text-4xl);
  }
}
</style>
