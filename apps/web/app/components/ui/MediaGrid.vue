<script setup lang="ts">
import type { MediaType } from '@revy/shared/types'
import { formatAverage, formatRatingCount, imageAtWidth, imageSrcSet } from '@revy/shared/utils'

/**
 * A wrapping grid of media cards.
 *
 * The third way this product shows a set of titles, and the first one that is
 * not a rail. Rails and the coverflow both answer "here is a row, look along
 * it" -- they are for a screen that is making a suggestion, where the point is
 * that one thing is in front.
 *
 * Search is not making a suggestion. Somebody on this screen is looking for
 * something, and a horizontal row hides most of what it holds behind a gesture
 * and shows about five titles at a time. A grid puts thirty on the screen at
 * once and lets the reader do the scanning, which is the actual job here.
 *
 * The card is deliberately the same object Explore uses -- same frame, same
 * score badge, same type tag -- because it is the same card. Only the way they
 * are arranged differs.
 */
interface GridItem {
  id: string
  mediaType: MediaType
  title: string
  coverImageUrl: string | null
  /** Already formatted; empty where the provider supplied no date. */
  releaseYear: string
  /** RENA's own average, 0.5-5.0. Null when nobody here has rated it. */
  ratingAverage: number | null
  ratingCount: number
  /**
   * The provider's aggregate, for the large majority nobody here has rated.
   *
   * Optional, because two of the three screens using this grid predate it and
   * a card without one simply says "not rated yet" -- which is still more
   * than the blank poster it replaced.
   */
  externalRating?: { source: string; score: number; votes: number } | null
  /**
   * A sentence or two about what it is, shown under the score on hover.
   *
   * Untrimmed here: the payloads these screens already carry include the full
   * description for other reasons, so there is nothing to save by trimming at
   * the call site. The overlay trims it.
   */
  blurb?: string | null
}

defineProps<{
  items: GridItem[]
  /** Small uppercase line above the heading. Optional. */
  eyebrow?: string
  title?: string
  /** One line under the heading. Optional. */
  subtitle?: string
}>()
</script>

<template>
  <section class="grid-section">
    <header v-if="title" class="grid-section__head">
      <p v-if="eyebrow" class="grid-section__eyebrow">{{ eyebrow }}</p>
      <h2 class="grid-section__title">{{ title }}</h2>
      <p v-if="subtitle" class="grid-section__sub">{{ subtitle }}</p>
    </header>

    <ul class="grid">
      <li v-for="item in items" :key="item.id" class="card">
        <MediaQuickLink :media-id="item.id" :title="item.title" :cover-image-url="item.coverImageUrl">
          <span class="card__frame">
            <img
              v-if="item.coverImageUrl"
              :src="imageAtWidth(item.coverImageUrl, 500) ?? item.coverImageUrl"
              :srcset="imageSrcSet(item.coverImageUrl, [342, 500, 780]) ?? undefined"
              sizes="(min-width: 64rem) 22rem, (min-width: 48rem) 17rem, 45vw"
              :alt="item.title"
              loading="lazy"
              decoding="async"
            />

            <!-- RENA's own score, where this community has one. Always on,
                 because it is the one number that belongs here. -->
            <span v-if="item.ratingAverage !== null" class="card__score">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z" />
              </svg>
              {{ formatAverage(item.ratingAverage) }}
            </span>

            <!-- And the fuller picture on hover: how many people, or whose
                 number it is when nobody here has one. -->
            <UiCardOverlay
              :rating-average="item.ratingAverage"
              :rating-count="item.ratingCount"
              :external-rating="item.externalRating ?? null"
              :blurb="item.blurb ?? null"
            />
          </span>

          <span class="card__title clamp-2">{{ item.title }}</span>

          <span class="card__meta">
            {{ $t(`mediaType.${item.mediaType}`) }}
            <template v-if="item.releaseYear">· {{ item.releaseYear }}</template>
          </span>

          <!--
            Pluralised by the locale, not by an inline ternary.

            `rating`/`ratings` is an English rule and only an English rule;
            every language here forms plurals differently, and a few of the
            ones we may add later have more than two forms. The `|` branches in
            the locale file are the translator's to decide.
          -->
          <span v-if="item.ratingCount" class="card__meta card__meta--quiet">
            {{ $t('common.ratings', { count: formatRatingCount(item.ratingCount) }, item.ratingCount) }}
          </span>
        </MediaQuickLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.grid-section {
  padding-block: var(--space-8) var(--space-10);
}

