<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import type { DiscoverSection } from '@revy/shared/types'

/**
 * Discover (SPEC 21).
 *
 * Its own screen, as the revised design has it. It previously lived on the
 * search page's idle state; splitting them means browsing gets a hero and room
 * for full rails, and search is just search.
 */
const api = useApi()

const tab = ref<'all' | 'movie' | 'series' | 'book' | 'game'>('all')

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
  { value: 'book', label: 'Books' },
  { value: 'game', label: 'Games' },
] as const

const type = computed(() => (tab.value === 'all' ? undefined : tab.value))

const { data, status, error, refresh } = await useAsyncData(
  'discover-page',
  () => api.discover.sections(type.value),
  { watch: [type], default: () => ({ sections: [] as DiscoverSection[] }) },
)

const sections = computed(() => data.value?.sections ?? [])

useHead({ title: 'Discover' })
</script>

<template>
  <div class="page">
    <header class="hero">
      <h1 class="hero__title">Discover<br />what moves you.</h1>
      <p class="hero__subtitle">{{ BRAND.tagline }}</p>
    </header>

    <div class="page__tabs">
      <UiTabNav v-model="tab" :tabs="tabs" />
    </div>

    <div class="page__body">
      <div v-if="status === 'pending' && sections.length === 0" class="loading">
        <div v-for="row in 2" :key="row" class="loading__row">
          <UiSkeletonBlock width="40%" height="1.25rem" />
          <div class="loading__rail">
            <UiSkeletonBlock
              v-for="i in 6"
              :key="i"
              width="7.5rem"
              height="11.25rem"
              radius="var(--radius-md)"
            />
          </div>
        </div>
      </div>

      <UiEmptyState
        v-else-if="error"
        icon="⚠️"
        title="We couldn't load Discover."
        description="Something went wrong on our end."
      >
        <template #action>
          <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="sections.length === 0"
        icon="🌱"
        title="Nothing to show yet."
        description="Rate a few things and this fills up with what the community is watching, reading and playing."
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/search')">
            Find something
          </UiAppButton>
        </template>
      </UiEmptyState>

      <DiscoverRail
        v-for="(section, index) in sections"
        v-else
        :key="section.key"
        v-reveal="index"
        :section="section"
      />
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--page-max);
  margin-inline: auto;
}

/*
 * The design opens both Home and Discover with a large statement over
 * artwork. Here it is typographic rather than image-backed: a hero image on a
 * browse screen competes with the posters, which are the actual content.
 */
.hero {
  padding: var(--space-10) var(--space-4) var(--space-8);
}

.hero__title {
  /*
   * Deliberately oversized. The screen shows very few things, so the ones it
   * does show should be unambiguous about what this place is -- which is the
   * whole argument of the design.
   */
  font-size: clamp(2.5rem, 7vw, 4.5rem);
  line-height: 0.98;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

/* The one flourish: a short accent rule under the statement. */
.hero__title::after {
  content: '';
  display: block;
  width: 2.5rem;
  height: 3px;
  margin-top: var(--space-5);
  border-radius: var(--radius-full);
  background: var(--accent);
}

.hero__subtitle {
  margin-top: var(--space-3);
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  color: var(--text-tertiary);
}

.page__tabs {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  padding-inline: var(--space-4);
  background: var(--surface-base);
}

.page__body {
  padding: var(--space-6) var(--space-4) 0;
}

.loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.loading__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.loading__rail {
  display: flex;
  gap: var(--space-3);
  overflow: hidden;
}
</style>
