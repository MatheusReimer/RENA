<script setup lang="ts">
import { MEDIA_TYPES } from '@revy/shared/constants'
import type { MediaType } from '@revy/shared/types'

/**
 * The Explore opener: a statement and the type filters.
 *
 * There was a second search field under the headline. It came out: the shell
 * above already carries one, and two fields for one destination on one screen
 * makes a reader stop and work out whether they differ. The one in the bar is
 * the one that is on every screen, so it is the one that stays.
 */
const mediaType = defineModel<MediaType | null>('mediaType', { default: null })

/**
 * Where the scene sits, shared between the CSS and the shader.
 *
 * Two copies of "76% 40%" that can drift apart is a visible jump at the exact
 * moment the canvas fades in over the image.
 */
const FOCUS = { x: 0.76, y: 0.4 }

const heroRoot = ref<HTMLElement | null>(null)
const art = ref<HTMLImageElement | null>(null)
const depthCanvas = ref<HTMLCanvasElement | null>(null)

/**
 * The same depth pass the landing hero runs, over the same scene.
 *
 * Reused rather than reimplemented, and reusing it costs nothing extra to
 * download: it is the same photograph and the same depth map, so both are
 * already in cache by the time anyone reaches this screen from the front page.
 */
const { active: depthActive } = useDepthParallax(depthCanvas, art, {
  depthSrc: '/hero/desk-depth.webp',
  focus: FOCUS,
  strength: 0.011,
  pointerTarget: heroRoot,
})

/** A warm light under the cursor; the layer below reads `--px`/`--py`. */
usePointerVars(heroRoot)

/**
 * The statement, split into words so each rises on its own beat.
 *
 * Authored as data rather than markup because the line breaks are a decision:
 * "Find something / worth getting lost in." is the rhythm, and letting the
 * browser re-break it loses that at some width nobody checked.
 */
/*
 * Translated, and still two authored lines.
 *
 * Same arrangement as the landing hero: each locale supplies the pieces and
 * decides where its own sentence turns, because the break is a rhythm decision
 * that does not survive being rewrapped by the browser. The accent phrase is
 * one key rather than three words, since which words carry the emphasis is a
 * property of the sentence and differs per language.
 */
const { t } = useI18n()

const STATEMENT = computed<Array<Array<{ text: string; strong?: boolean; accent?: boolean }>>>(
  () => [
    [
      { text: t('explore.heroLead'), strong: true },
      { text: t('explore.heroLeadRest') },
    ],
    [
      { text: t('explore.heroTail') },
      ...t('explore.heroAccent')
        .split(' ')
        .map((text) => ({ text, accent: true })),
    ],
  ],
)

/** A running index across both lines, so the stagger never restarts. */
const WORD_INDEX = computed(() =>
  STATEMENT.value.reduce<number[][]>((acc, line) => {
    const start = acc.flat().length
    acc.push(line.map((_, i) => start + i))
    return acc
  }, []),
)

</script>

<template>
  <section ref="heroRoot" class="hero">
    <div class="hero__art" aria-hidden="true">
      <img
        ref="art"
        src="/hero/desk-1672.webp"
        srcset="/hero/desk-1100.webp 1100w, /hero/desk-1672.webp 1672w"
        sizes="100vw"
        alt=""
        width="1672"
        height="941"
        fetchpriority="high"
        decoding="async"
        crossorigin="anonymous"
      />

      <!-- The same scene redrawn with depth. Fades in only once the shader has
           produced a frame, so the page never waits on it. -->
      <canvas ref="depthCanvas" class="hero__depth" :class="{ 'is-live': depthActive }" />

      <span class="hero__fade" />
      <span class="hero__light" />
    </div>

    <div class="hero__inner">
      <p class="hero__eyebrow">{{ $t('explore.heroTitle') }}</p>

      <!--
        One span per word inside a per-line clipping mask, so the words rise
        out from behind the line above rather than fading in place. The spans
        carry no semantics: to a screen reader this is still one sentence.
      -->
      <h1 class="hero__statement">
        <span v-for="(line, row) in STATEMENT" :key="row" class="hero__line">
          <span
            v-for="(word, col) in line"
            :key="word.text"
            class="hero__word"
            :class="{ 'hero__word--strong': word.strong, 'hero__word--accent': word.accent }"
            :style="{ '--i': WORD_INDEX[row]![col] }"
          >{{ word.text }}</span>
        </span>
      </h1>

      <p class="hero__sub">{{ $t('explore.heroSub') }}</p>

      <div class="chips">
        <!--
          A real radio group, not a row of buttons.

          Nine chips where five are one choice and four are another needs the
          grouping stated, or a screen reader hears nine unrelated toggles.
        -->
        <div class="chips__group" role="radiogroup" :aria-label="$t('explore.filterByType')">
          <button
            type="button"
            role="radio"
            class="chip"
            :class="{ 'chip--on': mediaType === null }"
            :aria-checked="mediaType === null"
            @click="mediaType = null"
          >
            {{ $t('common.all') }}
          </button>
          <button
            v-for="type in MEDIA_TYPES"
            :key="type"
            type="button"
            role="radio"
            class="chip"
            :class="{ 'chip--on': mediaType === type }"
            :aria-checked="mediaType === type"
            @click="mediaType = type"
          >
            {{ $t(`mediaType.${type}_plural`) }}
          </button>
        </div>
