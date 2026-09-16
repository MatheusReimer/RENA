<script setup lang="ts">
import { MEDIA_TYPES } from '@revy/shared/constants'
import type { MediaType } from '@revy/shared/types'

/**
 * "What's your next story?" -- the four media types, as four cards.
 *
 * Art-directed rather than data-driven, and that is a deliberate reversal.
 *
 * These cards used to wear a real backdrop pulled from each section of the
 * catalogue -- cheap, self-updating, and it came apart on contact with books.
 * That provider ships covers and no stills, so the Books card had either a
 * portrait crop showing a band of one cover, or nothing at all. Three
 * treatments of a cover were tried and none worked, because a book cover is
 * typography: anything that leaves it recognisable leaves its title readable,
 * and the card kept ending up with a half-legible word behind the word
 * "Books".
 *
 * So these are four stills from one lit set -- a cinema, a television, a stack
 * of books, a controller. They cost four small files and do not change with
 * the catalogue, and in exchange the row is one consistent piece of art
 * direction rather than four unrelated frames with a hole in the middle.
 */
const { t } = useI18n()

const categories = MEDIA_TYPES

/**
 * One line each, saying what the section is for rather than what is in it.
 *
 * Copy rather than data, and now translated copy: these are a claim about the
 * experience, so they live in the locale files beside the rest of the page's
 * words rather than in a constant here. The key is derived from the media type
 * so adding a fifth type needs one line in each locale and nothing here.
 */
function tagline(mediaType: MediaType): string {
  return t(`tagline.${mediaType}`)
}

/** 24px line icons, one per type, matching the weight of the rest of the UI. */
const ICONS: Record<MediaType, string> = {
  movie: 'M3.2 7.2h17.6v12.3H3.2zM3.2 7.2 6 3.3M9 7 11.8 3.1M15 7l2.8-3.9M3.2 11.4h17.6',
  series: 'M3.2 4.8h17.6v11.4H3.2zM8.4 20.7h7.2',
  game: 'M7.6 9.2v3.6M5.8 11h3.6M15.2 10.4h.1M17.8 12.2h.1M7.3 6.9h9.4a4.6 4.6 0 0 1 4.5 3.8l.6 3.6a2.7 2.7 0 0 1-5 1.8l-1-1.6H8.2l-1 1.6a2.7 2.7 0 0 1-5-1.8l.6-3.6a4.6 4.6 0 0 1 4.5-3.8Z',
  book: 'M12 6.4v13M12 6.4C10.6 5 8.5 4.3 5.4 4.3a1 1 0 0 0-1 1v11.5a1 1 0 0 0 1 1c3.1 0 5.2.7 6.6 2.1 1.4-1.4 3.5-2.1 6.6-2.1a1 1 0 0 0 1-1V5.3a1 1 0 0 0-1-1c-3.1 0-5.2.7-6.6 2.1Z',
}
</script>

<template>
  <section class="explore">
    <header v-reveal class="explore__head">
      <div>
        <p class="explore__eyebrow">{{ $t('landing.exploreEyebrow') }}</p>
        <h2 class="explore__title">{{ $t('landing.exploreTitle') }}</h2>
      </div>

      <NuxtLink to="/discover" class="explore__all">{{ $t('common.seeAll') }}</NuxtLink>
    </header>

    <ul class="explore__grid">
      <li v-for="(mediaType, index) in categories" :key="mediaType" v-reveal="index">
        <NuxtLink v-tilt="7" :to="{ path: '/discover', query: { type: mediaType } }" class="card">
          <!--
            Decorative. The card is already labelled by the heading inside it,
            and a screen reader announcing "an empty cinema with red velvet
            seats" before the word "Movies" would be describing the wallpaper
            rather than the link.
          -->
          <img
            class="card__art"
            :src="`/explore/${mediaType}-800.webp`"
            :srcset="`/explore/${mediaType}-480.webp 480w, /explore/${mediaType}-800.webp 800w`"
            sizes="(min-width: 64rem) 26vw, (min-width: 40rem) 46vw, 92vw"
            alt=""
            width="800"
            height="500"
            loading="lazy"
            decoding="async"
          />

          <span class="card__scrim" aria-hidden="true" />

          <!-- A highlight that tracks the cursor, so the card reads as a
               surface catching light rather than a rectangle rotating. -->
          <span class="card__glare" aria-hidden="true" />

          <span class="card__body">
            <span class="card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path :d="ICONS[mediaType]" />
              </svg>
            </span>

            <span class="card__text">
              <span class="card__name">{{ $t(`mediaType.${mediaType}_plural`) }}</span>
              <span class="card__tag">{{ tagline(mediaType) }}</span>
            </span>

            <span class="card__go" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.explore {
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-16) var(--space-6);
}

