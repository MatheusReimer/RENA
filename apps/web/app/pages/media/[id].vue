<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import type {
  CommunityMember,
  DiscussionThread,
  MediaCredit,
  MediaStatus,
  MediaType,
  Presence,
  Review,
} from '@revy/shared/types'
import {
  formatAverage,
  formatRatingCount,
  formatRuntime,
  isReleased,
  relativeTime,
  releaseYear,
} from '@revy/shared/utils'

/**
 * Media detail (SPEC 19).
 *
 * Ordered exactly as SPEC 19 prioritises: the media itself, then the viewer's
 * own rating and status, then friends, then community and reviews, with the
 * aggregate score alongside.
 */
const route = useRoute()
const api = useApi()
const notice = useNotice()
const { absolute } = useShareLink()
const auth = useAuthStore()
const { locale, t } = useI18n()

const mediaId = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAsyncData(
  () => `media:${mediaId.value}`,
  () => api.media.getById(mediaId.value),
  { watch: [mediaId] },
)

const media = computed(() => data.value?.media ?? null)

const tab = ref<'overview' | 'reviews' | 'discussions' | 'members' | 'friends'>('overview')

/*
 * The tab can be named in the URL.
 *
 * `/community/[id]` used to be a second page over the same threads, and it
 * redirects here now -- which only works if it can say *where* here. It is
 * also the thing you want when linking somebody to an argument about the
 * ending rather than to the top of a catalogue entry.
 */
const TABS = ['overview', 'reviews', 'discussions', 'members', 'friends'] as const

if (TABS.includes(route.query.tab as (typeof TABS)[number])) {
  tab.value = route.query.tab as (typeof TABS)[number]
}

/**
 * Who else here has been through this title.
 *
 * Deliberately not awaited with the page: the media page's own payload is
 * already several queries deep, and this is a panel further down the screen.
 * `lazy` means the page paints first and the panel arrives when it arrives.
 */
const { data: presence, refresh: refreshPresence } = await useAsyncData(
  () => `presence-${route.params.id}`,
  () => api.media.presence(String(route.params.id)),
  // Typed explicitly: an untyped `null` default widens the ref to `{}` and the
  // panel below then refuses every property it needs.
  { lazy: true, default: (): Presence | null => null },
)

const tabs = computed(() => [
  { value: 'overview', label: 'Overview' },
  { value: 'reviews', label: 'Reviews', badge: media.value?.reviewCount || undefined },
  {
    value: 'discussions',
    label: 'Discussions',
    badge: media.value?.discussionCount || undefined,
  },
  { value: 'members', label: 'Members', badge: memberCount.value || undefined },
  { value: 'friends', label: 'Friends', badge: media.value?.friendRatings.length || undefined },
])

/**
 * Cast and crew.
 *
 * `lazy` for the same reason presence is: the page's own payload is already
 * several queries deep, and this is a strip below the fold. It renders
 * nothing at all when a title has no credits -- books and games mostly, until
 * their authors and developers are backfilled.
 */
const { data: creditsData } = await useAsyncData(
  () => `credits:${mediaId.value}`,
  () => api.media.credits(mediaId.value),
  { lazy: true, watch: [mediaId], default: () => ({ credits: [] as MediaCredit[] }) },
)

const credits = computed(() => creditsData.value?.credits ?? [])

/* ------------------------------------------------------------------ *
 * The community, which is this title (SPEC 14)
 *
 * Folded in from `/community/[id]`, which was a second page over the same
 * threads: same `media_id`, same rows, two URLs. Everything that page had and
 * this one did not -- Join, the member count, the member list -- lives here
 * now, and its About tab was this page's Overview under another name.
 * ------------------------------------------------------------------ */

const joined = ref(false)
const memberCount = ref(0)
const joinPending = ref(false)

