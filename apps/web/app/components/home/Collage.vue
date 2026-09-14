<script setup lang="ts">
import { BRAND, MEDIA_TYPE_PLURALS, MEDIA_TYPES } from '@revy/shared/constants'
import type { UserSummary, WallTile } from '@revy/shared/types'
import { imageAtWidth, imageSrcSet } from '@revy/shared/utils'

/**
 * The home opener: a wall of the catalogue, with the statement laid over it.
 *
 * This replaced a single commissioned render. The render could only ever be
 * cropped to fit a window -- on a tall screen `cover` ate the sides of it --
 * whereas a collage of individual images reflows: narrow windows get fewer
 * columns, short ones get fewer rows, and nothing is squeezed. It is also made
 * of real titles, so it grows with the catalogue instead of dating the moment
 * the artwork does.
 *
 * Tiles come in two shapes. Posters are 2:3; films and series also carry a
 * 16:9 still, and mixing those in is what stops the wall reading as a shop
 * shelf.
 */
const props = withDefaults(
  defineProps<{
    tiles: WallTile[]
    members: UserSummary[]
    memberCount: number
    reviewCount: number
    /** Signed-in members get the wall without the pitch. */
    compact?: boolean
  }>(),
  { compact: false },
)

/** Roughly one screenful on a desktop. Pages are cut from this. */
const PER_PAGE = 44

const page = ref(0)

/*
 * Artwork that turns out not to exist.
 *
 * A non-null URL is not a promise: Open Library in particular returns a
 * record with a cover id whose image is gone. The browser then draws its own
 * broken-image glyph, which on a dark wall is unmistakable. Dropping the tile
 * closes the gap instead.
 */
const failed = ref(new Set<string>())

function onFailed(id: string) {
  // A new Set rather than mutating: Vue does not track Set mutation.
  failed.value = new Set(failed.value).add(id)
}

const pageCount = computed(() => Math.max(1, Math.ceil(props.tiles.length / PER_PAGE)))

/*
 * Only the current page is rendered.
 *
 * The whole set is sent in one request because the rows are tiny, but putting
 * all of them in the DOM would have the browser fetch a couple of hundred
 * images for a screen that shows forty. Slicing means each page costs exactly
 * what it shows.
 */
const visible = computed(() => {
  const start = page.value * PER_PAGE
  return props.tiles.slice(start, start + PER_PAGE).filter((tile) => !failed.value.has(tile.id))
})

function step(delta: number) {
  page.value = (page.value + delta + pageCount.value) % pageCount.value
}

/**
 * The shape vocabulary.
 *
 * A wall of identical 2:3 rectangles reads as a contact sheet -- correct, and
 * completely inert. What makes a collage look composed is that no two
 * neighbours agree: different sizes, different proportions, a degree or two of
 * rotation in alternating directions, and different amounts of light on each.
 *
 * Sizes are grid spans rather than aspect ratios, which is why this is a grid
 * and not columns: columns give every tile the same width, and a wall where
 * everything is the same width is still a grid however you crop it. A tile
 * three columns wide and nine rows tall sits next to one two wide and four
 * tall, and the packing fits them together.
 *
 * `bleed` and `z` are what turn an arrangement into a pile. A tile with bleed
 * overhangs its own grid area, so it covers the corner of whatever is beside
 * it, and the z order is deliberately not sequential -- things stacked by hand
 * do not end up in the order they were put down. Without both, mixed sizes and
 * a few degrees of rotation still read as a tidy mosaic that happens to be
 * crooked.
 *
 * Fixed variations, not a random number generator: the server and the browser
 * have to produce identical markup, and a wall that reshuffles itself on
 * hydration is a flicker.
 *
 * Nine entries, which shares no factor with any likely column count, so the
 * pattern never lines up into visible bands down the page.
 */
