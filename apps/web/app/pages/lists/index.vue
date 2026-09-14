<script setup lang="ts">
import type { ListSummary } from '@revy/shared/types'

/**
 * My Lists (SPEC 15).
 *
 * The mockup's panel 7: every list the viewer owns, filterable by visibility,
 * with a New List action.
 */
const api = useApi()
const auth = useAuthStore()

const filter = ref<'all' | 'public' | 'friends' | 'private'>('all')

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends' },
  { value: 'private', label: 'Private' },
] as const

const { data, status, error, refresh } = await useAsyncData('my-lists', async () => {
  if (!auth.isSignedIn) return { lists: [] as ListSummary[] }
  return api.lists.mine()
})

const lists = computed(() => data.value?.lists ?? [])

// Filtering client-side: a user's own list count is small, and the request
// already returned every visibility.
const visible = computed(() =>
  filter.value === 'all'
    ? lists.value
    : lists.value.filter((list) => list.visibility === filter.value),
)

const composerOpen = ref(false)

async function onCreated() {
  composerOpen.value = false
  await refresh()
}

useHead({ title: 'My Lists' })
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div class="page__title-row">
        <h1 class="page__title">My Lists</h1>
        <UiAppButton
          v-if="auth.isSignedIn"
          variant="secondary"
          size="sm"
          @click="composerOpen = true"
        >
          + New List
        </UiAppButton>
      </div>
      <UiTabNav v-model="filter" :tabs="tabs" />
    </header>

    <div class="page__body">
      <UiEmptyState
        v-if="!auth.isSignedIn && auth.initialised"
        icon="📚"
        title="Sign in to build your collections."
        description="Keep track of what you want to watch, read and play."
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/signin')">Sign in</UiAppButton>
        </template>
      </UiEmptyState>

      <div v-else-if="status === 'pending'" class="skeletons">
        <div v-for="i in 4" :key="i" class="skeleton-row">
          <div class="skeleton-row__text">
            <UiSkeletonBlock width="45%" height="1rem" />
            <UiSkeletonBlock width="25%" height="0.75rem" />
          </div>
          <UiSkeletonBlock width="3.5rem" height="3rem" radius="var(--radius-sm)" />
        </div>
      </div>

      <UiEmptyState
        v-else-if="error"
        icon="⚠️"
        title="We couldn't load your lists."
      >
        <template #action>
          <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="lists.length === 0"
        icon="📁"
        title="Create your first collection."
        description="Favourites, a watchlist, the books you keep meaning to start — anything you want to keep together."
      >
        <template #action>
          <UiAppButton variant="primary" @click="composerOpen = true">New list</UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="visible.length === 0"
        icon="🔍"
        :title="`No ${filter} lists.`"
        description="Change a list's visibility from its own page."
      />

      <ListCard
        v-for="(list, index) in visible"
        v-else
        :key="list.id"
        v-reveal="index"
        :list="list"
      />
    </div>

    <ListComposer v-if="composerOpen" @close="composerOpen = false" @created="onCreated" />
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

.page__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.page__title {
  font-size: var(--text-2xl);
}

.page__body {
  padding-inline: var(--space-4);
}

.skeletons {
  display: flex;
  flex-direction: column;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.skeleton-row__text {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}
</style>
