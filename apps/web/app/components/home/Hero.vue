<script setup lang="ts">
import type { UserSummary } from '@revy/shared/types'

/**
 * The landing hero.
 *
 * A commissioned render on the right, the statement on the left, and the two
 * overlapping in the middle rather than sitting in two columns. The render is
 * doing the work a collage of real covers could not: it is one lit scene with
 * books, a controller, photographs and a window in it, which says "all of
 * these things, in one room, at night" in a way that a grid of posters --
 * however well arranged -- says as "a catalogue".
 */
defineProps<{
  members: UserSummary[]
  memberCount: number
}>()

/** The scene, at the three widths it is actually drawn. */
const HERO_SRC = '/hero/desk-1672.webp'
const HERO_SRCSET =
  '/hero/desk-700.webp 700w, /hero/desk-1100.webp 1100w, /hero/desk-1672.webp 1672w'

/**
 * Where the scene sits inside the hero box, as `object-position` fractions.
 *
 * Shared with the shader rather than only written in CSS: the canvas has to
 * crop the photograph identically to the `<img>` beneath it, and two copies
 * of "72% 46%" that can drift apart is a visible jump at the moment the two
 * swap over.
 */
const FOCUS = { x: 0.72, y: 0.46 }

const { t, te } = useI18n()

const art = ref<HTMLImageElement | null>(null)
const depthCanvas = ref<HTMLCanvasElement | null>(null)
const heroRoot = ref<HTMLElement | null>(null)

/**
 * The photograph, turning under the cursor.
 *
 * Layered over the `<img>`, never instead of it: the image is the element the
 * browser measures for largest contentful paint and the only thing a viewer
 * without WebGL, with a touch screen, or with reduced motion will ever see.
 * `active` stays false unless the effect genuinely started.
 */
const { active: depthActive } = useDepthParallax(depthCanvas, art, {
  depthSrc: '/hero/desk-depth.webp',
  focus: FOCUS,
  strength: 0.012,
  // The whole section, not the art layer: the art sits behind the statement
  // with a negative z-index, so the cursor lands on the content column and
  // never touches the picture it is supposed to be turning.
  pointerTarget: heroRoot,
})

/**
 * On a phone, the thing worth offering is the app.
 *
 * Only swaps the primary action, and only once there is a published store
 * listing to send them to -- see `useAppDownload`. "Explore" stays either way,
 * because somebody who wants to look before they commit should not have to
 * install something to do it.
 */
const appDownload = useAppDownload()

/**
 * A soft warm light that follows the cursor across the scene.
 *
 * Publishes `--px`/`--py` on the section; the light layer below reads them.
 * It costs one listener and one composited transform, and what it buys is
 * that the room appears to be lit by something the viewer is holding rather
 * than by a gradient someone typed.
 */
usePointerVars(heroRoot)

/**
 * The statement, split into words so each can rise on its own beat.
 *
 * Authored as data rather than as markup because the line breaks are a
 * decision -- "Stories mean / more together." is the rhythm of the sentence,
 * and a template that let the browser re-break it would lose that at some
 * width nobody checked.
 */
/*
 * Translated, and still two authored lines rather than one wrapped sentence.
 *
 * The break is a decision about rhythm, so each locale supplies both halves
 * and decides where its own sentence turns -- "Histórias valem / mais juntos."
 * breaks in a different place than the English does, and a template that let
 * the browser rewrap would lose that in every language at once.
 *
 * Each line is split into words here rather than in the locale file, because
 * the word split is a mechanism -- the per-word reveal stagger -- and not
 * something a translator should have to know about.
 */
const STATEMENT = computed<Array<Array<{ text: string; accent?: boolean }>>>(() => [
  te('landing.titleLead')
    ? t('landing.titleLead')
        .split(' ')
        .map((text) => ({ text }))
    : [],
  [
    ...t('landing.titleRest')
      .split(' ')
      .map((text) => ({ text })),
    { text: t('landing.titleAccent'), accent: true },
  ],
])

