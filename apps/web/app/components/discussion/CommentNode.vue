<script setup lang="ts">
import { COMMENT_MAX_DEPTH } from '@revy/shared/constants'
import type { DiscussionCommentNode } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'

/**
 * One comment and its replies (SPEC 14).
 *
 * Recurses into itself via the Nuxt auto-import name. Indentation stops
 * increasing after three levels even though nesting is allowed to five: on a
 * phone, a fifth indent leaves almost no line width, so deeper replies stay
 * visually at level three and rely on the reply-to line for context.
 */
const props = defineProps<{
  comment: DiscussionCommentNode
  /** Id of the comment currently being replied to, if any. */
  replyingTo: string | null
}>()

const emit = defineEmits<{ reply: [commentId: string | null] }>()

const reportOpen = ref(false)

/**
 * Declared explicitly rather than inferred.
 *
 * This component renders itself, so an inferred slot type would reference its
 * own initializer and TypeScript gives up (TS7022). Naming the shape breaks
 * the cycle.
 */
defineSlots<{
  composer(props: { commentId: string }): unknown
}>()

const auth = useAuthStore()

/** Visual indent caps out well before the nesting limit. */
const indentLevel = computed(() => Math.min(props.comment.depth, 3))

const canReply = computed(() => props.comment.depth < COMMENT_MAX_DEPTH)
</script>

<template>
  <li class="comment" :style="{ '--indent': indentLevel }">
    <div class="comment__body">
      <header class="comment__header">
        <NuxtLink :to="`/u/${comment.user.username}`" class="comment__author">
          <UiUserAvatar :user="comment.user" size="xs" />
          <span class="comment__name">{{ comment.user.displayName }}</span>
          <UiUserTitle :slug="comment.user.titleSlug" />
        </NuxtLink>
        <time class="comment__time" :datetime="comment.createdAt">
          {{ relativeTime(comment.createdAt) }}
        </time>
      </header>

      <UiSpoilerGuard :spoiler="comment.spoiler">
        <!-- Interpolated, never v-html: comments are untrusted input (SPEC 39). -->
        <p class="comment__text">{{ comment.content }}</p>
      </UiSpoilerGuard>

      <footer class="comment__footer">
        <button
          v-if="canReply"
          type="button"
          class="comment__reply"
          @click="
            auth.isSignedIn
              ? emit('reply', replyingTo === comment.id ? null : comment.id)
              : navigateTo('/signin')
          "
        >
          {{ replyingTo === comment.id ? 'Cancel' : 'Reply' }}
        </button>
        <span v-else class="comment__maxed">Nesting limit reached</span>

        <!-- Reporting, on everybody's comment but the reader's own. -->
        <button
          v-if="auth.isSignedIn && comment.user.id !== auth.user?.id"
          type="button"
          class="comment__report"
          @click="reportOpen = true"
        >
          {{ $t('report.action') }}
        </button>
      </footer>

      <ModerationReportSheet
        v-model:open="reportOpen"
        target-type="comment"
        :target-id="comment.id"
        :author-name="comment.user.displayName"
      />

      <slot name="composer" :comment-id="comment.id" />
    </div>

    <ul v-if="comment.replies.length" class="comment__replies">
      <DiscussionCommentNode
        v-for="reply in comment.replies"
        :key="reply.id"
        :comment="reply"
        :replying-to="replyingTo"
        @reply="(id) => emit('reply', id)"
      >
        <template #composer="{ commentId }">
          <slot name="composer" :comment-id="commentId" />
        </template>
      </DiscussionCommentNode>
    </ul>
  </li>
</template>

<style scoped>
.comment {
  /* The rule is the thread line; it reads as connection rather than as a box. */
  margin-left: calc(var(--indent) * var(--space-4));
  padding-left: var(--space-3);
  border-left: 1px solid var(--border-subtle);
}

.comment:first-child {
  padding-top: 0;
}

.comment__body {
  padding-block: var(--space-3);
}

.comment__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.comment__author {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.comment__name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.comment__time {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.comment__text {
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.comment__footer {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-2);
}

.comment__report {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.comment__report:hover {
  color: var(--text-secondary);
}

.comment__reply {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-tertiary);
}

.comment__reply:hover {
  color: var(--accent-text);
}

.comment__maxed {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  font-style: italic;
}

.comment__replies {
  display: flex;
  flex-direction: column;
}
</style>
