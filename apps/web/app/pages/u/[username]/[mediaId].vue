<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import { relativeTime, releaseYear } from '@revy/shared/utils'

/**
 * One person's entry on one title -- the page a shared rating link opens
 * (SPEC 10, 22, 27).
 *
 * Addressed by `(username, mediaId)` rather than by a rating id, because both
 * of those rows are unique on that pair. Re-scoring four stars to five, adding
 * a review a week later, deleting the review and keeping the score: none of it
 * changes this URL. A link sent in March still resolves in December, which is
 * the one property a share link has to have.
 *
 * The card is the point of the whole feature. What makes a pasted link worth
 * clicking is that WhatsApp renders the poster, the person's name and their
 * score before anyone has decided to open it -- so the Open Graph tags here
 * are not decoration, they are the product.
 */
const route = useRoute()
const api = useApi()
const { t } = useI18n()
const { absolute, share } = useShareLink()

const username = computed(() => String(route.params.username))
const mediaId = computed(() => String(route.params.mediaId))

const { data, error } = await useAsyncData(
  () => `entry:${username.value}:${mediaId.value}`,
  () => api.entries.get(username.value, mediaId.value),
  { watch: [username, mediaId] },
)

const entry = computed(() => data.value?.entry ?? null)
const media = computed(() => entry.value?.media ?? null)
const review = computed(() => entry.value?.review ?? null)

/*
 * A real 404 for an entry that is not there.
 *
 * Without it every unrated pair is a soft 404 -- HTTP 200 with an error state
 * in the body -- and the set of unrated pairs is every person multiplied by
 * every title, which is exactly the kind of unbounded thin-page space a
 * crawler should never be handed.
 */