@media (min-width: 60rem) {
  .explore {
    padding-inline: var(--space-10);
  }
}

.explore__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-5);
  margin-bottom: var(--space-8);
}

.explore__eyebrow {
  margin: 0 0 var(--space-3);
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: var(--text-tertiary);
}

.explore__title {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(1.75rem, 3.4vw, 2.5rem);
  letter-spacing: -0.03em;
}

.explore__all {
  flex-shrink: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
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

.explore__all:hover {
  color: var(--text-primary);
}

/*
 * Four across, then two, then one.
 *
 * `auto-fit` was tried and is wrong here: at some widths it produces three
 * cards and a hole, and four named types should never lay out as three plus a
 * gap. Explicit counts at explicit breakpoints keep the row complete.
 */
/*
 * `perspective` on the grid rather than on each card, so all four tilt toward
 * one vanishing point. Per card, each gets its own camera and a row of them
 * fans out like a hand of cards.
 */
.explore__grid {
  display: grid;
  gap: var(--space-4);
  perspective: 1100px;
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 40rem) {
  .explore__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/*
 * Above the wide breakpoint the row stops being a grid and becomes an
 * accordion: hover one card and it takes room from the other three.
 *
 * Flex rather than grid because what is animating is a *ratio*. `flex-grow`
 * is a plain number and interpolates smoothly; `grid-template-columns`
 * animates only between two fully specified track lists and stutters at every
 * width in between.
 *
 * The height is fixed here and `aspect-ratio` dropped, which is the detail
 * that makes it work. Left on, a card growing wider also grows taller, the
 * row's height changes on every hover, and everything below the section
 * jumps up and down the page.
 */
@media (min-width: 64rem) {
  .explore__grid {
    display: flex;
    gap: var(--space-4);
  }

  .explore__grid > li {
    flex: 1 1 0;
    min-width: 0;
    transition: flex-grow 620ms var(--ease-out);
  }

  .explore__grid > li .card {
    aspect-ratio: auto;
    height: 21rem;
  }

  /* The hovered card takes the room; its neighbours give it up. Both sides
     are needed -- growing one alone just overflows the row. */
  .explore__grid:hover > li {
    flex-grow: 0.78;
  }

  .explore__grid > li:hover,
  .explore__grid > li:focus-within {
    flex-grow: 2;
  }

  /*
   * The label grows with the card it is on.
   *
   * A section heading that stays 17px while its card doubles in width reads
   * as a card that got bigger by accident. Scaling the type is what makes the
   * expansion feel like focus rather than like a layout glitch.
   */
  .explore__grid > li .card__name {
    transition: font-size 620ms var(--ease-out);
  }

  .explore__grid > li:hover .card__name,
  .explore__grid > li:focus-within .card__name {
    font-size: var(--text-2xl);
  }

  .explore__grid > li .card__tag {
    opacity: 0.75;
    transition: opacity 620ms var(--ease-out);
  }

  .explore__grid > li:hover .card__tag,
  .explore__grid > li:focus-within .card__tag {
    opacity: 1;
  }
}

/* ------------------------------------------------------------------ *
 * A card
 * ------------------------------------------------------------------ */

.card {
  position: relative;
  display: block;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  isolation: isolate;
  /*
   * `--tilt-x`/`--tilt-y` come from `v-tilt`; both are 0 until a cursor is
   * over the card, and stay 0 on touch and under reduced motion. The
   * translateZ is what separates a lifted card from its neighbours -- rotation
   * alone at this angle reads as a rendering glitch rather than as depth.
   */
  transform: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))
    translateZ(var(--lift, 0px));
  transform-style: preserve-3d;
  transition:
    border-color var(--duration-base) var(--ease-out),
    transform 320ms var(--ease-out);
}

/*
 * The light on the surface.
 *
 * `screen` so it only ever adds light -- over a bright backdrop it lifts the
 * highlight, over the near-black fallback card it is the only thing giving the
 * surface a direction. Multiply or plain alpha would grey out the artwork.
 */
