<script setup lang="ts">
import { MEDIA_TYPE_VERBS } from '@revy/shared/constants'
import type { Activity } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'

/**
 * A feed item (SPEC 13, 18).
 *
 * One card renders every activity type. Branching on `type` for the headline
 * and body while keeping one shell is what keeps the feed visually consistent
 * -- SPEC 18 asks for "visually clean and content-focused", which means the
 * artwork and the words, not a different card per event.
 */
const props = defineProps<{ activity: Activity }>()

const api = useApi()
const auth = useAuthStore()

// Optimistic like state: the heart must respond to a tap instantly, and a
// failed request rolls it back rather than leaving the UI lying.
const liked = ref(props.activity.likedByViewer)
const likeCount = ref(props.activity.likeCount)
const likePending = ref(false)

watch(
  () => props.activity,
  (next) => {
    liked.value = next.likedByViewer
    likeCount.value = next.likeCount
  },
)

/** 'rated', 'finished reading', 'reviewed' -- phrased per type (SPEC 9). */
const headline = computed(() => {
  const { type, media } = props.activity

  switch (type) {
    case 'rated_media':
      return 'rated'
    case 'reviewed_media':
      return 'reviewed'
    case 'completed_media':
      // 'finished watching' / 'finished reading', from the shared verb table.
      return media ? `finished ${MEDIA_TYPE_VERBS[media.mediaType].present}` : 'finished'
    case 'added_to_list':
      return 'added to a list'
    default:
      return 'shared'
  }
})

const timestamp = computed(() => relativeTime(props.activity.createdAt))

async function toggleLike() {
  if (!auth.isSignedIn) return navigateTo('/signin')
  if (likePending.value) return

  const next = !liked.value
  liked.value = next
  likeCount.value += next ? 1 : -1
  likePending.value = true

  try {
    await api.reviews.setLiked(props.activity.review?.id ?? props.activity.id, next)
  } catch {
    liked.value = !next
    likeCount.value += next ? -1 : 1
  } finally {
    likePending.value = false
  }
}
</script>

<template>
  <article class="card">
    <header class="card__header">
      <NuxtLink :to="`/u/${activity.user.username}`" class="card__author">
        <UiUserAvatar :user="activity.user" size="md" />
        <span class="card__author-text">
          <span class="card__headline">
            <strong>{{ activity.user.displayName }}</strong>
            <UiUserTitle :slug="activity.user.titleSlug" />
            {{ headline }}
            <NuxtLink
              v-if="activity.media"
              :to="`/media/${activity.media.id}`"
              class="card__media-link"
              @click.stop
            >
              {{ activity.media.title }}
            </NuxtLink>
          </span>
          <time class="card__time" :datetime="activity.createdAt">{{ timestamp }}</time>
        </span>
      </NuxtLink>
    </header>

    <NuxtLink v-if="activity.media" :to="`/media/${activity.media.id}`" class="card__art">
      <!-- The backdrop is the hero when the provider has one; books and most
           series fall back to the poster, which still fills the frame. -->
      <img
        v-if="activity.media.backdropImageUrl"
        :src="activity.media.backdropImageUrl"
        :alt="`${activity.media.title} artwork`"
        loading="lazy"
        decoding="async"
        class="card__backdrop"
      />
      <div v-else class="card__poster-frame">
        <UiMediaPoster
          :src="activity.media.coverImageUrl"
          :title="activity.media.title"
          :media-type="activity.media.mediaType"
          rounded="lg"
        />
      </div>
    </NuxtLink>

    <div v-if="activity.score !== null" class="card__rating">
      <UiStarRating :score="activity.score" size="lg" />
      <span class="card__score">{{ activity.score.toFixed(1) }}</span>
    </div>

    <UiSpoilerGuard v-if="activity.review" :spoiler="activity.review.spoiler">
      <p class="card__quote">{{ activity.review.excerpt }}</p>
    </UiSpoilerGuard>

    <footer class="card__actions">
      <button
        type="button"
        class="card__action"
        :class="{ 'card__action--liked': liked }"
        :aria-pressed="liked"
        :aria-label="liked ? $t('common.unlike') : $t('common.like')"
        @click="toggleLike"
      >
        <svg viewBox="0 0 24 24" :fill="liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />
        </svg>
        {{ likeCount }}
      </button>

      <NuxtLink
        v-if="activity.media"
        :to="`/media/${activity.media.id}`"
        class="card__action"
        :aria-label="$t('discussion.view')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l2-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
        </svg>
        {{ activity.commentCount }}
      </NuxtLink>
    </footer>
  </article>
</template>

<style scoped>
.card {
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.card__header {
  margin-bottom: var(--space-3);
}

.card__author {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.card__author-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.card__headline {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--leading-snug);
}

.card__headline strong {
  font-weight: 600;
  color: var(--text-primary);
}

.card__media-link {
  font-weight: 600;
  color: var(--text-primary);
}

.card__media-link:hover {
  color: var(--accent);
}

.card__time {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.card__art {
  display: block;
  margin-bottom: var(--space-3);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--surface-raised);
}

.card__backdrop {
  width: 100%;
  aspect-ratio: var(--backdrop-ratio);
  object-fit: cover;
}

/* Books and posters keep their own proportion rather than being cropped to
   a 16:9 frame, which would cut the title off most covers. */
.card__poster-frame {
  max-width: 11rem;
  padding: var(--space-4);
}

.card__rating {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.card__score {
  font-size: var(--text-base);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--star);
}

.card__quote {
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
}

.card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  margin-top: var(--space-4);
}

.card__action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
}

.card__action svg {
  width: 1.125rem;
  height: 1.125rem;
  transition: transform var(--duration-base) var(--ease-spring);
}

/*
 * The heart pops when it fills.
 *
 * This is the one place an overshoot curve earns its keep: liking something is
 * a small act of enthusiasm, and a linear fill reads as a checkbox. The scale
 * is on the icon alone so the count beside it stays legible.
 */
.card__action--liked svg {
  animation: heart-pop var(--duration-slow) var(--ease-spring);
}

.card__action:active svg {
  transform: scale(0.86);
  transition-duration: var(--duration-fast);
}

@keyframes heart-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}

.card__action:hover {
  color: var(--text-secondary);
}

.card__action--liked {
  color: var(--accent);
}

.card__action--liked:hover {
  color: var(--accent-hover);
}
</style>
