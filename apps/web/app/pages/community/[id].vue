<script setup lang="ts">
import { MEDIA_TYPE_LABELS } from '@revy/shared/constants'
import type { DiscussionThread } from '@revy/shared/types'
import { formatRatingCount, relativeTime, releaseYear } from '@revy/shared/utils'

/**
 * A single community (SPEC 14).
 *
 * The mockup's Discussions / Members / About tabs over a media backdrop. The
 * discussions live on the media item, so this and the media page's Discussions
 * tab are two doors into the same room -- this one is the community-first
 * framing, that one is the catalogue-first framing.
 */
const route = useRoute()
const api = useApi()
const auth = useAuthStore()

const mediaId = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAsyncData(
  () => `community:${mediaId.value}`,
  () => api.communities.get(mediaId.value),
  { watch: [mediaId] },
)

const community = computed(() => data.value?.community ?? null)
const media = computed(() => community.value?.media ?? null)

const tab = ref<'discussions' | 'members' | 'about'>('discussions')

const tabs = computed(() => [
  { value: 'discussions', label: 'Discussions', badge: community.value?.threadCount || undefined },
  { value: 'members', label: 'Members', badge: community.value?.memberCount || undefined },
  { value: 'about', label: 'About' },
])

/* ------------------------------------------------------------------ *
 * Membership
 * ------------------------------------------------------------------ */

const joined = ref(false)
const memberCount = ref(0)
const joinPending = ref(false)

watch(
  community,
  (next) => {
    joined.value = next?.joined ?? false
    memberCount.value = next?.memberCount ?? 0
  },
  { immediate: true },
)

async function toggleMembership() {
  if (!auth.isSignedIn) return navigateTo('/signin')
  if (joinPending.value || !media.value) return

  const next = !joined.value
  joinPending.value = true

  // Optimistic: the button is the whole interaction, so it must respond now.
  joined.value = next
  memberCount.value += next ? 1 : -1

  try {
    const result = await api.communities.setMembership(media.value.id, next)
    joined.value = result.joined
    memberCount.value = result.memberCount
  } catch {
    joined.value = !next
    memberCount.value += next ? -1 : 1
  } finally {
    joinPending.value = false
  }
}

/* ------------------------------------------------------------------ *
 * Discussions
 * ------------------------------------------------------------------ */

const threads = ref<DiscussionThread[]>([])
const threadsLoaded = ref(false)
const threadsLoading = ref(false)
const composerOpen = ref(false)

async function loadThreads() {
  if (!media.value) return
  threadsLoading.value = true
  try {
    const page = await api.media.discussions(media.value.id)
    threads.value = page.items
    threadsLoaded.value = true
  } finally {
    threadsLoading.value = false
  }
}

// Discussions are the default tab, so they load with the page rather than
// waiting for an interaction that has already happened.
watch(
  media,
  (next) => {
    if (next && !threadsLoaded.value) loadThreads()
  },
  { immediate: true },
)

useHead(() => ({ title: media.value ? `${media.value.title} community` : 'Community' }))
</script>