const SHAPES = [
  { cols: 2, rows: 6, wide: false, rot: -2.2, bleed: 6, z: 3, dim: 0.52 },
  { cols: 3, rows: 4, wide: true, rot: 1.4, bleed: 20, z: 7, dim: 0.62 },
  { cols: 2, rows: 4, wide: false, rot: 2.6, bleed: 0, z: 2, dim: 0.44 },
  { cols: 3, rows: 9, wide: false, rot: -0.8, bleed: 14, z: 9, dim: 0.66 },
  { cols: 2, rows: 7, wide: false, rot: 2.9, bleed: 4, z: 4, dim: 0.46 },
  { cols: 4, rows: 5, wide: true, rot: -1.7, bleed: 24, z: 8, dim: 0.58 },
  { cols: 2, rows: 5, wide: false, rot: 1.1, bleed: 0, z: 1, dim: 0.5 },
  { cols: 3, rows: 8, wide: false, rot: -3.1, bleed: 18, z: 6, dim: 0.56 },
  { cols: 2, rows: 6, wide: false, rot: 2.3, bleed: 10, z: 5, dim: 0.6 },
] as const

/**
 * What actually gets drawn.
 *
 * Built once per page rather than through helpers called from the template,
 * so each tile's shape, artwork and weight are decided in one place.
 */
const rendered = computed(() =>
  visible.value.map((tile, index) => {
    const shape = SHAPES[index % SHAPES.length]!
    /*
     * A landscape box only when there is a landscape image for it. Cropping a
     * poster to 16:9 shows a band across the middle of it and nothing else,
     * so a film-less tile takes a portrait span instead.
     */
    const wide = shape.wide && Boolean(tile.backdropImageUrl)
    const url = wide ? tile.backdropImageUrl! : tile.coverImageUrl

    return {
      id: tile.id,
      src: imageAtWidth(url, wide ? 500 : 342) ?? url,
      srcset: imageSrcSet(url, [185, 342, 500]) ?? undefined,
      cols: shape.wide && !wide ? 2 : shape.cols,
      rows: shape.wide && !wide ? 6 : shape.rows,
      rot: `${shape.rot}deg`,
      bleed: `${shape.bleed}px`,
      z: shape.z,
      dim: shape.dim,
      delay: `${Math.min(index, 26) * 16}ms`,
    }
  }),
)

/** The kinds of thing in here. Read from the media types, so it cannot drift
 *  from what the product actually holds. */
const kinds = MEDIA_TYPES.map((type) => MEDIA_TYPE_PLURALS[type])

const reviewLine = computed(() => {
  const count = props.reviewCount.toLocaleString()
  return `${count} honest ${props.reviewCount === 1 ? 'review' : 'reviews'} and counting.`
})

const pageLabel = computed(() => String(page.value + 1).padStart(2, '0'))
const totalLabel = computed(() => String(pageCount.value).padStart(2, '0'))
</script>

<template>
  <section class="collage" :class="{ 'collage--compact': compact }">
    <!--
      The wall. Decorative in full: every title on it is reachable from
      Discover and from search, and announcing forty cover images to a screen
      reader before the page's own statement would bury the statement.
    -->
    <div class="collage__field" aria-hidden="true">
      <div :key="page" class="collage__tiles">
        <span
          v-for="tile in rendered"
          :key="tile.id"
          class="collage__tile"
          :style="{
            '--tile-cols': tile.cols,
            '--tile-rows': tile.rows,
            '--tile-rot': tile.rot,
            '--tile-bleed': tile.bleed,
            '--tile-z': tile.z,
            '--tile-dim': tile.dim,
            '--tile-delay': tile.delay,
          }"
        >
          <img
            :src="tile.src"
            :srcset="tile.srcset"
            sizes="(min-width: 48rem) 220px, 140px"
            alt=""
            loading="eager"
            decoding="async"
            @error="onFailed(tile.id)"
          />
        </span>
      </div>

      <span class="collage__scrim" />
    </div>

    <div class="collage__inner">
      <!-- The four kinds of thing, down the left edge. -->
      <ul class="collage__kinds">
        <li v-for="kind in kinds" :key="kind">{{ kind }}</li>
        <li class="collage__kinds-more">and more</li>
      </ul>

      <div class="collage__panel">
        <p class="collage__kicker">A community for every perspective.</p>

        <h1 class="collage__statement">
          <span class="collage__line">Better Stories</span>
          <span class="collage__line">Brighter</span>
          <span class="collage__line collage__line--accent">People.</span>
        </h1>

        <p class="collage__sub">
          Review. Discuss. Discover.<br />Across every world you love.
        </p>

        <NuxtLink v-if="!compact" to="/signup" class="collage__cta">
          Join the community
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </NuxtLink>

        <div v-if="!compact && members.length" class="collage__people">
          <div class="collage__faces">
            <UiUserAvatar
              v-for="(member, index) in members"
              :key="member.id"
              :user="member"
              size="sm"
              class="collage__face"
              :style="{ zIndex: members.length - index }"
            />
          </div>
          <p class="collage__people-text">
            <strong>{{ memberCount.toLocaleString() }}</strong> members.<br />{{ reviewLine }}
          </p>
        </div>
      </div>

      <!-- Quiet marginalia, out at the edges of the wall. -->
      <p class="collage__note collage__note--right-top">Real opinions.<br />Real people.</p>
      <p class="collage__note collage__note--right-mid">All stories<br />belong here.</p>
      <p class="collage__note collage__note--left-bottom">Different worlds.<br />Same people.</p>

      <footer class="collage__foot">
        <div class="collage__pager">
          <span class="collage__count">
            <strong>{{ pageLabel }}</strong>
            <span class="collage__count-rule" aria-hidden="true" />
            {{ totalLabel }}
          </span>

          <button type="button" class="collage__arrow" aria-label="Previous titles" @click="step(-1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
          </button>
          <button type="button" class="collage__arrow" aria-label="More titles" @click="step(1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <p class="collage__scroll">
          {{ compact ? BRAND.tagline : 'Scroll to explore' }}
          <span class="collage__scroll-rule" aria-hidden="true" />
        </p>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.collage {
  position: relative;
  overflow: hidden;
  background: var(--surface-base);
  /* The section owns its own layer, so nothing inside it can paint over the
     top bar or the page below. */
  isolation: isolate;
}

