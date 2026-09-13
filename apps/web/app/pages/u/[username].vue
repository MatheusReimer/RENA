<script setup lang="ts">
import { MEDIA_STATUS_LABELS } from '@revy/shared/constants'
import { xpProgressRatio } from '@revy/shared/utils'

/**
 * User profile (SPEC 22).
 *
 * Addressed by username so profile links are readable and shareable. Shows the
 * viewer-relative friendship state, which is what decides whether the button
 * says Add, Cancel, Accept or Friends (SPEC 12).
 */
const route = useRoute()
const api = useApi()
const auth = useAuthStore()

const username = computed(() => String(route.params.username))

const { data, status, error, refresh } = await useAsyncData(
  () => `profile:${username.value}`,
  () => api.users.profile(username.value),
  { watch: [username] },
)

const profile = computed(() => data.value?.profile ?? null)
const activity = computed(() => data.value?.activity.items ?? [])
const currently = computed(() => data.value?.currently ?? [])

const tab = ref<'activity' | 'currently'>('activity')

const tabs = [
  { value: 'activity', label: 'Activity' },
  { value: 'currently', label: 'Currently' },
] as const

/**
 * Built here rather than inline in the template: the copy contains an
 * apostrophe, which a Vue attribute expression cannot carry without escaping
 * that TypeScript then fails to parse.
 */
const emptyActivityTitle = computed(() => {
  if (!profile.value) return ''
  return profile.value.isSelf
    ? 'You have not rated anything yet.'
    : `${profile.value.displayName} has not rated anything yet.`
})

/* ------------------------------------------------------------------ *
 * Friendship actions (SPEC 12)
 * ------------------------------------------------------------------ */

const friendPending = ref(false)

/** The single button's label, derived from the viewer-relative state. */
const friendAction = computed(() => {
  const state = profile.value?.friendship
  if (!profile.value || profile.value.isSelf || !state) return null

  switch (state.status) {
    case 'accepted':
      return { label: 'Friends', variant: 'secondary' as const, action: 'remove' as const }
    case 'pending':
      return state.isOutgoing
        ? { label: 'Cancel request', variant: 'secondary' as const, action: 'remove' as const }
        : { label: 'Accept request', variant: 'primary' as const, action: 'accept' as const }
    case 'blocked':
      return null
    default:
      return { label: 'Add friend', variant: 'primary' as const, action: 'add' as const }
  }
})

async function runFriendAction() {
  if (!auth.isSignedIn) return navigateTo('/signin')
  const config = friendAction.value
  if (!config || !profile.value || friendPending.value) return

  friendPending.value = true
  try {
    if (config.action === 'add') {
      await api.friends.sendRequest(profile.value.id)
    } else if (config.action === 'remove') {
      await api.friends.remove(profile.value.id)
    } else {
      const friendshipId = profile.value.friendship?.friendshipId
      if (friendshipId) await api.friends.respond(friendshipId, 'accept')
    }
    await refresh()
  } finally {
    friendPending.value = false
  }
}

useHead(() => ({ title: profile.value?.displayName ?? 'Profile' }))
</script>

