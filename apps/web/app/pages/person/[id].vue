<script setup lang="ts">
import { BRAND, CREDIT_ROLE_LABELS } from '@revy/shared/constants'
import { releaseYear } from '@revy/shared/utils'

/**
 * A person, through their work.
 *
 * Deliberately not a community (SPEC 14). A title community works because
 * everybody in it consumed the same object and can argue about the same
 * ending; a director has no such object, so a room about one decays into "who
 * is your favourite" -- and worse, it pulls the conversation off the title
 * pages where it has something to be about. This page is a *way through the
 * catalogue*: here is the body of work, here is what this community made of
 * it, go and talk on the ones you have seen.
 */
const route = useRoute()
const api = useApi()
const { absolute } = useShareLink()

const personId = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAsyncData(
  () => `person:${personId.value}`,
  () => api.people.get(personId.value),
  { watch: [personId] },
)

const person = computed(() => data.value?.person ?? null)

/**
 * What to call them, from what they actually did.
 *
 * `roles` arrives ordered most-defining-first, so somebody who both directed
 * and acted reads as a director -- which is how the title is remembered, and
 * avoids a page headed "Actor" for a career of directing.
 */
const roleLine = computed(() => {
  const roles = person.value?.roles ?? []
  return roles.map((role) => CREDIT_ROLE_LABELS[role]).join(' · ')
})

/** The filmography as cards, newest first. */
const credits = computed(() =>
  (person.value?.credits ?? []).map((credit) => ({
    id: credit.media.id,
    mediaType: credit.media.mediaType,
    title: credit.media.title,
    coverImageUrl: credit.media.coverImageUrl,
    releaseYear: releaseYear(credit.media.releaseDate),
    ratingAverage: credit.ratingAverage,
    ratingCount: credit.ratingCount,
    // A filmography is mostly titles nobody here has rated yet, which is
    // exactly where the provider's number earns its place.
    externalRating: credit.media.metadata.externalRating ?? null,
    blurb: credit.media.description,
  })),
)

useHead(() => ({ title: person.value?.name ?? 'Person' }))
useSeoMeta({
  description: () => person.value?.metadata.biography || BRAND.description,
  ogTitle: () => person.value?.name ?? BRAND.name,
  ogDescription: () => person.value?.metadata.biography || BRAND.description,
  ogType: 'profile',
  ogUrl: () => (person.value ? absolute(`/person/${person.value.id}`) : undefined),
  ogImage: () => person.value?.imageUrl ?? undefined,
  twitterCard: () => (person.value?.imageUrl ? 'summary_large_image' : 'summary'),
})
</script>

<template>
  <div class="page">
    <div v-if="status === 'pending' && !person" class="loading">
      <UiSkeletonBlock width="7rem" height="7rem" circle />
      <UiSkeletonBlock width="16rem" height="1.75rem" />
      <UiSkeletonBlock width="10rem" height="0.875rem" />
    </div>

    <UiEmptyState
      v-else-if="error || !person"
      :title="$t('person.failed')"
      :description="$t('person.failedBody')"
    >
      <template #action>
        <UiAppButton variant="secondary" @click="refresh()">{{ $t('common.tryAgain') }}</UiAppButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <header class="hero">
        <div class="hero__portrait">
          <img v-if="person.imageUrl" :src="person.imageUrl" :alt="person.name" />
          <span v-else class="hero__initials" aria-hidden="true">{{ person.name.slice(0, 1) }}</span>
        </div>

        <div class="hero__text">
          <h1 class="hero__name">{{ person.name }}</h1>
          <p v-if="roleLine" class="hero__roles">{{ roleLine }}</p>
          <p class="hero__count">
            {{ $t('person.credits', { count: person.creditCount }, person.creditCount) }}
          </p>
        </div>
      </header>

      <p v-if="person.metadata.biography" class="bio">{{ person.metadata.biography }}</p>

      <UiMediaGrid
        v-if="credits.length"
        :items="credits"
        :title="$t('person.workTitle')"
        :subtitle="$t('person.workSub', { name: person.name })"
      />

      <UiEmptyState
        v-else
        :title="$t('person.noWork')"
        :description="$t('person.noWorkBody')"
      />
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-8) var(--space-6) var(--space-16);
}

@media (min-width: 64rem) {
  .page {
    padding-inline: var(--space-10);
  }
}

.loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  align-items: flex-start;
}

.hero {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  margin-bottom: var(--space-6);
}

.hero__portrait {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 7rem;
  height: 7rem;
  overflow: hidden;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background: var(--surface-raised);
}

.hero__portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero__initials {
  font-size: var(--text-3xl);
  font-weight: 600;
  color: var(--text-tertiary);
}

.hero__text {
  min-width: 0;
}

.hero__name {
  margin: 0;
  font-size: clamp(var(--text-2xl), 4vw, var(--text-4xl));
  letter-spacing: var(--tracking-tight);
}

.hero__roles {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--accent);
}

.hero__count {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.bio {
  max-width: 48rem;
  margin: 0 0 var(--space-4);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  color: var(--text-secondary);
}
</style>
