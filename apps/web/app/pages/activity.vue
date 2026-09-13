<script setup lang="ts">
import type { Notification } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'

/**
 * Notifications (SPEC 23).
 *
 * Opening the screen marks everything read, which is what the unread dot in
 * the navigation counts.
 */
const api = useApi()
const auth = useAuthStore()

const filter = ref<'all' | 'friends' | 'discussions' | 'system'>('all')

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'friends', label: 'Friends' },
  { value: 'discussions', label: 'Discussions' },
  { value: 'system', label: 'System' },
] as const

const { data, status, error, refresh } = await useAsyncData(
  'notifications',
  async () => {
    if (!auth.isSignedIn) return { items: [], nextCursor: null }
    return api.notifications.list({ filter: filter.value })
  },
  { watch: [filter] },
)

const items = computed(() => data.value?.items ?? [])

onMounted(async () => {
  if (!auth.isSignedIn || auth.unreadNotifications === 0) return
  try {
    await api.notifications.markRead()
    auth.markNotificationsRead()
  } catch {
    // A failed read-receipt is not worth surfacing: the badge corrects itself
    // on the next session load.
  }
})

/** Copy for each notification type (SPEC 23). */
function describe(notification: Notification): string {
  const actor = notification.actor?.displayName ?? 'Someone'

  switch (notification.type) {
    case 'friend_request':
      return `${actor} sent you a friend request`
    case 'friend_request_accepted':
      return `${actor} accepted your friend request`
    case 'comment_on_review':
      return `${actor} replied to your review`
    case 'reply_to_discussion':
      return `${actor} replied to your discussion`
    case 'liked_review':
      return `${actor} liked your review`
    case 'mentioned':
      return `${actor} mentioned you`
    case 'badge_earned':
      return `You earned the ${notification.context.badgeName ?? 'new'} badge`
    default:
      return 'You have a new notification'
  }
}

const ICONS: Record<string, string> = {
  friend_request: '\u{1F464}',
  friend_request_accepted: '\u{1F91D}',
  comment_on_review: '\u{1F4AC}',
  reply_to_discussion: '\u{1F4AC}',
  liked_review: '❤️',
  mentioned: '@',
  badge_earned: '⭐',
}

useHead({ title: 'Activity' })
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1 class="page__title">Notifications</h1>
      <UiTabNav v-model="filter" :tabs="tabs" />
    </header>

    <div class="page__body">
      <UiEmptyState
        v-if="!auth.isSignedIn && auth.initialised"
        icon="🔔"
        title="Sign in to see your notifications."
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/signin')">Sign in</UiAppButton>
        </template>
      </UiEmptyState>

      <div v-else-if="status === 'pending'" class="list">
        <div v-for="i in 5" :key="i" class="row row--skeleton">
          <UiSkeletonBlock width="2.5rem" height="2.5rem" circle />
          <UiSkeletonBlock width="70%" height="0.875rem" />
        </div>
      </div>

      <UiEmptyState
        v-else-if="error"
        icon="⚠️"
        title="We couldn't load your notifications."
      >
        <template #action>
          <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="items.length === 0"
        icon="🔔"
        title="Nothing to catch up on."
        description="Friend requests, replies and badges show up here."
      />

      <div v-else class="list">
        <component
          :is="notification.actor ? 'NuxtLink' : 'div'"
          v-for="notification in items"
          :key="notification.id"
          :to="notification.actor ? `/u/${notification.actor.username}` : undefined"
          class="row"
          :class="{ 'row--unread': !notification.readAt }"
        >
          <span class="row__icon" aria-hidden="true">
            {{ ICONS[notification.type] ?? '\u{1F514}' }}
          </span>
          <UiUserAvatar v-if="notification.actor" :user="notification.actor" size="md" />
          <span class="row__text">
            <span class="row__message">{{ describe(notification) }}</span>
            <time class="row__time" :datetime="notification.createdAt">
              {{ relativeTime(notification.createdAt) }}
            </time>
          </span>
        </component>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
}

.page__header {
  padding: var(--space-5) var(--space-4) 0;
}

.page__title {
  margin-bottom: var(--space-4);
  font-size: var(--text-2xl);
}

.page__body {
  padding-inline: var(--space-4);
}

.list {
  display: flex;
  flex-direction: column;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.row--unread {
  /* A tint rather than a dot: the whole row carries the unread signal, which
     is easier to scan down a long list. */
  background: linear-gradient(to right, var(--accent-soft), transparent 60%);
  margin-inline: calc(var(--space-3) * -1);
  padding-inline: var(--space-3);
  border-radius: var(--radius-md);
}

.row__icon {
  display: grid;
  place-items: center;
  width: 1.5rem;
  font-size: var(--text-base);
  flex-shrink: 0;
}

.row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row__message {
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
}

.row__time {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.row--skeleton {
  pointer-events: none;
}
</style>
