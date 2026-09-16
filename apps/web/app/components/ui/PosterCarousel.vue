<script setup lang="ts">
import type { MediaType } from '@revy/shared/types'
import { formatAverage, imageAtWidth, imageSrcSet } from '@revy/shared/utils'

/**
 * A row of titles as a coverflow, rather than a rail of thumbnails.
 *
 * The rail this replaces was a row of identical small posters that scrolled
 * sideways, and its problem was not that it was ugly -- it was that nothing in
 * it was ever the subject. Twelve equal thumbnails give the eye nowhere to
 * land, so there is nothing to read and nothing to remember; the whole row
 * registers as texture.
 *
 * This puts one title in front, at a size worth looking at, with the rest
 * falling away behind it in depth. There is always exactly one thing being
 * shown, its name and score are set underneath it in full, and moving through
 * the set is a gesture rather than a scroll.
 *
 * Generic, because three screens wanted it: the landing page's trending row,
 * Explore's hidden gems, and search's highest-rated. It was written for the
 * first and hardcoded its heading; everything that made it specific to that
 * one row is now a prop.
 */
/**
 * The minimum a card needs to be drawn.
 *
 * Declared here rather than borrowing `TrendingTile` or `ExploreCard`, because
 * this component is now used by three screens whose payloads differ. Both of
 * those types already satisfy this, so neither call site has to map anything;
 * a screen whose data does not satisfy it maps once, at the call site, where
 * the reason for the difference is visible.
 */
interface CarouselItem {
  id: string
  mediaType: MediaType
  title: string
  coverImageUrl: string | null
  /** Already formatted; empty where the provider supplied no date. */
  releaseYear: string
  ratingAverage: number | null
  ratingCount: number
  /**
   * The provider aggregate, for the many titles nobody here has rated.
   *
   * Optional because the landing page built its payload before this existed.
   * A slide without either number says the year and nothing else, which is
   * what this row looked like for most of the catalogue.
   */
  externalRating?: { source: string; score: number; votes: number } | null
}

const props = defineProps<{
  items: CarouselItem[]
  /** Small uppercase line above the heading. Optional. */
  eyebrow?: string
  title: string
  /** One line under the heading. Optional. */
  subtitle?: string
  /** Shows a "see all" link when given. */
  seeAllTo?: string
  /**
   * Multiplies the card size, for a row that should not lead its screen.
   *
   * Per instance rather than a global change, because the three screens using
   * this want different weights: the landing page's trending row is the
   * composition somebody arrives on, while Explore's hidden gems sits below
   * two other sections and should not shout over them.
   */
  scale?: number
}>()

/** How many neighbours stay on screen either side of the front card. */
const DEPTH = 3

const active = ref(0)
const stage = ref<HTMLElement | null>(null)

/** Live finger offset while dragging, in px. Zero at rest. */
const drag = ref(0)

const current = computed(() => props.items[active.value] ?? null)

/**
 * The titles either side of the front one.
 *
 * These are the edge controls' labels. A chevron says "there is more"; the
 * name of the thing you are about to see says what it is -- which on a row
 * about what people are reviewing is the only information worth putting in
 * the margin. Wrapped, like the placement, so neither edge is ever empty.
 */
function neighbour(delta: number) {
  const total = props.items.length
  if (total < 2) return null
  return props.items[(((active.value + delta) % total) + total) % total] ?? null
}

const previous = computed(() => neighbour(-1))
const next = computed(() => neighbour(1))

function go(index: number) {
  const total = props.items.length
  if (!total) return
  // Wrapped, so the fan is symmetrical at every position. The counter below
  // still reads the true index, so wrapping costs no honesty about where in
  // the set you are -- it only removes two dead ends.
  active.value = ((index % total) + total) % total
}

function step(delta: number) {
  go(active.value + delta)
}

