<script setup lang="ts">
import { MEDIA_TYPE_LABELS } from '@revy/shared/constants'
import type { DiscoverSection, MediaSearchResult, UserSummary } from '@revy/shared/types'
import { releaseYear } from '@revy/shared/utils'

/**
 * Search (SPEC 20).
 *
 * Results are grouped by type as SPEC 20 requires, and the query drives the
 * provider abstraction rather than any vendor API (SPEC 49.2).
 */
const api = useApi()
const route = useRoute()
const router = useRouter()

const query = ref(String(route.query.q ?? ''))
const tab = ref<'all' | 'movie' | 'series' | 'book' | 'game' | 'people'>('all')

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
  { value: 'book', label: 'Books' },
  { value: 'game', label: 'Games' },
  { value: 'people', label: 'People' },
] as const

/**
 * Discover rails fill the idle state (SPEC 21).
 *
 * The mockup puts trending and popular on this screen rather than a separate
 * Discover tab, and the navigation has no slot for one -- so browsing and
 * searching share a surface, which is also where someone with nothing typed
 * actually is.
 */
const discoverType = ref<string | undefined>(undefined)

/**
 * Fetched through useAsyncData rather than onMounted so the rails are in the
 * server-rendered HTML. onMounted does not run during SSR, which left the
 * landing state of a main screen painting as skeletons before filling in.
 *
 * It runs even when the page opens with a query, which costs one unused
 * aggregate query -- worth it so clearing the search box reveals the rails
 * instantly rather than flashing a spinner.
 */
const {
  data: discoverData,
  status: discoverStatus,
  error: discoverError,
} = await useAsyncData(
  'discover',
  () => api.discover.sections(discoverType.value),
  { watch: [discoverType], default: () => ({ sections: [] as DiscoverSection[] }) },
)

// Discover is supplementary: a failure here leaves search fully usable.
const discoverSections = computed(() =>
  discoverError.value ? [] : (discoverData.value?.sections ?? []),
)
const discoverLoading = computed(() => discoverStatus.value === 'pending')

const media = ref<MediaSearchResult[]>([])
const people = ref<UserSummary[]>([])
const searching = ref(false)
const searched = ref(false)
const failed = ref(false)

/**
 * Debounced search.
 *
 * 300ms is long enough that typing "interstellar" is one provider request
 * rather than twelve, and short enough to feel immediate.
 */
let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(query, (value) => {
  clearTimeout(debounceTimer)
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    media.value = []
    people.value = []
    searched.value = false
    return
  }

  debounceTimer = setTimeout(() => runSearch(trimmed), 300)
})

// Re-running on tab change lets a type filter narrow the provider call rather
// than filtering results we already paid to fetch. With nothing typed, the tab
// instead re-filters the Discover rails.
watch(tab, () => {
  const trimmed = query.value.trim()
  if (trimmed.length > 0) {
    runSearch(trimmed)
    return
  }
  discoverType.value =
    tab.value === 'all' || tab.value === 'people' ? undefined : tab.value
})

async function runSearch(q: string) {
  searching.value = true
  failed.value = false

  // Keep the URL in sync so a search is shareable and survives a reload.
  router.replace({ query: q ? { q } : {} })

  try {
    const type = tab.value === 'all' || tab.value === 'people' ? undefined : tab.value
    const result = await api.media.search(q, type)
    media.value = result.media
    people.value = result.people
    searched.value = true
  } catch {
    failed.value = true
  } finally {
    searching.value = false
  }
}

/**
 * Opens a result.
 *
 * Provider-only results have no local id yet, so they are resolved into a
 * media row first (SPEC 8) -- this is the moment a catalogue entry becomes
 * something that can be rated.
 */
const opening = ref<string | null>(null)

async function open(result: MediaSearchResult) {
  if (result.id) return navigateTo(`/media/${result.id}`)

  opening.value = result.externalId
  try {
    const { media: resolved } = await api.media.resolve(result.externalId, result.mediaType)
    await navigateTo(`/media/${resolved.id}`)
  } catch {
    failed.value = true
  } finally {
    opening.value = null
  }
}

const visibleMedia = computed(() =>
  tab.value === 'people' ? [] : media.value,
)

const showPeople = computed(() => tab.value === 'all' || tab.value === 'people')

onMounted(() => {
  const initial = query.value.trim()
  if (initial) runSearch(initial)
})

// The Add screen links here with a type preselected.
if (route.query.type && typeof route.query.type === 'string') {
  const preset = route.query.type as typeof tab.value
  if (['movie', 'series', 'book', 'game'].includes(preset)) tab.value = preset
}

useHead({ title: 'Search' })
</script>

