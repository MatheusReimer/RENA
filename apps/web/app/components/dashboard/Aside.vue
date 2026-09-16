<script setup lang="ts">
import { MEDIA_TYPE_VERBS } from '@revy/shared/constants'
import type { DashboardActivity, FriendActivity, PopularItem } from '@revy/shared/types'
import { imageAtWidth, relativeTime } from '@revy/shared/utils'

/**
 * The right-hand column: who you are here, what your friends are on, what is
 * hot.
 *
 * Three panels rather than one list, because they answer three different
 * questions and a reader should be able to skip two of them at a glance.
 */
const props = defineProps<{
  activity: DashboardActivity
  friends: FriendActivity[]
  popular: PopularItem[]
}>()

const { t } = useI18n()

/**
 * The counters, in the order the design sets them.
 *
 * Friends rather than followers: RENA's graph is symmetric -- a request and an
 * accept -- so a follower count would be a number with no model behind it.
 */
const counters = computed(() => [
  {
    label: 'Reviews',
    value: props.activity.reviewCount,
    icon: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z',
  },
  {
    label: 'Comments',
    value: props.activity.commentCount,
    icon: 'M20.5 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 20.5 12Z',
  },
  {
    label: t('profile.likesReceived'),
    value: props.activity.likesReceived,
    icon: 'M12 20.3 4.8 13a4.6 4.6 0 1 1 7.2-5.7 4.6 4.6 0 1 1 7.2 5.7Z',
  },
  {
    label: 'Ratings',
    value: props.activity.ratingCount,
    icon: 'M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z',
  },
  {
    label: 'Friends',
    value: props.activity.friendCount,
    icon: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  },
])
</script>

<template>
  <aside class="aside">
    <section class="panel">
      <header class="panel__head">
        <h2>{{ $t('dash.activity') }}</h2>
        <NuxtLink to="/activity">{{ $t('dash.viewAll') }}</NuxtLink>
      </header>

      <ul class="stats">
        <li v-for="row in counters" :key="row.label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path :d="row.icon" />
          </svg>
          <span>{{ row.label }}</span>
          <strong><UiNumberTicker :value="row.value" /></strong>
        </li>
      </ul>
    </section>

    <!-- Dropped entirely when there is nobody to show. A "Friends are
         watching" heading over an empty box reads as broken, not as empty. -->
    <section v-if="friends.length" class="panel">
      <header class="panel__head">
        <h2>{{ $t('dash.friendsWatching') }}</h2>
      </header>

      <ul class="people">
        <li v-for="entry in friends" :key="entry.user.id">
          <NuxtLink :to="`/u/${entry.user.username}`">
            <UiUserAvatar :user="entry.user" size="sm" />
          </NuxtLink>

          <div class="people__what">
            <p class="people__name">{{ entry.user.username }}</p>
            <p class="people__line">
              {{ MEDIA_TYPE_VERBS[entry.mediaType].present }}
              <NuxtLink :to="`/media/${entry.mediaId}`">{{ entry.mediaTitle }}</NuxtLink>
            </p>
          </div>

          <time class="people__time" :datetime="entry.updatedAt">
            {{ relativeTime(entry.updatedAt) }}
          </time>
        </li>
      </ul>

      <NuxtLink to="/friends" class="panel__more">{{ $t('dash.viewMoreFriends') }}</NuxtLink>
    </section>

    <section v-if="popular.length" class="panel">
      <header class="panel__head">
        <h2>{{ $t('dash.popularNow') }}</h2>
      </header>

      <ol class="chart">
        <li v-for="(item, index) in popular" :key="item.id">
          <span class="chart__rank" aria-hidden="true">{{ index + 1 }}</span>
          <NuxtLink :to="`/media/${item.id}`" class="chart__link">
            <img
              v-if="item.coverImageUrl"
              :src="imageAtWidth(item.coverImageUrl, 185) ?? item.coverImageUrl"
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span class="chart__text">
              <span class="chart__title">{{ item.title }}</span>
              <UiMediaTypeTag :media-type="item.mediaType" size="sm" />
            </span>
          </NuxtLink>
        </li>
      </ol>
    </section>
  </aside>
</template>

<style scoped>
.aside {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.panel {
  padding: var(--space-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
}

.panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.panel__head h2 {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.panel__head a,
.panel__more {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
}

.panel__head a:hover,
.panel__more:hover {
  color: var(--text-primary);
}

.panel__more {
  display: block;
  margin-top: var(--space-4);
  padding: var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  text-align: center;
}

/* ------------------------------- counters ------------------------------- */

.stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.stats li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.stats svg {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.stats strong {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

/* -------------------------------- friends ------------------------------- */

.people {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.people li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.people__what {
  min-width: 0;
  flex: 1;
}

.people__name {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.people__line {
  margin: 0.1rem 0 0;
  font-size: var(--text-2xs);
  line-height: 1.45;
  color: var(--text-tertiary);
}

.people__line a {
  color: var(--text-secondary);
  transition: color var(--duration-fast) var(--ease-out);
}

.people__line a:hover {
  color: var(--text-primary);
}

.people__time {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

/* --------------------------------- chart -------------------------------- */

.chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.chart li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* Tabular and tertiary: the rank is an index, not a score, and it should not
   compete with the title beside it. */
.chart__rank {
  width: 1rem;
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--text-tertiary);
}

.chart__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
}

.chart__link img {
  width: 2.25rem;
  height: 3.25rem;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
}

.chart__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chart__title {
  font-size: var(--text-xs);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart__type {
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

@media (prefers-reduced-motion: reduce) {
  .panel__head a,
  .panel__more,
  .people__line a {
    transition: none;
  }
}
</style>
