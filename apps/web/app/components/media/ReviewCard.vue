<script setup lang="ts">
import type { Review } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'

/**
 * A single review (SPEC 11).
 *
 * The body goes through SpoilerGuard, so a review flagged as containing
 * spoilers is masked until the reader opts in.
 */
const props = defineProps<{ review: Review }>()

const api = useApi()
const auth = useAuthStore()

const liked = ref(props.review.likedByViewer)
const likeCount = ref(props.review.likeCount)
const pending = ref(false)

watch(
  () => props.review,
  (next) => {
    liked.value = next.likedByViewer
    likeCount.value = next.likeCount
  },
)

async function toggleLike() {
  if (!auth.isSignedIn) return navigateTo('/signin')
  if (pending.value) return

  const next = !liked.value
  liked.value = next
  likeCount.value += next ? 1 : -1
  pending.value = true

  try {
    await api.reviews.setLiked(props.review.id, next)
  } catch {
    // Roll back so the count never disagrees with the server.
    liked.value = !next
    likeCount.value += next ? -1 : 1
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <article class="review">
    <header class="review__header">
      <NuxtLink :to="`/u/${review.user.username}`" class="review__author">
        <UiUserAvatar :user="review.user" size="sm" />
        <span class="review__name">{{ review.user.displayName }}</span>
      </NuxtLink>

      <UiStarRating v-if="review.score !== null" :score="review.score" size="sm" />

      <time class="review__time" :datetime="review.createdAt">
        {{ relativeTime(review.createdAt) }}
      </time>
    </header>

    <UiSpoilerGuard :spoiler="review.spoiler">
      <!-- Interpolation, never v-html: user content is untrusted (SPEC 39). -->
      <p class="review__body">{{ review.content }}</p>
    </UiSpoilerGuard>

    <footer class="review__footer">
      <button
        type="button"
        class="review__like"
        :class="{ 'review__like--active': liked }"
        :aria-pressed="liked"
        :aria-label="liked ? 'Unlike review' : 'Like review'"
        @click="toggleLike"
      >
        <svg viewBox="0 0 24 24" :fill="liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />
        </svg>
        {{ likeCount }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.review {
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.review__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.review__author {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.review__name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.review__time {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.review__body {
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.review__footer {
  margin-top: var(--space-3);
}

.review__like {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
}

.review__like svg {
  width: 1rem;
  height: 1rem;
}

.review__like:hover {
  color: var(--text-secondary);
}

.review__like--active {
  color: var(--accent);
}
</style>