/** A running index across both lines, so the stagger never restarts. */
const STATEMENT_WORDS = computed(() =>
  STATEMENT.value.reduce<number[][]>((acc, line) => {
    const start = acc.flat().length
    acc.push(line.map((_, i) => start + i))
    return acc
  }, []),
)
</script>

<template>
  <section ref="heroRoot" class="hero">
    <!--
      Decorative in full. Everything the picture says is said in words beside
      it, and "a dark desk with books, a games controller, photographs and a
      window onto a city at dusk" read aloud before the headline would bury
      the headline under a description of its own wallpaper.
    -->
    <div class="hero__art" aria-hidden="true">
      <img
        ref="art"
        :src="HERO_SRC"
        :srcset="HERO_SRCSET"
        sizes="100vw"
        alt=""
        width="1672"
        height="941"
        fetchpriority="high"
        decoding="async"
        crossorigin="anonymous"
      />

      <!--
        The same photograph, redrawn with depth. Sits on top of the `<img>`
        and fades in only once the shader has actually produced a frame, so
        the page is never waiting on it and never shows a blank rectangle if
        it fails.
      -->
      <canvas ref="depthCanvas" class="hero__depth" :class="{ 'is-live': depthActive }" />

      <span class="hero__fade" />
      <span class="hero__light" />
      <span class="hero__grain" />
    </div>

    <div class="hero__inner">
      <div class="hero__panel">
        <p class="hero__eyebrow">{{ $t('landing.eyebrow') }}</p>

        <!--
          One `<span>` per word inside a per-line clipping mask, so the words
          rise out from behind the line above rather than fading in place.
          The whole sentence is still one continuous text node to a screen
          reader -- the spans carry no semantics and no aria.
        -->
        <h1 class="hero__statement">
          <span v-for="(line, row) in STATEMENT" :key="row" class="hero__line">
            <span
              v-for="(word, col) in line"
              :key="word.text"
              class="hero__word"
              :class="{ 'hero__word--accent': word.accent }"
              :style="{ '--i': STATEMENT_WORDS[row]![col] }"
            >{{ word.text }}</span>
          </span>
        </h1>

        <p class="hero__sub">{{ $t('landing.lede') }}</p>

        <div class="hero__actions">
          <a
            v-if="appDownload.available.value"
            :href="appDownload.href.value!"
            v-magnetic="10"
            class="hero__cta hero__cta--primary"
            rel="noopener"
          >
            {{ appDownload.label }}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
            </svg>
          </a>

          <NuxtLink v-else v-magnetic="10" to="/signup" class="hero__cta hero__cta--primary">
            {{ $t('landing.join') }}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </NuxtLink>

          <NuxtLink v-magnetic="10" to="/discover" class="hero__cta">
            {{ $t('landing.explore') }}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </NuxtLink>
        </div>

        <!--
          The real number, not a rounded-up one.

          The design mocks this up as "25K+ members", which is the figure a
          launch page wishes it had. A count a visitor can check against the
          community screen is the only kind worth printing, so this says
          whatever is actually true today.
        -->
        <div v-if="members.length" class="hero__people">
          <div class="hero__faces">
            <UiUserAvatar
              v-for="(member, index) in members"
              :key="member.id"
              :user="member"
              size="sm"
              class="hero__face"
              :style="{ zIndex: members.length - index }"
            />
          </div>
          <p class="hero__people-text">
            <strong><UiNumberTicker :value="memberCount" /></strong>
            {{ memberCount === 1 ? $t('landing.member') : $t('landing.members') }}<br />
            <span>{{ $t('landing.membersNote') }}</span>
          </p>
        </div>
      </div>
    </div>

    <!--
      Outside `.hero__inner` on purpose.

      That container is capped at `--page-max` and centred, so anything
      anchored to its right edge stops short of the window by half the
      leftover space -- which on a wide monitor landed this squarely on the
      lit stack of books. Against the section it reaches the actual corner,
      where the bottom fade has already made a dark band for it.
    -->
    <p class="hero__margin">A line<br />connects<br />us all.</p>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  align-items: center;
  overflow: hidden;
  /*
   * Tall enough to be a composition, capped so it is not a wall.
   *
   * `dvh` rather than `vh`: on a phone the browser chrome collapses as you
   * scroll, and `vh` would have the hero grow underneath the content while
   * you read it.
   */
  min-height: clamp(38rem, 92dvh, 54rem);
  background: var(--surface-base);
  isolation: isolate;
}

