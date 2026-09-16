<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import type { CommunityReview } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'

/**
 * "Real people. Real perspectives." -- the closing argument.
 *
 * Three real reviews, by real members, of real titles. This is the one place
 * on the page that claims there are people here, so every word in these cards
 * is somebody's: no placeholder quotes, and no cards at all before anyone has
 * written one. An empty state that quietly drops the row is a smaller lie than
 * three invented opinions.
 */
defineProps<{
  reviews: CommunityReview[]
}>()

/** Three slots. A fourth is fetched so a deleted review leaves a full row. */
const SLOTS = 3
</script>

<template>
  <section id="about" class="band">
    <!--
      The photograph is a CSS background rather than an `<img>`, and that is
      load-bearing: it is purely atmospheric, and a background that 404s paints
      nothing and leaves the gradient beneath it looking deliberate, where an
      `<img>` would draw the browser's broken-image glyph across the section.
    -->
    <div class="band__art" aria-hidden="true">
      <span class="band__photo" />
      <span class="band__scrim" />
      <span class="band__grain" />
    </div>

    <div class="band__inner">
      <div v-reveal class="band__pitch">
        <p class="band__eyebrow">{{ $t('landing.communityEyebrow', { brand: BRAND.name }) }}</p>

        <h2 class="band__title">
          <span>{{ $t('landing.communityTitleLead') }}</span>
          <span>{{ $t('landing.communityTitleRest') }}</span>
        </h2>

        <p class="band__sub">
          {{ $t('landing.communitySub') }}
        </p>

        <NuxtLink to="/signup" class="band__cta">
          {{ $t('landing.communityCta') }}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </NuxtLink>
      </div>

      <ul v-if="reviews.length" class="band__cards">
        <li
          v-for="(review, index) in reviews.slice(0, SLOTS)"
          :key="review.id"
          v-reveal="index + 1"
          class="note"
        >
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

          <p class="note__quote">{{ review.quote }}</p>

          <!--
            Counts, not controls. Liking a review from here would need an
            account and a round trip, and a heart that does nothing when
            pressed is worse than a heart that was never a button.
          -->
          <footer class="note__counts">
            <span class="note__count">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20.3 4.8 13a4.6 4.6 0 1 1 7.2-5.7 4.6 4.6 0 1 1 7.2 5.7Z" />
              </svg>
              {{ review.likeCount }}
              <span class="sr-only">{{ $t('landing.likes') }}</span>
            </span>

            <span class="note__count">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20.5 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 20.5 12Z" />
              </svg>
              {{ review.commentCount }}
              <span class="sr-only">{{ $t('landing.replies') }}</span>
            </span>
          </footer>
        </li>
      </ul>
    </div>

    <p class="band__hand" aria-hidden="true">{{ $t('landing.closingLead') }}<br />{{ $t('landing.closingRest') }}</p>
  </section>
</template>

<style scoped>
.band {
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--border-subtle);
  isolation: isolate;
}

/* ------------------------------------------------------------------ *
 * Atmosphere
 * ------------------------------------------------------------------ */

.band__art {
  position: absolute;
  inset: 0;
  z-index: -1;
}

/*
 * The photograph, anchored to the bottom of the band.
 *
 * The interesting part of a rooftop-at-dusk frame is its lower two thirds --
 * the skyline and whoever is sitting in front of it -- and the top of such an
 * image is sky, which is exactly where the heading needs an empty ground.
 * Anchoring to the bottom puts the two in the right places without a crop.
 */
.band__photo {
  position: absolute;
  inset: 0;
  background-image: url('/hero/rooftop-1672.webp');
  background-size: cover;
  background-position: center bottom;
  opacity: 0.5;
}

