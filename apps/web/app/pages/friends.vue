<script setup lang="ts">
import { FEED_PAGE_SIZE_DEFAULT } from '@revy/shared/constants'
import type { Activity, FriendRequest, UserSummary } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'

/**
 * Friends (SPEC 12, 13).
 *
 * Four tabs now: what friends have been rating, then the graph itself --
 * friends, incoming requests, outgoing requests. Accept and reject happen
 * inline here rather than only on a profile, because responding to a pile of
 * requests is the whole reason to open this screen.
 *
 * Ratings leads, and is the default. A screen called Friends that opens on a
 * list of names answers "who are my friends", which is a question nobody has
 * after the first week; opening on what they have been scoring answers "what
 * are my friends into", which is the one worth coming back for. The roster is
 * one tab away and keeps its counter in the tab bar.
 */
const api = useApi()
const auth = useAuthStore()
const { t } = useI18n()

const tab = ref<'ratings' | 'friends' | 'requests' | 'sent'>('ratings')

const { data, status, error, refresh } = await useAsyncData('friends', async () => {
  if (!auth.isSignedIn) {
    return {
      friends: [] as UserSummary[],
      incoming: [] as FriendRequest[],
      outgoing: [] as FriendRequest[],
    }
  }
  return api.friends.list()
})

const friends = computed(() => data.value?.friends ?? [])
const incoming = computed(() => data.value?.incoming ?? [])
const outgoing = computed(() => data.value?.outgoing ?? [])

const tabs = computed(() => [
  { value: 'ratings', label: t('friends.tabRatings') },
  { value: 'friends', label: t('friends.tabFriends'), badge: friends.value.length || undefined },
  { value: 'requests', label: t('friends.tabRequests'), badge: incoming.value.length || undefined },
  { value: 'sent', label: t('friends.tabSent'), badge: outgoing.value.length || undefined },
])

/* ------------------------------------------------------------------ *
 * What friends have been rating (SPEC 13)
 * ------------------------------------------------------------------ */

/*
 * The feed, scoped to friends and narrowed to ratings.
 *
 * `scope: 'following'` rather than 'for-you' because this screen is about
 * other people -- seeing your own scores mixed in would make it a worse
 * version of the home feed. The type filter is applied server-side, so a page
 * of fifteen is fifteen ratings rather than the ratings that happened to be
 * among the last fifteen events.
 */
const ratings = ref<Activity[]>([])
const ratingsCursor = ref<string | null>(null)
const ratingsLoading = ref(false)
const ratingsError = ref(false)
const ratingsLoaded = ref(false)

async function loadRatings(reset = false) {
  if (ratingsLoading.value || !auth.isSignedIn) return
  if (!reset && ratingsLoaded.value && !ratingsCursor.value) return

  ratingsLoading.value = true
  ratingsError.value = false

  try {
    const page = await api.feed.get({
      scope: 'following',
      type: 'rated_media',
      limit: FEED_PAGE_SIZE_DEFAULT,
      ...(reset ? {} : ratingsCursor.value ? { cursor: ratingsCursor.value } : {}),
    })

    // Replacing rather than appending on a reset keeps a refresh from
    // duplicating the first page underneath itself.
    ratings.value = reset ? page.items : [...ratings.value, ...page.items]
    ratingsCursor.value = page.nextCursor
    ratingsLoaded.value = true
  } catch {
    ratingsError.value = true
  } finally {
    ratingsLoading.value = false
  }
}

const ratingsHasMore = computed(() => ratingsCursor.value !== null)

/*
 * Fetched on the client, after mount, rather than in `useAsyncData`.
 *
 * The roster above is server-rendered because the tab counters need it before
 * first paint. This is a list the reader scrolls, and server-rendering the
 * first page of it would put fifteen posters into the HTML document for a
 * screen whose other three tabs do not use them.
 */
onMounted(() => {
  if (auth.isSignedIn) void loadRatings(true)
})

/*
 * Scrolling advances the list, and so does the button below it.
 *
 * Both, permanently -- the same rule `useInfiniteScroll` documents. A browser
 * that delivers one intersection and then goes quiet would otherwise strand
 * the rest of the feed behind a control that had withdrawn itself.
 */