/**
 * Where a card sits, as a function of its distance from the front.
 *
 * Everything is a custom property rather than a composed transform string, so
 * the CSS below owns how the card actually moves and this owns only how far
 * from the subject it is.
 */
function placement(index: number) {
  const total = props.items.length

  /*
   * The shorter way round.
   *
   * A plain `index - active` fans the whole set to one side whenever the front
   * card is near an end -- at index 0 every other card piles up on the right
   * and half the stage is empty, which reads as a broken layout rather than as
   * the start of a list. Taking whichever direction is nearer means the cards
   * behind the subject always come from both sides.
   */
  let offset = index - active.value
  if (offset > total / 2) offset -= total
  if (offset < -total / 2) offset += total

  const distance = Math.abs(offset)
  const hidden = distance > DEPTH

  /*
   * The fan spreads wider and recedes less than it used to.
   *
   * On a 2560px monitor the binding constraint on a 2:3 poster is the window's
   * *height*, not its width -- so past a point the front card cannot grow, and
   * the composition still reads as small because it occupies a quarter of a
   * very wide screen. Widening the spread and flattening the falloff is what
   * fills that space: the neighbours stay large and the whole set spans the
   * screen rather than huddling around the middle.
   */
  return {
    '--x': `${offset * 62}%`,
    '--z': `${distance * -150}px`,
    '--ry': `${offset * -24}deg`,
    '--scale': String(Math.max(0.7, 1 - distance * 0.065)),
    '--dim': String(hidden ? 0 : Math.max(0.3, 1 - distance * 0.2)),
    // Nearest the front paints on top, whichever side it is on.
    zIndex: String(100 - distance),
  }
}

/* ------------------------------------------------------------------ *
 * Dragging
 * ------------------------------------------------------------------ */

let startX = 0
let pressed = false

/** Movement past this counts as a drag rather than a click. */
const DRAG_THRESHOLD = 6

/** How far a drag must travel before it counts as one card. */
const STEP_PX = 120

/**
 * True once the pointer has actually travelled.
 *
 * This is the whole reason the carousel's buttons stopped responding. The
 * previous version called `setPointerCapture` on `pointerdown`, which
 * redirects every later pointer event -- and therefore the synthesised
 * `click` -- to the capturing element. The edge controls sit inside that
 * element, so their handlers were never reached: every press became a
 * zero-distance "drag" swallowed by the stage.
 *
 * Nothing is captured now. The gesture is tracked on the window, which is
 * more robust anyway (a drag that leaves the stage still finishes), and the
 * flag below is what tells a click from a throw.
 */
const dragging = ref(false)

function onPointerDown(event: PointerEvent) {
  // Primary button only; a right-click should open a menu, not spin the set.
  if (event.button !== 0) return
  pressed = true
  dragging.value = false
  startX = event.clientX
}

function onPointerMove(event: PointerEvent) {
  if (!pressed) return

  const travelled = event.clientX - startX
  if (!dragging.value && Math.abs(travelled) < DRAG_THRESHOLD) return

  dragging.value = true
  // Damped and capped: the track follows the finger enough to feel attached
  // without the whole composition sliding away.
  drag.value = Math.max(-STEP_PX, Math.min(STEP_PX, travelled * 0.5))
}

function onPointerUp(event: PointerEvent) {
  if (!pressed) return
  pressed = false
  drag.value = 0

  if (!dragging.value) return

  const travelled = event.clientX - startX
  // A flick moves one card per `STEP_PX`, so a long throw crosses several.
  step(-Math.round(travelled / STEP_PX) || (travelled > 0 ? -1 : 1))

  // Cleared on the next frame, not now: the click event that follows this
  // pointerup has to still see that a drag happened, or releasing a throw on
  // top of a poster would also open it.
  requestAnimationFrame(() => {
    dragging.value = false
  })
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp, { passive: true })
  window.addEventListener('pointercancel', onPointerUp, { passive: true })

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  })
})

