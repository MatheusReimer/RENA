<script setup lang="ts">
import { MEDIA_TYPE_LABELS } from '@revy/shared/constants'
import type { MediaSearchResult } from '@revy/shared/types'
import { formatAverage, releaseYear } from '@revy/shared/utils'

/**
 * One search result (SPEC 20).
 *
 * The design's "Top Results" row: poster, title, type and year, the aggregate
 * score where we have one, and a chevron. A score only appears for titles
 * already in the catalogue -- a provider result nobody here has rated yet has
 * no rating to show, and inventing one would be worse than the gap.
 */
defineProps<{
  result: MediaSearchResult
  /** Aggregate score, when this title is already known locally. */
  averageRating?: number | null
  opening?: boolean
}>()
</script>

<template>
  <div class="result" :class="{ 'result--busy': opening }">
    <div class="result__poster">
      <UiMediaPoster
        :src="result.coverImageUrl"
        :title="result.title"
        :media-type="result.mediaType"
      />
    </div>

    <div class="result__text">
      <span class="result__title clamp-2">{{ result.title }}</span>

      <span class="result__meta">
        {{ MEDIA_TYPE_LABELS[result.mediaType] }}
        <template v-if="releaseYear(result.releaseDate)">
          · {{ releaseYear(result.releaseDate) }}
        </template>
      </span>

      <span v-if="result.subtitle" class="result__subtitle clamp-1">{{ result.subtitle }}</span>

      <span v-if="averageRating != null" class="result__score">
        <strong>{{ formatAverage(averageRating) }}</strong>
        <UiStarRating :score="averageRating" size="sm" />
      </span>
    </div>

    <span v-if="opening" class="result__spinner" aria-label="Opening" />
    <svg v-else class="result__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  </div>
</template>

<style scoped>
.result {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  padding-block: var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
  transition: opacity var(--duration-fast) var(--ease-out);
}

.result--busy {
  opacity: 0.5;
}

.result__poster {
  width: 3rem;
  flex-shrink: 0;
}

.result__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.result__title {
  font-size: var(--text-base);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.result__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.result__subtitle {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.result__score {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--star);
}

.result__chevron {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.result__spinner {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  border: 2px solid var(--text-tertiary);
  border-right-color: transparent;
  border-radius: var(--radius-full);
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}
</style>
