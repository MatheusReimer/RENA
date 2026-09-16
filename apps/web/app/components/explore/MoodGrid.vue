<script setup lang="ts">
import { MOODS } from '@revy/shared/constants'

/**
 * "What are you in the mood for?"
 *
 * Six ways in for somebody who does not know what they want -- which is most
 * people most of the time, and the one question a list of genres cannot
 * answer. Nobody is ever in the mood for "Drama".
 *
 * Each card is a photograph and a question, and nothing else. No counts, no
 * ratings, no sample titles: the moment a mood card starts showing what is
 * behind it, it stops being a mood and becomes a badly labelled genre.
 */
defineProps<{
  /** The mood currently open, if any. Drives the pressed state. */
  active?: string | null
}>()

const emit = defineEmits<{ open: [key: string] }>()
</script>

<template>
  <section class="moods">
    <header v-reveal class="moods__head">
      <div>
        <p class="moods__eyebrow">{{ $t('explore.moodEyebrow') }}</p>
        <h2 class="moods__title">{{ $t('explore.moodTitle') }}</h2>
      </div>

      <NuxtLink to="/search" class="moods__all">
        {{ $t("common.seeAll") }}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </NuxtLink>
    </header>

    <ul class="moods__grid">
      <li v-for="(mood, index) in MOODS" :key="mood.key" v-reveal="index">
        <button
          v-tilt="5"
          type="button"
          class="mood"
          :class="{ 'mood--on': active === mood.key }"
          :aria-pressed="active === mood.key"
          @click="emit('open', mood.key)"
        >
          <!-- Decorative: the question is the label, and describing the
               photograph would bury it. -->
          <img
            class="mood__art"
            :src="`/moods/${mood.key}.webp`"
            alt=""
            width="640"
            height="374"
            loading="lazy"
            decoding="async"
          />

          <span class="mood__scrim" aria-hidden="true" />

          <!-- A highlight that tracks the cursor, so the card reads as a
               surface catching light rather than a rectangle tipping. -->
          <span class="mood__glare" aria-hidden="true" />

          <span class="mood__body">
            <span class="mood__text">
              <span class="mood__name">{{ $t(`mood.${mood.key}`) }}</span>
              <span class="mood__tags">{{ $t(`mood.${mood.key}_tags`) }}</span>
            </span>

            <span class="mood__go" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.moods {
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-12) var(--space-6) 0;
}

@media (min-width: 64rem) {
  .moods {
    padding-inline: var(--space-10);
  }
}

.moods__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.moods__eyebrow {
  margin: 0 0 var(--space-3);
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: var(--text-tertiary);
}

.moods__title {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(1.6rem, 3vw, 2.25rem);
  letter-spacing: -0.03em;
}

.moods__all {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
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

.moods__all svg {
  width: 0.9rem;
  height: 0.9rem;
}

.moods__all:hover {
  color: var(--text-primary);
}

/* `perspective` on the grid, not per card: set per card each gets its own
   camera and the row fans out like a hand of playing cards. */
.moods__grid {
  display: grid;
  gap: var(--space-4);
  perspective: 1200px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/*
 * Two across on a tablet, three on a desktop.
 *
 * Six moods divide evenly either way, so the choice is about how big a card
 * wants to be rather than about filling rows. The cards keep the height they
 * gained -- 16:9 rather than the original letterbox strip -- so three across
 * on a wide screen is still a substantially larger card than the first
 * version, with room for the photograph to read as a scene.
 */
@media (min-width: 40rem) {
  .moods__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
  }
}

@media (min-width: 72rem) {
  .moods__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* ------------------------------------------------------------------ *
 * A mood card
 * ------------------------------------------------------------------ */

.mood {
  position: relative;
  display: block;
  width: 100%;
  /*
   * Taller as well as wider.
   *
   * At 16:7 a half-width card was a letterbox strip -- room for the words and
   * almost none for the picture, which is the part that actually communicates
   * a mood. 16:9 gives the photograph back the height it needs without the
   * card turning into a poster.
   */
  aspect-ratio: 16 / 9;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  cursor: var(--cursor-hand);
  isolation: isolate;
  /* `--tilt-x`/`--tilt-y` come from `v-tilt`; both are 0 until a cursor is
     over the card, and stay 0 on touch and under reduced motion. */
  transform: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))
    translateZ(var(--lift, 0px));
  transform-style: preserve-3d;
  transition:
    border-color var(--duration-base) var(--ease-out),
    transform 320ms var(--ease-out);
}

/* `screen` so it only ever adds light: over a bright frame it lifts the
   highlight, over a dark one it is the only thing giving the surface a
   direction. Multiply or plain alpha would grey the photograph out. */
.mood__glare {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  mix-blend-mode: screen;
  background: radial-gradient(
    22rem 22rem at var(--glare-x, 50%) var(--glare-y, 50%),
    rgb(255 236 214 / 0.16),
    transparent 60%
  );
  transition: opacity var(--duration-slow) var(--ease-out);
}

.mood__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /*
   * Lifted, then held back -- in that order, which is the fix.
   *
   * The intent was right: the question is the content and the photograph is
   * only the mood, so a card where the picture wins is one you look at instead
   * of answering. But these files measure an average luminance of 17 out of
   * 255, and 0.62 opacity on top of near-black is black. Six cards of it read
   * as six empty panels.
   *
   * So the brightness lifts the image into visibility and the opacity then
   * does the holding-back it was always meant to do. As with the category
   * stills, the real repair is artwork exposed higher; this is the stopgap
   * until there is some.
   */
  opacity: 0.85;
  filter: brightness(2.8) saturate(1.15);
  transition:
    opacity var(--duration-slow) var(--ease-out),
    transform var(--duration-slow) var(--ease-out);
}

.mood__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgb(6 6 8 / 0.95) 0%,
    rgb(6 6 8 / 0.55) 48%,
    rgb(6 6 8 / 0.12) 100%
  );
}

.mood__body {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  padding: var(--space-4);
  text-align: left;
}

.mood__text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.mood__name {
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.015em;
}

.mood__tags {
  font-size: var(--text-2xs);
  color: var(--text-secondary);
}

.mood__go {
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

.mood__go svg {
  width: 0.95rem;
  height: 0.95rem;
  transition: transform var(--duration-base) var(--ease-out);
}

/* The open mood keeps its lit state, so the row below it is obviously the
   answer to this card rather than to the page. */
.mood--on {
  border-color: var(--accent-border);
}

.mood--on .mood__go {
  background: var(--accent);
  border-color: var(--accent);
}

.mood--on .mood__art {
  opacity: 1;
  filter: brightness(3.2) saturate(1.25);
}

@media (hover: hover) and (pointer: fine) {
  .mood:hover {
    border-color: var(--border-default);
    --lift: 14px;
  }

  .mood:hover .mood__glare {
    opacity: 1;
  }

  .mood:hover .mood__art {
    opacity: 1;
    filter: brightness(3.2) saturate(1.25);
    transform: scale(1.05);
  }

  .mood:hover .mood__go {
    background: var(--accent);
    border-color: var(--accent);
  }

  .mood:hover .mood__go svg {
    transform: translateX(2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mood,
  .mood__art,
  .mood__glare,
  .mood__go,
  .mood__go svg,
  .moods__all {
    transition: none;
  }

  .mood,
  .mood:hover,
  .mood:hover .mood__art {
    transform: none;
  }
}
</style>
