<script setup lang="ts">
import type { Badge } from '@revy/shared/types'

/**
 * One badge, drawn as its medallion (SPEC 17).
 *
 * The artwork lives at `/badges/<slug>.webp` rather than in a column, because
 * the filename is already the slug and a second source of truth for "where is
 * this badge's picture" is a second thing that can disagree. Adding a badge is
 * a definition plus a file with the matching name.
 *
 * The emoji stays as the fallback. Every badge has art today, but a badge
 * added before its artwork should render as something rather than as a broken
 * image -- and the emoji is already in the database for exactly that.
 */
const props = withDefaults(
  defineProps<{
    badge: Badge
    size?: 'sm' | 'md' | 'lg'
    /** Dims and desaturates it: shown but not yet earned. */
    locked?: boolean
  }>(),
  { size: 'md', locked: false },
)

const failed = ref(false)

// Reset when the badge changes, or one broken image would poison the slot for
// every badge that later renders through the same component instance.
watch(() => props.badge.slug, () => (failed.value = false))

/*
 * WebP with an alpha channel, at 192px.
 *
 * Three things were wrong with the masters and all of them are fixed here.
 *
 * They were 1.9 MB of PNG -- 76 KB each for a three-colour mark, one of which
 * renders beside a name on every comment. They were **opaque**: RGB with no
 * alpha at all, a black square with the design painted on it, so every badge
 * showed as a black tile against the page. And they were 256px for something
 * that renders at 80px at its largest.
 *
 * The black is recovered as alpha rather than colour-keyed away, because black
 * is also the *interior* of these designs -- the gaps in a globe, the spaces
 * inside a laurel. See `design/badges-png/` for the masters, which are kept
 * out of `public/` so they are no longer deployed.
 */
const src = computed(() => `/badges/${props.badge.slug}.webp`)
</script>

<template>
  <span class="medal" :class="[`medal--${size}`, { 'medal--locked': locked }]">
    <img
      v-if="!failed"
      :src="src"
      :alt="badge.name"
      class="medal__art"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <span v-else class="medal__emoji" role="img" :aria-label="badge.name">
      {{ badge.icon }}
    </span>
  </span>
</template>

<style scoped>
.medal {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  /* The art carries its own rim and sits on transparency, so the container
     is square and unstyled -- a border or a background here would draw a
     second edge around the one the badge already has. */
  line-height: 0;
}

.medal--sm { width: 1.5rem; height: 1.5rem; }
.medal--md { width: 3.5rem; height: 3.5rem; }
.medal--lg { width: 5rem; height: 5rem; }

.medal__art {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.medal__emoji {
  font-size: 1.25em;
  line-height: 1;
}

/*
 * Not yet earned: visible, obviously inert.
 *
 * Greyed rather than hidden, because the point of showing a locked badge is
 * that somebody can see what there is to go after. Hiding them makes the set
 * look smaller than it is.
 */
.medal--locked {
  opacity: 0.25;
  filter: grayscale(1);
}
</style>