.card__glare {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  mix-blend-mode: screen;
  background: radial-gradient(
    28rem 28rem at var(--glare-x, 50%) var(--glare-y, 50%),
    rgb(255 236 214 / 0.16),
    transparent 60%
  );
  transition: opacity var(--duration-slow) var(--ease-out);
}

.card__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /*
   * Held back, but nowhere near as far as it was.
   *
   * This artwork is a texture behind a label rather than a poster, and the
   * first pass over-corrected for that: 0.55 opacity with a quarter of the
   * colour drained, over a near-black ground, left four cards that read as
   * empty rectangles. The restraint was real and the result was that nobody
   * could see the photograph at all.
   *
   * The scrim underneath is what actually protects the heading, so the image
   * can sit much closer to full strength without costing legibility.
   */
  opacity: 0.92;
  /*
   * Lifted, because the source files are almost black.
   *
   * These four stills measure an average luminance of 23 out of 255 -- about
   * nine percent. They were generated dark on purpose, to sit behind text, and
   * they overshot: at native brightness the cards read as empty rectangles no
   * matter what the scrim and the opacity do, which is what sent the first two
   * attempts at this chasing the wrong cause.
   *
   * The right repair is new artwork exposed a stop or two higher. Until then
   * this is the honest stopgap, and it is worth knowing it is a stopgap: it
   * lifts the shadows a long way, so the highlights in the brighter corners of
   * each frame do clip.
   */
  filter: brightness(3.4) saturate(1.2) contrast(0.95);
  transition:
    opacity var(--duration-slow) var(--ease-out),
    transform var(--duration-slow) var(--ease-out);
}

/*
 * Dark where the words are, clear where the picture is.
 *
 * The first version ran 62% black across the middle of the card and 18% at the
 * very top, which protected type that is not there -- the label sits in the
 * bottom quarter and nothing above it needs covering. Between that and the
 * artwork's own 55% opacity, the photograph was invisible and four cards read
 * as four empty rectangles.
 *
 * Now it is heavy at the base, gone by two-thirds up. The label is just as
 * readable, because the gradient is strongest exactly where it sits.
 */
.card__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgb(8 8 10 / 0.95) 0%,
    rgb(8 8 10 / 0.72) 22%,
    rgb(8 8 10 / 0.2) 52%,
    transparent 78%
  );
}

.card__body {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
}

.card__icon {
  flex-shrink: 0;
  color: var(--text-primary);
}

.card__icon svg {
  width: 1.35rem;
  height: 1.35rem;
}

.card__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.card__name {
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.card__tag {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__go {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  margin-left: auto;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  color: var(--text-primary);
  transition:
    background-color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.card__go svg {
  width: 0.95rem;
  height: 0.95rem;
  transition: transform var(--duration-base) var(--ease-out);
}

/*
 * Hover: the artwork comes forward and back into colour.
 *
 * Scaling the image inside a clipped box rather than scaling the card is what
 * keeps the row stable -- a card that grows pushes its neighbours' shadows
 * around, and four cards in a tight grid make that obvious.
 */
@media (hover: hover) and (pointer: fine) {
  .card:hover {
    border-color: var(--border-default);
    --lift: 16px;
  }

  .card:hover .card__glare {
    opacity: 1;
  }

  .card:hover .card__art {
    opacity: 1;
    /* Brighter still on hover, so the hovered card is the lit one in the row. */
    filter: brightness(4) saturate(1.3) contrast(0.95);
    transform: scale(1.05);
  }

  .card:hover .card__go {
    background: var(--accent);
    border-color: var(--accent);
  }

  .card:hover .card__go svg {
    transform: translateX(2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .card__art,
  .card__glare,
  .card__go,
  .card__go svg,
  .explore__all,
  .explore__grid > li,
  .explore__grid > li .card__name,
  .explore__grid > li .card__tag {
    transition: none;
  }

  /* No accordion either: a row that resizes under the pointer is motion,
     however smoothly it is done. */
  .explore__grid:hover > li,
  .explore__grid > li:hover,
  .explore__grid > li:focus-within {
    flex-grow: 1;
  }

  .card {
    transform: none;
  }

  .card:hover .card__art {
    transform: none;
  }
}
</style>
