<script setup lang="ts">
import type { DiscoverSection, MediaSearchResult, UserSummary } from '@revy/shared/types'
import { releaseYear } from '@revy/shared/utils'

/**
 * Search (SPEC 20).
 *
 * Results are grouped by type as SPEC 20 requires, and the query drives the
 * provider abstraction rather than any vendor API (SPEC 49.2).
 */
const api = useApi()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const query = ref(String(route.query.q ?? ''))

const TABS = ['all', 'movie', 'series', 'book', 'game', 'people'] as const
type Tab = (typeof TABS)[number]

/**
 * The tab, taken from the URL (SPEC 20).
 *
 * It used to be a bare `ref('all')`, which meant this screen had exactly one
 * entrance: "Find people" on the friends screen landed here on All, and the
 * reader had to find the People tab themselves to do the thing they had just
 * pressed a button to do. A tab that cannot be linked to is a tab every other
 * screen has to explain in words.
 *
 * Unknown values fall back to All rather than being trusted -- this comes from
 * a URL somebody can type.
 */
function tabFromRoute(): Tab {
  const value = String(route.query.tab ?? '')
  return (TABS as readonly string[]).includes(value) ? (value as Tab) : 'all'
}

const tab = ref<Tab>(tabFromRoute())

// Back and forward should move between tabs, not silently leave the URL
// pointing at one while another is rendered.
watch(() => route.query.tab, () => {
  const next = tabFromRoute()
  if (next !== tab.value) tab.value = next
})

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
  { value: 'book', label: 'Books' },
  { value: 'game', label: 'Games' },
  { value: 'people', label: t('search.people') },
] as const

/**
 * A grid of the catalogue fills the idle state (SPEC 21).
 *
 * The mockup puts trending and popular on this screen rather than a separate
 * Discover tab, and the navigation has no slot for one -- so browsing and
 * searching share a surface, which is also where someone with nothing typed
 * actually is.
 *
 * Driven by the tab, which it was not before: the tabs filtered results and
 * did nothing at all until you had typed something, so on the screen somebody
 * actually lands on, six controls sat there inert. Now they browse.
 */
const discoverType = computed(() =>
  tab.value === 'all' || tab.value === 'people' ? undefined : tab.value,
)

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

/**
 * Every section, flattened into one grid of cards.
 *
 * Flat rather than a stack of titled rows, because the sections are the
 * server's way of assembling a *recommendation* and this screen is not making
 * one -- somebody here is looking for something, and eight headings between
 * them and the catalogue is furniture. Explore is where the editorial cut
 * lives.
 *
 * Deduplicated because the sections overlap by design: a title that is both
 * new and trending is in two of them, and the same poster twice in one grid
 * reads as a bug.
 *
 * A Discover section nests its media one level down and names the score
 * `averageRating`; the card wants a flat object and calls it `ratingAverage`.
 * Mapped here rather than changing either shape, because this is the only
 * screen where the two meet.
 */
const BROWSE_LIMIT = 120

const browseCards = computed(() => {
  const seen = new Set<string>()
  const cards = []

  for (const section of discoverSections.value) {
    for (const item of section.items) {
      if (seen.has(item.media.id)) continue
      seen.add(item.media.id)

      cards.push({
        id: item.media.id,
        mediaType: item.media.mediaType,
        title: item.media.title,
        coverImageUrl: item.media.coverImageUrl,
        releaseYear: releaseYear(item.media.releaseDate),
        ratingAverage: item.averageRating,
        ratingCount: item.ratingCount,
        // Most of the catalogue has no local ratings yet, so without this the
        // grid is a wall of posters with nothing to choose between them.
        externalRating: item.media.metadata.externalRating ?? null,
        blurb: item.media.description,
      })

      if (cards.length >= BROWSE_LIMIT) return cards
    }
  }

  return cards
})

const media = ref<MediaSearchResult[]>([])
const people = ref<UserSummary[]>([])
const searching = ref(false)
const searched = ref(false)
const failed = ref(false)

