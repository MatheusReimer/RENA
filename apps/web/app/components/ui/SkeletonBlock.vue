<script setup lang="ts">
/**
 * Loading placeholder (SPEC 36).
 *
 * SPEC 36 forbids blank screens during a request. Skeletons are sized to the
 * content they stand in for so the page does not jump when data lands.
 */
withDefaults(
  defineProps<{
    width?: string
    height?: string
    radius?: string
    circle?: boolean
  }>(),
  { width: '100%', height: '1rem', radius: 'var(--radius-sm)', circle: false },
)
</script>

<template>
  <span
    class="skeleton"
    :style="{
      width,
      height,
      borderRadius: circle ? 'var(--radius-full)' : radius,
    }"
    aria-hidden="true"
  />
</template>

<style scoped>
.skeleton {
  display: block;
  background: linear-gradient(
    90deg,
    var(--surface-raised) 25%,
    var(--surface-overlay) 50%,
    var(--surface-raised) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: var(--surface-overlay);
  }
}
</style>
