<script setup lang="ts">
/**
 * A soft highlight that follows the pointer across its container.
 *
 * The effect only exists on devices with a real pointer -- on touch there is
 * no cursor to follow, so nothing is rendered rather than a highlight stuck
 * wherever the last tap landed.
 *
 * Position is written to CSS custom properties and read by a gradient, so the
 * moving part never touches layout: no reflow, no re-render, one composited
 * paint per frame.
 */
withDefaults(defineProps<{ intensity?: number }>(), { intensity: 1 })

const host = ref<HTMLElement | null>(null)
const active = ref(false)

/** Coalesces moves to one update per frame; pointermove fires far faster. */
let frame = 0
let pendingX = 0
let pendingY = 0

function onMove(event: PointerEvent) {
  // Touch and pen produce pointer events too, but a highlight that only
  // appears where a finger already is adds nothing.
  if (event.pointerType !== 'mouse') return

  const el = host.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  pendingX = event.clientX - rect.left
  pendingY = event.clientY - rect.top
  active.value = true

  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    el.style.setProperty('--spot-x', `${pendingX}px`)
    el.style.setProperty('--spot-y', `${pendingY}px`)
  })
}

function onLeave() {
  active.value = false
}

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <div
    ref="host"
    class="spotlight"
    :style="{ '--spot-intensity': intensity }"
    @pointermove="onMove"
    @pointerleave="onLeave"
  >
    <span class="spotlight__glow" :class="{ 'spotlight__glow--on': active }" aria-hidden="true" />
    <slot />
  </div>
</template>

<style scoped>
.spotlight {
  position: relative;
}

.spotlight__glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--duration-slow) var(--ease-out);
  background: radial-gradient(
    24rem 24rem at var(--spot-x, 50%) var(--spot-y, 50%),
    rgb(232 53 43 / calc(0.14 * var(--spot-intensity))),
    transparent 70%
  );
}

.spotlight__glow--on {
  opacity: 1;
}

/*
 * Coarse pointers get nothing at all. `any-hover: none` is the honest test for
 * "there is no cursor here" -- a width query would wrongly include a small
 * laptop and wrongly exclude a large tablet.
 */
@media (any-hover: none) {
  .spotlight__glow {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spotlight__glow {
    display: none;
  }
}
</style>