/**
 * Whether the screen is idle: nothing typed, nothing searched, nothing failed.
 *
 * The browse grid renders outside the results column (see `.page__bleed`), so
 * it can no longer ride the template's `v-else-if` chain and has to state its
 * own condition -- the same thing the chain used to mean by falling through
 * to it.
 */
const idle = computed(
  () => !searching.value && !failed.value && !searched.value && !query.value.trim(),
)

/** The tab's name, so the grid says what it is holding. */
const browseTitle = computed(() =>
  tab.value === 'all' || tab.value === 'people'
    ? 'search.browseTitle'
    : `mediaType.${tab.value}_plural`,
)

/**
 * The grid grows as it is scrolled, rather than arriving whole.
 *
 * The payload is one request either way -- the sections are already in hand.
 * What is paged here is the *rendering*: a hundred and twenty posters in the
 * document on load is a hundred and twenty images decoding at once, on the one
 * screen where the reader's next action is probably to type instead. Two rows
 * past the fold is enough to show what the grid is.
 */
const BROWSE_PAGE = 24

const browseShown = ref(BROWSE_PAGE)
const visibleBrowseCards = computed(() => browseCards.value.slice(0, browseShown.value))
const browseHasMore = computed(() => browseShown.value < browseCards.value.length)

// Back to the top of the set whenever the set itself changes. Without this,
// switching from All to Books after scrolling would open Books at card ninety.
watch([tab, browseCards], () => {
  browseShown.value = BROWSE_PAGE
})

const browseSentinel = ref<HTMLElement | null>(null)

function showMoreBrowse() {
  if (browseHasMore.value) browseShown.value += BROWSE_PAGE
}

/*
 * Scrolling advances the grid; the button below it does the same thing.
 *
 * Both, permanently, rather than the button appearing only when the observer
 * looks broken. That was the first version and it did not survive testing: a
 * browser that delivers one entry and then goes quiet passes the check, so the
 * button withdrew itself and the remaining hundred titles became unreachable.
 * The reader who never needs the button only ever sees it slide past.
 */
useInfiniteScroll(browseSentinel, showMoreBrowse)

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

/*
 * Re-running on tab change lets a type filter narrow the provider call rather
 * than filtering results we already paid to fetch.
 *
 * Only the typed case needs the re-run. With nothing typed the tab drives
 * `discoverType`, which is derived from it rather than assigned to it, and the
 * browse fetch already watches that -- the hand-written assignment that used
 * to live here was the same rule stated twice.
 *
 * Both cases scroll back to the top. Switching tabs replaces everything below
 * the field, and leaving the scroll where it was dropped you into the middle
 * of a set you had not seen the start of -- worse once the grid pages, because
 * the new tab has fewer rows than you were scrolled past and the page would
 * jump on its own.
 */
watch(tab, (value) => {
  const trimmed = query.value.trim()
  if (trimmed.length > 0) runSearch(trimmed)

  /*
   * Mirror the tab into the URL, so the screen can be shared and the back
   * button works. `replace` rather than `push`: flicking through six tabs
   * should not bury the page you arrived from under six history entries.
   */
  if (tabFromRoute() !== value) {
    const next = { ...route.query }
    if (value === 'all') delete next.tab
    else next.tab = value
    void router.replace({ query: next })
  }

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
})

/**
 * Ctrl/Cmd-K focuses this page's field.
 *
 * The shell binds the same shortcut to the field in its bar, and hides that
 * field here -- so without this the combination would work on every screen in
 * the product except the one that is entirely about searching.
 */
const searchField = ref<HTMLInputElement | null>(null)

