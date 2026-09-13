<script setup lang="ts">
import { MEDIA_STATUS_LABELS, MEDIA_TYPE_VERBS } from '@revy/shared/constants'
import type { Media, MediaStatus } from '@revy/shared/types'

/**
 * "Continue watching / reading / playing" (SPEC 22).
 *
 * The design shows these as separate panels beside the feed. They are one
 * component grouped by verb instead, so a fourth media type needs no new panel
 * -- the heading comes from the shared verb table.
 */
const props = defineProps<{
  entries: Array<{ status: MediaStatus; media: Media; updatedAt: string }>
}>()

/**
 * Grouped by the present-tense verb rather than by media type, so movies and
 * series share one "Continue watching" panel exactly as the design has them.
 */
const groups = computed(() => {
  const byVerb = new Map<string, typeof props.entries>()

  for (const entry of props.entries) {
    // Only things actually in progress; "want to watch" is a plan, not
    // something to continue.
    if (entry.status !== 'in_progress') continue

    const verb = MEDIA_TYPE_VERBS[entry.media.mediaType].present
    byVerb.set(verb, [...(byVerb.get(verb) ?? []), entry])
  }

  return [...byVerb.entries()].map(([verb, entries]) => ({
    verb,
    title: `Continue ${verb}`,
    entries,
  }))
})
</script>

<template>
  <div v-if="groups.length" class="continue">
    <section v-for="group in groups" :key="group.verb" class="group">
      <h2 class="group__title">{{ group.title }}</h2>

      <NuxtLink
        v-for="entry in group.entries"
        :key="entry.media.id"
        :to="`/media/${entry.media.id}`"
        class="item"
      >
        <div class="item__poster">
          <UiMediaPoster
            :src="entry.media.coverImageUrl"
            :title="entry.media.title"
            :media-type="entry.media.mediaType"
          />
        </div>

        <div class="item__text">
          <span class="item__title clamp-2">{{ entry.media.title }}</span>
          <span class="item__status">
            {{ MEDIA_STATUS_LABELS[entry.media.mediaType][entry.status] }}
          </span>
        </div>
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.continue {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.group__title {
  margin-bottom: var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  margin-inline: calc(var(--space-2) * -1);
  border-radius: var(--radius-md);
  transition: background-color var(--duration-fast) var(--ease-out);
}

.item:hover {
  background: var(--surface-raised);
}

.item__poster {
  width: 2.5rem;
  flex-shrink: 0;
}

.item__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.item__title {
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.item__status {
  font-size: var(--text-2xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--accent);
}
</style>
