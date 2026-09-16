<script setup lang="ts">
/**
 * The light behind the whole product.
 *
 * Two parts, both brand red, both behind everything:
 *
 *  1. **A slow drift.** Two blurred fields on long, offset cycles (23s and
 *     31s). The periods are co-prime-ish so the composite never visibly
 *     repeats -- a loop you can spot is a loop you start watching instead of
 *     reading the page.
 *  2. **A glow under the cursor.** Red, large and soft, so moving the mouse
 *     lights the page under it rather than drawing a dot on top of it.
 *
 * The cursor glow is roughly twice the strength of the drift, and that ratio
 * is the design. Weighted the other way -- which is how this first looked --
 * the drift wins, the page reads as unevenly tinted rather than lit, and the
 * light that follows you is lost inside it.
 *
 * Mounted once, above the layout, so it covers all three shells rather than
 * being remembered per screen. Fixed rather than absolute: it stays put while
 * the page scrolls, which is what makes it read as light in the room instead
 * of a texture printed on the document.
 *
 * Deliberately dim. On a dark, artwork-led product the job is to stop every
 * screen reading as flat black. If you catch yourself looking at it rather
 * than at the page, it is too bright.
 */
withDefaults(
  defineProps<{
    /** Overall strength. Screens with their own treatment can turn it down. */
    intensity?: number
  }>(),
  { intensity: 1 },
)

const cursor = ref<HTMLElement | null>(null)

/** Hidden until the pointer has actually been somewhere. */
const lit = ref(false)

/*
 * Coalesced to one write per frame.
 *
 * `pointermove` fires far faster than the display refreshes -- several times
 * per frame on a high-polling mouse -- and each one would otherwise be a style
 * write the browser has to reconcile. Writing custom properties on a
 * `position: fixed` layer keeps the moving part off the layout entirely: no
 * reflow, no component re-render, one composited paint.
 */
let frame = 0
let nextX = 0
let nextY = 0

function onMove(event: PointerEvent) {
  // Touch and pen produce pointer events too, but a glow that only appears
  // where a finger already is adds nothing and costs a repaint per drag.
  if (event.pointerType !== 'mouse') return

  /*
   * Viewport coordinates, used raw.
   *
   * The layer is fixed, so its coordinate space *is* the viewport -- no scroll
   * offset to add, and the glow stays under the cursor while the page moves
   * beneath it, which is the whole illusion.
   */
  nextX = event.clientX
  nextY = event.clientY
  lit.value = true

  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const element = cursor.value
    if (!element) return
    /*
     * A transform, not a gradient position.
     *
     * The first version moved the light by feeding the pointer into a
     * full-bleed `radial-gradient`, which meant repainting the entire viewport
     * every frame the mouse moved -- over three million pixels on a wide
     * display, for an effect nobody asked to pay for. A fixed-size element
     * moved by `translate3d` is handled on the compositor: the layer is
     * rasterised once and then only relocated, so the per-frame cost stops
     * scaling with the size of the screen.
     */
    element.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`
  })
}

/** Fades out when the pointer leaves the window, rather than stranding the
 *  light wherever it happened to exit. */
function onLeave(event: PointerEvent) {
  if (event.pointerType === 'mouse') lit.value = false
}

onMounted(() => {
  // Passive: this never calls preventDefault, and saying so lets the browser
  // skip waiting on it before scrolling.
  window.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerleave', onLeave)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  document.removeEventListener('pointerleave', onLeave)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="ambient" :style="{ '--ambient-intensity': intensity }" aria-hidden="true">
    <span class="ambient__field ambient__field--one" />
    <span class="ambient__field ambient__field--two" />
    <span ref="cursor" class="ambient__cursor" :class="{ 'ambient__cursor--lit': lit }" />
  </div>
</template>

<style scoped>
.ambient {
  position: fixed;
  inset: 0;
  /*
   * Above the page's own background, below its content.
   *
   * The layout roots carry `z-index: 1`, which is what keeps this underneath
   * them -- a positioned element paints above ordinary static content, so
   * without that the wash would sit over the text.
   */
  z-index: 0;
  /* Never intercepts anything; the cursor it follows must still reach links. */
  pointer-events: none;
  /* Clips the blur so it cannot force the document wider. */
  overflow: hidden;
}

.ambient__field {
  position: absolute;
  border-radius: 50%;
  /* One large blur is cheaper than several small ones, and the compositor
     keeps it on its own layer for as long as it animates by transform only. */
  filter: blur(110px);
  will-change: transform;
  background: rgb(200 16 46 / calc(0.11 * var(--ambient-intensity)));
}

.ambient__field--one {
  top: -25%;
  left: -12%;
  width: 55%;
  aspect-ratio: 1;
  animation: ambient-drift-one 23s var(--ease-inout) infinite;
}

.ambient__field--two {
  bottom: -30%;
  right: -10%;
  width: 48%;
  aspect-ratio: 1;
  /* Dimmer than its partner, so the two never read as a matched pair. */
  background: rgb(200 16 46 / calc(0.07 * var(--ambient-intensity)));
  animation: ambient-drift-two 31s var(--ease-inout) infinite;
}

/*
 * The cursor light.
 *
 * A gradient rather than a blurred circle, and a moved element rather than a
 * moved gradient. `filter: blur()` would cost a blur pass per frame; a
 * repositioned gradient would cost a full-viewport repaint per frame. A
 * pre-rasterised layer that only ever changes its `transform` costs neither.
 *
 * Three stops rather than two. A straight fade to transparent has a visible
 * edge where the falloff ends; the middle stop is what makes it read as light
 * rather than as a circle.
 */
.ambient__cursor {
  position: absolute;
  top: 0;
  left: 0;
  width: 68rem;
  height: 68rem;
  /* Half its own size, so the light centres on the pointer instead of hanging
     off it by a corner. */
  margin: -34rem 0 0 -34rem;
  opacity: 0;
  /* Slow enough that entering and leaving the window is a fade, not a blink. */
  transition: opacity 500ms var(--ease-out);
  background: radial-gradient(
    closest-side,
    rgb(200 16 46 / calc(0.26 * var(--ambient-intensity))),
    rgb(200 16 46 / calc(0.09 * var(--ambient-intensity))) 36%,
    transparent 70%
  );
  /* Parked centre-screen until the first move; invisible until then anyway. */
  transform: translate3d(50vw, 50vh, 0);
  will-change: transform;
}

.ambient__cursor--lit {
  opacity: 1;
}

@keyframes ambient-drift-one {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(22%, 16%, 0) scale(1.15);
  }
}

@keyframes ambient-drift-two {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1.1);
  }
  50% {
    transform: translate3d(-18%, -14%, 0) scale(0.9);
  }
}

/*
 * Reduced motion drops the drift and keeps the colour -- removing it entirely
 * would leave a flat black page where the design expects light.
 *
 * The cursor glow stays. It is direct manipulation: it moves only while the
 * reader is moving the mouse, and it stops the instant they do, which is not
 * the autonomous motion the preference is about.
 */
@media (prefers-reduced-motion: reduce) {
  .ambient__field {
    animation: none;
  }
}
</style>