/* ------------------------------------------------------------------ *
 * The wall
 * ------------------------------------------------------------------ */

.collage__field {
  position: absolute;
  inset: 0;
}

/*
 * Multi-column rather than grid.
 *
 * Tiles are two different shapes, and a grid would need every one of them
 * assigned a row span to avoid holes. Columns just flow: each tile keeps its
 * own proportion, the browser balances the stacks, and a narrower window
 * simply gets fewer columns. That is the responsiveness the single render
 * could not have.
 */
.collage__tiles {
  display: grid;
  /*
   * A fine column track, so spans of two, three and four give genuinely
   * different tile widths rather than three shades of the same one.
   */
  grid-template-columns: repeat(auto-fill, minmax(4.25rem, 1fr));
  grid-auto-rows: 2.1rem;
  /*
   * Dense packing back-fills the holes a mixed-span mosaic leaves behind.
   * Without it a tall tile opens a gap beside it that nothing later can use,
   * and the wall ends up more air than artwork.
   */
  grid-auto-flow: row dense;
  gap: 10px;
  padding: 10px;
  /*
   * Keeps the tiles' stacking to themselves.
   *
   * They carry z-index 1-9 so they pile out of order, and without a stacking
   * context here those numbers compete with everything else on the page --
   * the scrim over the wall and the statement on top of it both have auto
   * z-index, so every tile won and the headline rendered underneath the
   * artwork.
   */
  isolation: isolate;
  /* Taller than the frame so the bottom row is cut rather than floating in
     space -- the wall should continue past the screen. */
  height: 122%;
}

@media (min-width: 48rem) {
  .collage__tiles {
    grid-template-columns: repeat(auto-fill, minmax(5.25rem, 1fr));
    grid-auto-rows: 2.6rem;
  }
}

/*
 * Turned, oversized past its own cell, and stacked out of order.
 *
 * The negative margin is the piling: the tile draws beyond the area the grid
 * gave it and lands on top of its neighbour's edge. The z-index decides which
 * way round that goes, and it is deliberately shuffled rather than running
 * with the grid, so the wall never resolves into one consistent direction of
 * overlap.
 *
 * The border and the two shadows are what make it read as depth rather than
 * as a mistake -- a tight one for the contact edge and a wide one for the
 * drop. Without them two dark covers touching look like one torn image.
 */
