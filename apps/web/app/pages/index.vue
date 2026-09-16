<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import type { HomeSummary, Media, MediaStatus, MediaType } from '@revy/shared/types'

/**
 * Home: two screens behind one route.
 *
 * A visitor gets the landing page -- an argument for why this place is worth
 * joining. A member gets their feed, immediately, because they have already
 * been argued into it and the feed is what they came back for.
 *
 * These used to be one screen with a `compact` flag on the opener, and the
 * flag was never going to hold: every section either had to work in two very
 * different states or be hidden in one of them, which is two designs wearing
 * one component. Splitting them means each is allowed to be finished.
 *
 * The layout is chosen here rather than in `definePageMeta`, which is static.
 * The session is resolved in `app.vue`, above the layout, so `isSignedIn` is
 * already known by the time this renders -- on the server as well as the
 * client, which is what keeps the two from disagreeing.
 */
definePageMeta({ layout: false })

const auth = useAuthStore()
const api = useApi()
const { absolute } = useShareLink()

/* ------------------------------------------------------------------ *
 * The landing screen
 * ------------------------------------------------------------------ */

const EMPTY_HOME: HomeSummary = {
  trending: [],
  members: [],
  reviews: [],
  titleCount: 0,
  memberCount: 0,
  reviewCount: 0,
  conversationCount: 0,
}

/**
 * Fetched for everyone, including members who will never see it.
 *
 * `useAsyncData` is not conditional -- it has to be called the same way on
 * every render or the keys drift between server and client. The response is a
 * few kilobytes and identical for every visitor, so the cost of a member
 * fetching it is a rounding error against the complexity of not doing so.
 */
const { data: homeData } = await useAsyncData('home-summary', () => api.discover.home(), {
  default: () => EMPTY_HOME,
})

const home = computed<HomeSummary>(() => homeData.value ?? EMPTY_HOME)

/* ------------------------------------------------------------------ *
 * The member dashboard (SPEC 18, 22)
 * ------------------------------------------------------------------ */

/** The trending-reviews filter. Only that row depends on it. */
const reviewFilter = ref<MediaType | null>(null)

const { data: dash, status: dashStatus } = await useAsyncData(
  'dashboard',
  () => (auth.isSignedIn ? api.auth.dashboard(reviewFilter.value ?? undefined) : Promise.resolve(null)),
  // Refetched rather than filtered client-side: the row shows the four
  // most-liked of a *type*, which is a different query, not a subset.
  { watch: [reviewFilter] },
)

/**
 * "Continue exploring", beside the dashboard (SPEC 22).
 *
 * Its own endpoint rather than part of the dashboard payload: it is the one
 * piece here that changes as you use the product, so it can be refetched
 * alone when you finish something.
 */
const { data: currentlyData } = await useAsyncData(
  'home-currently',
  () =>
    auth.isSignedIn
      ? api.auth.currently()
      : Promise.resolve({
          currently: [] as Array<{ status: MediaStatus; media: Media; updatedAt: string }>,
        }),
  {
    default: () => ({
      currently: [] as Array<{ status: MediaStatus; media: Media; updatedAt: string }>,
    }),
  },
)

const continueItems = computed(() =>
  (currentlyData.value?.currently ?? []).map((entry) => ({
    id: entry.media.id,
    title: entry.media.title,
    mediaType: entry.media.mediaType,
    coverImageUrl: entry.media.coverImageUrl,
  })),
)

/*
 * The front door (SPEC 22).
 *
 * The one page whose card is seen by people who have never heard of the
 * product, so it carries the positioning line rather than a screen name. No
 * title for a visitor: `titleTemplate` in `app.vue` renders the brand alone,
 * which is what a landing page should say.
 */
useHead({ title: auth.isSignedIn ? 'Home' : null })
useSeoMeta({
  description: BRAND.description,
  ogTitle: `${BRAND.name} — ${BRAND.tagline}`,
  ogDescription: BRAND.description,
  ogType: 'website',
  ogUrl: () => absolute('/'),
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <NuxtLayout :name="auth.isSignedIn ? 'default' : 'landing'">
    <!-- Signed out: the landing screen. -->
    <template v-if="!auth.isSignedIn">
      <HomeHero :members="home.members" :member-count="home.memberCount" />
      <HomeExploreCards />
      <UiPosterCarousel
        v-if="home.trending.length"
        :items="home.trending"
        :eyebrow="$t('landing.trendingEyebrow', { brand: BRAND.name })"
        :title="$t('landing.trendingTitle')"
        see-all-to="/discover"
      />
      <HomeCommunityBand :reviews="home.reviews" />
      <HomeClosingBand
        :title-count="home.titleCount"
        :member-count="home.memberCount"
        :review-count="home.reviewCount"
        :conversation-count="home.conversationCount"
      />
    </template>

    <!-- Signed in: the dashboard. -->
    <template v-else>
      <DashboardHero :name="auth.user?.displayName.split(' ')[0] ?? 'there'" />

      <div class="board">
        <div class="board__main">
          <DashboardPosterRow
            v-if="continueItems.length"
            :title="$t('dash.continueTitle')"
            :subtitle="$t('dash.continueSub')"
            see-all-to="/lists"
            :items="continueItems"
          />

          <DashboardReviewRow
            v-model="reviewFilter"
            :reviews="dash?.reviews ?? []"
            :loading="dashStatus === 'pending'"
          />

          <!--
            One row per thing they liked, each named after it.

            Rendered in a loop rather than once, because a single row on the
            most recent favourite says the same thing on every visit -- and
            the server now drops any row whose anchor has nothing genuinely
            connected to it, so an empty list here means "nothing to say"
            rather than "not implemented".
          -->
          <DashboardPosterRow
            v-for="row in dash?.recommendations ?? []"
            :key="row.anchor.id"
            :title="$t('recommend.because', { title: row.anchor.title })"
            :subtitle="$t('recommend.becauseSub')"
            :anchor="row.anchor"
            see-all-to="/discover"
            :items="row.items"
          />
        </div>

        <DashboardAside
          v-if="dash"
          class="board__side"
          :activity="dash.activity"
          :friends="dash.friends"
          :popular="dash.popular"
        />
      </div>

      <HomeCommunityBand :reviews="home.reviews" />
    </template>
  </NuxtLayout>
</template>

<style scoped>
/*
 * The main column and the margin.
 *
 * One column until 80rem rather than at the usual 64rem: the side panels are
 * summaries, and squeezed next to a four-card review grid they stop being
 * glanceable. Below that width they fall underneath, which is the right
 * reading order anyway -- what you came for first, context second.
 */
.board {
  display: grid;
  gap: var(--space-6);
  padding-bottom: var(--space-12);
}

@media (min-width: 80rem) {
  .board {
    grid-template-columns: minmax(0, 1fr) 20rem;
    align-items: start;
    gap: var(--space-8);
  }

  .board__side {
    position: sticky;
    top: calc(var(--topbar-height) + var(--space-6));
    padding-top: var(--space-10);
    padding-right: var(--space-8);
  }
}

.board__side {
  padding-inline: var(--space-6);
}

@media (min-width: 80rem) {
  .board__side {
    padding-left: 0;
  }
}
</style>
