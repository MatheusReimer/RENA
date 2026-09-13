<script setup lang="ts">
import { toStarParts } from '@revy/shared/utils'

/**
 * Read-only star display (SPEC 30: "clear rating visualization").
 *
 * Half stars are drawn with a clipped overlay rather than a separate glyph, so
 * the full and half states are guaranteed to be the same shape and weight.
 */
const props = withDefaults(
  defineProps<{
    score: number | null
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)

const parts = computed(() => toStarParts(props.score))

const label = computed(() =>
  props.score === null ? 'Not rated' : `Rated ${props.score} out of 5`,
)
</script>

<template>
  <span class="stars" :class="`stars--${size}`" role="img" :aria-label="label">
    <svg
      v-for="i in parts.full"
      :key="`f${i}`"
      class="star star--full"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z"
      />
    </svg>

    <svg v-if="parts.half" class="star star--half" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient :id="`half-${$.uid}`">
          <stop offset="50%" stop-color="var(--star)" />
          <stop offset="50%" stop-color="var(--star-empty)" />
        </linearGradient>
      </defs>
      <path
        :fill="`url(#half-${$.uid})`"
        d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z"
      />
    </svg>

    <svg
      v-for="i in parts.empty"
      :key="`e${i}`"
      class="star star--empty"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z"
      />
    </svg>
  </span>
</template>

<style scoped>
.stars {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  /* Keeps the row from shifting when a score changes length. */
  flex-shrink: 0;
}

.star {
  width: var(--star-size);
  height: var(--star-size);
}

.star--full {
  fill: var(--star);
}

.star--empty {
  fill: var(--star-empty);
}

.stars--sm {
  --star-size: 0.75rem;
}
.stars--md {
  --star-size: 0.9375rem;
}
.stars--lg {
  --star-size: 1.25rem;
}
</style>