</div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

.hero__art {
  position: absolute;
  inset: 0;
  z-index: -1;
}

.hero__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 76% 40%;
  /* A camera that never quite stops. Thirty seconds to travel 4% is slow
     enough that nobody catches it moving and slow enough that the scene is
     never twice the same while you read the headline. */
  animation: hero-drift 30s var(--ease-inout) infinite alternate;
}

/* The canvas takes the same drift, so the two are geometrically identical at
   every moment and the crossfade between them gives nothing away. */
.hero__depth {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity var(--duration-enter) var(--ease-out);
  animation: hero-drift 30s var(--ease-inout) infinite alternate;
}

.hero__depth.is-live {
  opacity: 1;
}

@keyframes hero-drift {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.04);
  }
}

/*
 * A warm pool of light under the cursor.
 *
 * A fixed-size element translated into place rather than a gradient whose
 * centre moves: animating the stops repaints the layer every frame, while
 * moving the element is composited and costs nothing.
 */
.hero__light {
  position: absolute;
  top: 0;
  left: 0;
  width: 38rem;
  height: 38rem;
  margin: -19rem 0 0 -19rem;
  pointer-events: none;
  background: radial-gradient(closest-side, rgb(255 186 132 / 0.09), transparent 72%);
  opacity: 0;
  transform: translate3d(var(--px, 70vw), var(--py, 50%), 0);
  transition:
    transform 500ms var(--ease-out),
    opacity 700ms var(--ease-out);
}

.hero:hover .hero__light {
  opacity: 1;
}

/*
 * Reaches further right than the other two heroes, because this one carries a
 * search field and a row of chips as well as a statement -- but only to 62%.
 *
 * It was taken to 82% first and that was a mistake worth recording: past
 * about two thirds the scene is not "held back", it is gone, and the section
 * reads as a black box somebody forgot to put an image in.
 */
.hero__fade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      to right,
      var(--surface-base) 0%,
      rgb(10 10 12 / 0.93) 20%,
      rgb(10 10 12 / 0.45) 40%,
      transparent 62%
    ),
    linear-gradient(to bottom, rgb(10 10 12 / 0.7) 0%, transparent 20%),
    linear-gradient(to top, var(--surface-base) 0%, transparent 24%);
}

.hero__inner {
  position: relative;
  max-width: var(--page-max);
  margin-inline: auto;
  padding: calc(var(--topbar-height) + var(--space-10)) var(--space-6) var(--space-8);
}

@media (min-width: 64rem) {
  .hero__inner {
    padding-inline: var(--space-10);
  }
}

.hero__eyebrow {
  margin: 0 0 var(--space-4);
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: var(--text-secondary);
}

/*
 * Two weights in one sentence.
 *
 * "Find" is the instruction and carries the weight; "something worth" is the
 * connective tissue and steps back. It is the same trick the red does at the
 * end of the line, done with weight instead of colour so the two do not
 * compete.
 */
.hero__statement {
  margin: 0;
  max-width: 20ch;
  font-family: var(--font-sans);
  font-weight: 400;
  font-size: clamp(2.1rem, 4.6vw, 3.5rem);
  line-height: 1.08;
  letter-spacing: -0.035em;
}