.collage__tile {
  display: block;
  grid-column: span var(--tile-cols, 2);
  grid-row: span var(--tile-rows, 6);
  min-width: 0;
  margin: calc(var(--tile-bleed, 0px) * -1);
  z-index: var(--tile-z, 1);
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid rgb(255 255 255 / 0.07);
  box-shadow:
    0 2px 6px rgb(0 0 0 / 0.5),
    0 16px 38px rgb(0 0 0 / 0.7);
  transform: rotate(var(--tile-rot, 0deg));
  /* Each fades up on its own beat, so a page turn reads as the wall
     rebuilding rather than as one block swapping. */
  animation: tile-in var(--duration-slow) var(--ease-out) var(--tile-delay, 0ms) both;
}

.collage__tile img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  object-fit: cover;
  display: block;
  /*
   * Held well back. The wall is a texture, not a gallery -- if a single cover
   * pulls the eye off the statement it has failed. Desaturating as well as
   * dimming stops the handful of bright red and yellow covers doing exactly
   * that while everything around them recedes.
   */
  opacity: var(--tile-dim, 0.52);
  filter: grayscale(0.3) contrast(0.96);
}

/*
 * The custom properties are read, not animated, so each tile settles into its
 * own angle rather than every one of them landing square.
 */
@keyframes tile-in {
  from {
    opacity: 0;
    transform: rotate(var(--tile-rot, 0deg)) scale(0.93);
  }
  to {
    opacity: 1;
    transform: rotate(var(--tile-rot, 0deg)) scale(1);
  }
}

/*
 * Darkens the wall, and darkens it most where the words are.
 *
 * Three passes: a flat wash so no tile is at full strength, a column down the
 * left for the statement to sit on, and a fade at top and bottom so the grid
 * runs off the screen instead of ending on a row of edges.
 */
.collage__scrim {
  position: absolute;
  inset: 0;
  background:
    /* A flat wash, so no tile is ever at full strength. */
    linear-gradient(rgb(10 10 12 / 0.46), rgb(10 10 12 / 0.46)),
    /* Top and bottom, so the grid runs off the screen rather than ending on a
       row of edges -- and so the nav has something to sit on. */
    linear-gradient(
      to bottom,
      rgb(10 10 12 / 0.92) 0%,
      rgb(10 10 12 / 0.3) 16%,
      transparent 34%,
      transparent 62%,
      rgb(10 10 12 / 0.94) 100%
    );
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

/*
 * The dark column the statement sits on.
 *
 * On `.collage__inner` rather than on the wall, because it has to be measured
 * from the CONTAINER: the wall spans the window, so a percentage stop on it
 * lands somewhere different on every monitor and the type ends up half on a
 * book cover. Anchored here it reaches the window's left edge and releases at
 * a fixed point relative to the words.
 */
.collage__inner::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(50% - 50vw);
  right: 30%;
  pointer-events: none;
  /*
   * A band, not a blackout. The wall keeps the strip outside the container --
   * artwork at the very edge of the window is most of what makes it read as a
   * wall rather than a panel with a picture next to it -- then goes solid
   * across the type and releases on the far side.
   */
  background: linear-gradient(
    to right,
    transparent 0%,
    rgb(10 10 12 / 0.7) 10%,
    var(--surface-base) 18%,
    var(--surface-base) 56%,
    rgb(10 10 12 / 0.55) 74%,
    transparent 94%
  );
}

.collage__inner {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 82dvh;
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-16) var(--space-4) var(--space-6);
}

.collage--compact .collage__inner {
  min-height: 58dvh;
}

.collage__kinds {
  display: none;
}

/*
 * Positioned, so it paints above the column behind it.
 *
 * The column is an absolutely positioned pseudo-element, and positioned
 * elements paint above in-flow content whatever the source order says. Left
 * in the flow, the panel was drawn first and the scrim covered the entire
 * statement -- the page rendered with a headline that was not there.
 */
.collage__panel {
  position: relative;
  max-width: 30rem;
  margin-block: auto;
}

.collage__kicker {
  margin: 0 0 var(--space-5);
  font-size: var(--text-2xs);
  font-weight: 500;
  line-height: 1.9;
  text-transform: uppercase;
  letter-spacing: 0.26em;
  color: var(--text-secondary);
}

.collage__statement {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(2.75rem, 10vw, 4.75rem);
  line-height: 1.02;
  letter-spacing: -0.015em;
}

.collage__line {
  display: block;
}

.collage__line--accent {
  color: var(--accent);
}

.collage__sub {
  margin: var(--space-5) 0 0;
  font-size: var(--text-base);
  line-height: 1.65;
  color: var(--text-secondary);
}

