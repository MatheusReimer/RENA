<script setup lang="ts">
import type { DiscussionThread } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'

/**
 * One thread in a media item's community list (SPEC 14).
 *
 * Matches the mockup's discussion rows: icon, title, reply count and age.
 * A spoiler thread shows a marker rather than masking the title -- the title
 * itself is validated as spoiler-free framing, and masking every row would
 * make the list unreadable.
 */
defineProps<{ thread: DiscussionThread }>()
</script>

<template>
  <NuxtLink :to="`/discussions/${thread.id}`" class="row">
    <span class="row__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l2-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
      </svg>
    </span>

    <span class="row__text">
      <span class="row__title clamp-2">
        {{ thread.title }}
        <span v-if="thread.spoiler" class="row__spoiler">Spoilers</span>
      </span>
      <span class="row__meta">
        {{ thread.replyCount }} {{ thread.replyCount === 1 ? 'reply' : 'replies' }}
        · {{ relativeTime(thread.lastActivityAt) }}
      </span>
    </span>

    <svg class="row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  </NuxtLink>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.row__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.row__icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.row__title {
  font-size: var(--text-base);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.row__spoiler {
  display: inline-block;
  margin-left: var(--space-2);
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  font-size: var(--text-2xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--accent);
  vertical-align: middle;
}

.row__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.row__chevron {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--text-tertiary);
}
</style>
