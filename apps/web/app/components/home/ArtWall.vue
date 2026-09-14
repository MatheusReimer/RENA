<script setup lang="ts">
import type { WallTile } from '@revy/shared/types'
import { imageAtWidth, imageSrcSet } from '@revy/shared/utils'

/**
 * The home opener: the catalogue itself, as the image.
 *
 * A dense grid of cover art held right back, with the statement floating over
 * it and a moving light that brings whatever is under the cursor back to full
 * colour. The argument is that RENA's own shelf is more interesting than any
 * single featured title -- and unlike a full-bleed backdrop, nothing here is
 * large enough for a weak source image to show.
 *
 * The light is a mask, not per-tile JavaScript. Two copies of the grid are
 * stacked: the lower one dimmed, the upper one at full strength with a radial
 * mask following the pointer. That keeps the moving part on the compositor --
 * no layout, no per-tile style writes, no re-render -- whether the grid holds
 * forty tiles or four hundred.
 */
const props = defineProps<{ tiles: WallTile[]; titleCount: number; memberCount: number }>()

const host = ref<HTMLElement | null>(null)

/** Tracks whether a real pointer is over the wall, so the light can fade out. */
const lit = ref(false)

let frame = 0
let pendingX = 0
let pendingY = 0

function onMove(event: PointerEvent) {
  // Touch would leave the light stranded wherever the last tap landed; those
  // devices get the ambient drift defined in CSS instead.
  if (event.pointerType !== 'mouse') return

  const el = host.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  pendingX = event.clientX - rect.left
  pendingY = event.clientY - rect.top
  lit.value = true

  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    el.style.setProperty('--wall-x', `${pendingX}px`)
    el.style.setProperty('--wall-y', `${pendingY}px`)
  })
}

function onLeave() {
  lit.value = false
}

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

/*
 * Tiles are a fixed width, not a share of the viewport -- the grid adds
 * columns rather than growing them. Stating it plainly lets the browser pick a
 * 154px candidate on a 1x screen and 342px on a retina one, instead of the
 * 2000px original we now store.
 */
const TILE_SIZES = '(min-width: 48rem) 96px, 72px'

function tileSrc(url: string) {
  return imageAtWidth(url, 342) ?? url
}

function tileSrcSet(url: string) {
  return imageSrcSet(url, [154, 342, 500]) ?? undefined
}

/** Figures read as prose, not as a dashboard. */
const stats = computed(() => {
  const titles = props.titleCount.toLocaleString()
  const people = props.memberCount.toLocaleString()
  return `${titles} titles · ${people} ${props.memberCount === 1 ? 'person' : 'people'} · rate what you finish`
})
</script>

<template>
  <section
    ref="host"
    class="wall"
    :class="{ 'wall--lit': lit }"
    @pointermove="onMove"
    @pointerleave="onLeave"
  >
    <!--
      The base layer carries the links. Everything stacked above it is
      pointer-transparent, so hovering a tile lights it and clicking it opens
      the title -- which is what stops the wall from being only decorative.
    -->
    <div class="wall__grid wall__grid--base">
      <NuxtLink
        v-for="tile in tiles"
        :key="tile.id"
        :to="`/media/${tile.id}`"
        class="wall__tile"
        :aria-label="tile.title"
      >
        <img
          :src="tileSrc(tile.coverImageUrl)"
          :srcset="tileSrcSet(tile.coverImageUrl)"
          :sizes="TILE_SIZES"
          :alt="''"
          loading="eager"
          decoding="async"
        />
      </NuxtLink>
    </div>

    <!--
      The same grid again, undimmed, revealed only through the moving mask.
      Marked aria-hidden and empty-alt: it is the same artwork a second time
      and has nothing to add to a screen reader.
    -->
    <div class="wall__grid wall__grid--lit" aria-hidden="true">
      <span v-for="tile in tiles" :key="tile.id" class="wall__tile">
        <img
          :src="tileSrc(tile.coverImageUrl)"
          :srcset="tileSrcSet(tile.coverImageUrl)"
          :sizes="TILE_SIZES"
          alt=""
          loading="eager"
          decoding="async"
        />
      </span>
    </div>

    <div class="wall__scrim" aria-hidden="true" />

    <div class="wall__type">
      <h1 class="wall__statement">Stories connect us.</h1>
      <p class="wall__stats">{{ stats }}</p>
    </div>
  </section>
</template>

<style scoped>
.wall {
  position: relative;
  /* Runs off the bottom of the opener rather than ending on a visible last
     row, so the grid reads as a surface that continues. */
  height: clamp(22rem, 62vh, 34rem);
  overflow: hidden;
  background: #000;
  isolation: isolate;
}

/*
 * Auto-fill rather than a fixed column count, so tiles keep their size and the
 * grid simply holds more of them on a wider screen -- the texture stays the
 * same density on a laptop and an ultrawide.
 */
.wall__grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  grid-auto-rows: min-content;
  align-content: start;
  gap: 4px;
  padding: 4px;
}

@media (min-width: 48rem) {
  .wall__grid {
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  }
}

/*
 * Tiles keep poster proportion, which means the grid is taller than the wall
 * and runs off the bottom edge. That overflow is the effect: a shelf that
 * continues past the screen, not a block that ends.
 */