watch(
  media,
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

/**
 * The member list, fetched when its tab is opened.
 *
 * Unlike the count and the viewer's own membership -- which ride the page
 * payload because the Join button cannot afford to paint wrong -- this is a
 * list behind a tab nobody has clicked yet.
 */
const members = ref<CommunityMember[]>([])
const membersLoaded = ref(false)
const membersLoading = ref(false)

async function loadMembers() {
  if (membersLoading.value || !media.value) return
  membersLoading.value = true
  try {
    const result = await api.communities.get(media.value.id)
    members.value = result.community.members
    membersLoaded.value = true
  } catch (error) {
    notice.fromError(error)
  } finally {
    membersLoading.value = false
  }
}

watch(tab, (next) => {
  if (next === 'members' && !membersLoaded.value) loadMembers()
})

// The tab can arrive already selected from the query, in which case the watch
// above never fires.
onMounted(() => {
  if (tab.value === 'members' && !membersLoaded.value) loadMembers()
})

/** Metadata line: 2024 · Movie · Sci-Fi, Drama · 2h 46m */
const metaLine = computed(() => {
  if (!media.value) return ''
  const parts: string[] = []

  const year = releaseYear(media.value.releaseDate)
  if (year) parts.push(year)

  parts.push(t(`mediaType.${media.value.mediaType}`))

  const genres = media.value.metadata.genres
  if (genres?.length) parts.push(genres.slice(0, 2).join(', '))

  const runtime = formatRuntime(media.value.metadata.runtimeMinutes)
  if (runtime) parts.push(runtime)

  const authors = media.value.metadata.authors
  if (authors?.length) parts.push(authors[0]!)

  return parts.join(' · ')
})

/* ------------------------------------------------------------------ *
 * Rating (SPEC 10)
 * ------------------------------------------------------------------ */

const rateOpen = ref(false)
const draftScore = ref<number | null>(null)
const savingRating = ref(false)
const rateError = ref<string | null>(null)

function openRating() {
  if (!auth.isSignedIn) return navigateTo('/signin')
  draftScore.value = media.value?.viewerState?.score ?? null
  rateError.value = null
  rateOpen.value = true
}

async function saveRating() {
  if (draftScore.value === null || !media.value) return
  savingRating.value = true
  rateError.value = null

  try {
    await api.ratings.upsert(media.value.id, draftScore.value)
    rateOpen.value = false
    await refresh()
  } catch (err) {
    rateError.value = err instanceof ApiError ? err.message : t('media.rateFailed')
  } finally {
    savingRating.value = false
  }
}

/* ------------------------------------------------------------------ *
 * Consumption status (SPEC 9)
 * ------------------------------------------------------------------ */

const savingStatus = ref(false)

/**
 * Whether this is out yet.
 *
 * The catalogue carries titles well before release, and they were collecting
 * ratings -- Avengers: Doomsday had scores on it. The server refuses those
 * now; this is so nobody is offered a control that is going to say no.
 *
 * Planning stays available, because "want to watch" is exactly what somebody
 * on an unreleased title's page came to do.
 */
const released = computed(() => isReleased(media.value?.releaseDate))

const statusOptions = computed<MediaStatus[]>(() =>
  released.value ? ['planned', 'in_progress', 'completed'] : ['planned'],
)

/** The release day, spelled out, for the notice that replaces the controls. */
const releaseLabel = computed(() => {
  const date = media.value?.releaseDate
  if (!date) return ''

  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return releaseYear(date)

  return new Intl.DateTimeFormat(locale.value, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
})

/**
 * Where the viewer is: episode for a series, page for a book.
 *
 * Only offered for types where a position means something and we know the
 * total, because the number is only useful next to a denominator.
 */
const progressDraft = ref<number | null>(null)
const savingProgress = ref(false)

const progressUnit = computed(() => {
  if (!media.value) return null
  if (media.value.mediaType === 'series') {
    return { label: 'Episode', total: media.value.metadata.episodeCount }
  }
  if (media.value.mediaType === 'book') {
    return { label: 'Page', total: media.value.metadata.pageCount }
  }
  return null
})

const showProgress = computed(
  () =>
    auth.isSignedIn &&
    media.value?.viewerState?.status === 'in_progress' &&
    progressUnit.value !== null,
)

watch(
  media,
  (next) => {
    progressDraft.value = next?.viewerState?.progress ?? null
  },
  { immediate: true },
)

async function saveProgress() {
  if (!media.value || savingProgress.value) return
  savingProgress.value = true
  try {
    await api.ratings.setStatus(media.value.id, 'in_progress', progressDraft.value ?? 0)
    await refresh()
  } catch (error) {
    notice.fromError(error)
  } finally {
    savingProgress.value = false
  }
}

async function setStatus(next: MediaStatus) {
  if (!auth.isSignedIn) return navigateTo('/signin')
  if (!media.value || savingStatus.value) return

  savingStatus.value = true
  try {
    // Tapping the active status clears it, so there is no separate "remove".
    const value = media.value.viewerState?.status === next ? null : next
    await api.ratings.setStatus(media.value.id, value)
    // The presence panel counts the viewer out of its own figures, so marking
    // something finished changes what it says -- and finishing something is
    // exactly the moment somebody looks at it.
    await Promise.all([refresh(), refreshPresence()])
  } catch (error) {
    notice.fromError(error)
  } finally {
    savingStatus.value = false
  }
}

/* ------------------------------------------------------------------ *
 * Reviews (SPEC 11)
 * ------------------------------------------------------------------ */

const reviews = ref<Review[]>([])
const reviewsLoaded = ref(false)
const reviewsLoading = ref(false)

const composeOpen = ref(false)

/* ------------------------------------------------------------------ *
 * Lists (SPEC 15)
 * ------------------------------------------------------------------ */

const addToListOpen = ref(false)

function openAddToList() {
  if (!auth.isSignedIn) return navigateTo('/signin')
  addToListOpen.value = true
}

/* ------------------------------------------------------------------ *
 * Discussions (SPEC 14)
 * ------------------------------------------------------------------ */

const threads = ref<DiscussionThread[]>([])
const threadsLoaded = ref(false)
const threadsLoading = ref(false)
const threadComposerOpen = ref(false)

async function loadThreads() {
  if (!media.value) return
  threadsLoading.value = true
  try {
    const page = await api.media.discussions(media.value.id)
    threads.value = page.items
    threadsLoaded.value = true
  } catch (error) {
    notice.fromError(error)
  } finally {
    threadsLoading.value = false
  }
}

/*
 * Both lists load on first visit to their tab rather than with the page, so
 * opening a media item is one request instead of three.
 *
 * `immediate`, and watching `media` as well as `tab`, and both halves were
 * bugs. `tab` is set from `?tab=` synchronously in setup -- above, before this
 * watcher exists -- so a reader arriving *directly* at `?tab=reviews` never
 * triggered it and sat looking at "No reviews yet" on a title that had them.
 * That is the linked case, which is the whole reason the tab is in the URL:
 * every `/community/<id>` redirect lands on `?tab=discussions`, and every
 * shared link to a review lands here too.
 *
 * Watching `media` covers the other order: fire immediately, find the media
 * still resolving, return -- and then run again when it arrives. The
 * `*Loaded` guards make the repeat free.
 */
watch([tab, media], async ([value]) => {
  if (!media.value) return

  if (value === 'reviews' && !reviewsLoaded.value) {
    reviewsLoading.value = true
    try {
      const page = await api.media.reviews(media.value.id)
      reviews.value = page.items
      reviewsLoaded.value = true
    } catch (error) {
      notice.fromError(error)
    } finally {
      reviewsLoading.value = false
    }
    return
  }

  if (value === 'discussions' && !threadsLoaded.value) {
    await loadThreads()
  }
}, { immediate: true })

/*
 * A shared media link (SPEC 19).
 *
 * The other URL people paste. Unlike a profile this one always has artwork, so
 * the card is worth having: a poster, the title, and what this community
 * scored it -- which is the thing we know that IMDb does not.
 */
/*
 * The Open Graph type per media kind.
 *
 * This was `video.other` for everything, which told Facebook a Dostoevsky
 * novel was a video. The type drives which extra properties a consumer looks
 * for and how the card is laid out, so a wrong one is a worse card, not just a
 * wrong label.
 *
 * Games get `website`: Open Graph has no game type, and `article` -- the usual
 * reflex -- claims a byline and a publish date this page does not have.
 */
// `as const` so the values stay literals: `useSeoMeta` types `ogType` as a
// union of the valid Open Graph types, and a widened `string` is rejected.
const OG_TYPES = {
  movie: 'video.movie',
  series: 'video.tv_show',
  book: 'book',
  game: 'website',
} as const satisfies Record<MediaType, string>

useSeoMeta({
  title: () => (media.value ? `${media.value.title} · ${BRAND.name}` : BRAND.name),
  description: () => media.value?.description || BRAND.description,
  ogTitle: () => media.value?.title ?? BRAND.name,
  ogDescription: () => media.value?.description || BRAND.description,
  ogType: () => OG_TYPES[media.value?.mediaType ?? 'movie'],
  ogUrl: () => (media.value ? absolute(`/media/${media.value.id}`) : undefined),
  ogImage: () => media.value?.backdropImageUrl ?? media.value?.coverImageUrl ?? undefined,
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <div class="page">
    <div v-if="status === 'pending' && !media" class="loading">
      <UiSkeletonBlock width="100%" height="18rem" radius="0" />
      <div class="loading__body">
        <UiSkeletonBlock width="60%" height="2rem" />
        <UiSkeletonBlock width="40%" height="1rem" />
        <UiSkeletonBlock width="100%" height="4rem" />
      </div>
    </div>

    <UiEmptyState
      v-else-if="error || !media"
      :title="t('media.loadFailed')"
      :description="t('media.loadFailedBody')"
    >
      <template #action>
        <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <!-- Hero (SPEC 30: large media artwork) -->
      <header class="hero">
        <div class="hero__art">
          <img
            v-if="media.backdropImageUrl"
            :src="media.backdropImageUrl"
            :alt="`${media.title} artwork`"
            class="hero__backdrop"
            fetchpriority="high"
          />
          <div v-else-if="media.coverImageUrl" class="hero__cover-bg">
            <img :src="media.coverImageUrl" alt="" aria-hidden="true" class="hero__blur" />
            <img :src="media.coverImageUrl" :alt="`${media.title} cover`" class="hero__cover" />
          </div>
          <div class="hero__scrim" />
        </div>

        <button type="button" class="hero__back" aria-label="Go back" @click="$router.back()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 class="hero__title">{{ media.title }}</h1>
      </header>

      <div class="body">
        <p class="meta">{{ metaLine }}</p>

        <!-- Aggregate score (SPEC 19) -->
        <div class="score">
          <!-- Counts up on first view when there is a real number; an unrated
               title keeps the em-dash, which is not something to animate. -->
          <span class="score__value">
            <UiNumberTicker
              v-if="media.ratingSummary.average !== null"
              :value="media.ratingSummary.average"
              :decimals="1"
            />
            <template v-else>{{ formatAverage(media.ratingSummary.average) }}</template>
          </span>
          <div class="score__detail">
            <UiStarRating :score="media.ratingSummary.average" size="lg" />
            <span class="score__count">
              {{
                $t(
                  'common.ratings',
                  { count: formatRatingCount(media.ratingSummary.count) },
                  media.ratingSummary.count,
                )
              }}
            </span>
          </div>
        </div>

        <!-- The viewer's own state comes before everything social (SPEC 19) -->
        <div class="actions">
          <!--
            The beam runs only while the title is unrated. It exists to pull the
            eye to the one thing the viewer has not done; once they have rated,
            the button is a status readout and should stop asking.
          -->
          <!--
            No rating control before release.

            A disabled button with a tooltip would be the usual answer and it
            is the wrong one here: the reason has nothing to do with the
            reader, so there is nothing for them to fix by hovering it. The
            date is the useful thing, so the date is what the space says.
          -->
          <div v-if="released" class="cta" :class="{ 'cta--beamed': !media.viewerState?.score }">
            <UiBorderBeam v-if="!media.viewerState?.score" />
            <UiAppButton variant="primary" size="lg" block @click="openRating">
              <UiStarRating
                v-if="media.viewerState?.score"
                :score="media.viewerState.score"
                size="sm"
              />
              {{
                media.viewerState?.score
                  ? t('media.yourRating', { score: media.viewerState.score.toFixed(1) })
                  : t('media.rateThis')
              }}
            </UiAppButton>
          </div>

          <p v-else class="unreleased">
            <span class="unreleased__mark" aria-hidden="true" />
            {{
              releaseLabel
                ? $t('media.releasesOn', { date: releaseLabel })
                : $t('media.notReleased')
            }}
          </p>

          <UiAppButton variant="secondary" size="lg" @click="openAddToList">
            <span class="actions__plus" aria-hidden="true">+</span>
            {{ media.viewerState?.inListIds.length ? t('media.inYourLists') : t('media.addToList') }}
          </UiAppButton>
        </div>

        <div class="statuses" role="group" aria-label="Your status">
          <button
            v-for="option in statusOptions"
            :key="option"
            type="button"
            class="status-chip"
            :class="{ 'status-chip--active': media.viewerState?.status === option }"
            :disabled="savingStatus"
            :aria-pressed="media.viewerState?.status === option"
            @click="setStatus(option)"
          >
            {{ t(`status.${media.mediaType}_${option}`) }}
          </button>
        </div>

        <div v-if="showProgress && progressUnit" class="progress">
          <label class="progress__label" :for="`progress-${media.id}`">
            {{ progressUnit.label }}
          </label>
          <input
            :id="`progress-${media.id}`"
            v-model.number="progressDraft"
            type="number"
            min="0"
            :max="progressUnit.total ?? 32767"
            class="progress__input"
            @change="saveProgress"
          />
          <span v-if="progressUnit.total" class="progress__total">
            of {{ progressUnit.total }}
          </span>
          <span v-if="savingProgress" class="progress__saving">Saving…</span>
        </div>

        <UiTabNav v-model="tab" :tabs="tabs" class="body__tabs" />

        <!-- Overview -->
        <section v-if="tab === 'overview'" class="section">
          <p v-if="media.description" class="description">{{ media.description }}</p>
          <p v-else class="description description--empty">
            No description available for this title yet.
          </p>

          <!--
            Who made it, as a row of faces.

            This is the way into a person's page, and the reason those pages
            are worth having: "what else has this director done" gets asked
            while looking at a film, not from a search box.
          -->
          <MediaCreditStrip :credits="credits" />

          <!-- Friends (SPEC 19) -->
          <div v-if="media.friendRatings.length" class="friends">
            <h2 class="section__heading">Your friends</h2>
            <NuxtLink
              v-for="friend in media.friendRatings.slice(0, 5)"
              :key="friend.user.id"
              :to="`/u/${friend.user.username}`"
              class="friend"
            >
              <UiUserAvatar :user="friend.user" size="md" />
              <span class="friend__name">{{ friend.user.displayName }}</span>
              <UiStarRating :score="friend.score" size="sm" />
              <span class="friend__score">{{ friend.score?.toFixed(1) }}</span>
            </NuxtLink>
          </div>

          <!--
            Who else here has been through this (SPEC 9, 12).

            Its own request, fired after the page has painted: this sits below
            the description and nobody should wait on it to see what they came
            for. It is also the one panel a signed-out visitor gets the full
            value of, which is why it is not gated.
          -->
          <MediaPresencePanel
            v-if="presence"
            :presence="presence"
            :media-type="media.mediaType"
            :media-title="media.title"
          />
        </section>

        <!-- Reviews (SPEC 11) -->
        <section v-else-if="tab === 'reviews'" class="section">
          <div class="section__actions">
            <UiAppButton
              v-if="!media.viewerState?.hasReview"
              variant="secondary"
              size="sm"
              @click="auth.isSignedIn ? (composeOpen = true) : navigateTo('/signin')"
            >
              {{ t('review.write') }}
            </UiAppButton>
          </div>

          <div v-if="reviewsLoading" class="section__loading">
            <UiSkeletonBlock v-for="i in 3" :key="i" width="100%" height="5rem" />
          </div>

          <UiEmptyState
            v-else-if="reviews.length === 0"
            :title="t('media.noReviews')"
            :description="t('media.noReviewsBody')"
          />

          <MediaReviewCard
            v-for="review in reviews"
            v-else
            :key="review.id"
            :review="review"
          />
        </section>

        <!-- Discussions (SPEC 14) -->
        <section v-else-if="tab === 'discussions'" class="section">
          <div class="section__actions">
            <UiAppButton
              variant="secondary"
              size="sm"
              @click="auth.isSignedIn ? (threadComposerOpen = true) : navigateTo('/signin')"
            >
              Start a discussion
            </UiAppButton>
            <!-- Was "Open community", which led to a second page over these
                 same threads. Joining is what that page was actually for. -->
            <UiAppButton
              :variant="joined ? 'ghost' : 'secondary'"
              size="sm"
              :loading="joinPending"
              @click="toggleMembership"
            >
              {{ joined ? 'Joined' : 'Join' }}
            </UiAppButton>
          </div>

          <div v-if="threadsLoading" class="section__loading">
            <UiSkeletonBlock v-for="i in 3" :key="i" width="100%" height="3.5rem" />
          </div>

          <UiEmptyState
            v-else-if="threads.length === 0"
            :title="t('media.noThreads')"
            :description="t('media.noThreadsBody')"
          />

          <DiscussionThreadRow
            v-for="thread in threads"
            v-else
            :key="thread.id"
            :thread="thread"
          />
        </section>

        <!-- Members (SPEC 14). The people who joined this title. -->
        <section v-else-if="tab === 'members'" class="section">
          <div class="section__actions">
            <UiAppButton
              :variant="joined ? 'ghost' : 'secondary'"
              size="sm"
              :loading="joinPending"
              @click="toggleMembership"
            >
              {{ joined ? 'Joined' : 'Join' }}
            </UiAppButton>
          </div>

          <div v-if="membersLoading" class="section__loading">
            <UiSkeletonBlock v-for="i in 4" :key="i" width="100%" height="3rem" />
          </div>

          <UiEmptyState
            v-else-if="members.length === 0"
            :title="t('media.noMembers')"
            :description="t('media.noMembersBody')"
          />

          <NuxtLink
            v-for="member in members"
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

        <!-- Friends tab -->
        <section v-else class="section">
          <UiEmptyState
            v-if="!auth.isSignedIn"
            title="Sign in to see what your friends thought."
          />
          <UiEmptyState
            v-else-if="media.friendRatings.length === 0"
            :title="t('media.noFriendRatings')"
            :description="t('media.noFriendRatingsBody')"
          />
          <NuxtLink
            v-for="friend in media.friendRatings"
            v-else
            :key="friend.user.id"
            :to="`/u/${friend.user.username}`"
            class="friend"
          >
            <UiUserAvatar :user="friend.user" size="md" />
            <span class="friend__name">{{ friend.user.displayName }}</span>
            <UiStarRating :score="friend.score" size="sm" />
            <span class="friend__score">{{ friend.score?.toFixed(1) }}</span>
          </NuxtLink>
        </section>
      </div>

      <!-- Rating sheet -->
      <MediaRatingSheet
        v-model:open="rateOpen"
        v-model:score="draftScore"
        :title="media.title"
        :saving="savingRating"
        :error="rateError"
        @save="saveRating"
      />

      <!-- Add to list -->
      <ListAddToListSheet
        v-if="addToListOpen"
        :media-id="media.id"
        :media-title="media.title"
        :in-list-ids="media.viewerState?.inListIds ?? []"
        @close="addToListOpen = false"
        @changed="refresh"
      />

      <!-- New discussion -->
      <DiscussionThreadComposer
        v-if="threadComposerOpen"
        :media-id="media.id"
        :media-title="media.title"
        @close="threadComposerOpen = false"
        @created="(threadId) => navigateTo(`/discussions/${threadId}`)"
      />

      <!-- Review composer -->
      <MediaReviewComposer
        v-if="composeOpen"
        :media-id="media.id"
        :media-title="media.title"
        :initial-score="media.viewerState?.score ?? null"
        @close="composeOpen = false"
        @created="
          () => {
            composeOpen = false
            reviewsLoaded = false
            tab = 'reviews'
            refresh()
          }
        "
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

/* ------------------------------------------------------------------ *
 * Hero
 * ------------------------------------------------------------------ */

.hero {
  position: relative;
}

.hero__art {
  position: relative;
  aspect-ratio: 4 / 3;
  max-height: 24rem;
  overflow: hidden;
  background: var(--surface-raised);
}

.hero__backdrop {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Books have no backdrop art. Rather than inventing one, the cover is shown
   over a blurred copy of itself -- honest about the source material. */
.hero__cover-bg {
  position: relative;
  display: grid;
  place-items: center;
  height: 100%;
}

.hero__blur {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(30px) saturate(1.4);
  transform: scale(1.2);
  opacity: 0.5;
}

.hero__cover {
  position: relative;
  height: 80%;
  width: auto;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-float);
}

.hero__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgb(10 10 12 / 0.35) 0%,
    rgb(10 10 12 / 0) 35%,
    rgb(10 10 12 / 0.75) 82%,
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
  color: var(--text-primary);
}

.hero__back svg {
  width: 1.125rem;
  height: 1.125rem;
}

.hero__title {
  position: absolute;
  inset-inline: var(--space-4);
  bottom: var(--space-3);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
}

/* ------------------------------------------------------------------ *
 * Body
 * ------------------------------------------------------------------ */

.body {
  padding: var(--space-4);
}

.meta {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.score {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-block: var(--space-5);
}

.score__value {
  font-size: var(--text-4xl);
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--tracking-tight);
}

.score__detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.score__count {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.actions {
  display: flex;
  gap: var(--space-3);
}

/*
 * Holds the beam a hair outside the button.
 *
 * The 1px padding is the whole trick: the beam fills this box, its own mask
 * covers everything from 1px inwards, and the button sits on top of that mask.
 * What is left visible is a one-pixel ring the light travels around. Without
 * the padding the button would cover the ring exactly.
 */
.cta {
  position: relative;
  flex: 1;
  border-radius: var(--radius-full);
}

.cta--beamed {
  padding: 1px;
}

/*
 * Takes the rating button's place, and its size.
 *
 * Sized like the control it replaces so the row does not reflow between a
 * released title and an upcoming one -- browsing a list of both should not
 * make the page jump.
 */
.unreleased {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  flex: 1;
  margin: 0;
  padding: var(--space-3) var(--space-5);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
  text-align: center;
}

.unreleased__mark {
  width: 0.5rem;
  height: 0.5rem;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  background: var(--accent);
}

.cta :deep(.btn) {
  position: relative;
  z-index: 1;
}

.actions > * {
  flex: 1;
}

.actions__plus {
  font-size: var(--text-lg);
  line-height: 1;
}

.statuses {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.status-chip {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.status-chip:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.status-chip--active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
}

.status-chip:disabled {
  opacity: 0.6;
}

.progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
}

.progress__label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}

.progress__input {
  width: 5rem;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--surface-base);
  color: var(--text-primary);
  font-size: var(--text-input);
  font-variant-numeric: tabular-nums;
}

.progress__input:focus {
  outline: none;
  border-color: var(--border-strong);
}

.progress__total,
.progress__saving {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.body__tabs {
  margin-top: var(--space-6);
}

.section {
  padding-top: var(--space-5);
}

.section__heading {
  margin-bottom: var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}

.section__actions {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.section__loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Carried over from the community page this tab replaces. */
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

.description {
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
}

.description--empty {
  color: var(--text-tertiary);
  font-style: italic;
}

.friends {
  margin-top: var(--space-8);
}

.friend {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.friend__name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 600;
}

.friend__score {
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--star);
}

@media (min-width: 60rem) {
  .hero__art {
    max-height: 28rem;
    border-radius: 0 0 var(--radius-xl) var(--radius-xl);
  }

  .hero__title {
    font-size: var(--text-4xl);
  }
}
</style>
