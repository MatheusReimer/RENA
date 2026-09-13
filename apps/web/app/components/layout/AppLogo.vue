<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'

/**
 * The wordmark.
 *
 * Reads the brand from the shared constants rather than hardcoding it, so the
 * Revy/VYBE naming decision is a one-line change (see BRAND in
 * @revy/shared/constants).
 */
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg'; tagline?: boolean }>(), {
  size: 'md',
  tagline: false,
})
</script>

<template>
  <span class="logo" :class="`logo--${size}`">
    <span class="logo__mark">
      {{ BRAND.name }}<span class="logo__dot" aria-hidden="true" />
    </span>
    <span v-if="tagline" class="logo__tagline">{{ BRAND.tagline }}</span>
  </span>
</template>

<style scoped>
.logo {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-4);
}

.logo__mark {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--text-primary);
}

.logo__dot {
  width: 0.3em;
  height: 0.3em;
  border-radius: var(--radius-full);
  background: var(--accent);
  /* Sits on the cap-height line rather than the baseline, matching the mark. */
  align-self: center;
}

.logo__tagline {
  font-size: var(--text-2xs);
  font-weight: 500;
  letter-spacing: var(--tracking-widest);
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.logo--sm .logo__mark { font-size: var(--text-lg); }
.logo--md .logo__mark { font-size: var(--text-xl); }
.logo--lg .logo__mark { font-size: var(--text-3xl); }

@media (max-width: 60rem) {
  .logo__tagline {
    display: none;
  }
}
</style>
