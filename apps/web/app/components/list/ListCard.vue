<script setup lang="ts">
import type { ListSummary } from '@revy/shared/types'

/**
 * A list row with stacked cover thumbnails (SPEC 15).
 *
 * Matches the mockup's My Lists screen: name, item count and visibility, with
 * the first few covers fanned out on the right.
 */
defineProps<{ list: ListSummary }>()

const VISIBILITY_LABELS = {
  private: 'Private',
  friends: 'Friends',
  public: 'Public',
} as const
</script>

<template>
  <NuxtLink :to="`/lists/${list.id}`" class="card">
    <div class="card__text">
      <span class="card__name clamp-1">{{ list.name }}</span>
      <span class="card__meta">
        {{ list.itemCount }} {{ list.itemCount === 1 ? 'item' : 'items' }}
        · {{ VISIBILITY_LABELS[list.visibility] }}
      </span>
    </div>

    <div v-if="list.previewCovers.length" class="card__covers" aria-hidden="true">
      <img
        v-for="(cover, index) in list.previewCovers.slice(0, 4)"
        :key="cover"
        :src="cover"
        alt=""
        loading="lazy"
        decoding="async"
        class="card__cover"
        :style="{ zIndex: 4 - index }"
      />
    </div>
    <div v-else class="card__covers card__covers--empty" aria-hidden="true">
      <span class="card__empty-slot" />
    </div>

    <svg class="card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  </NuxtLink>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.card__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.card__name {
  font-size: var(--text-base);
  font-weight: 600;
}

.card__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* Covers overlap into a fan. Reversed so the first cover sits on top without
   needing a wrapper per thumbnail. */
.card__covers {
  display: flex;
  flex-shrink: 0;
}

.card__cover {
  position: relative;
  width: 2rem;
  height: 3rem;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--surface-overlay);
}

.card__cover:not(:first-child) {
  margin-left: -0.75rem;
}

.card__covers--empty .card__empty-slot,
.card__empty-slot {
  display: block;
  width: 2rem;
  height: 3rem;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--border-default);
}

.card__chevron {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--text-tertiary);
}
</style>
