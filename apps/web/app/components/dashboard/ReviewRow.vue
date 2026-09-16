<script setup lang="ts">
import { MEDIA_TYPES } from '@revy/shared/constants'
import type { DashboardReview, MediaType } from '@revy/shared/types'
import { imageAtWidth, relativeTime } from '@revy/shared/utils'

/**
 * "Trending reviews" -- what the community is talking about this week.
 *
 * A grid rather than a carousel, and deliberately: a review card is something
 * you read, and reading four of them means seeing four at once. The carousel
 * on the landing page works because posters are things you recognise at a
 * glance; prose is not.
 */
defineProps<{
  reviews: DashboardReview[]
  loading?: boolean
}>()

const { t } = useI18n()

/** The active type filter. `null` is "All". */
const filter = defineModel<MediaType | null>({ default: null })

const tabs = computed(() => [
  { value: null, label: t('common.all') },
  ...MEDIA_TYPES.map((type) => ({ value: type, label: t(`mediaType.${type}_plural`) })),
])
</script>

<template>
  <section class="row">
    <header class="row__head">
      <div>
        <h2 class="row__title">{{ $t('dash.trendingReviews') }}</h2>
        <p class="row__sub">{{ $t('dash.trendingSub') }}</p>
      </div>

      <div class="row__controls">
        <!--
          A real tab list, not a row of links.

          `aria-selected` and `role=tab` are what tell a screen reader that
          pressing one of these changes the cards below rather than navigating
          away, which is the only thing distinguishing a filter from a menu.
        -->
        <div class="tabs" role="tablist" :aria-label="$t('dash.filterReviews')">
          <button
            v-for="tab in tabs"
            :key="tab.label"
            type="button"
            role="tab"
            class="tabs__tab"
            :class="{ 'tabs__tab--on': filter === tab.value }"
            :aria-selected="filter === tab.value"
            @click="filter = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <NuxtLink to="/discover" class="row__all">{{ $t('common.seeAll') }}</NuxtLink>
      </div>
    </header>

    <!-- Skeletons rather than a spinner: the row keeps its height, so
         switching filters does not make everything below it jump. -->
    <ul v-if="loading" class="cards">
      <li v-for="i in 4" :key="i" class="card card--ghost">
        <UiSkeletonBlock width="100%" height="9rem" radius="var(--radius-md)" />
        <UiSkeletonBlock width="60%" height="0.9rem" />
        <UiSkeletonBlock width="90%" height="0.9rem" />
      </li>
    </ul>

    <UiEmptyState
      v-else-if="reviews.length === 0"
      :title="$t('explore.empty')"
      :description="
        filter
          ? $t('dash.reviewsEmptyFiltered')
          : $t('dash.reviewsEmpty')
      "
    />

    <ul v-else class="cards">
      <li v-for="(review, index) in reviews" :key="review.id" v-reveal="index" class="card">
        <MediaQuickLink :media-id="review.mediaId" :title="review.mediaTitle" :cover-image-url="review.coverImageUrl" class="card__art">
          <img
            v-if="review.coverImageUrl"
            :src="imageAtWidth(review.coverImageUrl, 342) ?? review.coverImageUrl"
            :alt="review.mediaTitle"
            loading="lazy"
            decoding="async"
          />
        </MediaQuickLink>

        <div class="card__body">
          <header class="card__who">
            <UiUserAvatar :user="review.author" size="xs" />
            <span class="card__name">@{{ review.author.username }}</span>
            <UiMediaTypeTag :media-type="review.mediaType" size="sm" />
            <time class="card__time" :datetime="review.createdAt">
              {{ relativeTime(review.createdAt) }}
            </time>
          </header>

          <div v-if="review.score !== null" class="card__score">
            <UiStarRating :score="review.score" size="sm" />
            <span>{{ review.score.toFixed(1) }}</span>
          </div>

          <p class="card__headline">{{ review.headline }}</p>
          <p v-if="review.body" class="card__text">{{ review.body }}</p>

          <!-- Counts, not controls: liking from here needs a round trip, and a
               heart that does nothing when pressed is worse than a number. -->
          <footer class="card__counts">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20.3 4.8 13a4.6 4.6 0 1 1 7.2-5.7 4.6 4.6 0 1 1 7.2 5.7Z" />
              </svg>
              {{ review.likeCount }}<span class="sr-only"> likes</span>
            </span>
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20.5 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 20.5 12Z" />
              </svg>
              {{ review.commentCount }}<span class="sr-only"> replies</span>
            </span>
          </footer>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.row {
  padding: var(--space-10) var(--space-6) 0;
}