.wall__tile {
  display: block;
  min-width: 0;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 3px;
}

.wall__tile img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  object-fit: cover;
  display: block;
}

/*
 * The resting state: dim and desaturated.
 *
 * Far enough back that the statement over it is unambiguously the thing to
 * read. If a tile competes with the headline the wall has failed.
 */
.wall__grid--base img {
  opacity: 0.34;
  filter: grayscale(0.6);
  transition: transform var(--duration-base) var(--ease-out);
}

/*
 * A small lift under the cursor.
 *
 * The moving light already brightens whatever is under the pointer, but that
 * reads as atmosphere, not as an affordance. The lift is what says the tile is
 * a link -- it tracks one tile exactly, which light with a 30rem falloff
 * cannot do.
 */
.wall__grid--base .wall__tile:hover img {
  transform: scale(1.07);
}

.wall__tile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 3px;
}

/*
 * The mask is a fixed-size gradient that gets MOVED, rather than a gradient
 * whose centre is recomputed.
 *
 * That distinction matters twice over. A custom property inside a gradient
 * cannot be interpolated by an animation unless it is registered with
 * @property -- so the ambient drift below would jump between keyframes instead
 * of travelling. Driving `mask-position` instead animates a real CSS property,
 * which interpolates everywhere and stays on the compositor.
 *
 * The offset by half the mask size is because `mask-position` places the
 * gradient's top-left corner, while the pointer coordinate is where its centre
 * should be.
 */
.wall__grid--lit {
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--duration-slow) var(--ease-out);
  --wall-size: 30rem;
  --wall-half: 15rem;

  mask-image: radial-gradient(
    circle closest-side,
    #000 0%,
    rgb(0 0 0 / 0.6) 48%,
    transparent 78%
  );
  mask-size: var(--wall-size) var(--wall-size);
  mask-repeat: no-repeat;
  mask-position: calc(var(--wall-x, 50%) - var(--wall-half))
    calc(var(--wall-y, 50%) - var(--wall-half));

  -webkit-mask-image: radial-gradient(
    circle closest-side,
    #000 0%,
    rgb(0 0 0 / 0.6) 48%,
    transparent 78%
  );
  -webkit-mask-size: var(--wall-size) var(--wall-size);
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: calc(var(--wall-x, 50%) - var(--wall-half))
    calc(var(--wall-y, 50%) - var(--wall-half));
}

.wall--lit .wall__grid--lit {
  opacity: 1;
}

/*
 * Without a mouse the light drifts on its own.
 *
 * A touch visitor would otherwise get a flat grey grid and never learn the
 * artwork is in colour. Slow and wide, so it reads as ambient light moving
 * across a shelf rather than an element animating.
 */
@media (any-hover: none) {
  .wall__grid--lit {
    opacity: 1;
    --wall-size: 22rem;
    animation: wall-drift 26s var(--ease-inout) infinite;
  }
}

@keyframes wall-drift {
  0% {
    mask-position: 8% 12%;
    -webkit-mask-position: 8% 12%;
  }
  33% {
    mask-position: 88% 74%;
    -webkit-mask-position: 88% 74%;
  }
  66% {
    mask-position: 46% 4%;
    -webkit-mask-position: 46% 4%;
  }
  100% {
    mask-position: 8% 12%;
    -webkit-mask-position: 8% 12%;
  }
}

/*
 * Darkens the middle so the statement holds, and the edges so the grid fades
 * out rather than stopping at a hard border.
 */
.wall__scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      68% 58% at 50% 48%,
      rgb(10 10 12 / 0.62) 0%,
      rgb(10 10 12 / 0.86) 58%,
      rgb(10 10 12 / 0.95) 100%
    ),
    linear-gradient(to bottom, rgb(10 10 12 / 0.5) 0%, transparent 22%, var(--surface-base) 100%);
}

.wall__type {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-4);
  text-align: center;
  /* Lets a click through to the tile underneath; the statement is not a
     control and should not swallow the wall's only interaction. */
  pointer-events: none;
}

.wall__statement {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: clamp(2.4rem, 8.5vw, 5.5rem);
  line-height: 0.9;
  letter-spacing: -0.05em;
  text-wrap: balance;
  margin: 0;
  /* The grid behind is busy; a soft shadow keeps the edges of the letterforms
     readable over a light tile without a plate behind the text. */
  text-shadow: 0 2px 40px rgb(0 0 0 / 0.65);
  animation: statement-in var(--duration-enter) var(--ease-out) both;
}

.wall__stats {
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  color: var(--text-secondary);
  margin: 0;
  text-shadow: 0 1px 20px rgb(0 0 0 / 0.8);
  animation: statement-in var(--duration-enter) var(--ease-out) 120ms both;
}

@keyframes statement-in {
  from {
    opacity: 0;
    transform: translate3d(0, 0.3em, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wall__statement,
  .wall__stats {
    animation: none;
  }

  .wall__grid--lit {
    animation: none;
  }

  /* No moving light. The grid is simply a little brighter so the artwork is
     still legible as artwork. */
  .wall__grid--base img {
    opacity: 0.45;
    filter: grayscale(0.4);
    transition: none;
  }

  .wall__grid--base .wall__tile:hover img {
    transform: none;
  }
}
</style>