/*
 * The mask each line's words rise out of.
 *
 * The padding and negative margin are not decoration: `overflow: hidden` on a
 * line of 56px type clips the descender of a "g" and the full stop's optical
 * overshoot, so the box is grown by a tenth of an em and pulled back by the
 * same amount. Without it "getting" loses the tail of its g.
 */
.hero__line {
  display: block;
  overflow: hidden;
  padding-bottom: 0.12em;
  margin-bottom: -0.12em;
}

.hero__word {
  display: inline-block;
}

/* The space between words, which `inline-block` collapses out of existence
   once the whitespace between the tags is gone. */
.hero__word + .hero__word {
  margin-left: 0.22em;
}

.hero__word--strong {
  font-weight: 700;
}

.hero__word--accent {
  font-weight: 700;
  color: var(--accent);
}

.hero__sub {
  margin: var(--space-5) 0 0;
  max-width: 26rem;
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--text-secondary);
}

/* ------------------------------------------------------------------ *
 * The opening sequence
 *
 * One keyframe and a delay per element, in CSS. Nothing here can arrive late
 * or fail to run the way a script can, so the page is legible with JavaScript
 * off and identical with it on. The photograph is deliberately not in the
 * sequence: it is what the browser measures for largest contentful paint, and
 * holding it back to make an entrance of it would be paying for choreography
 * in the one currency that matters.
 * ------------------------------------------------------------------ */

@keyframes hero-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/*
 * Each word climbs out from behind the line above it.
 *
 * A mask reveal rather than a fade: the words begin genuinely out of sight and
 * arrive without ever being semi-transparent. Type that fades reads as a
 * slideshow; type that is uncovered reads as printed.
 */
@keyframes hero-word {
  from {
    transform: translateY(110%) rotate(2deg);
  }
  to {
    transform: translateY(0) rotate(0deg);
  }
}

.hero__eyebrow,
.hero__sub,
.chips {
  animation: hero-rise var(--duration-enter) var(--ease-out) var(--in-delay, 0ms) backwards;
}

.hero__word {
  animation: hero-word 780ms var(--ease-out) calc(150ms + var(--i, 0) * 85ms) backwards;
}

.hero__eyebrow {
  --in-delay: 80ms;
}

.hero__sub {
  --in-delay: 620ms;
}

.chips {
  --in-delay: 740ms;
}

/*
 * Scrolling away.
 *
 * Scrubbed to the scroll position rather than played on a trigger -- scroll
 * back up and it runs backwards, which is the difference between a page that
 * responds and one that performs at you. Native CSS, no listener, run off the
 * main thread. `@supports` because Firefox has not shipped it; there, and
 * under reduced motion, the panel simply stays where it is.
 */
@keyframes hero-exit {
  to {
    opacity: 0;
    transform: translateY(-2rem);
  }
}

@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .hero__inner {
      animation: hero-exit linear both;
      animation-timeline: view();
      animation-range: exit 15% exit 90%;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Chips
 * ------------------------------------------------------------------ */

.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-6);
}

.chips__group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chips__rule {
  width: 1px;
  height: 1.5rem;
  background: var(--border-default);
}

.chip {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
  transition:
    color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    background-color var(--duration-base) var(--ease-out);
}

.chip:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

/*
 * The selected type chip fills red; the selected sort chip only brightens.
 *
 * Two filled chips in one row would read as two halves of one choice. The
 * accent marks the primary axis -- what you are looking at -- and the
 * secondary axis is marked with contrast instead.
 */
.chip--on {
  color: var(--text-primary);
  border-color: var(--border-strong);
  background: rgb(255 255 255 / 0.1);
}

.chips__group:first-child .chip--on {
  border-color: var(--accent);
  background: var(--accent);
}

/*
 * `animation: none`, not a shorter duration.
 *
 * These are `backwards`-filled with delays running out to three quarters of a
 * second, so merely collapsing the duration -- which is what the global rule
 * in main.css does -- would leave each element in its invisible start state
 * for the whole delay and then snap it in.
 */
@media (prefers-reduced-motion: reduce) {
  .hero__eyebrow,
  .hero__word,
  .hero__sub,
  .chips,
  .hero__art img,
  .hero__depth {
    animation: none;
  }

  .chip,
  .hero__depth {
    transition: none;
  }

  /* The composable checks the same query and never starts, so this canvas is
     empty -- and an empty canvas over the photograph would be a black
     rectangle. Belt and braces. */
  .hero__depth,
  .hero__light {
    display: none;
  }
}
</style>