.band__scrim {
  position: absolute;
  inset: 0;
  background:
    /* Down the left, so the heading has an unbroken ground. */
    linear-gradient(
      to right,
      rgb(10 10 12 / 0.94) 0%,
      rgb(10 10 12 / 0.72) 38%,
      rgb(10 10 12 / 0.4) 100%
    ),
    /* Top and bottom, so the band joins the sections either side of it rather
       than sitting between two hard edges. */
    linear-gradient(to bottom, var(--surface-base) 0%, transparent 22%),
    linear-gradient(to top, rgb(10 10 12 / 0.86) 0%, transparent 44%),
    /* The ground the photograph is composited onto, and the whole section's
       appearance when there is no photograph to load. */
    radial-gradient(90% 80% at 30% 30%, rgb(232 53 43 / 0.08), transparent 70%),
    linear-gradient(to bottom, #0b0b0e, #121016);
}

.band__grain {
  position: absolute;
  inset: 0;
  opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 160px 160px;
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

.band__inner {
  display: grid;
  gap: var(--space-10);
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-16) var(--space-6) calc(var(--space-16) * 1.6);
}

@media (min-width: 64rem) {
  /* Room for the photograph to be a photograph. Without a floor the band is
     only as tall as three short cards, and a cinematic image in a 500px strip
     is a texture rather than a scene. */
  .band {
    min-height: 34rem;
    display: flex;
    align-items: center;
  }

  .band__inner {
    /*
     * The pitch column is sized by its longest word, not by a fraction.
     *
     * At 20rem "Real perspectives." broke across two lines and the heading
     * came out as three -- Real people. / Real / perspectives. -- which reads
     * as a layout accident rather than as the two-line couplet it is. 24rem
     * is what that line needs at this size.
     */
    width: 100%;
    grid-template-columns: minmax(0, 24rem) minmax(0, 1fr);
    gap: var(--space-12);
    align-items: center;
    padding-inline: var(--space-10);
  }
}

.band__eyebrow {
  margin: 0 0 var(--space-3);
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: var(--text-tertiary);
}

.band__title {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(1.85rem, 3.6vw, 2.75rem);
  line-height: 1.12;
  letter-spacing: -0.03em;
}

.band__title span {
  display: block;
}

.band__sub {
  margin: var(--space-5) 0 0;
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--text-secondary);
}

.band__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding: var(--space-3) var(--space-5);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
  background: rgb(255 255 255 / 0.08);
  font-size: var(--text-base);
  font-weight: 500;
  transition:
    background-color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.band__cta svg {
  width: 1.05rem;
  height: 1.05rem;
  transition: transform var(--duration-base) var(--ease-out);
}

.band__cta:hover {
  background: var(--accent);
  border-color: var(--accent);
}

.band__cta:hover svg {
  transform: translateX(3px);
}

/* ------------------------------------------------------------------ *
 * Review cards
 * ------------------------------------------------------------------ */

.band__cards {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 48rem) {
  .band__cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/*
 * Solid, not frosted.
 *
 * A blurred translucent card is the obvious treatment for something sitting on
 * a photograph, and it is wrong twice over: it is the glassmorphism the design
 * system rules out, and `backdrop-filter` across three cards on a full-bleed
 * image is an expensive way to make small text harder to read. A near-opaque
 * ground with a hairline sits on the photograph just as convincingly.
 */
.note {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: rgb(16 16 20 / 0.92);
  box-shadow: 0 18px 44px rgb(0 0 0 / 0.5);
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

/*
 * Clamped, because a review is prose.
 *
 * The API already trims to a card's worth of characters, but characters are
 * not lines -- a narrow column or a long word still pushes it to a fifth line
 * and makes one card taller than its neighbours.
 */
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

.note__counts {
  display: flex;
  gap: var(--space-5);
  margin-top: auto;
  padding-top: var(--space-1);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
}

.note__count {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.note__count svg {
  width: 0.9rem;
  height: 0.9rem;
}

/* ------------------------------------------------------------------ *
 * The handwritten line
 * ------------------------------------------------------------------ */

/*
 * Decoration, and hidden from assistive tech because it is: the sentence is a
 * flourish over a photograph, not a claim the page is making, and it would be
 * read out in the middle of the community section where it belongs to
 * neither the heading nor the cards.
 *
 * Only once there is a bottom-right corner of photograph to write it on.
 */
.band__hand {
  display: none;
}

@media (min-width: 64rem) {
  .band__hand {
    position: absolute;
    right: var(--space-12);
    bottom: var(--space-10);
    display: block;
    margin: 0;
    font-family: var(--font-hand);
    font-size: 1.75rem;
    font-weight: 500;
    line-height: 1.25;
    text-align: center;
    color: var(--text-primary);
    transform: rotate(-3deg);
    text-shadow: 0 2px 18px rgb(0 0 0 / 0.85);
  }

  /* The underline a hand would actually draw: a short sweep under the second
     line rather than a text-decoration rule across both. */
  .band__hand::after {
    content: '';
    display: block;
    width: 62%;
    height: 1px;
    margin: 0.35rem 0 0 auto;
    background: currentColor;
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .band__cta,
  .band__cta svg {
    transition: none;
  }
}
</style>
