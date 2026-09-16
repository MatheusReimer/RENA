<script setup lang="ts">
import type { CommunityReview } from '@revy/shared/types'
import { imageAtWidth, relativeTime } from '@revy/shared/utils'

/**
 * "What the community is saying" -- the Explore cut.
 *
 * A separate component from the landing screen's band despite sharing a
 * heading, because the cards are doing a different job. There, three quotes
 * are evidence that people exist. Here the reader is browsing, so each quote
 * carries the title it is about as something they can click -- the review is
 * the pitch and the chip is the way in.
 */
defineProps<{
  reviews: CommunityReview[]
}>()

const rail = ref<HTMLElement | null>(null)

/*
 * The arrows exist only when there is somewhere to go.
 *
 * With three reviews the row fits, and the pair of arrows beside the heading
 * did nothing when pressed -- which reads as the page being broken rather than
 * as the row being short.
 */
const { overflows, atStart, atEnd } = useRailOverflow(rail)

function page(direction: 1 | -1) {
  const el = rail.value
  if (!el) return

  const step = Math.max(el.clientWidth - 120, 200)
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollBy({ left: step * direction, behavior: still ? 'auto' : 'smooth' })
}
</script>

<template>
  <section class="say">
    <header v-reveal class="say__head">
      <div>
        <h2 class="say__title">{{ $t('explore.sayEyebrow') }}</h2>
        <p class="say__sub">{{ $t('explore.sayTitle') }}</p>
      </div>

      <div class="say__controls">
        <NuxtLink to="/community" class="say__all">{{ $t('common.seeAll') }}</NuxtLink>

        <!-- Absent, not disabled, when the row fits: a greyed-out control
             still says "there is more, but not for you". -->
        <template v-if="overflows">
          <button
            type="button"
            class="say__arrow"
            :disabled="atStart"
            :aria-label="$t('explore.scrollBack')"
            @click="page(-1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            class="say__arrow"
            :disabled="atEnd"
            :aria-label="$t('explore.scrollForward')"
            @click="page(1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </template>
      </div>
    </header>

    <div class="say__body">
      <ul ref="rail" class="say__rail">
        <li v-for="(review, index) in reviews" :key="review.id" v-reveal="index" class="note">
          <header class="note__head">
            <UiUserAvatar :user="review.author" size="sm" />
            <span class="note__who">
              <span class="note__name">@{{ review.author.username }}</span>
              <time class="note__time" :datetime="review.createdAt">
                {{ relativeTime(review.createdAt) }}
              </time>
            </span>
          </header>

          <UiStarRating v-if="review.score !== null" :score="review.score" size="sm" />

          <p class="note__quote">&ldquo;{{ review.quote }}&rdquo;</p>

          <!-- The way in. On a browsing screen the review is the argument and
               this is the door it opens. -->
          <NuxtLink :to="`/media/${review.mediaId}`" class="note__media">
            <img
              v-if="review.coverImageUrl"
              :src="imageAtWidth(review.coverImageUrl, 185) ?? review.coverImageUrl"
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span class="note__media-text">
              <span class="note__media-title">{{ review.mediaTitle }}</span>
              <UiMediaTypeTag :media-type="review.mediaType" size="sm" />
            </span>
          </NuxtLink>

          <!--
            Counts, not controls.

            The design puts a bookmark here as well. It is not drawn, because
            saving a review needs an account and a round trip, and a control
            that does nothing when pressed is worse than a number that never
            promised to.
          -->
          <footer class="note__counts">
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
        </li>
      </ul>

      <!--
        The closing flourish, in its own panel at the end of the row.

        Decorative and hidden from assistive tech: it is a flourish over a
        photograph, not a claim the page is making, and read aloud between the
        reviews and the next heading it would belong to neither.
      -->
      <aside class="say__coda" aria-hidden="true">
        <span class="say__orb" />
        <p>{{ $t('explore.sayClosingA') }}<br />{{ $t('explore.sayClosingB') }}<br />{{ $t('explore.sayClosingC') }}</p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.say {
  padding: var(--space-12) 0 0;
}

.say__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  max-width: var(--page-max);
  margin-inline: auto;
  margin-bottom: var(--space-5);
  padding-inline: var(--space-6);
}

@media (min-width: 64rem) {
  .say__head,
  .say__body {
    padding-inline: var(--space-10);
  }
}

.say__title {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(1.6rem, 3vw, 2.25rem);
  letter-spacing: -0.03em;
}

.say__sub {
  margin: 0.25rem 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.say__controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.say__all {
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

.say__all:hover {
  color: var(--text-primary);
}

.say__arrow {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .say__arrow {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
    color: var(--text-secondary);
    transition:
      color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out);
  }

  .say__arrow:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
    background: var(--surface-raised);
  }
}

.say__arrow svg {
  width: 1rem;
  height: 1rem;
}

/* ------------------------------------------------------------------ *
 * The row
 * ------------------------------------------------------------------ */

.say__body {
  display: grid;
  gap: var(--space-4);
  max-width: var(--page-max);
  margin-inline: auto;
  padding-inline: var(--space-6);
}

@media (min-width: 72rem) {
  .say__body {
    /* The coda takes a fixed share; `minmax(0, 1fr)` on the rail is
       load-bearing, or a scrolling row in an auto track sizes itself to every
       card laid end to end and stretches the grid past the window. */
    grid-template-columns: minmax(0, 1fr) 15rem;
    align-items: stretch;
  }
}

.say__rail {
  display: flex;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}

.say__rail::-webkit-scrollbar {
  display: none;
}

/*
 * Solid, not frosted.
 *
 * A blurred translucent card is the obvious treatment for something on a dark
 * page and it is the glassmorphism the design system rules out -- and
 * `backdrop-filter` behind a row of cards is an expensive way to make small
 * text harder to read.
 */
.note {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 0 0 auto;
  width: 19rem;
  max-width: 85vw;
  padding: var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  scroll-snap-align: start;
}

.note__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.note__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.note__name {
  font-size: var(--text-xs);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note__time {
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

/* Clamped, because a review is prose: the API trims to a character budget,
   and characters are not lines. */
.note__quote {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}

.note__media {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: auto;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.04);
  transition: background-color var(--duration-fast) var(--ease-out);
}

.note__media:hover {
  background: rgb(255 255 255 / 0.09);
}

.note__media img {
  width: 2rem;
  height: 2.9rem;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.note__media-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.note__media-title {
  font-size: var(--text-xs);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note__media-type {
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

.note__counts {
  display: flex;
  gap: var(--space-5);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
}

.note__counts span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.note__counts svg {
  width: 0.9rem;
  height: 0.9rem;
}

/* ------------------------------------------------------------------ *
 * Coda
 * ------------------------------------------------------------------ */

.say__coda {
  display: none;
}

@media (min-width: 72rem) {
  .say__coda {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-6);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: radial-gradient(80% 60% at 70% 20%, rgb(200 16 46 / 0.12), transparent 70%),
      linear-gradient(to bottom, #0e0e12, #131016);
  }

  .say__coda p {
    margin: 0;
    font-family: var(--font-hand);
    font-size: 1.5rem;
    font-weight: 500;
    line-height: 1.3;
    color: var(--text-primary);
  }
}

.say__orb {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-full);
  background: radial-gradient(circle at 35% 30%, #ff8095, var(--accent) 55%, #5e0816);
  box-shadow: 0 0 1.25rem rgb(200 16 46 / 0.55);
}

@media (prefers-reduced-motion: reduce) {
  .say__all,
  .say__arrow,
  .note__media {
    transition: none;
  }
}
</style>