/*
 * A floor tied to the width, for very wide monitors.
 *
 * The scene is 16:9. Held at 54rem tall on a 2560px window the hero becomes a
 * 2.95:1 letterbox, and `cover` answers that by throwing away 40% of the
 * image's height -- which is the half with the desk in it. Growing the hero
 * with the window keeps the crop near the ratio the picture was composed at.
 *
 * `max()` rather than another breakpoint because it is self-limiting: 42vw
 * only exceeds 54rem past about 2050px, so every ordinary laptop is
 * untouched by it.
 */
@media (min-width: 60rem) {
  .hero {
    min-height: max(clamp(38rem, 92dvh, 54rem), 42vw);
  }
}

/* ------------------------------------------------------------------ *
 * The scene
 * ------------------------------------------------------------------ */

/*
 * Edge to edge, with `object-position` doing the composing.
 *
 * This was a right-hand panel of fixed width, and it broke exactly where a
 * percentage width always breaks: on a wide monitor. The type column is
 * capped at `--page-max` and centred in the window, while a 76%-wide image is
 * pinned to the window's right edge -- so the wider the screen, the further
 * apart the two drifted, until a 2560px display showed a quarter-screen of
 * flat black on the left, the statement floating in the middle, and the
 * picture starting somewhere off to the right. Three things, not one
 * composition.
 *
 * Full bleed has no such failure mode: the scene fills the hero at every
 * width and the fade below decides where it stops being a photograph and
 * starts being a page. `72% 46%` keeps the lamp, the labelled book spines and
 * the orb in frame -- the part of the render that is actually about this
 * product -- while the dark left of the room is what the type sits on.
 */
.hero__art {
  position: absolute;
  inset: 0;
  z-index: -1;
}

.hero__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 72% 46%;
  /*
   * A camera that never quite stops moving.
   *
   * Half a minute to travel 4%, which is slow enough that nobody watching the
   * page catches it moving and slow enough that the scene is never twice the
   * same while you read the headline. It is the cheapest possible way to stop
   * a still photograph reading as a still photograph.
   *
   * `alternate`, so it breathes in and out rather than snapping back to the
   * start every cycle, and scale only -- one composited property, no repaint,
   * and scaling *up* means the crop can never expose an edge.
   */
  animation: hero-drift 32s var(--ease-inout) infinite alternate;
}

/*
 * The canvas takes the same slow drift as the image it covers, so the two are
 * geometrically identical at every moment and the crossfade between them has
 * nothing to give away.
 */
.hero__depth {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity var(--duration-enter) var(--ease-out);
  animation: hero-drift 32s var(--ease-inout) infinite alternate;
}

.hero__depth.is-live {
  opacity: 1;
}

@keyframes hero-drift {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.045);
  }
}

/*
 * Where the photograph becomes the page.
 *
 * Three gradients rather than one: left, so the type has an unbroken ground
 * to sit on; bottom, so the hero hands off to the section below instead of
 * ending on a hard horizontal edge; and top, so the nav has something to be
 * legible against without the bar itself needing a background.
 *
 * A `mask-image` would be tidier and is the wrong tool -- masking punches the
 * image out to transparency, and what is wanted is a blend into a specific
 * near-black, which is what the page behind it actually is.
 */
/*
 * The narrow-screen fade is a scrim, not a left-to-right wipe.
 *
 * The stops below were drawn for a layout where the type is a column on the
 * left and the photograph is what fills the space beside it. On a phone there
 * is no space beside it: the panel is the width of the screen, so a gradient
 * that reaches `transparent` at 70% leaves the last quarter of every line
 * sitting on an unattenuated photograph -- which on this image is the lamp,
 * the orb, and the spines with words printed on them. Two sets of words on
 * top of each other.
 *
 * So below the breakpoint the whole width keeps a ground, weakest at the far
 * edge where no text reaches. The photograph still reads; it simply stops
 * competing with the sentence over it.
 */
