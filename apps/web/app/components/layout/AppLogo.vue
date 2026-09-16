<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'

/**
 * The wordmark.
 *
 * Reads the brand from the shared constants rather than hardcoding it, so the
 * product name is a one-line change (see BRAND in @revy/shared/constants).
 */
/**
 * The mark is split around its own centre: RE&bull;NA.
 *
 * Derived from the brand name rather than written out, so the wordmark cannot
 * drift from `BRAND.name` -- which is the single fact this component exists to
 * render. A four-letter name breaks two and two; an odd one leans the extra
 * letter left, which is where a reader's eye already is.
 */
const half = Math.ceil(BRAND.name.length / 2)
const head = BRAND.name.slice(0, half)
const tail = BRAND.name.slice(half)

withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg'
    tagline?: boolean
    /**
     * Letterspaced, as the landing design sets it: R E N A.
     *
     * The app bar wants the opposite -- a tight, dense mark that reads as one
     * object at 17px in a row of controls. Spread out, the same four letters
     * read as a masthead, which is right on a page whose job is to introduce
     * the product and wrong on every screen after it.
     */
    spaced?: boolean
  }>(),
  { size: 'md', tagline: false, spaced: false },
)
</script>

<template>
  <span class="logo" :class="[`logo--${size}`, { 'logo--spaced': spaced }]">
    <!--
      The dot is `aria-hidden`, so the accessible name stays the brand name
      rather than becoming two fragments with an ornament between them.
    -->
    <span class="logo__mark">{{ head }}<span class="logo__dot" aria-hidden="true" />{{ tail }}</span>
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
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--text-primary);
}

/*
 * Margins rather than a flex `gap`, because the dot is now interior to the
 * word: a gap would space the two halves away from an ornament that is
 * supposed to read as part of the mark, not as punctuation between two words.
 *
 * It is also a lamp, not a full stop -- the faint halo is what keeps a plain
 * circle from reading as a bullet point, and it is the one place the brand
 * red is allowed to glow.
 */
.logo__dot {
  width: 0.3em;
  height: 0.3em;
  margin-inline: 0.16em;
  border-radius: var(--radius-full);
  background: var(--accent);
  box-shadow: 0 0 0.5em rgb(200 16 46 / 0.55);
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

/*
 * The gap grows with the tracking, because `letter-spacing` adds its space
 * after the final letter too -- without this the dot would drift away from
 * the mark by exactly one space.
 */
/*
 * The gap grows with the tracking, because `letter-spacing` adds its space
 * after every letter -- including the one before the dot. The dot's own
 * margin comes down to compensate, or it drifts visibly right of centre.
 */
.logo--spaced .logo__mark {
  letter-spacing: 0.32em;
  font-weight: 600;
}

.logo--spaced .logo__dot {
  margin-inline: 0 0.28em;
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
