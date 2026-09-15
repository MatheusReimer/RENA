<script setup lang="ts">
import { CONVERSATION_POLL_INTERVAL_MS } from '@revy/shared/constants'
import type { ConversationSummary } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'

/**
 * Messages (SPEC 12).
 *
 * The list of conversations, and nothing else -- no compose-new control,
 * because there is nothing to compose *to* that is not already a friend. You
 * start a conversation from a profile, which is where you find the person.
 *
 * Polled rather than pushed, slowly: this screen backs a badge and a set of
 * previews, and nobody watches it the way they watch an open thread.
 */
const api = useApi()
const auth = useAuthStore()
const { t } = useI18n()

const conversations = ref<ConversationSummary[]>([])

const { data, status, error, refresh } = await useAsyncData('conversations', async () => {
  if (!auth.isSignedIn) return { conversations: [] as ConversationSummary[] }
  return api.conversations.list()
})

watchEffect(() => {
  conversations.value = data.value?.conversations ?? []
})

/**
 * Keeps the global badge honest.
 *
 * This screen has just fetched the authoritative counts, so it updates the
 * store rather than leaving the shell to re-ask `/api/me` for a number it
 * already has on screen.
 */
watchEffect(() => {
  if (!auth.isSignedIn) return
  auth.setUnreadMessages(
    conversations.value.reduce((total, conversation) => total + conversation.unreadCount, 0),
  )
})

const polling = usePolling(
  async () => {
    if (!auth.isSignedIn) return
    const result = await api.conversations.list()
    conversations.value = result.conversations
  },
  { interval: CONVERSATION_POLL_INTERVAL_MS, immediate: false },
)

onMounted(() => {
  if (auth.isSignedIn) polling.start()
})

const totalUnread = computed(() =>
  conversations.value.reduce((total, conversation) => total + conversation.unreadCount, 0),
)

useHead(() => ({ title: t('messages.title') }))
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1 class="page__title">
        {{ $t('messages.title') }}
        <span v-if="totalUnread" class="page__count">{{ totalUnread }}</span>
      </h1>
      <p class="page__note">
        {{ $t('messages.privacyNote') }}
      </p>
    </header>

    <div class="page__body">
      <UiEmptyState
        v-if="!auth.isSignedIn && auth.initialised"
        :title="$t('messages.signInTitle')"
        :description="$t('messages.signInBody')"
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/signin')">
            {{ $t('messages.signIn') }}
          </UiAppButton>
        </template>
      </UiEmptyState>

      <div v-else-if="status === 'pending'" class="rows">
        <div v-for="i in 4" :key="i" class="row row--skeleton">
          <UiSkeletonBlock width="2.75rem" height="2.75rem" circle />
          <div class="row__lines">
            <UiSkeletonBlock width="30%" height="0.875rem" />
            <UiSkeletonBlock width="55%" height="0.75rem" />
          </div>
        </div>
      </div>

      <UiEmptyState v-else-if="error" :title="$t('messages.loadFailed')">
        <template #action>
          <UiAppButton variant="secondary" @click="refresh()">
            {{ $t('messages.tryAgain') }}
          </UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="conversations.length === 0"
        :title="$t('messages.noneTitle')"
        :description="$t('messages.noneBody')"
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/friends')">
            {{ $t('messages.yourFriends') }}
          </UiAppButton>
        </template>
      </UiEmptyState>

      <NuxtLink
        v-for="conversation in conversations"
        v-else
        :key="conversation.id"
        :to="`/messages/${conversation.id}`"
        class="row"
        :class="{ 'row--unread': conversation.unreadCount > 0 }"
      >
        <UiUserAvatar :user="conversation.participant" size="md" />

        <div class="row__text">
          <span class="row__top">
            <span class="row__name">{{ conversation.participant.displayName }}</span>
            <span class="row__time">{{ relativeTime(conversation.lastActivityAt) }}</span>
          </span>

          <span class="row__preview">
            <template v-if="conversation.lastMessage">
              <!--
                "You:" only on your own last message. Naming the other person
                in a two-person thread would repeat the row's own title.
              -->
              <span v-if="conversation.lastMessage.senderId === auth.user?.id" class="row__you">
                {{ $t('messages.you') }}
              </span>
              {{ conversation.lastMessage.excerpt }}
            </template>
            <span v-else class="row__empty">{{ $t('messages.noMessagesYet') }}</span>
          </span>
        </div>

        <span
          v-if="conversation.unreadCount"
          class="row__badge"
          :aria-label="$t('messages.unreadLabel', { count: conversation.unreadCount })"
        >
          {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
        </span>
      </NuxtLink>
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
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-2xl);
}

.page__count {
  padding: 0.1rem var(--space-2);
  border-radius: var(--radius-full);
  background: var(--accent);
  color: var(--text-inverse);
  font-size: var(--text-xs);
  font-weight: 700;
}

.page__note {
  margin-top: var(--space-2);
  margin-bottom: var(--space-4);
  max-width: 46ch;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.page__body {
  padding-inline: var(--space-4);
}

.rows {
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

.row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.row__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.row__name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.row__time {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.row__preview {
  /* One line, clipped: a preview that wraps turns the list into a feed. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.row__you,
.row__empty {
  color: var(--text-tertiary);
}

.row--unread .row__preview {
  color: var(--text-primary);
  font-weight: 500;
}

.row__badge {
  flex-shrink: 0;
  min-width: 1.35rem;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-full);
  background: var(--accent);
  color: var(--text-inverse);
  font-size: var(--text-xs);
  font-weight: 700;
  text-align: center;
}

.row--skeleton {
  pointer-events: none;
}

.row__lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}
</style>