/*
 * Outlined, not filled.
 *
 * The accent is already carrying the last line of the statement directly
 * above it; a solid red button underneath would be the same voice twice. The
 * outline fills on hover, which is where the emphasis belongs.
 */
.collage__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-6);
  padding: var(--space-4) var(--space-6);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
  color: var(--text-primary);
  font-size: var(--text-base);
  font-weight: 500;
  transition:
    background-color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.collage__cta svg {
  width: 1.125rem;
  height: 1.125rem;
  transition: transform var(--duration-base) var(--ease-out);
}

.collage__cta:hover {
  background: var(--accent);
  border-color: var(--accent);
}

.collage__cta:hover svg {
  transform: translateX(3px);
}

.collage__people {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-8);
}

.collage__faces {
  display: flex;
  flex-shrink: 0;
}

.collage__face {
  position: relative;
  outline: 2px solid var(--surface-base);
  border-radius: var(--radius-full);
}

.collage__face:not(:first-child) {
  margin-left: -0.6rem;
}

.collage__people-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--text-secondary);
}

.collage__people-text strong {
  color: var(--text-primary);
  font-weight: 600;
}

/* ------------------------------------------------------------------ *
 * Marginalia and the pager
 * ------------------------------------------------------------------ */

.collage__note {
  display: none;
}

.collage__foot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  margin-top: var(--space-10);
}

.collage__pager {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.collage__count {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.18em;
  color: var(--text-tertiary);
}

.collage__count strong {
  font-weight: 600;
  color: var(--text-primary);
}

.collage__count-rule {
  width: 1.75rem;
  height: 1px;
  background: var(--border-strong);
}

.collage__arrow {
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

.collage__arrow:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
  background: var(--surface-raised);
}

.collage__arrow svg {
  width: 1rem;
  height: 1rem;
}

.collage__scroll {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin: 0;
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.collage__scroll-rule {
  width: 1px;
  height: 1.5rem;
  background: var(--border-strong);
}

/* ------------------------------------------------------------------ *
 * Desktop
 * ------------------------------------------------------------------ */

@media (min-width: 60rem) {
  .collage__inner {
    min-height: 100dvh;
    padding: calc(var(--topbar-height) + var(--space-8)) var(--space-8) var(--space-8);
  }

  .collage--compact .collage__inner {
    min-height: 64dvh;
  }

  /* The kinds list, down the far left. Small, quiet, and the only thing that
     tells you what is on the wall without naming a single title. */
  .collage__kinds {
    position: absolute;
    top: calc(var(--topbar-height) + var(--space-12));
    left: var(--space-8);
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-2xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.26em;
    color: var(--text-secondary);
  }

  .collage__kinds-more {
    color: var(--text-tertiary);
  }

  /* The statement clears the kinds list rather than starting at the container
     edge, which is what gives the panel its column. */
  .collage__panel {
    margin-left: 9rem;
    max-width: 27rem;
  }

  .collage__statement {
    font-size: clamp(3.25rem, 4.6vw, 4.5rem);
  }

  .collage__note {
    position: absolute;
    display: block;
    margin: 0;
    font-size: var(--text-2xs);
    font-weight: 500;
    line-height: 2;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--text-secondary);
    /* These are the only type over the bright middle of the wall, so they
       carry their own shadow rather than leaning on the scrim. */
    text-shadow: 0 1px 16px rgb(0 0 0 / 0.9);
  }

  .collage__note--right-top {
    top: calc(var(--topbar-height) + var(--space-12));
    right: var(--space-8);
  }

  .collage__note--right-mid {
    top: 52%;
    right: var(--space-8);
  }

  /*
   * Only once there is room for it.
   *
   * Below about 1280px the panel reaches down into this corner and the note
   * lands on the face pile. It is marginalia -- the first thing that should
   * go when the space is needed.
   */
  .collage__note--left-bottom {
    display: none;
  }

  @media (min-width: 80rem) {
    .collage__note--left-bottom {
      display: block;
      bottom: 18%;
      left: var(--space-8);
    }
  }

  .collage--compact .collage__note {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .collage__tile {
    animation: none;
  }

  .collage__cta,
  .collage__cta svg,
  .collage__arrow {
    transition: none;
  }
}
</style>
