<script setup lang="ts">
import { BRAND, PAGE_SIZE_DEFAULT } from '@revy/shared/constants'
import type { CommunityScope, CommunitySummary } from '@revy/shared/types'

/**
 * Communities (SPEC 14).
 *
 * Every media item is a community, so there is nothing to create and no
 * directory to curate: a title appears here once people are talking about it,
 * ranked by how recently that happened.
 */
const api = useApi()
const { absolute } = useShareLink()
const auth = useAuthStore()

const { t } = useI18n()

/*
 * Browse first, deliberately.
 *
 * Active was the default and showed 5 of 2,020 titles, because a community
 * only appeared once somebody had started a thread in it. That made the screen
 * read as "there are five communities" when in fact every title is one. Browse
 * is the honest default: the catalogue, most-joined first, joinable on sight.
 */
const tab = ref<CommunityScope>('browse')

const tabs = computed(() => [
  { value: 'browse', label: t('community.tabBrowse') },
  { value: 'active', label: t('community.tabActive') },
  { value: 'friends', label: t('community.tabFriends') },
  { value: 'joined', label: t('community.tabJoined') },
])

/*
 * The typed filter.
 *
 * `query` is what the field holds; `search` is what the fetch watches, and it
 * only catches up 300ms after typing stops. Binding the fetch straight to the
 * field would fire a request per keystroke -- twelve for "Dark Knight", eleven
 * of them already stale by the time they land.
 */
const query = ref('')
const search = ref('')

let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(query, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    search.value = value.trim()
  }, 300)
})

onBeforeUnmount(() => clearTimeout(debounceTimer))

/** Which "nothing here" sentence fits the tab you are looking at. */
const emptyTitle = computed(() => {
  if (tab.value === 'joined') return t('community.emptyJoined')
  if (tab.value === 'friends') return t('community.emptyFriends')
  return t('community.emptyActive')
})

/** Tabs that are about *you*, and so have nothing to show signed out. */
const needsAuth = computed(() => tab.value === 'joined' || tab.value === 'friends')

const page = ref(0)

/*
 * Accumulated across pages rather than replaced.
 *
 * Only Browse pages, so switching tab resets both this and the page number --
 * without that, Active would render whatever Browse had already loaded for the
 * moment before its own fetch resolved.
 */
const extra = ref<CommunitySummary[]>([])

// Both reset paging: a new tab and a new filter each start a different list,
// and keeping the accumulated pages would append the old one's rows to it.
watch([tab, search], () => {
  page.value = 0
  extra.value = []
})

const { data, status, error, refresh } = await useAsyncData(
  'communities',
  async () => {
    if (needsAuth.value && !auth.isSignedIn) {
      return { communities: [] as CommunitySummary[] }
    }
    return api.communities.list(tab.value, 0, search.value || undefined)
  },
  {
    watch: [tab, search],
    default: () => ({ communities: [] as CommunitySummary[] }),
    /*
     * Deep, because the Join button mutates a row in place.
     *
     * Nuxt hands back `data` as a **shallowRef** by default, so assigning
     * `community.joined` changes the object and re-renders nothing. It fails
     * in the most expensive way available: the request fires, the server
     * returns 200, the membership is real, and the button still says Join --
     * so the reader clicks it again. Nothing in the code reads as wrong, which
     * is why this is worth a comment rather than a one-word option.
     */
    deep: true,
  },
)

const communities = computed(() => [...(data.value?.communities ?? []), ...extra.value])

/*
 * Whether another page is worth asking for.
 *
 * Inferred from a full last page rather than from a total count: counting the
 * catalogue on every request to decide whether to draw one button is a scan
 * nobody sees. The cost of guessing wrong is one request that returns nothing.
 */
const canLoadMore = computed(
  () =>
    tab.value === 'browse' &&
    communities.value.length > 0 &&
    // Divisible by the page size means every page so far came back full, so
    // there is probably another. Wrong only on an exact multiple, where it
    // costs one request that returns nothing.
    communities.value.length % PAGE_SIZE_DEFAULT === 0,
)

const loadingMore = ref(false)

