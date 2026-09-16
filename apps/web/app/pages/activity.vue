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
const { t } = useI18n()
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

/**
 * "You are not the first."
 *
 * Names two people and counts the rest, because that is how somebody would
 * say it out loud. A bare "11 others have read this" is a statistic; "marina
 * and leo, and 9 others" is the beginning of a conversation, which is the
 * entire point of the notification.
 */
function alsoConsumed(notification: Notification): string {
  const title = notification.context.mediaTitle ?? 'this'
  const names = notification.context.otherNames ?? []
  const total = notification.context.otherCount ?? names.length

  if (names.length === 0) return `Others here have finished ${title} too`

  const named = names.length === 1 ? names[0]! : `${names[0]} and ${names[1]}`
  const rest = total - names.length

  return rest > 0
    ? `${named}, and ${rest} other${rest === 1 ? '' : 's'}, have finished ${title} too`
    : `${named} ${names.length === 1 ? 'has' : 'have'} finished ${title} too`
}

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
    case 'also_consumed':
      return alsoConsumed(notification)
    default:
      return t('activity.newNotification')
  }
}

/**
 * Friend requests are answered here rather than only on a profile (SPEC 12).
 *
 * The notification is where people actually see the request, so making them
 * navigate elsewhere to act on it is a step that exists for no reason. The
 * friendship id is the notification's entityId.
 */
const friendRequests = ref(new Map<string, 'accepted' | 'rejected'>())
const pendingId = ref<string | null>(null)

async function respond(notificationId: string, friendshipId: string, action: 'accept' | 'reject') {
  if (pendingId.value) return
  pendingId.value = notificationId
  try {
    await api.friends.respond(friendshipId, action)
    // Resolved in place rather than refetching: the row stays put and says
    // what happened, instead of vanishing under the reader's cursor.
    friendRequests.value.set(notificationId, action === 'accept' ? 'accepted' : 'rejected')
    friendRequests.value = new Map(friendRequests.value)
  } finally {
    pendingId.value = null
  }
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
        :title="t('activity.loadFailed')"
      >
        <template #action>
          <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="items.length === 0"
        :title="t('activity.empty')"
        :description="t('activity.emptyBody')"
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
          <!-- An unread marker rather than a per-type glyph. The message
               already says what happened and the avatar says who did it; the
               only thing the row was actually missing was whether it is new. -->
          <span
            class="row__dot"
            :aria-label="notification.readAt ? undefined : t('activity.unread')"
          />
          <UiUserAvatar v-if="notification.actor" :user="notification.actor" size="md" />
          <span class="row__text">
            <span class="row__message">{{ describe(notification) }}</span>
            <time class="row__time" :datetime="notification.createdAt">
              {{ relativeTime(notification.createdAt) }}
            </time>
          </span>

          <span
            v-if="notification.type === 'friend_request' && notification.entityId"
            class="row__actions"
            @click.stop.prevent
          >
            <template v-if="friendRequests.get(notification.id)">
              <span class="row__resolved">
                {{ friendRequests.get(notification.id) === 'accepted' ? 'Accepted' : 'Rejected' }}
              </span>
            </template>
            <template v-else>
              <UiAppButton
                variant="primary"
                size="sm"
                :loading="pendingId === notification.id"
                @click="respond(notification.id, notification.entityId, 'accept')"
              >
                Accept
              </UiAppButton>
              <UiAppButton
                variant="ghost"
                size="sm"
                :disabled="pendingId === notification.id"
                @click="respond(notification.id, notification.entityId, 'reject')"
              >
                Reject
              </UiAppButton>
            </template>
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

.row__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  /* Holds its column whether or not it is lit, so read and unread rows keep
     the same left edge. */
  background: transparent;
}

.row--unread .row__dot {
  background: var(--accent);
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

.row__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  flex-shrink: 0;
}

.row__resolved {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-tertiary);
}

.row--skeleton {
  pointer-events: none;
}
</style>
