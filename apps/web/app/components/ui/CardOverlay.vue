<script setup lang="ts">
import { excerpt, formatAverage, formatRatingCount } from '@revy/shared/utils'

/** Matches the server-side trim in the dashboard service. */
const BLURB_LENGTH = 130

/**
 * What a card says on hover: how good it is, whose opinion that is, and what
 * the thing actually is.
 *
 * Cards in the recommendation rows and the browse grid were showing a title
 * and nothing else -- "Because you liked Avatar" over six posters with no
 * number on any of them, which gives the reader no reason to click one rather
 * than another. The catalogue had the answer all along: every imported title
 * carries the provider's own aggregate in `metadata.externalRating`.
 *
 * The blurb came second, and it is the half that decides. A score says how
 * good something is and nothing about what it *is*, so a row of posters with
 * numbers on them is still a guessing game for anything whose cover art is
 * not self-explanatory.
 *
 * Two rules this component exists to keep:
 *
 *  1. RENA's average leads wherever it exists. It is the only score that
 *     belongs to this community, and it is the whole point of the product.
 *  2. A provider's score keeps its own scale and its own name. TMDB's 8.4 is
 *     out of ten; halving it to fit five stars would quietly present a
 *     stranger's opinion as this community's, which is how a catalogue starts
 *     feeling invented. It gets "8.4" and the word "TMDB", never stars.
 */
/*
 * Spelled out rather than `defineProps<CardPreview>()`.
 *
 * The shape is `CardPreview` from `@revy/shared/types` and must stay identical
 * to it -- but Vue's SFC compiler resolves prop types syntactically, at
 * compile time, and cannot follow an import into another workspace package.
 * It fails with "Unresolvable type reference", and `tsc` does not catch it
 * because TypeScript resolves the import perfectly well: only the runtime
 * props generation cannot.
 */
const props = defineProps<{
  /** RENA's own average, 0.5-5.0. Null when nobody here has rated it. */
  ratingAverage: number | null
  ratingCount: number
  /** The provider's aggregate, normalised to 0-10 and named. */
  externalRating: { source: string; score: number; votes: number } | null
  /**
   * A sentence or two about what the thing is.
   *
   * Trimmed again here, defensively: the recommendation rows trim server-side
   * so the text never crosses the wire, but the grid maps from a payload that
   * already carries the full description for other reasons, and a thousand
   * characters of RAWG blurb would push the band over the whole poster.
   */
  blurb?: string | null
}>()

/** Which of the two -- if either -- this card can actually show. */
const kind = computed(() => {
  if (props.ratingAverage !== null && props.ratingCount > 0) return 'local'
  if (props.externalRating) return 'external'
  return 'none'
})
</script>

<template>
  <span class="score" :class="`score--${kind}`" aria-hidden="true">
    <template v-if="kind === 'local'">
      <span class="score__value">
        <svg class="score__star" viewBox="0 0 24 24">
          <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z" />
        </svg>
        {{ formatAverage(ratingAverage) }}
      </span>
      <span class="score__origin">
        {{ $t('score.onRena', { count: formatRatingCount(ratingCount) }, ratingCount) }}
      </span>
    </template>

    <template v-else-if="kind === 'external' && externalRating">
      <!-- Out of ten, and said so: the denominator is what stops this being
           read as a five-star score with a suspiciously high number. -->
      <span class="score__value score__value--external">
        {{ externalRating.score.toFixed(1) }}<span class="score__scale">/10</span>
      </span>
      <span class="score__origin">
        {{
          externalRating.votes
            ? $t('score.fromSource', {
              source: externalRating.source,
              count: formatRatingCount(externalRating.votes),
            })
            : $t('score.fromSourceBare', { source: externalRating.source })
        }}
      </span>
    </template>

    <template v-else>
      <span class="score__origin score__origin--empty">{{ $t('score.unrated') }}</span>
    </template>

    <!--
      What the thing actually is.

      Under the score rather than above it, because the number is what the
      reader came to the band for and the plot is what decides it. Clamped to
      three lines: a caption that grows with its text turns a row of cards into
      a row of different heights the moment one of them is a long blurb.
    -->
    <span v-if="blurb" class="score__blurb">{{ excerpt(blurb, BLURB_LENGTH) }}</span>
  </span>
</template>

<style scoped>
/*
 * A band across the foot of the artwork.
 *
 * Over the poster rather than under it, because the row has to stay one
 * height whether a card has a score or not -- and because the thing being
 * annotated is the artwork. The scrim is a gradient so the top of the band
 * dissolves into the image instead of cutting a rectangle out of it.
 */
.score {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: var(--space-6) var(--space-3) var(--space-3);
  background: linear-gradient(to top, rgb(6 6 8 / 0.94) 35%, transparent);
  opacity: 0;
  transform: translateY(0.5rem);
  pointer-events: none;
  transition:
    opacity var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}

/*
 * Revealed by the card around it, not by itself.
 *
 * Two reasons this element cannot own its own `:hover`. It is
 * `pointer-events: none` -- which it has to be, so the band can never swallow
 * a click meant for the poster -- so the pointer is never "on" it. And the
 * card's DOM differs per caller: here the overlay sits inside a frame inside
 * a link inside an `li`, and guessing that shape from in here produced a
 * selector that silently matched nothing.
 *
 * So each parent writes one `:deep(.score--shown)` rule against its own
 * markup, which is the only place the structure is actually known.
 */
.score--shown {
  opacity: 1;
  transform: none;
}

/*
 * No pointer, no hover, no score.
 *
 * On a phone this would be information that simply never appears. `hover:
 * none` is the honest test -- it asks whether there is a pointer at all,
 * rather than inferring one from the width -- and where there is not, the
 * band is just always on.
 */
@media (hover: none) {
  .score {
    opacity: 1;
    transform: none;
  }
}

.score__value {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  font-size: var(--text-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--text-primary);
}

.score__star {
  width: 0.85rem;
  height: 0.85rem;
  align-self: center;
  fill: var(--star);
}

/* Quieter than RENA's, and in the same colour as its attribution: this is a
   number we are passing on, not one we stand behind. */
.score__value--external {
  font-size: var(--text-base);
  color: var(--text-primary);
}

.score__scale {
  font-size: var(--text-2xs);
  font-weight: 500;
  color: var(--text-tertiary);
}

.score__origin {
  font-size: var(--text-2xs);
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.score__origin--empty {
  color: var(--text-tertiary);
}

/*
 * Three lines, then clipped.
 *
 * A hard ceiling rather than a graceful one: the band grows upward from the
 * foot of the poster, and an unbounded caption on a long blurb would cover
 * the artwork it is annotating. Three lines is about as much as anyone reads
 * off a card they are still deciding about.
 */
.score__blurb {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  margin-top: var(--space-2);
  font-size: var(--text-2xs);
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

@media (prefers-reduced-motion: reduce) {
  .score {
    transition: opacity var(--duration-fast) var(--ease-out);
    transform: none;
  }
}
</style>