if (import.meta.server && error.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

/*
 * Indexable only when there are words.
 *
 * A page saying "Matheus rated The Dark Knight 4.5" and nothing else is thin
 * content, and there is one per person per title. A review is genuine writing
 * about a title and is exactly the long-tail content this catalogue can offer
 * that a database of metadata cannot -- so that gets indexed and the bare
 * score does not. `follow` either way: the links out to the media page and the
 * profile are worth passing on regardless.
 */
watchEffect(() => {
  if (review.value?.content) setIndexPolicy('index')
  else setIndexPolicy('noindex-follow')
})

/** Stars as text, because a share card cannot render a component. */
const scoreText = computed(() => (entry.value?.score != null ? `${entry.value.score}/5` : null))

const shareTitle = computed(() => {
  const value = entry.value
  if (!value) return BRAND.name
  return scoreText.value
    ? t('entry.shareTitle', {
        name: value.user.displayName,
        title: value.media.title,
        score: scoreText.value,
      })
    : t('entry.shareTitleNoScore', {
        name: value.user.displayName,
        title: value.media.title,
      })
})

/*
 * The review is the description when there is one, trimmed to what a card
 * actually shows. Falls back to the score rather than the product tagline:
 * this page is about one person's opinion, and the generic line would waste
 * the only two lines the card gets.
 */
const shareDescription = computed(() => {
  const value = entry.value
  if (!value) return BRAND.description
  if (value.review?.content && !value.review.spoiler) {
    const text = value.review.content.replace(/\s+/g, ' ').trim()
    return text.length > 200 ? `${text.slice(0, 197)}…` : text
  }
  return shareTitle.value
})

useSeoMeta({
  title: () => shareTitle.value,
  description: () => shareDescription.value,
  ogTitle: () => shareTitle.value,
  ogDescription: () => shareDescription.value,
  ogType: 'article',
  ogUrl: () => absolute(`/u/${username.value}/${mediaId.value}`),
  // The poster, always present on a media row worth showing. Unlike a profile
  // link, this card never has to fall back to no image.
  ogImage: () => media.value?.coverImageUrl ?? undefined,
  twitterCard: 'summary_large_image',
})

const shareState = ref<'idle' | 'copied' | 'failed'>('idle')

async function shareEntry() {
  const outcome = await share({
    path: `/u/${username.value}/${mediaId.value}`,
    title: shareTitle.value,
  })
  if (outcome === 'dismissed') return
  shareState.value = outcome === 'failed' ? 'failed' : 'copied'
  setTimeout(() => (shareState.value = 'idle'), 2500)
}
</script>

<template>
  <div class="page">
    <UiEmptyState
      v-if="error || !entry"
      :title="t('entry.missing')"
      :description="t('entry.missingBody')"
    >
      <template #action>
        <UiAppButton variant="secondary" @click="navigateTo('/')">
          {{ t('entry.backHome') }}
        </UiAppButton>
      </template>
    </UiEmptyState>

    <article v-else class="entry">
      <MediaQuickLink :media-id="entry.media.id" :title="entry.media.title" :cover-image-url="entry.media.coverImageUrl" class="entry__art">
        <UiMediaPoster
          sizes="200px"
          :src="entry.media.coverImageUrl"
          :title="entry.media.title"
          :media-type="entry.media.mediaType"
        />
      </MediaQuickLink>

      <div class="entry__body">
        <NuxtLink :to="`/u/${entry.user.username}`" class="entry__who">
          <UiUserAvatar :user="entry.user" size="sm" />
          <span class="entry__name">{{ entry.user.displayName }}</span>
          <UiUserTitle :slug="entry.user.titleSlug" />
        </NuxtLink>

        <h1 class="entry__title">
          <NuxtLink :to="`/media/${entry.media.id}`">{{ entry.media.title }}</NuxtLink>
          <span v-if="releaseYear(entry.media.releaseDate)" class="entry__year">
            {{ releaseYear(entry.media.releaseDate) }}
          </span>
        </h1>

        <div v-if="entry.score != null" class="entry__score">
          <UiStarRating :score="entry.score" />
          <span class="entry__score-text">{{ scoreText }}</span>
        </div>

        <UiSpoilerGuard v-if="review" :spoiler="review.spoiler" class="entry__review">
          <p class="entry__text">{{ review.content }}</p>
        </UiSpoilerGuard>

        <p class="entry__when">{{ t('entry.logged', { ago: relativeTime(entry.createdAt) }) }}</p>

        <div class="entry__actions">
          <UiAppButton variant="primary" @click="shareEntry()">
            {{
              shareState === 'copied'
                ? t('common.copied')
                : shareState === 'failed'
                  ? t('common.copyFailed')
                  : t('entry.share')
            }}
          </UiAppButton>
          <UiAppButton variant="secondary" @click="navigateTo(`/media/${entry.media.id}`)">
            {{ t('entry.openTitle') }}
          </UiAppButton>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
  padding: var(--space-6) var(--space-4);
}

.entry {
  display: flex;
  gap: var(--space-6);
  align-items: flex-start;
}

.entry__art {
  flex-shrink: 0;
  width: 12rem;
  max-width: 34vw;
}

.entry__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.entry__who {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--text-sm);
}

.entry__name {
  font-weight: 600;
  color: var(--text-primary);
}

.entry__title {
  font-size: var(--text-2xl);
  line-height: var(--leading-snug);
}

.entry__title a {
  color: inherit;
  text-decoration: none;
}

.entry__year {
  margin-left: var(--space-2);
  font-size: var(--text-base);
  font-weight: 400;
  color: var(--text-tertiary);
}

.entry__score {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.entry__score-text {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.entry__text {
  white-space: pre-wrap;
  font-size: var(--text-base);
  line-height: var(--leading-relaxed);
}

.entry__when {
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

.entry__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

/* The poster stops being a column and becomes a banner: at this width a
   12rem poster beside text leaves neither enough room. */
@media (max-width: 40rem) {
  .entry {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .entry__who,
  .entry__score,
  .entry__actions {
    justify-content: center;
  }
}
</style>