/**
 * A card behind the front one brings itself forward.
 *
 * Clicking a poster that is rotated away and half-covered to *navigate* is a
 * trap -- at that angle you cannot read what you are opening. So the cards
 * behind the subject are the carousel's most obvious control, and one nobody
 * has to be taught.
 */
function onSideClick(index: number) {
  if (dragging.value) return
  go(index)
}

/** The front card does navigate -- unless the press was the end of a throw. */
function onFrontClick(event: MouseEvent) {
  if (dragging.value) event.preventDefault()
}

/**
 * Keeps the front card and the keyboard in agreement.
 *
 * Every poster is a real link and stays tabbable, so someone moving through
 * the page by keyboard walks into the middle of the set. Following focus means
 * the card they are on is the card being shown, rather than their focus ring
 * sitting on something rotated away behind three others.
 */
function onFocusIn(index: number) {
  go(index)
}
</script>

<template>
  <!-- Published as a custom property so the sizes below stay one expression
       each, rather than every `min()` growing a conditional. -->
  <section class="trending" :style="{ '--carousel-scale': scale ?? 1 }">
    <header v-reveal class="trending__head">
      <div>
        <p v-if="eyebrow" class="trending__eyebrow">{{ eyebrow }}</p>
        <h2 class="trending__title">{{ title }}</h2>
        <p v-if="subtitle" class="trending__sub">{{ subtitle }}</p>
      </div>

      <div v-if="seeAllTo" class="trending__controls">
        <NuxtLink :to="seeAllTo" class="trending__all">{{ $t('common.seeAll') }}</NuxtLink>
      </div>
    </header>

    <!--
      `role="group"` with a label, and arrow keys bound: the cards behind the
      front one are rotated away and partly covered, so without a keyboard
      route through the set they would be decoration a mouse user can reach
      and nobody else can.
    -->
    <div
      ref="stage"
      class="stage"
      role="group"
      aria-roledescription="carousel"
      :aria-label="title"
      tabindex="0"
      @pointerdown="onPointerDown"
      @keydown.left.prevent="step(-1)"
      @keydown.right.prevent="step(1)"
      @keydown.home.prevent="go(0)"
      @keydown.end.prevent="go(items.length - 1)"
    >
      <!--
        The carousel's only controls, down each side of the stage itself.

        There were two small buttons up beside the heading as well. They went
        because a control that sits a heading's width away from the thing it
        drives is a control you have to go and find -- and having two ways to
        do one thing meant neither got to be the obvious one.

        The hit area is the full height of the stage; the disc inside it is
        just where the mark is drawn. So the target is enormous and the page
        still looks like it has almost no chrome on it.
      -->
      <button
        v-if="previous"
        type="button"
        class="edge edge--prev"
        :aria-label="`Previous title: ${previous.title}`"
        @click="step(-1)"
      >
        <span class="edge__disc" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 5.5 8 12l6.5 6.5" />
          </svg>
        </span>
        <span class="edge__name" aria-hidden="true">{{ previous.title }}</span>
      </button>

      <button
        v-if="next"
        type="button"
        class="edge edge--next"
        :aria-label="`Next title: ${next.title}`"
        @click="step(1)"
      >
        <span class="edge__disc" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.5 5.5 16 12l-6.5 6.5" />
          </svg>
        </span>
        <span class="edge__name" aria-hidden="true">{{ next.title }}</span>
      </button>

      <ul class="stage__track" :style="{ '--drag': `${drag}px` }">
        <li
          v-for="(item, index) in items"
          :key="item.id"
          class="slide"
          :class="{ 'slide--front': index === active }"
          :style="placement(index)"
          :aria-hidden="Math.abs(index - active) > DEPTH ? 'true' : undefined"
        >
          <!--
            The front card is a link; the others are buttons.

            Not one element with a click handler that cancels navigation --
            that was tried and does not work, because `NuxtLink` binds its own
            handler and it runs before a fall-through one, so `preventDefault`
            arrives after the router has already left. Two elements is also the
            honest markup: a control that re-centres the carousel is a button,
            and an `<a>` that refuses to navigate is a lie told to every
            screen reader and every middle-click.

            The inner markup is duplicated rather than extracted. It is an
            image and a badge, and a component for it would cost more to read
            than the eight lines it saved.
          -->
          <NuxtLink
            v-if="index === active"
            :to="`/media/${item.id}`"
            class="slide__link"
            @focusin="onFocusIn(index)"
            @click="onFrontClick($event)"
          >
            <img
              v-if="item.coverImageUrl"
              :src="imageAtWidth(item.coverImageUrl, 500) ?? item.coverImageUrl"
              :srcset="imageSrcSet(item.coverImageUrl, [342, 500, 780]) ?? undefined"
              sizes="(min-width: 60rem) 700px, 60vw"
              :alt="item.title"
              draggable="false"
              :loading="index < 3 ? 'eager' : 'lazy'"
              decoding="async"
            />

            <span v-if="item.ratingAverage !== null" class="slide__score">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z" />
              </svg>
              {{ formatAverage(item.ratingAverage) }}
            </span>
          </NuxtLink>

          <button
            v-else
            type="button"
            class="slide__link"
            :tabindex="Math.abs(index - active) > DEPTH ? -1 : undefined"
            :aria-label="`Show ${item.title}`"
            @focusin="onFocusIn(index)"
            @click="onSideClick(index)"
          >
            <img
              v-if="item.coverImageUrl"
              :src="imageAtWidth(item.coverImageUrl, 500) ?? item.coverImageUrl"
              :srcset="imageSrcSet(item.coverImageUrl, [342, 500, 780]) ?? undefined"
              sizes="(min-width: 60rem) 700px, 60vw"
              alt=""
              draggable="false"
              :loading="index < 3 ? 'eager' : 'lazy'"
              decoding="async"
            />
          </button>
        </li>
      </ul>
    </div>

    <!--
      The subject, named in full underneath it.
      `aria-live` because pressing an arrow changes what is being shown, and
      that change is otherwise silent to anyone not looking at the artwork.
    -->
    <div v-if="current" class="caption" aria-live="polite">
      <p :key="current.id" class="caption__name">{{ current.title }}</p>
      <p class="caption__meta">
        <UiMediaTypeTag :media-type="current.mediaType" />
        <span v-if="current.releaseYear">{{ current.releaseYear }}</span>
        <span v-if="current.ratingCount">
          {{ $t('common.ratings', { count: current.ratingCount }, current.ratingCount) }}
        </span>

        <!-- Whose number it is, when it is not this community's. Kept on the
             provider's own scale: see CardOverlay for why halving it would
             be dishonest rather than merely inconsistent. -->
        <span v-else-if="current.externalRating" class="caption__external">
          {{ current.externalRating.score.toFixed(1) }}/10 · {{ current.externalRating.source }}
        </span>
      </p>

      <!--
        "01 — 01" is not a position, it is a shrug.

        A counter only means something when there is somewhere else to be, and
        the edge controls are already absent at one item -- so the whole
        apparatus of a carousel disappears and what is left is one poster with
        its name under it, which is all a row of one ever was.
      -->
      <p v-if="items.length > 1" class="caption__count">
        <strong>{{ String(active + 1).padStart(2, '0') }}</strong>
        <span class="caption__rule" aria-hidden="true" />
        {{ String(items.length).padStart(2, '0') }}
      </p>
    </div>
  </section>
