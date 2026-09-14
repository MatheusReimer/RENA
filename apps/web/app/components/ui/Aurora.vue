<script setup lang="ts">
/**
 * A slow drift of coloured light behind a hero.
 *
 * Three blurred blobs on long, offset cycles. Because the periods are
 * co-prime-ish (19s, 23s, 29s) the composite never visibly repeats, which is
 * what keeps an ambient effect from turning into a loop you start watching.
 *
 * Kept dim on purpose. On a dark, artwork-led screen the job is to stop the
 * background reading as flat black -- not to be noticed. If you catch yourself
 * looking at it, it is too bright.
 */
withDefaults(
  defineProps<{
    /** Overall strength. The default is deliberately restrained. */
    intensity?: number
  }>(),
  { intensity: 1 },
)
</script>

<template>
  <div class="aurora" :style="{ '--aurora-intensity': intensity }" aria-hidden="true">
    <span class="aurora__blob aurora__blob--one" />
    <span class="aurora__blob aurora__blob--two" />
    <span class="aurora__blob aurora__blob--three" />
    <span class="aurora__veil" />
  </div>
</template>

<style scoped>
.aurora {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* Never intercepts a click; it sits behind real content. */
  pointer-events: none;
  /* Its own stacking context, so the blur cannot leak over siblings. */
  isolation: isolate;
}

.aurora__blob {
  position: absolute;
  border-radius: 50%;
  /* A single large blur is cheaper than many small ones, and the GPU keeps it
     on its own layer while it animates. */
  filter: blur(90px);
  will-change: transform;
}

.aurora__blob--one {
  top: -30%;
  left: -10%;
  width: 46%;
  aspect-ratio: 1;
  background: rgb(232 53 43 / calc(0.28 * var(--aurora-intensity)));
  animation: drift-one 19s var(--ease-inout) infinite;
}

.aurora__blob--two {
  top: -10%;
  right: -8%;
  width: 38%;
  aspect-ratio: 1;
  /* A warmer second tone so the wash has depth rather than one flat colour. */
  background: rgb(245 166 35 / calc(0.14 * var(--aurora-intensity)));
  animation: drift-two 23s var(--ease-inout) infinite;
}

.aurora__blob--three {
  bottom: -35%;
  left: 30%;
  width: 42%;
  aspect-ratio: 1;
  background: rgb(120 40 200 / calc(0.16 * var(--aurora-intensity)));
  animation: drift-three 29s var(--ease-inout) infinite;
}

/*
 * Fades the whole thing into the page background at the bottom edge, so the
 * hero dissolves into the content rather than ending on a line.
 */
.aurora__veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgb(10 10 12 / 0.35) 55%,
    var(--surface-base) 100%
  );
}

@keyframes drift-one {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(18%, 12%, 0) scale(1.18);
  }
}

@keyframes drift-two {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1.1);
  }
  50% {
    transform: translate3d(-14%, 18%, 0) scale(0.92);
  }
}

@keyframes drift-three {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(0.95);
  }
  50% {
    transform: translate3d(12%, -16%, 0) scale(1.2);
  }
}

/*
 * Reduced motion keeps the colour and drops the movement. Removing it
 * entirely would leave a flat black rectangle where the design expects light.
 */
@media (prefers-reduced-motion: reduce) {
  .aurora__blob {
    animation: none;
  }
}
</style>
