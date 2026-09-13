<script setup lang="ts">
import { MEDIA_TYPE_LABELS } from '@revy/shared/constants'
import type { MediaType } from '@revy/shared/types'

/**
 * Poster artwork (SPEC 30: "large media artwork", SPEC 38: lazy loading).
 *
 * Reserves its aspect ratio before the image arrives, so a loading feed does
 * not reflow as covers pop in -- the single biggest source of layout shift in
 * an artwork-led design.
 */
withDefaults(
  defineProps<{
    src: string | null
    title: string
    mediaType?: MediaType
    /** `eager` for above-the-fold hero art; everything else stays lazy. */
    loading?: 'lazy' | 'eager'
    rounded?: 'md' | 'lg'
  }>(),
  { loading: 'lazy', rounded: 'md', mediaType: undefined },
)

const failed = ref(false)
</script>

<template>
  <div class="poster" :class="`poster--${rounded}`">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="`${title} cover art`"
      :loading="loading"
      decoding="async"
      class="poster__img"
      @error="failed = true"
    />
    <!-- Fallback carries the title rather than a generic icon: a missing
         cover should still tell you what the item is. -->
    <div v-else class="poster__fallback">
      <span class="poster__fallback-title clamp-3">{{ title }}</span>
      <span v-if="mediaType" class="poster__fallback-type">
        {{ MEDIA_TYPE_LABELS[mediaType] }}
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
}

.poster__fallback {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: var(--space-3);
}

.poster__fallback-title {
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.poster__fallback-type {
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}
</style>
