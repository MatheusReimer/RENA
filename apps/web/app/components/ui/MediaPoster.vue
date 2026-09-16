<script setup lang="ts">
import type { MediaType } from '@revy/shared/types'
import { POSTER_WIDTHS, imageSrcSet } from '@revy/shared/utils'

/**
 * Poster artwork (SPEC 30: "large media artwork", SPEC 38: lazy loading).
 *
 * Reserves its aspect ratio before the image arrives, so a loading feed does
 * not reflow as covers pop in -- the single biggest source of layout shift in
 * an artwork-led design.
 */
const props = withDefaults(
  defineProps<{
    src: string | null
    title: string
    mediaType?: MediaType
    /** `eager` for above-the-fold hero art; everything else stays lazy. */
    loading?: 'lazy' | 'eager'
    rounded?: 'md' | 'lg'
    /**
     * The CSS `sizes` value: how wide this poster actually renders.
     *
     * Without it the browser assumes the full viewport width and downloads the
     * largest candidate for a 120px card. The default describes a rail card;
     * anything larger should say so.
     */
    sizes?: string
  }>(),
  { loading: 'lazy', rounded: 'md', mediaType: undefined, sizes: '(min-width: 60rem) 180px, 33vw' },
)

/*
 * We now store the provider's largest image, so every poster must declare the
 * width it is actually drawn at -- otherwise a rail of 200 cards would pull
 * 200 full-resolution posters. Null for artwork we cannot resize (Steam, Open
 * Library), where the plain `src` is the only option.
 */
const srcset = computed(() => imageSrcSet(props.src, POSTER_WIDTHS))

const failed = ref(false)
const loaded = ref(false)
const img = ref<HTMLImageElement | null>(null)

/**
 * Catches an image that finished before the listener existed.
 *
 * A cached cover can complete between render and hydration, so its `load`
 * event never reaches us -- and since the fade starts at `opacity: 0`, the
 * poster would stay invisible forever. `complete` is the authoritative answer
 * to "did this already finish", so it is checked directly on mount and again
 * whenever the source changes.
 */
function syncLoaded() {
  const el = img.value
  if (el?.complete && el.naturalWidth > 0) loaded.value = true
}

onMounted(syncLoaded)

// A list can reuse a component instance for a different item; without this a
// single broken cover would poison every card that scrolled through the slot.
watch(
  () => props.src,
  async () => {
    failed.value = false
    loaded.value = false
    // After the new src has been applied to the element, not before.
    await nextTick()
    syncLoaded()
  },
)

const showFallback = computed(() => !props.src || failed.value)

/**
 * A stable hue per title.
 *
 * Some titles genuinely have no artwork -- an obscure show, a book nobody has
 * scanned. A grey box reads as broken; a deliberate, coloured card reads as a
 * design. Deriving the hue from the title means the same title is always the
 * same colour, so a shelf of them still looks composed rather than random.
 */
const hue = computed(() => {
  let hash = 0
  for (const char of props.title) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
})

/** Trimmed so a long title does not shrink to unreadable. */
const displayTitle = computed(() =>
  props.title.length > 48 ? `${props.title.slice(0, 46).trimEnd()}…` : props.title,
)
</script>

<template>
  <div class="poster" :class="`poster--${rounded}`">
    <img
      v-if="!showFallback"
      ref="img"
      :src="src!"
      :srcset="srcset ?? undefined"
      :sizes="srcset ? sizes : undefined"
      :alt="`${title} cover art`"
      :loading="loading"
      decoding="async"
      class="poster__img"
      :class="{ 'poster__img--loaded': loaded }"
      @load="loaded = true"
      @error="failed = true"
    />

    <!--
      The fallback carries the title rather than a generic icon: a missing
      cover should still tell you what the item is, and at a glance.
    -->
    <div v-else class="poster__fallback" :style="{ '--poster-hue': hue }">
      <span class="poster__grain" aria-hidden="true" />
      <span class="poster__fallback-title clamp-3">{{ displayTitle }}</span>
      <span v-if="mediaType" class="poster__fallback-type">
        {{ $t(`mediaType.${mediaType}`) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.poster {
  position: relative;
  aspect-ratio: var(--poster-ratio);
  width: 100%;
  overflow: hidden;
  background: var(--surface-overlay);
  border: 1px solid var(--border-subtle);
}

.poster--md {
  border-radius: var(--radius-md);
}

.poster--lg {
  border-radius: var(--radius-lg);
}

.poster__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /*
   * Covers arrive at wildly different times across a rail. Snapping in reads
   * as the page glitching; a short fade reads as loading. Starting slightly
   * scaled up means the settle is visible without the frame ever moving.
   */
  opacity: 0;
  transform: scale(1.04);
  transition:
    opacity var(--duration-slow) var(--ease-out),
    transform var(--duration-slow) var(--ease-out);
}

.poster__img--loaded {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .poster__img {
    opacity: 1;
    transform: none;
  }
}

/* ------------------------------------------------------------------ *
 * Fallback
 * ------------------------------------------------------------------ */

.poster__fallback {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
  padding: var(--space-3);
  /* Dark and desaturated: this sits in a grid beside real artwork and must
     not shout louder than it. */
  background:
    linear-gradient(
      160deg,
      hsl(var(--poster-hue) 32% 22%) 0%,
      hsl(var(--poster-hue) 28% 12%) 55%,
      var(--surface-overlay) 100%
    );
}

/* A faint diagonal texture, so the card reads as a surface rather than a
   flat swatch. Cheap: one repeating gradient, no image. */
.poster__grain {
  position: absolute;
  inset: 0;
  opacity: 0.5;
  background: repeating-linear-gradient(
    135deg,
    rgb(255 255 255 / 0.035) 0px,
    rgb(255 255 255 / 0.035) 1px,
    transparent 1px,
    transparent 7px
  );
}

.poster__fallback-title {
  position: relative;
  font-size: var(--text-sm);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: var(--tracking-tight);
  text-wrap: balance;
  color: hsl(var(--poster-hue) 25% 92%);
}

.poster__fallback-type {
  position: relative;
  margin-top: var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: hsl(var(--poster-hue) 20% 68%);
}
</style>