async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  try {
    const next = page.value + 1
    const result = await api.communities.list('browse', next, search.value || undefined)
    page.value = next
    extra.value = [...extra.value, ...result.communities]
  } finally {
    loadingMore.value = false
  }
}

/**
 * Joins or leaves without leaving the directory.
 *
 * Optimistic, and reconciled from the server's own count rather than by
 * incrementing ours -- two tabs open on the same title would otherwise drift.
 * On failure the row is put back exactly as it was, because a Join button that
 * silently does nothing is worse than one that visibly fails.
 */
async function toggleMembership(community: CommunitySummary) {
  if (!auth.isSignedIn) return navigateTo('/signin')

  const target = !community.joined
  const before = { joined: community.joined, memberCount: community.memberCount }

  community.joined = target
  community.memberCount = Math.max(0, community.memberCount + (target ? 1 : -1))

  try {
    const result = await api.communities.setMembership(community.media.id, target)
    community.joined = result.joined
    community.memberCount = result.memberCount
  } catch {
    community.joined = before.joined
    community.memberCount = before.memberCount
  }
}

useHead({ title: () => t('nav.community') })
useSeoMeta({
  description: BRAND.description,
  ogTitle: () => `Community · ${BRAND.name}`,
  ogDescription: BRAND.description,
  ogType: 'website',
  ogUrl: () => absolute('/community'),
})
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1 class="page__title">{{ t('community.title') }}</h1>
      <p class="page__subtitle">{{ t('community.subtitle') }}</p>
      <UiTabNav v-model="tab" :tabs="tabs" />

      <div class="search">
        <svg
          class="search__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4.35-4.35" />
        </svg>
        <input
          v-model="query"
          type="search"
          class="search__input"
          :placeholder="t('community.searchPlaceholder')"
          :aria-label="t('community.searchPlaceholder')"
          autocomplete="off"
        />
        <button
          v-if="query"
          type="button"
          class="search__clear"
          :aria-label="t('common.clear')"
          @click="query = ''"
        >
          ×
        </button>
      </div>
    </header>

    <div class="page__body">
      <UiEmptyState
        v-if="needsAuth && !auth.isSignedIn && auth.initialised"
        :title="tab === 'friends' ? t('community.signInFriends') : t('community.signInJoined')"
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/signin')">
            {{ t('common.signIn') }}
          </UiAppButton>
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

      <UiEmptyState v-else-if="error" :title="t('community.loadFailed')">
        <template #action>
          <UiAppButton variant="secondary" @click="refresh()">
            {{ t('common.tryAgain') }}
          </UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="communities.length === 0 && search"
        :title="t('community.emptySearch', { query: search })"
        :description="t('community.emptySearchHint')"
      >
        <template #action>
          <UiAppButton variant="secondary" @click="query = ''">
            {{ t('common.clear') }}
          </UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="communities.length === 0"
        :title="emptyTitle"
        :description="t('community.emptyHint')"
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/discover')">
            {{ t('community.emptyAction') }}
          </UiAppButton>
        </template>
      </UiEmptyState>

      <template v-else>
        <CommunityCard
          v-for="(community, index) in communities"
          :key="community.media.id"
          v-reveal="index"
          :community="community"
          @toggle="toggleMembership(community)"
        />

        <div v-if="canLoadMore" class="more">
          <UiAppButton variant="secondary" :disabled="loadingMore" @click="loadMore()">
            {{ loadingMore ? t('common.loading') : t('common.showMore') }}
          </UiAppButton>
        </div>
      </template>
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

.search {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  background: var(--surface-overlay);
}

.search:focus-within {
  border-color: var(--accent);
}

.search__icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  font-size: var(--text-sm);
  outline: none;
}

/* The browser's own clear affordance, removed in favour of ours -- two
   crosses in one field is worse than either. */
.search__input::-webkit-search-cancel-button {
  display: none;
}

.search__clear {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--radius-full);
  background: none;
  color: var(--text-tertiary);
  font-size: var(--text-base);
  line-height: 1;
  cursor: var(--cursor-hand);
}

.search__clear:hover {
  color: var(--text-primary);
}

.more {
  display: flex;
  justify-content: center;
  padding-block: var(--space-5);
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