const ratingsSentinel = ref<HTMLElement | null>(null)
useInfiniteScroll(ratingsSentinel, () => {
  if (ratingsHasMore.value && !ratingsLoading.value) void loadRatings()
})

/** Search filters the loaded list; a friend list is small enough for that. */
const filter = ref('')

const visibleFriends = computed(() => {
  const term = filter.value.trim().toLowerCase()
  if (!term) return friends.value
  return friends.value.filter(
    (friend) =>
      friend.displayName.toLowerCase().includes(term) ||
      friend.username.toLowerCase().includes(term),
  )
})

const pendingId = ref<string | null>(null)

async function respond(request: FriendRequest, action: 'accept' | 'reject') {
  if (pendingId.value) return
  pendingId.value = request.id
  try {
    await api.friends.respond(request.id, action)
    await refresh()
  } finally {
    pendingId.value = null
  }
}

async function cancel(request: FriendRequest) {
  if (pendingId.value) return
  pendingId.value = request.id
  try {
    await api.friends.remove(request.user.id)
    await refresh()
  } finally {
    pendingId.value = null
  }
}

useHead(() => ({ title: t('friends.title') }))
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1 class="page__title">{{ $t('friends.title') }}</h1>
      <UiTabNav v-model="tab" :tabs="tabs" />
    </header>

    <div class="page__body">
      <UiEmptyState
        v-if="!auth.isSignedIn && auth.initialised"
        :title="$t('friends.signInTitle')"
        :description="$t('friends.signInBody')"
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/signin')">
            {{ $t('friends.signIn') }}
          </UiAppButton>
        </template>
      </UiEmptyState>

      <div v-else-if="status === 'pending'" class="rows">
        <div v-for="i in 5" :key="i" class="row row--skeleton">
          <UiSkeletonBlock width="2.5rem" height="2.5rem" circle />
          <div class="row__lines">
            <UiSkeletonBlock width="35%" height="0.875rem" />
            <UiSkeletonBlock width="20%" height="0.75rem" />
          </div>
        </div>
      </div>

      <UiEmptyState v-else-if="error" :title="$t('friends.loadFailed')">
        <template #action>
          <UiAppButton variant="secondary" @click="refresh()">{{ $t('friends.tryAgain') }}</UiAppButton>
        </template>
      </UiEmptyState>

      <!-- What friends have been rating -->
      <template v-else-if="tab === 'ratings'">
        <UiEmptyState
          v-if="friends.length === 0"
          :title="$t('friends.noFriendsYet')"
          :description="$t('friends.noFriendsYetBody')"
        >
          <template #action>
            <UiAppButton variant="primary" @click="navigateTo('/search?tab=people')">
              {{ $t('friends.findPeople') }}
            </UiAppButton>
          </template>
        </UiEmptyState>

        <div v-else-if="!ratingsLoaded && ratingsLoading" class="ratings">
          <FeedActivitySkeleton v-for="i in 4" :key="i" />
        </div>

        <UiEmptyState
          v-else-if="ratingsError && ratings.length === 0"
          :title="$t('friends.ratingsFailed')"
        >
          <template #action>
            <UiAppButton variant="secondary" @click="loadRatings(true)">{{ $t('friends.tryAgain') }}</UiAppButton>
          </template>
        </UiEmptyState>

        <UiEmptyState
          v-else-if="ratings.length === 0"
          :title="$t('friends.noRatingsYet')"
          :description="$t('friends.noRatingsYetBody')"
        />

        <div v-else class="ratings">
          <FeedActivityCard
            v-for="activity in ratings"
            :key="activity.id"
            :activity="activity"
          />

          <!--
            The sentinel and the button are the same action. The button is
            rendered unconditionally whenever there is more, never behind a
            check for whether the observer looks healthy.
          -->
          <div v-if="ratingsHasMore" ref="ratingsSentinel" class="ratings__more">
            <UiAppButton
              variant="secondary"
              :loading="ratingsLoading"
              @click="loadRatings()"
            >
              {{ $t('friends.showMore') }}
            </UiAppButton>
          </div>

          <p v-else-if="ratings.length >= 10" class="ratings__end">
            {{ $t('friends.ratingsEnd') }}
          </p>
        </div>
      </template>

      <!-- Friends -->
      <template v-else-if="tab === 'friends'">
        <div v-if="friends.length" class="searchbar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4.35-4.35" />
          </svg>
          <input
            v-model="filter"
            type="search"
            class="searchbar__input"
            :placeholder="$t('friends.searchPlaceholder')"
            :aria-label="$t('friends.searchLabel')"
          />
        </div>

        <UiEmptyState
          v-if="friends.length === 0"
          :title="$t('friends.noneTitle')"
          :description="$t('friends.noneBody')"
        >
          <template #action>
            <UiAppButton variant="primary" @click="navigateTo('/search?tab=people')">
              {{ $t('friends.findPeople') }}
            </UiAppButton>
          </template>
        </UiEmptyState>

        <UiEmptyState
          v-else-if="visibleFriends.length === 0"
          :title="$t('friends.noMatches', { term: filter.trim() })"
        />

        <NuxtLink
          v-for="friend in visibleFriends"
          v-else
          :key="friend.id"
          :to="`/u/${friend.username}`"
          class="row"
        >
          <UiUserAvatar :user="friend" size="md" />
          <div class="row__text">
            <span class="row__name">{{ friend.displayName }}</span>
            <span class="row__handle">@{{ friend.username }}</span>
          </div>
          <svg class="row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </NuxtLink>
      </template>

      <!-- Incoming requests -->
      <template v-else-if="tab === 'requests'">
        <UiEmptyState
          v-if="incoming.length === 0"
          :title="$t('friends.noRequests')"
          :description="$t('friends.noRequestsBody')"
        />

        <div v-for="request in incoming" v-else :key="request.id" class="row">
          <NuxtLink :to="`/u/${request.user.username}`" class="row__link">
            <UiUserAvatar :user="request.user" size="md" />
            <div class="row__text">
              <span class="row__name">{{ request.user.displayName }}</span>
              <span class="row__handle">
                @{{ request.user.username }} · {{ relativeTime(request.createdAt) }}
              </span>
            </div>
          </NuxtLink>

          <div class="row__actions">
            <UiAppButton
              variant="primary"
              size="sm"
              :loading="pendingId === request.id"
              @click="respond(request, 'accept')"
            >
              {{ $t('friends.accept') }}
            </UiAppButton>
            <UiAppButton
              variant="ghost"
              size="sm"
              :disabled="pendingId === request.id"
              @click="respond(request, 'reject')"
            >
              {{ $t('friends.reject') }}
            </UiAppButton>
          </div>
        </div>
      </template>

      <!-- Sent requests -->
      <template v-else>
        <UiEmptyState
          v-if="outgoing.length === 0"
          :title="$t('friends.noSent')"
        />

        <div v-for="request in outgoing" v-else :key="request.id" class="row">
          <NuxtLink :to="`/u/${request.user.username}`" class="row__link">
            <UiUserAvatar :user="request.user" size="md" />
            <div class="row__text">
              <span class="row__name">{{ request.user.displayName }}</span>
              <span class="row__handle">
                @{{ request.user.username }} · sent {{ relativeTime(request.createdAt) }}
              </span>
            </div>
          </NuxtLink>

          <UiAppButton
            variant="secondary"
            size="sm"
            :loading="pendingId === request.id"
            @click="cancel(request)"
          >
            {{ $t('friends.cancel') }}
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
  margin-bottom: var(--space-4);
  font-size: var(--text-2xl);
}

.page__body {
  padding-inline: var(--space-4);
}

.searchbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-block: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-full);
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
}

.searchbar svg {
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

.searchbar__input::-webkit-search-cancel-button {
  display: none;
}

.rows {
  display: flex;
  flex-direction: column;
}

.ratings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-block: var(--space-4);
}

.ratings__more {
  display: flex;
  justify-content: center;
  padding-block: var(--space-4);
}

.ratings__end {
  padding-block: var(--space-4);
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.row__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}

.row__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.row__name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.row__handle {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.row__actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.row__chevron {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--text-tertiary);
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