</template>

<style scoped>
/*
 * Sized against its own container, not the window.
 *
 * This started life full-bleed on the landing page, so everything in it was
 * measured in `vh` and viewport media queries. Search puts it inside a 672px
 * reading column on a 2560px monitor -- and a card sized from viewport height
 * came out wider than the box it was in, which then squeezed the edge controls
 * on top of the artwork.
 *
 * `container-type: inline-size` lets the rules below ask how much room this
 * component actually has rather than how big the screen is, which is the only
 * question that has ever been relevant to them.
 */
.trending {
  container-type: inline-size;
  border-top: 1px solid var(--border-subtle);
  overflow: hidden;
}

.trending__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-5);
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-16) var(--space-6) var(--space-10);
}

@media (min-width: 60rem) {
  .trending__head {
    padding-inline: var(--space-10);
  }
}

.trending__eyebrow {
  margin: 0 0 var(--space-3);
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: var(--text-tertiary);
}

.trending__sub {
  margin: 0.25rem 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.trending__title {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(1.75rem, 3.4vw, 2.5rem);
  letter-spacing: -0.03em;
}

.trending__controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.trending__all {
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

.trending__all:hover {
  color: var(--text-primary);
}

/* ------------------------------------------------------------------ *
 * Edge zones
 * ------------------------------------------------------------------ */

/*
 * The controls are the neighbouring titles, set vertically down each edge.
 *
 * Two chevrons in circles is the shape every carousel on the internet has,
 * and on a page whose hero already sets marginalia vertically down its right
 * edge it was the one component that looked borrowed. This uses the type
 * instead: the name of what is next, rotated onto its side, with a rule
 * running out of it. It says where you are going rather than merely that you
 * can go, and it belongs to this page rather than to carousels in general.
 *
 * The hit area is still the full height of the stage -- the label is only
 * where the mark is drawn.
 */
/*
 * A column: the disc, and the title it will show underneath it.
 *
 * The title used to sit beside the disc and reveal on hover, which meant that
 * in practice nobody ever saw it -- a label you have to discover is a label
 * that is not doing its job, and this one was reported missing twice. It is
 * the whole reason these controls say more than a plain arrow would: "next"
 * tells you a direction, "Breaking Bad" tells you where you are going.
 */
.edge {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 200;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  width: 8rem;
  border: 0;
  background: none;
  cursor: var(--cursor-hand);
  color: var(--text-secondary);
  transition: color var(--dur-base) var(--ease-out);
}

/*
 * Shown only when the container is wide enough for them to sit beside the
 * fan rather than on top of it. A viewport query cannot answer that: the
 * window can be 2560px while this component has 672px.
 */
@container (min-width: 80rem) {
  .edge {
    display: flex;
  }
}

/*
 * Beside the carousel, not at the edges of the window.
 *
 * These were pinned to the stage, and the stage is full-bleed -- so on a wide
 * monitor the two controls sat five hundred pixels out from the artwork with
 * nothing connecting them to the thing they moved.
 *
 * Anchoring from the centre keeps them a fixed distance from the front card at
 * every width, which is what "on the left and right of the carousel" means.
 *  stops them being pushed off-screen on a narrow desktop window;
 * below 60rem they are hidden and the drag gesture takes over.
 */
.edge--prev {
  right: min(calc(50% + 33rem), calc(100% - 9rem));
}

.edge--next {
  left: min(calc(50% + 33rem), calc(100% - 9rem));
}

.edge:focus {
  outline: none;
}

/*
 * A disc, because the previous version was not a control.
 *
 * What was here was the neighbouring title set vertically -- clever, and it
 * failed at the only job a control has: being recognised as one. Rendered in
 * grey beside the artwork it read as part of the poster fan, and the carousel
 * was reported as broken twice by somebody looking straight at it.
 *
 * So: a real disc with a real chevron. The distinctive part moved to how it
 * behaves rather than what it is -- it is lit from within by the accent, it
 * swells under the cursor, and it brings the title it is about to show with
 * it. A control can be unusual as long as it is first obvious.
 */
.edge__disc {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 4rem;
  height: 4rem;
  /*
   * Opaque enough to sit on artwork.
   *
   * The fan is wide enough now that these land on top of a poster rather than
   * on empty ground, and a 72%-transparent disc over a busy frame stops being
   * a shape. The ring and the drop shadow are what separate it from whatever
   * is behind it, so both are stronger than a control on a plain background
   * would need.
   */
  border: 1px solid rgb(255 255 255 / 0.22);
  border-radius: var(--radius-full);
  background: rgb(10 10 12 / 0.88);
  backdrop-filter: blur(12px);
  box-shadow:
    0 0.75rem 2.5rem rgb(0 0 0 / 0.75),
    0 0 0 1px rgb(0 0 0 / 0.4);
  transition:
    transform var(--dur-base) var(--ease-out),
    border-color var(--dur-base) var(--ease-out),
    background var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

.edge__disc svg {
  width: 1.5rem;
  height: 1.5rem;
}

.edge:hover .edge__disc,
.edge:focus-visible .edge__disc {
  transform: scale(1.12);
  border-color: var(--accent);
  background: rgb(200 16 46 / 0.16);
  /* Lit from within, so it reads as the brand rather than as a grey chrome
     button borrowed from somewhere else. */
  box-shadow:
    0 0.5rem 2rem rgb(0 0 0 / 0.55),
    0 0 2rem rgb(200 16 46 / 0.45);
}

.edge:hover,
.edge:focus-visible {
  color: var(--text-primary);
}

.edge:focus-visible .edge__disc {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

/*
 * The title it will show, revealed on approach.
 *
 * Present but collapsed at rest, so the control is a clean disc until somebody
 * reaches for it -- then it says where it goes. Animating  rather
 * than  lets the label size itself to whatever the title happens to be.
 */
/*
 * Always visible, and readable over artwork.
 *
 * Wraps to two lines rather than truncating: these are real titles, and "A
 * Game of Thr…" beside an arrow is worse than two short lines. The shadow is
 * doing real work -- the label sits over whatever poster happens to be behind
 * the control, so it cannot rely on the background being dark.
 *
 * Tracking is looser and the size smaller than the caption below the stage,
 * because this is a signpost rather than a heading: it should be legible at a
 * glance and never compete with the title of the card in front.
 */
.edge__name {
  max-width: 100%;
  opacity: 0.8;
  font-size: var(--text-2xs);
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  text-shadow:
    0 1px 10px rgb(0 0 0 / 0.95),
    0 0 24px rgb(0 0 0 / 0.8);
  transition: opacity var(--dur-base) var(--ease-out);
}

.edge:hover .edge__name,
.edge:focus-visible .edge__name {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .edge__disc,
  .edge__name {
    transition-duration: 1ms;
  }
}

/* ------------------------------------------------------------------ *
 * The stage
 * ------------------------------------------------------------------ */

/*
 * `perspective` lives here, on the ancestor, so every card shares one vanishing
 * point. Set per-card instead, each one gets its own camera and the row fans
 * out like a hand of playing cards rather than receding into one room.
 */
.stage {
  position: relative;
  height: calc(min(70vh, 34rem) * var(--carousel-scale, 1));
  perspective: 1500px;
  perspective-origin: 50% 45%;
  /* The grab affordance, and the reason the images carry `draggable=false`:
     without it the browser's native image drag wins and the carousel never
     sees the gesture. */
  cursor: grab;
  touch-action: pan-y;
}

.stage:active {
  cursor: grabbing;
}

.stage:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -4px;
  border-radius: var(--radius-lg);
}

@media (min-width: 60rem) {
  .stage {
    height: calc(min(92vh, 82rem, 105cqw) * var(--carousel-scale, 1));
  }
}

.stage__track {
  position: relative;
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  transform-style: preserve-3d;
  /* The live finger offset. Springs back to zero on release, which is what
     makes a drag that does not travel far enough feel resisted rather than
     ignored. */
  transform: translateX(var(--drag, 0px));
  transition: transform 420ms var(--ease-out);
}

/*
 * Sized from height, not width.
 *
 * These cards were 25rem wide on a 2560px monitor -- fifteen percent of the
 * screen, for the one thing the section exists to show. Doubling the width is
 * not available, though: a poster is 2:3, so an 800px card is 1200px tall and
 * taller than most windows.
 *
 * So the height leads and the aspect ratio derives the width. The card takes
 * most of the viewport's height and can never overflow it, which on a wide
 * screen works out at about half as wide again and more than twice the area.
 */
.slide {
  position: absolute;
  top: 50%;
  left: 50%;
  height: calc(min(62vh, 34rem, 95cqw) * var(--carousel-scale, 1));
  width: auto;
  aspect-ratio: var(--poster-ratio);
  margin: 0;
  transform-style: preserve-3d;
  transform: translate(-50%, -50%) translateX(var(--x)) translateZ(var(--z))
    rotateY(var(--ry)) scale(var(--scale));
  opacity: var(--dim);
  /*
   * Long and soft rather than quick and tight.
   *
   * At 640ms with the standard curve the set snapped, which is right for a
   * control and wrong for a composition -- the whole point of showing one
   * title at a time is that arriving somewhere should feel like a camera
   * move.
   */
  transition:
    transform 900ms cubic-bezier(0.16, 1, 0.24, 1),
    opacity 700ms var(--ease-out);
}

@media (min-width: 60rem) {
  .slide {
    height: calc(min(82vh, 72rem, 95cqw) * var(--carousel-scale, 1));
  }
}

.slide__link {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  cursor: var(--cursor-hand);
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  box-shadow: 0 24px 60px rgb(0 0 0 / 0.6);
}

.slide__link img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /*
   * Held back, and released only at the front.
   *
   * Twelve fully saturated posters compete for attention and the carousel
   * goes back to being a wall. Desaturating everything but the subject is
   * what makes the subject a subject.
   */
  filter: grayscale(0.55) brightness(0.62);
  transition: filter 900ms cubic-bezier(0.16, 1, 0.24, 1);
}

.slide--front .slide__link {
  border-color: var(--border-strong);
  box-shadow: 0 36px 80px rgb(0 0 0 / 0.72);
}

.slide--front .slide__link img {
  filter: none;
}

.slide__score {
  position: absolute;
  left: var(--space-2);
  bottom: var(--space-2);
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem var(--space-2);
  border-radius: var(--radius-sm);
  background: rgb(8 8 10 / 0.82);
  font-size: var(--text-2xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
}

/* Only the subject shows its score. On the cards behind it the badge is four
   unreadable pixels rotated away from the viewer. */
.slide--front .slide__score {
  opacity: 1;
}

.slide__score svg {
  width: 0.7rem;
  height: 0.7rem;
  fill: var(--star);
}

/* ------------------------------------------------------------------ *
 * Caption
 * ------------------------------------------------------------------ */

.caption {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-6) var(--space-16);
  text-align: center;
}

/*
 * Keyed on the title's id, so Vue replaces the node rather than patching its
 * text -- which is what lets the animation run again on every change. Patched
 * in place, the name would simply swap with no transition at all.
 */
.caption__name {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
  animation: caption-in 420ms var(--ease-out);
}

@keyframes caption-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.caption__meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

/* Set apart from RENA's own count beside it: a borrowed number should not
   read as this community's at a glance. */
.caption__external {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.caption__count {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-4) 0 0;
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.18em;
  color: var(--text-tertiary);
}

.caption__count strong {
  font-weight: 600;
  color: var(--text-primary);
}

.caption__rule {
  width: 1.75rem;
  height: 1px;
  background: var(--border-strong);
}

@media (prefers-reduced-motion: reduce) {
  .slide,
  .stage__track,
  .slide__link img,
  .slide__score,
  .slide,
  .stage__track,
  .slide__link img,
  .slide__score,
  .edge,
  .edge__rule,
  .trending__all {
    transition: none;
  }

  .caption__name {
    animation: none;
  }
}
</style>
