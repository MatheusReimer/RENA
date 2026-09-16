<script setup lang="ts">
/**
 * Interactive rating picker (SPEC 10).
 *
 * Each star is two buttons -- a left half and a right half -- rather than one
 * button with pointer maths. That makes half-star selection reliable on touch,
 * keyboard-navigable by default, and correct without any drag handling.
 */
const model = defineModel<number | null>({ default: null })

/**
 * `compact` drops the numeric readout beside the stars.
 *
 * For a dense grid where the control sits under its own poster: the score is
 * already legible from the fill, and the readout is a fixed ~2.75rem that a
 * narrow column cannot spare.
 */
defineProps<{ compact?: boolean }>()

const hovered = ref<number | null>(null)

/** What to paint: the hovered value while hovering, otherwise the real one. */
const shown = computed(() => hovered.value ?? model.value ?? 0)

function select(value: number) {
  // Tapping the current score clears it, which is the only way to un-rate
  // without a separate control.
  model.value = model.value === value ? null : value
}

const starIndexes = [1, 2, 3, 4, 5]
</script>

<template>
  <div
    class="star-input"
    role="group"
    aria-label="Your rating"
    @mouseleave="hovered = null"
  >
    <div v-for="i in starIndexes" :key="i" class="star-slot">
      <svg class="star-bg" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z"
        />
      </svg>

      <svg
        class="star-fill"
        viewBox="0 0 24 24"
        aria-hidden="true"
        :style="{
          clipPath: `inset(0 ${100 - Math.min(100, Math.max(0, (shown - (i - 1)) * 100))}% 0 0)`,
        }"
      >
        <path
          d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z"
        />
      </svg>

      <button
        type="button"
        class="hit hit--left"
        :aria-label="`Rate ${i - 0.5} out of 5`"
        :aria-pressed="model === i - 0.5"
        @mouseenter="hovered = i - 0.5"
        @click="select(i - 0.5)"
      />
      <button
        type="button"
        class="hit hit--right"
        :aria-label="`Rate ${i} out of 5`"
        :aria-pressed="model === i"
        @mouseenter="hovered = i"
        @click="select(i)"
      />
    </div>

    <span v-if="!compact" class="value" :class="{ 'value--empty': shown === 0 }">
      {{ shown > 0 ? shown.toFixed(1) : '—' }}
    </span>

    <!-- The visible control is a grid of buttons; this keeps the value
         available to assistive tech as a single number. -->
    <span class="sr-only" aria-live="polite">
      {{ model === null ? 'Not rated' : `Rated ${model} out of 5` }}
    </span>
  </div>
</template>

<style scoped>
.star-input {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

/*
 * Sized by an inherited custom property, not a fixed width.
 *
 * The fallback lives in the `var()` rather than as a declaration on
 * `.star-input`, deliberately: a declaration there would sit on the element
 * itself and beat anything an ancestor set, so `--star-size` on a parent grid
 * would silently do nothing.
 */
.star-slot {
  position: relative;
  width: var(--star-size, 2rem);
  height: var(--star-size, 2rem);
}

.star-bg,
.star-fill {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.star-bg {
  fill: var(--star-empty);
}

.star-fill {
  fill: var(--star);
  transition: clip-path var(--duration-fast) var(--ease-out);
}

.hit {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  /* Extends the touch target vertically past the glyph without changing
     layout, so a slightly-off tap still registers. */
  padding-block: var(--space-2);
}

.hit--left {
  left: 0;
}

.hit--right {
  right: 0;
}

.hit:focus-visible {
  outline-offset: -2px;
}

.value {
  margin-left: var(--space-2);
  font-size: var(--text-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--star);
  min-width: 2.25rem;
}

.value--empty {
  color: var(--text-tertiary);
}
</style>