<template>
  <div class="page">
    <div v-if="status === 'pending' && !profile" class="loading">
      <UiSkeletonBlock width="6.5rem" height="6.5rem" circle />
      <UiSkeletonBlock width="40%" height="2rem" />
      <UiSkeletonBlock width="25%" height="1rem" />
    </div>

    <UiEmptyState
      v-else-if="error || !profile"
      icon="🔍"
      title="We couldn't find that profile."
      description="The username may have changed, or the account no longer exists."
    >
      <template #action>
        <UiAppButton variant="secondary" @click="navigateTo('/search')">
          Search for people
        </UiAppButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <header class="profile">
        <UiUserAvatar :user="profile" size="xl" ring />

        <h1 class="profile__name">{{ profile.displayName }}</h1>
        <p class="profile__handle">@{{ profile.username }}</p>
        <p v-if="profile.bio" class="profile__bio">{{ profile.bio }}</p>

        <!-- Level progress makes XP legible; the number alone means nothing. -->
        <div class="level">
          <span class="level__label">Level {{ profile.xp.level }}</span>
          <div
            class="level__track"
            role="progressbar"
            :aria-valuenow="profile.xp.currentLevelXp"
            :aria-valuemax="profile.xp.nextLevelXp"
            :aria-label="`Level ${profile.xp.level} progress`"
          >
            <div class="level__fill" :style="{ width: `${xpProgressRatio(profile.xp) * 100}%` }" />
          </div>
          <span class="level__xp">
            {{ profile.xp.currentLevelXp }} / {{ profile.xp.nextLevelXp }} XP
          </span>
        </div>

        <dl class="stats">
          <div class="stat">
            <dt class="stat__label">Ratings</dt>
            <dd class="stat__value">{{ profile.stats.ratingCount }}</dd>
          </div>
          <div class="stat">
            <dt class="stat__label">Reviews</dt>
            <dd class="stat__value">{{ profile.stats.reviewCount }}</dd>
          </div>
          <div class="stat">
            <dt class="stat__label">Friends</dt>
            <dd class="stat__value">{{ profile.stats.friendCount }}</dd>
          </div>
        </dl>

        <div v-if="friendAction" class="profile__action">
          <UiAppButton
            :variant="friendAction.variant"
            :loading="friendPending"
            @click="runFriendAction"
          >
            {{ friendAction.label }}
          </UiAppButton>
        </div>
        <div v-else-if="profile.isSelf" class="profile__action">
          <UiAppButton variant="secondary" @click="auth.signOut()">Sign out</UiAppButton>
        </div>
      </header>

      <div class="body">
        <UiTabNav v-model="tab" :tabs="tabs" />

        <section v-if="tab === 'activity'" class="section">
          <UiEmptyState
            v-if="activity.length === 0"
            icon="🎬"
            :title="emptyActivityTitle"
            :description="
              profile.isSelf
                ? 'Search for something you have watched or read, and give it a score.'
                : undefined
            "
          >
            <template v-if="profile.isSelf" #action>
              <UiAppButton variant="primary" @click="navigateTo('/search')">
                Rate something
              </UiAppButton>
            </template>
          </UiEmptyState>

          <FeedActivityCard v-for="item in activity" v-else :key="item.id" :activity="item" />
        </section>

        <section v-else class="section section--padded">
          <UiEmptyState
            v-if="currently.length === 0"
            icon="📚"
            title="Nothing in progress."
            description="Titles marked as watching or reading show up here."
          />

          <NuxtLink
            v-for="entry in currently"
            v-else
            :key="entry.media.id"
            :to="`/media/${entry.media.id}`"
            class="current"
          >
            <div class="current__poster">
              <UiMediaPoster
                :src="entry.media.coverImageUrl"
                :title="entry.media.title"
                :media-type="entry.media.mediaType"
              />
            </div>
            <div class="current__text">
              <span class="current__status">
                {{ MEDIA_STATUS_LABELS[entry.media.mediaType][entry.status] }}
              </span>
              <span class="current__title clamp-2">{{ entry.media.title }}</span>
            </div>
          </NuxtLink>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-4);
}

.profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-4) var(--space-6);
  text-align: center;
}

.profile__name {
  margin-top: var(--space-3);
  font-size: var(--text-3xl);
}

.profile__handle {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.profile__bio {
  max-width: 26rem;
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.level {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  max-width: 20rem;
  margin-top: var(--space-4);
}

.level__label {
  font-size: var(--text-xs);
  font-weight: 700;
  white-space: nowrap;
  color: var(--text-secondary);
}

.level__track {
  flex: 1;
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--surface-overlay);
  overflow: hidden;
}

.level__fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent);
  transition: width var(--duration-base) var(--ease-out);
}

.level__xp {
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--text-tertiary);
}

.stats {
  display: flex;
  gap: var(--space-8);
  margin-top: var(--space-6);
}

.stat {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-1);
}

.stat__value {
  font-size: var(--text-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat__label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.profile__action {
  margin-top: var(--space-5);
}

.body {
  padding-inline: var(--space-4);
}

.section {
  padding-top: var(--space-2);
}

.section--padded {
  padding-top: var(--space-4);
}

.current {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.current__poster {
  width: 3rem;
  flex-shrink: 0;
}

.current__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.current__status {
  font-size: var(--text-2xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--accent);
}

.current__title {
  font-size: var(--text-base);
  font-weight: 600;
  line-height: var(--leading-snug);
}
</style>