.hero__fade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      to right,
      var(--surface-base) 0%,
      rgb(10 10 12 / 0.93) 30%,
      rgb(10 10 12 / 0.78) 66%,
      rgb(10 10 12 / 0.58) 100%
    ),
    linear-gradient(to bottom, rgb(10 10 12 / 0.72) 0%, transparent 22%),
    linear-gradient(to top, var(--surface-base) 0%, transparent 26%);
}

/*
 * Now that the picture runs the full width, the horizontal fade has to cover
 * the whole type column rather than just the seam at a panel's edge -- it is
 * the only thing standing between a 5rem headline and a photograph of a lamp.
 */
@media (min-width: 60rem) {
  .hero__fade {
    background:
      linear-gradient(
        to right,
        var(--surface-base) 0%,
        rgb(10 10 12 / 0.97) 20%,
        rgb(10 10 12 / 0.6) 42%,
        rgb(10 10 12 / 0.14) 64%,
        transparent 80%
      ),
      linear-gradient(to bottom, rgb(10 10 12 / 0.75) 0%, transparent 18%),
      linear-gradient(to top, var(--surface-base) 0%, rgb(10 10 12 / 0.45) 10%, transparent 28%);
  }
}

/*
 * Film grain over the whole scene.
 *
 * A 160px tile of fractal noise, repeated -- the browser rasterises the SVG
 * once at tile size and it is then an ordinary repeating background, which is
 * nothing like the cost of filtering the element underneath it.
 *
 * What it buys: the render and the flat near-black of the page below it are
 * two different kinds of surface, and a shared grain is what stops the seam
 * between them being visible on a good monitor.
 */
/*
 * A warm pool of light under the cursor.
 *
 * A fixed-size element translated into place, rather than a radial gradient
 * whose centre is animated: moving a gradient's stops repaints the whole
 * layer every frame, while moving the element is composited and costs
 * nothing. On a hero this size that is the difference between a smooth
 * effect and a stuttering one.
 *
 * Only while the cursor is actually over the section -- it fades out with the
 * pointer, so the page at rest is the composition as designed.
 */
.hero__light {
  position: absolute;
  top: 0;
  left: 0;
  width: 44rem;
  height: 44rem;
  margin: -22rem 0 0 -22rem;
  pointer-events: none;
  background: radial-gradient(closest-side, rgb(255 186 132 / 0.1), transparent 72%);
  opacity: 0;
  transform: translate3d(var(--px, 60vw), var(--py, 50%), 0);
  transition:
    transform 500ms var(--ease-out),
    opacity 700ms var(--ease-out);
}

.hero:hover .hero__light {
  opacity: 1;
}

.hero__grain {
  position: absolute;
  inset: 0;
  opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 160px 160px;
}

/* ------------------------------------------------------------------ *
 * The statement
 * ------------------------------------------------------------------ */

.hero__inner {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  max-width: var(--page-max);
  margin-inline: auto;
  padding: calc(var(--topbar-height) + var(--space-12)) var(--space-6) var(--space-12);
}

@media (min-width: 60rem) {
  .hero__inner {
    padding-inline: var(--space-10);
  }
}

/* Wide enough to hold the statement at its largest without the longest line
   reaching the edge; the paragraph under it is held narrower separately,
   because 38rem is a composition width and not a reading width. */
.hero__panel {
  max-width: 38rem;
}

.hero__eyebrow {
  margin: 0 0 var(--space-5);
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: var(--text-secondary);
}

/*
 * Set in the sans, not the display serif.
 *
 * Every other headline in the product is Playfair, and this one is the
 * exception on purpose: the design sets the landing statement as a tight
 * grotesque, and at this size the two faces say genuinely different things.
 * The serif is literary and a little formal -- right over a media page. The
 * grotesque at -0.03em is plain speech, which is what a sentence like this
 * one has to be to be believed.
 */
