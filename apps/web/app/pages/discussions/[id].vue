<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
/**
 * A discussion thread with its nested replies (SPEC 14).
 *
 * The whole comment tree arrives in one request and is rendered recursively,
 * so a five-level conversation costs one round trip.
 */
const route = useRoute()
const api = useApi()
const notice = useNotice()
const { t } = useI18n()
const { absolute } = useShareLink()
const auth = useAuthStore()

const threadId = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAsyncData(
  () => `thread:${threadId.value}`,
  () => api.discussions.get(threadId.value),
  { watch: [threadId] },
)

const thread = computed(() => data.value?.thread ?? null)
const media = computed(() => data.value?.media ?? null)
const comments = computed(() => data.value?.comments ?? [])

/** Which comment the inline reply box is currently attached to. */
const replyingTo = ref<string | null>(null)

async function onPosted() {
  replyingTo.value = null
  await refresh()
}

const isAuthor = computed(() => auth.user && thread.value?.user.id === auth.user.id)
const deleting = ref(false)

async function removeThread() {
  if (!thread.value || deleting.value) return
  deleting.value = true
  try {
    await api.discussions.remove(thread.value.id)
    await navigateTo(`/media/${thread.value.mediaId}`)
  } catch (error) {
    notice.fromError(error)
  } finally {
    deleting.value = false
  }
}

useHead(() => ({ title: thread.value?.title ?? 'Discussion' }))
useSeoMeta({
  ogTitle: () => thread.value?.title ?? BRAND.name,
  /*
   * The title only, never the opening comment.
   *
   * Threads are flagged for spoilers and the body of one is exactly what a
   * spoiler guard exists to hide -- putting it in a share card would leak it
   * past every control the page has.
   */
  ogDescription: () => BRAND.description,
  ogType: 'article',
  ogUrl: () => (thread.value ? absolute(`/discussions/${thread.value.id}`) : undefined),
})
</script>

<template>
  <div class="page">
    <div v-if="status === 'pending' && !thread" class="loading">
      <UiSkeletonBlock width="70%" height="1.75rem" />
      <UiSkeletonBlock width="40%" height="0.875rem" />
      <UiSkeletonBlock width="100%" height="4rem" />
      <UiSkeletonBlock width="100%" height="4rem" />
    </div>

    <UiEmptyState
      v-else-if="error || !thread || !media"
      :title="t('discussion.loadFailed')"
      :description="t('discussion.loadFailedBody')"
    >
      <template #action>
        <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <header class="header">
        <NuxtLink :to="`/media/${media.id}`" class="header__back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span class="clamp-1">{{ media.title }}</span>
        </NuxtLink>

        <h1 class="header__title">{{ thread.title }}</h1>

        <div class="header__meta">
          <NuxtLink :to="`/u/${thread.user.username}`" class="header__author">
            <UiUserAvatar :user="thread.user" size="xs" />
            <span>{{ thread.user.displayName }}</span>
          </NuxtLink>
          <span class="header__dot" aria-hidden="true">·</span>
          <span>
            {{ thread.replyCount }} {{ thread.replyCount === 1 ? 'reply' : 'replies' }}
          </span>
          <span v-if="thread.spoiler" class="header__spoiler">Spoilers</span>

          <button
            v-if="isAuthor"
            type="button"
            class="header__delete"
            :disabled="deleting"
            @click="removeThread"
          >
            Delete
          </button>
        </div>
      </header>

      <UiEmptyState
        v-if="comments.length === 0"
        :title="t('discussion.noReplies')"
        :description="t('discussion.noRepliesBody')"
      />

      <ul v-else class="comments">
        <DiscussionCommentNode
          v-for="comment in comments"
          :key="comment.id"
          :comment="comment"
          :replying-to="replyingTo"
          @reply="(id) => (replyingTo = id)"
        >
          <template #composer="{ commentId }">
            <DiscussionCommentComposer
              v-if="replyingTo === commentId"
              :thread-id="thread.id"
              :parent-comment-id="commentId"
              :placeholder="t('discussion.replyPlaceholder')"
              autofocus
              @posted="onPosted"
              @cancel="replyingTo = null"
            />
          </template>
        </DiscussionCommentNode>
      </ul>

      <div class="reply-box">
        <DiscussionCommentComposer
          v-if="auth.isSignedIn"
          :thread-id="thread.id"
          @posted="onPosted"
        />
        <UiEmptyState v-else title="Sign in to join the conversation.">
          <template #action>
            <UiAppButton variant="primary" @click="navigateTo('/signin')">Sign in</UiAppButton>
          </template>
        </UiEmptyState>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
  padding: var(--space-5) var(--space-4) var(--space-12);
}

.loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.header {
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.header__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  margin-bottom: var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}

.header__back:hover {
  color: var(--text-primary);
}

.header__back svg {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

.header__title {
  font-size: var(--text-2xl);
}

.header__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.header__author {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
  color: var(--text-secondary);
}

.header__dot {
  color: var(--text-tertiary);
}

.header__spoiler {
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--accent);
}

.header__delete {
  margin-left: auto;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-tertiary);
}

.header__delete:hover:not(:disabled) {
  color: var(--danger);
}

.comments {
  display: flex;
  flex-direction: column;
  padding-block: var(--space-2);
}

/* Top-level comments carry no thread line; only replies are connected. */
.comments > :deep(.comment) {
  margin-left: 0;
  padding-left: 0;
  border-left: none;
  border-bottom: 1px solid var(--border-subtle);
}

.reply-box {
  margin-top: var(--space-5);
}
</style>
