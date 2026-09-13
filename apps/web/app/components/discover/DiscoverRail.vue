<script setup lang="ts">
import { MEDIA_TYPE_LABELS } from '@revy/shared/constants'
import type { DiscoverSection } from '@revy/shared/types'
import { formatAverage, releaseYear } from '@revy/shared/utils'

/**
 * A horizontally scrolling row of media cards (SPEC 21).
 *
 * The "Trending this week" / "Popular on ..." rails from the mockup. Uses the
 * shared `.rail` utility, which bleeds cards to the screen edge so the
 * partially-visible next card is the scroll affordance.
 */
defineProps<{ section: DiscoverSection }>()
</script>

<template>
  <section class="rail-section">
    <h2 class="rail-section__title">{{ section.title }}</h2>

    <ul class="rail">
      <li v-for="item in section.items" :key="item.media.id" class="card">
        <NuxtLink :to="`/media/${item.media.id}`" class="card__link">
          <UiMediaPoster
            :src="item.media.coverImageUrl"
            :title="item.media.title"
            :media-type="item.media.mediaType"
          />

          <span class="card__title clamp-2">{{ item.media.title }}</span>

          <span class="card__meta">
            {{ MEDIA_TYPE_LABELS[item.media.mediaType] }}
            <template v-if="releaseYear(item.media.releaseDate)">
              · {{ releaseYear(item.media.releaseDate) }}
            </template>
          </span>

          <span v-if="item.averageRating !== null" class="card__score">
            <UiStarRating :score="item.averageRating" size="sm" />
            {{ formatAverage(item.averageRating) }}
          </span>

          <!-- Friend sections carry avatars instead of an aggregate score:
               whose opinion it is matters more than the number. -->
          <span v-else-if="item.friends.length" class="card__friends">
            <UiUserAvatar
              v-for="friend in item.friends.slice(0, 3)"
              :key="friend.id"
              :user="friend"
              size="xs"
              class="card__friend"
            />
            <span v-if="item.friends.length > 3" class="card__friend-more">
              +{{ item.friends.length - 3 }}
            </span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.rail-section {
  margin-bottom: var(--space-8);
}

.rail-section__title {
  margin-bottom: var(--space-3);
  font-size: var(--text-lg);
}

.card {
  width: 7.5rem;
}

.card__link {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.card__title {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.card__meta {
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

.card__score {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--star);
}

.card__friends {
  display: flex;
  align-items: center;
  margin-top: var(--space-1);
}

/* Avatars overlap into a small stack, matching the friend rows elsewhere. */
.card__friend:not(:first-child) {
  margin-left: -0.4rem;
}

.card__friend-more {
  margin-left: var(--space-1);
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}
</style>