<template>
  <div class="page">
    <div v-if="status === 'pending' && !community" class="loading">
      <UiSkeletonBlock width="100%" height="12rem" radius="0" />
      <div class="loading__body">
        <UiSkeletonBlock width="55%" height="1.75rem" />
        <UiSkeletonBlock width="35%" height="0.875rem" />
      </div>
    </div>

    <UiEmptyState
      v-else-if="error || !community || !media"
      title="We couldn't load this community."
    >
      <template #action>
        <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <header class="hero">
        <div class="hero__art">
          <img
            v-if="media.backdropImageUrl"
            :src="media.backdropImageUrl"
            :alt="`${media.title} artwork`"
            class="hero__backdrop"
          />
          <div class="hero__scrim" />
        </div>

        <NuxtLink to="/community" class="hero__back" aria-label="All communities">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </NuxtLink>

        <div class="hero__content">
          <h1 class="hero__title">{{ media.title }}</h1>
          <p class="hero__meta">
            {{ formatRatingCount(memberCount) }}
            {{ memberCount === 1 ? 'member' : 'members' }}
          </p>
        </div>

        <div class="hero__action">
          <UiAppButton
            :variant="joined ? 'secondary' : 'primary'"
            :loading="joinPending"
            @click="toggleMembership"
          >
            {{ joined ? 'Joined' : 'Join' }}
          </UiAppButton>
        </div>
      </header>

      <div class="body">
        <UiTabNav v-model="tab" :tabs="tabs" />

        <!-- Discussions -->
        <section v-if="tab === 'discussions'" class="section">
          <div class="section__actions">
            <UiAppButton
              variant="secondary"
              size="sm"
              @click="auth.isSignedIn ? (composerOpen = true) : navigateTo('/signin')"
            >
              + New Discussion
            </UiAppButton>
          </div>

          <div v-if="threadsLoading" class="section__loading">
            <UiSkeletonBlock v-for="i in 4" :key="i" width="100%" height="3.5rem" />
          </div>

          <UiEmptyState
            v-else-if="threads.length === 0"
            title="Be the first person to start a discussion."
            description="Ask a question, share a theory, or argue about the ending."
          />

          <DiscussionThreadRow
            v-for="thread in threads"
            v-else
            :key="thread.id"
            :thread="thread"
          />
        </section>

        <!-- Members -->
        <section v-else-if="tab === 'members'" class="section">
          <UiEmptyState
            v-if="community.members.length === 0"
            title="No members yet."
            description="Join to be the first."
          />

          <NuxtLink
            v-for="member in community.members"
            v-else
            :key="member.user.id"
            :to="`/u/${member.user.username}`"
            class="member"
          >
            <UiUserAvatar :user="member.user" size="md" />
            <div class="member__text">
              <span class="member__name">{{ member.user.displayName }}</span>
              <span class="member__handle">
                @{{ member.user.username }} · joined {{ relativeTime(member.joinedAt) }}
              </span>
            </div>
          </NuxtLink>
        </section>

        <!-- About -->
        <section v-else class="section">
          <p v-if="media.description" class="about__description">{{ media.description }}</p>
          <p v-else class="about__description about__description--empty">
            No description available for this title yet.
          </p>

          <dl class="about__facts">
            <div class="fact">
              <dt class="fact__label">Type</dt>
              <dd class="fact__value">{{ MEDIA_TYPE_LABELS[media.mediaType] }}</dd>
            </div>
            <div v-if="releaseYear(media.releaseDate)" class="fact">
              <dt class="fact__label">Released</dt>
              <dd class="fact__value">{{ releaseYear(media.releaseDate) }}</dd>
            </div>
            <div v-if="media.metadata.genres?.length" class="fact">
              <dt class="fact__label">Genres</dt>
              <dd class="fact__value">{{ media.metadata.genres.join(', ') }}</dd>
            </div>
            <div class="fact">
              <dt class="fact__label">Discussions</dt>
              <dd class="fact__value">{{ community.threadCount }}</dd>
            </div>
          </dl>

          <div class="about__link">
            <UiAppButton variant="secondary" @click="navigateTo(`/media/${media.id}`)">
              Open the media page
            </UiAppButton>
          </div>
        </section>
      </div>

      <DiscussionThreadComposer
        v-if="composerOpen"
        :media-id="media.id"
        :media-title="media.title"
        @close="composerOpen = false"
        @created="(threadId) => navigateTo(`/discussions/${threadId}`)"
      />
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
}

.loading__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-4);
}

.hero {
  position: relative;
}

.hero__art {
  position: relative;
  aspect-ratio: 21 / 9;
  max-height: 16rem;
  overflow: hidden;
  background: var(--surface-raised);
}

.hero__backdrop {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgb(10 10 12 / 0.4) 0%,
    rgb(10 10 12 / 0.1) 40%,
    rgb(10 10 12 / 0.85) 85%,
    var(--surface-base) 100%
  );
}

.hero__back {
  position: absolute;
  top: calc(var(--space-4) + env(safe-area-inset-top, 0px));
  left: var(--space-4);
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-full);
  background: var(--scrim-strong);
}

.hero__back svg {
  width: 1.125rem;
  height: 1.125rem;
}

.hero__content {
  position: absolute;
  inset-inline: var(--space-4);
  bottom: var(--space-3);
}

.hero__title {
  font-size: var(--text-2xl);
}

.hero__meta {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.hero__action {
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-3);
}

.body {
  padding: var(--space-4);
}

.section {
  padding-top: var(--space-5);
}

.section__actions {
  margin-bottom: var(--space-4);
}

.section__loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.member {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.member__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.member__name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.member__handle {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.about__description {
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
}

.about__description--empty {
  color: var(--text-tertiary);
  font-style: italic;
}

.about__facts {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-6);
}

.fact {
  display: flex;
  gap: var(--space-4);
}

.fact__label {
  width: 7rem;
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}

.fact__value {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.about__link {
  margin-top: var(--space-8);
}
</style>