.grid-section__head {
  margin-bottom: var(--space-6);
}

.grid-section__eyebrow {
  margin: 0 0 var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--text-tertiary);
}

.grid-section__title {
  margin: 0;
  font-size: clamp(var(--text-lg), 2.4vw, var(--text-2xl));
  letter-spacing: var(--tracking-tight);
}

.grid-section__sub {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

/*
 * Tracks, not card widths.
 *
 * `auto-fill` with a floor means the row count follows the space available
 * rather than a breakpoint list, so this is right inside the reading column,
 * at full width, and beside a sidebar that only exists above 64rem -- none of
 * which this component can see.
 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: var(--space-6) var(--space-4);
}

@media (min-width: 48rem) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  }
}

@media (min-width: 64rem) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(21rem, 1fr));
    gap: var(--space-8) var(--space-5);
  }
}

/*
 * The cards settle as they scroll into view.
 *
 * Scrubbed to the scroll position rather than triggered once: scroll back up
 * and it runs backwards. In a grid `view(block)` staggers by row, because a
 * row shares a vertical position and the next one does not -- which is the
 * behaviour you want here, and the opposite of what it does to a horizontal
 * rail.
 */
@keyframes card-settle {
  from {
    opacity: 0;
    transform: translateY(1.5rem) scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .card {
      animation: card-settle linear both;
      animation-timeline: view(block);
      /* Finished well before the row reaches the middle of the screen: a card
         still assembling while you read its title is an effect in the way. */
      animation-range: entry 8% cover 18%;
    }
  }
}

.card__frame {
  position: relative;
  display: block;
  aspect-ratio: var(--poster-ratio);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  transition:
    transform var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

.card__frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card__score {
  position: absolute;
  left: var(--space-2);
  bottom: var(--space-2);
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem var(--space-2);
  border-radius: var(--radius-sm);
  background: rgb(8 8 10 / 0.85);
  font-size: var(--text-2xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.card__score svg {
  width: 0.7rem;
  height: 0.7rem;
  fill: var(--star);
}

.card__title {
  display: block;
  margin-top: var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: var(--leading-snug);
  transition: color var(--duration-fast) var(--ease-out);
}

/* The card is a third of a metre wide up here; a caption set at the small size
   reads as a label attached to the poster rather than as the title of it. */
@media (min-width: 64rem) {
  .card__title {
    font-size: var(--text-base);
  }

  .card__meta {
    font-size: var(--text-xs);
  }
}

.card:hover .card__title {
  color: var(--accent-text);
}

.card__meta {
  display: block;
  margin-top: 0.15rem;
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
}

.card__meta--quiet {
  opacity: 0.75;
}

@media (hover: hover) and (pointer: fine) {
  .card:hover .card__frame {
    transform: translateY(-4px);
    border-color: var(--accent-edge);
    box-shadow: var(--accent-glow-soft);
  }

  /* The card reveals its own score band -- see CardOverlay for why the
     overlay cannot do this itself. */
  .card:hover :deep(.score),
  .card:focus-within :deep(.score) {
    opacity: 1;
    transform: none;
  }

  /* The resting badge would sit under the band it duplicates. */
  .card:hover .card__score {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card__frame,
  .card__title {
    transition: none;
  }

  .card:hover .card__frame {
    transform: none;
  }
}
</style>
