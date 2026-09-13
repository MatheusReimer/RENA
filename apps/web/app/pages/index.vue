<script setup lang="ts">
import type { Activity } from '@revy/shared/types'

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

useHead({ title: 'Home' })
</script>

<template>
  <div class="page">
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
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
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