.hero__statement {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  /*
   * The lower bound is set by the longest line at the narrowest window, not by
   * what looks good on a desktop.
   *
   * "more together." is about 6.8em once the negative tracking is counted, so
   * at 2.4rem it needs ~260px and a 360px phone offers ~312px inside the
   * gutter. Going larger here does not wrap -- each line is its own block, so
   * there is nowhere to wrap to -- it overflows the screen sideways.
   */
  font-size: clamp(2.4rem, 8vw, 5rem);
  line-height: 1.03;
  letter-spacing: -0.035em;
}

/*
 * The mask each line's words rise out of.
 *
 * The padding/negative-margin pair is not decoration: `overflow: hidden` on a
 * line of 80px type clips the descender of a "g" and the full stop's optical
 * overshoot, so the box is grown by a tenth of an em and pulled back by the
 * same amount. Without it "together." loses the tail of its g and nobody can
 * say quite why the headline looks wrong.
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

/* The space between words, which `inline-block` would otherwise collapse out
   of existence once the whitespace between the tags is gone. */
.hero__word + .hero__word {
  margin-left: 0.22em;
}

.hero__word--accent {
  color: var(--accent);
}

.hero__sub {
  margin: var(--space-6) 0 0;
  max-width: 30rem;
  font-size: var(--text-lg);
  line-height: 1.6;
  color: var(--text-secondary);
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-8);
}

.hero__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
  color: var(--text-primary);
  font-size: var(--text-base);
  font-weight: 500;
  /*
   * `--mx`/`--my` come from `v-magnetic`; they are 0 until a cursor is near,
   * and stay 0 forever on touch and under reduced motion. The transition is
   * what turns a per-frame offset into weight -- without it the control is
   * welded to the pointer, which reads as a glitch rather than as attraction.
   */
  transform: translate(var(--mx, 0px), var(--my, 0px));
  transition:
    transform 260ms var(--ease-out),
    background-color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

/* A hair of fill, so the two buttons are ranked without one of them shouting.
   The red is saved for the hover, where the emphasis belongs. */
.hero__cta--primary {
  background: rgb(255 255 255 / 0.08);
}

.hero__cta svg {
  width: 1.05rem;
  height: 1.05rem;
  transition: transform var(--duration-base) var(--ease-out);
}

.hero__cta:hover {
  border-color: var(--border-strong);
  background: rgb(255 255 255 / 0.14);
}

.hero__cta--primary:hover {
  background: var(--accent);
  border-color: var(--accent);
}

.hero__cta:hover svg {
  transform: translateX(3px);
}

.hero__people {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-8);
}

.hero__faces {
  display: flex;
  flex-shrink: 0;
}

.hero__face {
  position: relative;
  outline: 2px solid var(--surface-base);
  border-radius: var(--radius-full);
}

.hero__face:not(:first-child) {
  margin-left: -0.65rem;
}

.hero__people-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--text-tertiary);
}

.hero__people-text strong {
  color: var(--text-primary);
  font-weight: 600;
}

/*
 * Marginalia, bottom right.
 *
 * Only once the window is wide enough that it lands on the dark edge of the
 * render rather than on the lamp. It is the first thing that should go when
 * space is short -- it is decoration, and it knows it.
 */
.hero__margin {
  display: none;
}

@media (min-width: 80rem) {
  .hero__margin {
    position: absolute;
    right: var(--space-10);
    bottom: var(--space-8);
    display: block;
    margin: 0;
    font-size: var(--text-2xs);
    font-weight: 500;
    line-height: 2;
    text-align: right;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    color: var(--text-secondary);
    /* The only type over the lit part of the scene, so it carries its own
       shadow rather than leaning on the fade. */
    text-shadow: 0 1px 14px rgb(0 0 0 / 0.9);
  }
}

/* ------------------------------------------------------------------ *
 * The opening sequence
 *
 * One keyframe and a delay per element. Everything here is opacity and
 * transform -- both composited -- and none of it can arrive late or fail to
 * run the way a script can, so the page is legible with JavaScript off and
 * identical with it on.
 *
 * The image is deliberately not in the sequence. It is the largest thing on
 * the screen and almost certainly what the browser measures as the largest
 * contentful paint, and holding it back to make an entrance of it would be
 * paying for choreography in the one currency that matters.
 * ------------------------------------------------------------------ */