onMounted(() => {
  function onKey(event: KeyboardEvent) {
    if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    searchField.value?.focus()
    searchField.value?.select()
  }

  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
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

/**
 * Server-renders the results when the page is opened with a query.
 *
 * Previously the first search ran in onMounted, which does not execute during
 * SSR -- so a shared /search?q=dune link arrived empty and filled in only after
 * hydration. Typing still goes through the debounced client path; this covers
 * the one case that has a query before the page exists.
 */
await useAsyncData('search-initial', async () => {
  const initial = query.value.trim()
  if (!initial) return { done: true }

  const searchType = tab.value === 'all' || tab.value === 'people' ? undefined : tab.value
  const result = await api.media.search(initial, searchType)
  media.value = result.media
  people.value = result.people
  searched.value = true
  return { done: true }
})

// The Add screen links here with a type preselected.
if (route.query.type && typeof route.query.type === 'string') {
  const preset = route.query.type as typeof tab.value
  if (['movie', 'series', 'book', 'game'].includes(preset)) tab.value = preset
}

useHead({ title: () => t('nav.search') })
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
          ref="searchField"
          v-model="query"
          type="search"
          class="searchbar__input"
          :placeholder="t('search.placeholder')"
          aria-label="Search"
          autocomplete="off"
        />
        <button
          v-if="query"
          type="button"
          class="searchbar__clear"
          :aria-label="t('search.clear')"
          @click="query = ''"
        >
          ×
        </button>
      </div>

      <UiTabNav v-model="tab" :tabs="tabs" />
    </div>

    <!--
      The browse grid, at the width of the screen rather than the width of the
      results list.

      This was the home page's coverflow, and before that a rail. Both were
      the wrong shape for this screen: they show about five titles and put the
      rest behind a gesture, on the one page in the product where the reader
      arrived wanting to scan. Thirty posters at once is the whole point.

      It sits outside `.page__body` because the results list is a 42rem
      reading column and a grid of posters in that is two columns wide. It
      takes the grid's full-width track instead.
    -->
    <template v-if="idle && tab !== 'people'">
      <div v-if="discoverLoading" class="page__bleed browse-loading">
        <UiSkeletonBlock width="16rem" height="1.5rem" />
        <div class="browse-loading__grid">
          <!-- `height: auto` so the aspect ratio below decides the height:
               the cards are a poster wide and grow with the column, and a
               fixed number here would be right at exactly one window width. -->
          <UiSkeletonBlock
            v-for="i in 12"
            :key="i"
            height="auto"
            radius="var(--radius-md)"
            class="browse-loading__cell"
          />
        </div>
      </div>

      <UiMediaGrid
        v-else-if="browseCards.length"
        class="page__bleed"
        :items="visibleBrowseCards"
        :title="$t(browseTitle)"
        :subtitle="$t('search.browseSub')"
      />

      <!-- Where the next batch is asked for. It has height because a
           zero-height element at the very end of the document can sit below
           the scrollable area and never intersect anything. -->
      <div v-if="browseHasMore" ref="browseSentinel" class="browse-sentinel">
        <UiAppButton variant="secondary" @click="showMoreBrowse">
          {{ $t('common.loadMore') }}
        </UiAppButton>
      </div>
    </template>

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
        :title="t('search.unavailable')"
        description="The catalogue did not respond. Try again in a moment."
      >
        <template #action>
          <UiAppButton variant="secondary" @click="runSearch(query.trim())">
            Try again
          </UiAppButton>
        </template>
      </UiEmptyState>

      <!--
        Idle (SPEC 21, 36). The grid itself is drawn above, outside this
        column; what is left here is the People tab, which has no catalogue to
        browse, and the case where the catalogue gave us nothing.
      -->
      <template v-else-if="idle">
        <UiEmptyState
          v-if="tab === 'people'"
          :title="$t('search.peopleTitle')"
          :description="$t('search.peopleBody')"
        />

        <UiEmptyState
          v-else-if="!discoverLoading && !browseCards.length"
          :title="$t('search.emptyTitle')"
          :description="$t('search.emptyBody')"
        />
      </template>

      <!-- No matches (SPEC 37) -->
      <UiEmptyState
        v-else-if="searched && visibleMedia.length === 0 && (!showPeople || people.length === 0)"
        :title="`No results for &quot;${query.trim()}&quot;`"
        :description="t('search.noMatchBody')"
      />

      <div v-else class="results">
        <h2 v-if="visibleMedia.length" class="results__heading">Top results</h2>

        <button
          v-for="result in visibleMedia"
          :key="`${result.provider}:${result.externalId}`"
          type="button"
          class="result-button"
          :disabled="opening === result.externalId"
          @click="open(result)"
        >
          <SearchResultRow
            :result="result"
            :average-rating="result.averageRating"
            :opening="opening === result.externalId"
          />
        </button>

        <template v-if="showPeople && people.length">
          <h2 class="results__heading">{{ t('search.people') }}</h2>
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
/*
 * A reading column with one escape hatch.
 *
 * Results are a list and want 42rem. The trending rail is artwork and wants
 * the screen. A negative margin cannot do that here -- the page sits inside a
 * layout with a sidebar, so "the whole window" is not a width this element can
 * work out -- but a grid can: the middle track holds the column, the outer
 * tracks absorb whatever is left, and a child that asks for `full` spans all
 * three without knowing how wide any of them are.
 */
.page {
  display: grid;
  grid-template-columns:
    [full-start] minmax(0, 1fr)
    [content-start] minmax(0, var(--content-max))
    [content-end] minmax(0, 1fr)
    [full-end];
}

.page > * {
  grid-column: content;
}

/*
 * Full width, but not to the very edge.
 *
 * The carousel that used to take this track carried its own inner container
 * and padding. The grid does not -- it is a plain grid of tracks, and without
 * this its first and last columns run into the sidebar and the window.
 */
.page__bleed {
  grid-column: full;
  padding-inline: var(--space-6);
}

@media (min-width: 64rem) {
  .page__bleed {
    padding-inline: var(--space-10);
  }
}

/*
 * The field spans the screen; what is in it keeps the column.
 *
 * It is opaque and it is sticky, so once the rail below it is full-bleed a
 * 42rem version of this reads as a hole cut out of the artwork as you scroll.
 * At full width it reads as a second bar under the shell's own, which is what
 * it behaves like.
 */
.page__search {
  grid-column: full;
  position: sticky;
  /* Below the shell's own sticky bar, which is taller than this one and
     outranks it -- pinned at 0 the field scrolled in behind it. The fallback
     covers any shell that does not publish a height. */
  top: var(--shell-bar, 0px);
  z-index: var(--z-sticky);
  padding: var(--space-4) var(--space-4) 0;
  background: var(--surface-base);
}

.page__search > * {
  max-width: var(--content-max);
  margin-inline: auto;
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

.result-button {
  display: block;
  width: 100%;
  text-align: left;
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

/* Sized and spaced like the grid it stands in for, so the page does not jump
   when the payload lands (SPEC 36). */
.browse-loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding-block: var(--space-8) var(--space-10);
}

.browse-loading__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: var(--space-6) var(--space-4);
  overflow: hidden;
}

.browse-loading__cell {
  aspect-ratio: var(--poster-ratio);
}

@media (min-width: 48rem) {
  .browse-loading__grid {
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  }
}

@media (min-width: 64rem) {
  .browse-loading__grid {
    grid-template-columns: repeat(auto-fill, minmax(21rem, 1fr));
    gap: var(--space-8) var(--space-5);
  }
}

/*
 * The trigger for the next batch, and it needs a height.
 *
 * A zero-height element at the very end of the document can come to rest below
 * the scrollable area and never intersect anything, which leaves the grid
 * stuck at its first page with no way to ask for more.
 */
.browse-sentinel {
  grid-column: full;
  display: grid;
  place-items: center;
  min-height: var(--space-8);
  padding-bottom: var(--space-10);
}

.result__lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}
</style>
