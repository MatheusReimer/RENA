<script setup lang="ts">
import type { CommunitySummary } from '@revy/shared/types'

/**
 * Communities (SPEC 14).
 *
 * Every media item is a community, so there is nothing to create and no
 * directory to curate: a title appears here once people are talking about it,
 * ranked by how recently that happened.
 */
const api = useApi()
const auth = useAuthStore()

const tab = ref<'active' | 'joined'>('active')

const tabs = [
  { value: 'active', label: 'Active' },
  { value: 'joined', label: 'Joined' },
] as const

const { data, status, error, refresh } = await useAsyncData(
  'communities',
  async () => {
    if (tab.value === 'joined' && !auth.isSignedIn) {
      return { communities: [] as CommunitySummary[] }
    }
    return api.communities.list(tab.value)
  },
  { watch: [tab], default: () => ({ communities: [] as CommunitySummary[] }) },
)

const communities = computed(() => data.value?.communities ?? [])

useHead({ title: 'Community' })
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1 class="page__title">Community</h1>
      <p class="page__subtitle">Discuss, share ideas and connect with people.</p>
      <UiTabNav v-model="tab" :tabs="tabs" />
    </header>

    <div class="page__body">
      <UiEmptyState
        v-if="tab === 'joined' && !auth.isSignedIn && auth.initialised"
        icon="👥"
        title="Sign in to see the communities you've joined."
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/signin')">Sign in</UiAppButton>
        </template>
      </UiEmptyState>

      <div v-else-if="status === 'pending'" class="rows">
        <div v-for="i in 4" :key="i" class="row row--skeleton">
          <UiSkeletonBlock width="3.5rem" height="5rem" radius="var(--radius-md)" />
          <div class="row__lines">
            <UiSkeletonBlock width="45%" height="1rem" />
            <UiSkeletonBlock width="30%" height="0.75rem" />
          </div>
        </div>
      </div>

      <UiEmptyState v-else-if="error" icon="⚠️" title="We couldn't load communities.">
        <template #action>
          <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="communities.length === 0"
        icon="💬"
        :title="
          tab === 'joined'
            ? 'You have not joined any communities yet.'
            : 'No conversations yet.'
        "
        description="Open any title and start a discussion — that is all it takes to make one."
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/discover')">
            Find something to talk about
          </UiAppButton>
        </template>
      </UiEmptyState>

      <CommunityCard
        v-for="(community, index) in communities"
        v-else
        :key="community.media.id"
        v-reveal="index"
        :community="community"
      />
    </div>
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

.page__title {
  font-size: var(--text-2xl);
}

.page__subtitle {
  margin-block: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.page__body {
  padding-inline: var(--space-4);
}

.rows {
  display: flex;
  flex-direction: column;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.row--skeleton {
  pointer-events: none;
}

.row__lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}
</style>
