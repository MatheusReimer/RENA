<script setup lang="ts">
import type { FriendRequest, UserSummary } from '@revy/shared/types'
import { relativeTime } from '@revy/shared/utils'

/**
 * Friends (SPEC 12).
 *
 * Friends, incoming requests and outgoing requests, matching the design's
 * three tabs. Accept and reject happen inline here rather than only on a
 * profile, because responding to a pile of requests is the whole reason to
 * open this screen.
 */
const api = useApi()
const auth = useAuthStore()

const tab = ref<'friends' | 'requests' | 'sent'>('friends')

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
  { value: 'friends', label: 'Friends', badge: friends.value.length || undefined },
  { value: 'requests', label: 'Requests', badge: incoming.value.length || undefined },
  { value: 'sent', label: 'Sent', badge: outgoing.value.length || undefined },
])

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

useHead({ title: 'Friends' })
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1 class="page__title">Friends</h1>
      <UiTabNav v-model="tab" :tabs="tabs" />
    </header>

    <div class="page__body">
      <UiEmptyState
        v-if="!auth.isSignedIn && auth.initialised"
        title="Sign in to see your friends."
        description="Follow people whose taste you trust and their ratings show up in your feed."
      >
        <template #action>
          <UiAppButton variant="primary" @click="navigateTo('/signin')">Sign in</UiAppButton>
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

      <UiEmptyState v-else-if="error" title="We couldn't load your friends.">
        <template #action>
          <UiAppButton variant="secondary" @click="refresh()">Try again</UiAppButton>
        </template>
      </UiEmptyState>

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
            placeholder="Search friends..."
            aria-label="Search friends"
          />
        </div>

        <UiEmptyState
          v-if="friends.length === 0"
          title="Add friends to see what they're watching and reading."
          description="Search for someone by name, or open a profile and send a request."
        >
          <template #action>
            <UiAppButton variant="primary" @click="navigateTo('/search')">
              Find people
            </UiAppButton>
          </template>
        </UiEmptyState>

        <UiEmptyState
          v-else-if="visibleFriends.length === 0"
          :title="`No friends matching &quot;${filter.trim()}&quot;.`"
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
          title="No pending requests."
          description="When someone asks to be your friend, it shows up here."
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
              Accept
            </UiAppButton>
            <UiAppButton
              variant="ghost"
              size="sm"
              :disabled="pendingId === request.id"
              @click="respond(request, 'reject')"
            >
              Reject
            </UiAppButton>
          </div>
        </div>
      </template>

      <!-- Sent requests -->
      <template v-else>
        <UiEmptyState
          v-if="outgoing.length === 0"
          title="No requests waiting on a reply."
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
            Cancel
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