<template>
  <div class="page">
    <div class="page__search">
      <div class="searchbar">
        <svg class="searchbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4.35-4.35" />
        </svg>
        <input
          v-model="query"
          type="search"
          class="searchbar__input"
          placeholder="Search for movies, series, books..."
          aria-label="Search"
          autocomplete="off"
        />
        <button
          v-if="query"
          type="button"
          class="searchbar__clear"
          aria-label="Clear search"
          @click="query = ''"
        >
          ×
        </button>
      </div>

      <UiTabNav v-model="tab" :tabs="tabs" />
    </div>

    <div class="page__body">
      <!-- Loading (SPEC 36) -->
      <div v-if="searching && !searched" class="results">
        <div v-for="i in 5" :key="i" class="result result--skeleton">
          <UiSkeletonBlock width="3rem" height="4.5rem" radius="var(--radius-md)" />
          <div class="result__lines">
            <UiSkeletonBlock width="50%" height="1rem" />
            <UiSkeletonBlock width="25%" height="0.75rem" />
          </div>
        </div>
      </div>

      <!-- Error with retry (SPEC 36) -->
      <UiEmptyState
        v-else-if="failed"
        icon="⚠️"
        title="Search is unavailable right now."
        description="The catalogue did not respond. Try again in a moment."
      >
        <template #action>
          <UiAppButton variant="secondary" @click="runSearch(query.trim())">
            Try again
          </UiAppButton>
        </template>
      </UiEmptyState>

      <!-- Idle: browse instead of a blank screen (SPEC 21, 36) -->
      <template v-else-if="!searched && !query.trim()">
        <div v-if="discoverLoading" class="discover-loading">
          <UiSkeletonBlock width="40%" height="1.25rem" />
          <div class="discover-loading__rail">
            <UiSkeletonBlock
              v-for="i in 5"
              :key="i"
              width="7.5rem"
              height="11.25rem"
              radius="var(--radius-md)"
            />
          </div>
        </div>

        <UiEmptyState
          v-else-if="discoverSections.length === 0"
          icon="🔎"
          title="Find movies, series, books and games."
          description="Search the catalogue to rate something, add it to a list, or see what your friends thought."
        />

        <DiscoverRail
          v-for="section in discoverSections"
          v-else
          :key="section.key"
          :section="section"
        />
      </template>

      <!-- No matches (SPEC 37) -->
      <UiEmptyState
        v-else-if="searched && visibleMedia.length === 0 && (!showPeople || people.length === 0)"
        icon="🤷"
        :title="`No results for &quot;${query.trim()}&quot;`"
        description="Try a different spelling, or search by the original title."
      />

      <div v-else class="results">
        <button
          v-for="result in visibleMedia"
          :key="`${result.provider}:${result.externalId}`"
          type="button"
          class="result"
          :disabled="opening === result.externalId"
          @click="open(result)"
        >
          <div class="result__poster">
            <UiMediaPoster
              :src="result.coverImageUrl"
              :title="result.title"
              :media-type="result.mediaType"
            />
          </div>
          <div class="result__text">
            <span class="result__title clamp-2">{{ result.title }}</span>
            <span class="result__meta">
              {{ MEDIA_TYPE_LABELS[result.mediaType] }}
              <template v-if="releaseYear(result.releaseDate)">
                · {{ releaseYear(result.releaseDate) }}
              </template>
            </span>
            <span v-if="result.subtitle" class="result__subtitle clamp-1">
              {{ result.subtitle }}
            </span>
          </div>
          <span v-if="opening === result.externalId" class="result__spinner" aria-label="Opening" />
        </button>

        <template v-if="showPeople && people.length">
          <h2 class="results__heading">People</h2>
          <NuxtLink
            v-for="person in people"
            :key="person.id"
            :to="`/u/${person.username}`"
            class="result result--person"
          >
            <UiUserAvatar :user="person" size="lg" />
            <div class="result__text">
              <span class="result__title">{{ person.displayName }}</span>
              <span class="result__meta">@{{ person.username }}</span>
            </div>
          </NuxtLink>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
}

.page__search {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  padding: var(--space-4) var(--space-4) 0;
  background: var(--surface-base);
}

.searchbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  border-radius: var(--radius-full);
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.searchbar:focus-within {
  border-color: var(--border-strong);
}

.searchbar__icon {
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.searchbar__input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  font-size: var(--text-base);
  color: var(--text-primary);
}

.searchbar__input::placeholder {
  color: var(--text-tertiary);
}

/* The native search-cancel button is unstyleable and inconsistent. */
.searchbar__input::-webkit-search-cancel-button {
  display: none;
}

.searchbar__clear {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--radius-full);
  font-size: var(--text-xl);
  line-height: 1;
  color: var(--text-tertiary);
}

.searchbar__clear:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.page__body {
  padding-inline: var(--space-4);
}

.results {
  display: flex;
  flex-direction: column;
}

.results__heading {
  padding-block: var(--space-5) var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}

.result {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  padding: var(--space-3) 0;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
  transition: opacity var(--duration-fast) var(--ease-out);
}

.result:disabled {
  opacity: 0.5;
}

.result__poster {
  width: 3rem;
  flex-shrink: 0;
}

.result__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.result__title {
  font-size: var(--text-base);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.result__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.result__subtitle {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.result__spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--text-tertiary);
  border-right-color: transparent;
  border-radius: var(--radius-full);
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}

.result--skeleton {
  pointer-events: none;
}

.discover-loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.discover-loading__rail {
  display: flex;
  gap: var(--space-3);
  overflow: hidden;
}

.result__lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}
</style>