@media (min-width: 64rem) {
  .row {
    padding-inline: var(--space-8);
  }
}

.row__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.row__title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.row__sub {
  margin: 0.2rem 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.row__controls {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  /* A flex item will not shrink below its content unless told it may, and the
     content here is five pills plus a link -- 417px of it on a 390px phone. */
  min-width: 0;
}

/* Never the thing that gets shrunk or scrolled away: it is one short link,
   and losing it would cost the only route to the full list. */
.row__all {
  flex: none;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
  display: inline-flex;
  align-items: center;
  /*
   * Tall enough to hit with a thumb.
   *
   * One line of 15px type is a 23px box, and WCAG 2.2 asks for 24 (2.5.8).
   * One pixel sounds like pedantry until it is a standalone control in a
   * section header being aimed at on a moving train; the padding is symmetric,
   * so nothing moves visually.
   */
  padding-block: var(--space-1);
}

.row__all:hover {
  color: var(--text-primary);
}

/*
 * The pill group scrolls rather than overflowing.
 *
 * Five media types plus "All" do not fit beside a "See all" link at 390px, and
 * the three that did not fit were simply painted past the edge of the screen
 * and clipped -- reachable on a desktop, invisible and untappable on a phone.
 *
 * The same treatment the card rails get in `main.css`: the scrollbar is
 * hidden, and the half-visible next pill is the affordance. It is a filter
 * rather than navigation, so nothing here is lost if it is never scrolled --
 * "All" is first and is the default.
 */
.tabs {
  display: flex;
  gap: 0.15rem;
  padding: 0.2rem;
  border-radius: var(--radius-full);
  background: var(--surface-raised);
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  /* Stops a flex row from stretching the pills vertically as it shrinks. */
  flex-shrink: 1;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tabs__tab {
  flex: none;
}

.tabs__tab {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
  transition:
    color var(--duration-fast) var(--ease-out),
    background-color var(--duration-base) var(--ease-out);
}

.tabs__tab:hover {
  color: var(--text-primary);
}

/* The one place on this screen the accent is used as a fill: it marks which
   of five mutually exclusive states you are in, which is exactly what a brand
   colour is for. */
.tabs__tab--on {
  color: var(--text-primary);
  background: var(--accent);
}

/* -------------------------------- cards --------------------------------- */

.cards {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 40rem) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 80rem) {
  .cards {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  transition:
    border-color var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

/*
 * The wash the card warms up with.
 *
 * Its own layer rather than a background on the card, because the card's
 * ground is opaque and a gradient there would have to replace it -- which
 * means animating a `background-image`, which does not interpolate. An
 * overlay fades its opacity instead, which composites on the GPU.
 *
 * Behind the content and ignoring the pointer, so it can never take a click
 * meant for the review underneath it.
 */
.card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--accent-wash);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-base) var(--ease-out);
}

.card > * {
  position: relative;
  z-index: 1;
}

.card--ghost {
  gap: var(--space-3);
  padding: var(--space-4);
}

@media (hover: hover) and (pointer: fine) {
  .card:not(.card--ghost):hover {
    border-color: var(--accent-edge);
    transform: translateY(-3px);
    box-shadow: var(--accent-glow-soft);
  }

  .card:not(.card--ghost):hover::after {
    opacity: 1;
  }
}

/*
 * A landscape crop of a portrait cover, on purpose.
 *
 * The card is about the *review*; the artwork is there to tell you what is
 * being reviewed at a glance, so it gets a band rather than the full poster.
 * Anchored high, because the top of a cover is where the title usually is.
 */
.card__art {
  display: block;
  aspect-ratio: 16 / 11;
  overflow: hidden;
  background: var(--surface-overlay);
}

.card__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 22%;
}

.card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
}

.card__who {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.card__name {
  font-size: var(--text-2xs);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__time {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

.card__score {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--star);
}

.card__headline {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* Clamped, because a review is prose: the API trims to a character budget,
   and characters are not lines. */
.card__text {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.card__counts {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-1);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
}

.card__counts span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.card__counts svg {
  width: 0.85rem;
  height: 0.85rem;
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .card::after,
  .tabs__tab,
  .row__all {
    transition: none;
  }

  /* The lift goes, the wash stays: colour is not motion, and it is the part
     that says which card the pointer is on. */
  .card:not(.card--ghost):hover {
    transform: none;
  }
}
</style>
