<script setup lang="ts">
/**
 * A point of light that travels around the edge of its container.
 *
 * Reserved for the single most important action on a screen -- on a media page
 * that is "Rate this", which is the whole point of the product. One beam per
 * screen: the effect works by being the only thing doing it.
 *
 * Built from a conic gradient rotating behind a masked inset, so the border
 * animates without animating a border -- which would relayout on every frame.
 */
withDefaults(defineProps<{ durationS?: number }>(), { durationS: 6 })
</script>

<template>
  <span
    class="beam"
    :style="{ '--beam-duration': `${durationS}s` }"
    aria-hidden="true"
  />
</template>

<style scoped>
.beam {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  overflow: hidden;
}

.beam::before {
  content: '';
  position: absolute;
  /* Oversized and square so the rotating gradient always covers the corners. */
  inset: -100%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    transparent 300deg,
    rgb(255 255 255 / 0.9) 345deg,
    transparent 360deg
  );
  animation: beam-spin var(--beam-duration) linear infinite;
}

/*
 * The mask: a second element covering everything except a 1px rim, so only the
 * edge of the rotating gradient shows.
 */
.beam::after {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  background: var(--beam-fill, var(--accent));
}

@keyframes beam-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .beam::before {
    animation: none;
  }
}
</style>