@keyframes hero-rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.hero__eyebrow,
.hero__sub,
.hero__actions,
.hero__people,
.hero__margin {
  animation: hero-rise var(--duration-enter) var(--ease-out) var(--in-delay, 0ms) backwards;
}

/*
 * Each word climbs out from behind the line above it.
 *
 * A mask reveal rather than a fade: the words are already clipped by the
 * line, so travelling 110% of their own height means they begin genuinely
 * out of sight and arrive without ever being semi-transparent. Type that
 * fades reads as a slideshow; type that is uncovered reads as printed.
 *
 * The stagger runs across both lines from one counter, so the second line
 * continues the rhythm instead of restarting it.
 */
.hero__word {
  animation: word-rise 820ms var(--ease-out) calc(160ms + var(--i, 0) * 90ms) backwards;
}

@keyframes word-rise {
  from {
    transform: translateY(110%) rotate(2deg);
  }
  to {
    transform: translateY(0) rotate(0deg);
  }
}

.hero__eyebrow {
  --in-delay: 80ms;
}

.hero__sub {
  --in-delay: 500ms;
}

.hero__actions {
  --in-delay: 620ms;
}

.hero__people {
  --in-delay: 740ms;
}

.hero__margin {
  --in-delay: 1000ms;
}

/* ------------------------------------------------------------------ *
 * Scrolling away
 *
 * The statement drifts up and fades as the hero leaves, so the page hands
 * over to the next section instead of the two sliding past each other like
 * cards in a deck. It is scrubbed to the scroll position rather than played
 * on a trigger -- it tracks the gesture, and scrolling back up runs it
 * backwards, which is the difference between a page that responds and a page
 * that performs at you.
 *
 * Native CSS, no library and no scroll listener: the browser runs this off
 * the main thread, so it stays smooth on a page that is also decoding a
 * megapixel photograph.
 *
 * `@supports` because Firefox has not shipped it yet. There, and under
 * reduced motion, the panel simply stays where it is -- which is a page that
 * works, not a page missing a feature.
 * ------------------------------------------------------------------ */

@keyframes hero-exit {
  to {
    opacity: 0;
    transform: translateY(-2.5rem);
  }
}

@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .hero__panel {
      animation: hero-exit linear both;
      animation-timeline: view();
      /* Only over the half of the exit where the panel is genuinely on its
         way out. Starting at 0% would have it fading while still centred. */
      animation-range: exit 15% exit 90%;
    }
  }
}

/*
 * `animation: none`, not a shorter duration.
 *
 * These are `backwards`-filled with delays running out to a second, so merely
 * collapsing the duration -- which is what the global rule in main.css does --
 * would leave each element sitting in its invisible start state for the whole
 * delay and then snapping in. Removing the animation outright is the only
 * version of this that renders a finished page immediately.
 */
@media (prefers-reduced-motion: reduce) {
  .hero__eyebrow,
  .hero__word,
  .hero__sub,
  .hero__actions,
  .hero__people,
  .hero__margin,
  /* The drift is slow enough to be subliminal, which is exactly why it has to
     go here: "I cannot see it moving" is not the same as "it is not moving",
     and vestibular triggers do not care whether the motion was tasteful. */
  .hero__art img,
  .hero__depth {
    animation: none;
  }

  /* Belt and braces. The composable checks the same query and never starts,
     so this canvas is empty -- but an empty canvas painted over the
     photograph would be a black rectangle, and that is not a risk worth
     leaving to one guard. */
  .hero__depth {
    display: none;
  }

  .hero__cta,
  .hero__cta svg {
    transition: none;
  }

  /* The directive never publishes an offset under reduced motion, so this is
     belt and braces -- but a control stuck at a stale offset would be a
     layout bug rather than merely an un-animated one. */
  .hero__cta {
    transform: none;
  }

  .hero__light {
    display: none;
  }
}
</style>
