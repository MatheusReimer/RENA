<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import type { Activity, Media, MediaStatus } from '@revy/shared/types'

/**
 * Home feed (SPEC 18).
 *
 * The primary social surface. Two scopes, matching the mockup: For You mixes
 * the viewer's own activity in, Following is friends only (SPEC 13).
 */
const auth = useAuthStore()
const api = useApi()

const scope = ref<'for-you' | 'following'>('for-you')

const tabs = [
  { value: 'for-you', label: 'For You' },
  { value: 'following', label: 'Following' },
] as const

const items = ref<Activity[]>([])
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)

const { status, error, refresh } = await useAsyncData(
  'feed',
  async () => {
    if (!auth.isSignedIn) return { items: [], nextCursor: null }
    const result = await api.feed.get({ scope: scope.value })
    items.value = result.items
    nextCursor.value = result.nextCursor
    return result
  },
  // Switching tabs refetches rather than filtering client-side, because the
  // two scopes are genuinely different queries.
  { watch: [scope] },
)

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const result = await api.feed.get({ scope: scope.value, cursor: nextCursor.value })
    items.value.push(...result.items)
    nextCursor.value = result.nextCursor
  } finally {
    loadingMore.value = false
  }
}

/**
 * "Continue watching / reading", beside the feed on desktop (SPEC 22).
 *
 * Fetched separately from the feed so a slow catalogue query cannot hold up
 * the thing people actually came for.
 */
const { data: currentlyData } = await useAsyncData(
  'home-currently',
  async () => {
    if (!auth.isSignedIn) {
      return { currently: [] as Array<{ status: MediaStatus; media: Media; updatedAt: string }> }
    }
    return api.auth.currently()
  },
  {
    default: () => ({
      currently: [] as Array<{ status: MediaStatus; media: Media; updatedAt: string }>,
    }),
  },
)

const currently = computed(() => currentlyData.value?.currently ?? [])

useHead({ title: 'Home' })
</script>

<template>
  <div class="page">
    <header v-if="auth.isSignedIn" class="hero">
      <h1 class="hero__title">Stories<br />connect us.</h1>
      <p class="hero__subtitle">{{ BRAND.tagline }}</p>
    </header>

    <div class="columns">
      <div class="columns__main">
        <div class="page__tabs">
          <UiTabNav v-model="scope" :tabs="tabs" />
        </div>

    <!-- Signed out: the feed is meaningless without a graph, so say what the
         product is rather than showing an empty list. -->
    <UiEmptyState
      v-if="!auth.isSignedIn && auth.initialised"
      icon="👋"
      title="See what your friends are watching, reading and loving."
      description="Sign in to follow friends, rate what you finish, and keep everything you want to watch in one place."
    >
      <template #action>
        <div class="page__cta">
          <UiAppButton variant="primary" @click="navigateTo('/signup')">
            Create account
          </UiAppButton>
          <UiAppButton variant="ghost" @click="navigateTo('/signin')">Sign in</UiAppButton>
        </div>
      </template>
    </UiEmptyState>

    <!-- Loading (SPEC 36) -->
    <div v-else-if="status === 'pending' && items.length === 0" class="feed">
      <FeedActivitySkeleton v-for="i in 3" :key="i" />
    </div>

    <!-- Error with retry (SPEC 36) -->
    <UiEmptyState
      v-else-if="error"
      icon="⚠️"
      title="We couldn't load your feed."
      description="Something went wrong on our end. Give it another try."
    >
      <template #action>
        <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
      </template>
    </UiEmptyState>

    <!-- Empty (SPEC 37) -->
    <UiEmptyState
      v-else-if="items.length === 0"
      icon="🍿"
      :title="
        scope === 'following'
          ? 'Your friends have not posted yet.'
          : 'Nothing here yet.'
      "
      description="Add friends to see what they're watching and reading, or rate something to start your own history."
    >
      <template #action>
        <UiAppButton variant="primary" @click="navigateTo('/search')">
          Find something to rate
        </UiAppButton>
      </template>
    </UiEmptyState>

    <div v-else class="feed">
      <FeedActivityCard
        v-for="activity in items"
        :key="activity.id"
        :activity="activity"
      />

      <div v-if="nextCursor" class="feed__more">
        <UiAppButton variant="secondary" :loading="loadingMore" @click="loadMore">
          Load more
        </UiAppButton>
      </div>
        </div>
      </div>

      <aside v-if="currently.length" class="columns__side">
        <FeedContinuePanel :entries="currently" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin-inline: auto;
}

.hero {
  padding: var(--space-8) var(--space-4) var(--space-6);
}

.hero__title {
  font-size: clamp(2rem, 6vw, var(--text-4xl));
  line-height: 1.05;
  letter-spacing: var(--tracking-tight);
}

.hero__subtitle {
  margin-top: var(--space-3);
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  color: var(--text-tertiary);
}

/*
 * One column on phones, two from the tablet breakpoint. The side panel comes
 * second in the DOM so the feed is what a screen reader and a narrow screen
 * reach first -- it is the reason the page exists.
 */
.columns {
  display: grid;
  gap: var(--space-8);
}

.columns__main {
  min-width: 0;
}

@media (min-width: 60rem) {
  .columns {
    grid-template-columns: minmax(0, var(--content-max)) 16rem;
    align-items: start;
    padding-inline: var(--space-4);
  }

  .columns__side {
    position: sticky;
    top: var(--space-6);
    padding-top: var(--space-10);
  }
}

.page__tabs {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  padding-inline: var(--space-4);
  background: var(--surface-base);
}

.page__cta {
  display: flex;
  gap: var(--space-2);
}

.feed {
  display: flex;
  flex-direction: column;
}

.feed__more {
  display: grid;
  place-items: center;
  padding: var(--space-6);
}

@media (min-width: 60rem) {
  .page {
    padding-top: var(--space-6);
  }

  .page__tabs {
    top: 0;
    padding-top: var(--space-2);
  }
}
</style>
