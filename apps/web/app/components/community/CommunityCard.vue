<script setup lang="ts">
import type { CommunitySummary } from '@revy/shared/types'
import { formatRatingCount, relativeTime } from '@revy/shared/utils'

/**
 * One community in the directory (SPEC 14).
 *
 * Shows discussion activity ahead of member count: a community with a thousand
 * silent members is not somewhere worth sending anyone.
 */
defineProps<{ community: CommunitySummary }>()
</script>

<template>
  <NuxtLink :to="`/community/${community.media.id}`" class="card">
    <div class="card__poster">
      <UiMediaPoster
        :src="community.media.coverImageUrl"
        :title="community.media.title"
        :media-type="community.media.mediaType"
      />
    </div>

    <div class="card__text">
      <span class="card__title clamp-2">{{ community.media.title }}</span>

      <span class="card__meta">
        {{ community.threadCount }}
        {{ community.threadCount === 1 ? 'discussion' : 'discussions' }}
        <template v-if="community.memberCount">
          · {{ formatRatingCount(community.memberCount) }} members
        </template>
      </span>

      <span v-if="community.lastActivityAt" class="card__activity">
        Active {{ relativeTime(community.lastActivityAt) }}
      </span>
    </div>

    <span v-if="community.joined" class="card__badge">Joined</span>
    <svg v-else class="card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  </NuxtLink>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.card__poster {
  width: 3.5rem;
  flex-shrink: 0;
}

.card__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.card__title {
  font-size: var(--text-base);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.card__meta {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.card__activity {
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

.card__badge {
  flex-shrink: 0;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--accent);
}

.card__chevron {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--text-tertiary);
}
</style>
