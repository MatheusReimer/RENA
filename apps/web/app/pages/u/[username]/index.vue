<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import type { ListSummary } from '@revy/shared/types'
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
const notice = useNotice()
const badgeText = useBadgeText()
const { t } = useI18n()
const { share, absolute } = useShareLink()

/*
 * Sharing the profile.
 *
 * `outcome` drives one line of feedback rather than a toast system, because
 * this is the only place in the product that needs to say "done" after a
 * click. The message clears itself: a confirmation that stays on screen stops
 * reading as a response to what you just did.
 */
const shareOutcome = ref<'copied' | 'failed' | null>(null)
let shareTimer: ReturnType<typeof setTimeout> | null = null

async function shareProfile() {
  if (!profile.value) return

  const result = await share({
    path: `/u/${profile.value.username}`,
    title: profile.value.displayName,
    text: t('profile.shareText', { name: profile.value.displayName }),
  })

  // A native share needs no confirmation -- the sheet was the feedback, and
  // a dismissal is not something to comment on either.
  shareOutcome.value =
    result === 'copied' ? 'copied' : result === 'failed' ? 'failed' : null

  if (shareTimer) clearTimeout(shareTimer)
  if (shareOutcome.value) {
    shareTimer = setTimeout(() => (shareOutcome.value = null), 2500)
  }
}

onBeforeUnmount(() => {
  if (shareTimer) clearTimeout(shareTimer)
})

/**
 * Signing out, with its failure visible.
 *
 * The store deliberately throws rather than clearing local state on a failed
 * request -- the session cookie is httpOnly, so a client that navigated away
 * anyway would be showing a signed-out screen over a live session. So the
 * error has to land somewhere, and this is where.
 */
const signingOut = ref(false)
const signOutFailed = ref(false)

async function runSignOut() {
  signingOut.value = true
  signOutFailed.value = false

  try {
    await auth.signOut()
  } catch {
    signOutFailed.value = true
  } finally {
    signingOut.value = false
  }
}

const username = computed(() => String(route.params.username))

const { data, status, error, refresh } = await useAsyncData(
  () => `profile:${username.value}`,
  () => api.users.profile(username.value),
  { watch: [username] },
)

const profile = computed(() => data.value?.profile ?? null)
const activity = computed(() => data.value?.activity.items ?? [])
const currently = computed(() => data.value?.currently ?? [])

const tab = ref<'activity' | 'currently' | 'lists'>('activity')

const tabs = [
  { value: 'activity', label: 'Activity' },
  { value: 'currently', label: 'Currently' },
  { value: 'lists', label: 'Lists' },
] as const

/**
 * Lists load on first visit to their tab (SPEC 22).
 *
 * The API filters by visibility, so this returns only what the viewer is
 * allowed to see -- a stranger gets the public ones, a friend also gets
 * friends-only, the owner gets everything.
 */
const lists = ref<ListSummary[]>([])
const listsLoaded = ref(false)
const listsLoading = ref(false)

watch(tab, async (value) => {
  if (value !== 'lists' || listsLoaded.value) return
  listsLoading.value = true
  try {
    const result = await api.lists.forUser(username.value)
    lists.value = result.lists
    listsLoaded.value = true
  } catch (error) {
    // A tab that stops loading and shows nothing reads as "no lists", which is
    // a different and wrong answer.
    notice.fromError(error)
  } finally {
    listsLoading.value = false
  }
})

/**
 * Built here rather than inline in the template: the copy contains an
 * apostrophe, which a Vue attribute expression cannot carry without escaping
 * that TypeScript then fails to parse.
 */
const emptyActivityTitle = computed(() => {
  if (!profile.value) return ''
  return profile.value.isSelf
    ? t('profile.noRatings')
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
      return { label: t('profile.friends'), variant: 'secondary' as const, action: 'remove' as const }
    case 'pending':
      return state.isOutgoing
        ? { label: t('profile.cancelRequest'), variant: 'secondary' as const, action: 'remove' as const }
        : { label: t('profile.acceptRequest'), variant: 'primary' as const, action: 'accept' as const }
    case 'blocked':
      return null
    default:
      return { label: t('profile.addFriend'), variant: 'primary' as const, action: 'add' as const }
  }
})

/**
 * Whether to offer a Message button (SPEC 12).
 *
 * Friends only, which is the same rule the server enforces -- so this hides a
 * button that would fail rather than hiding a capability. Never on your own
 * profile.
 */
const canMessage = computed(
  () => auth.messagingEnabled && Boolean(profile.value) && !profile.value!.isSelf &&
    profile.value!.friendship?.status === 'accepted',
)

const messagePending = ref(false)

/**
 * Opens the conversation and goes to it.
 *
 * The server decides which conversation that is: asking for one with this
 * person is idempotent, so pressing this twice lands on the same thread rather
 * than creating a second.
 */
async function openConversation() {
  if (!profile.value || messagePending.value) return
  if (!auth.isSignedIn) return navigateTo('/signin')

  messagePending.value = true
  try {
    const result = await api.conversations.start(profile.value.id)
    await navigateTo(`/messages/${result.conversation.id}`)
  } catch (error) {
    // Messaging is gated on a confirmed address and on being friends, so this
    // is refused often and for reasons the reader can act on.
    notice.fromError(error)
  } finally {
    messagePending.value = false
  }
}

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
  } catch (error) {
    /*
     * The refusal this whole notice system was built for.
     *
     * This was `try`/`finally` with no catch: an unconfirmed address made the
     * request 403, the spinner stopped, the button said "Add friend" exactly
     * as before, and nothing anywhere said why. Indistinguishable from a
     * broken button.
     */
    notice.fromError(error)
  } finally {
    friendPending.value = false
  }
}

/*
 * What a shared profile link looks like when it lands (SPEC 22).
 *
 * `useSeoMeta` rather than `useHead` because these tags have to be in the
 * server-rendered HTML: WhatsApp, Slack and Twitter read the document as
 * fetched and never run the page's JavaScript. The profile data comes from
 * `useAsyncData`, which resolves during SSR, so the values are present in the
 * first response rather than filled in after hydration.
 *
 * The description prefers the bio and falls back to counts, because most
 * profiles have no bio and "142 ratings, 12 reviews" is a better answer to
 * "what is this link" than the product tagline repeated on every card.
 */
const shareDescription = computed(() => {
  const p = profile.value
  if (!p) return BRAND.description
  if (p.bio) return p.bio

  const parts = [
    t('profile.metaRatings', { count: p.stats.ratingCount }),
    t('profile.metaReviews', { count: p.stats.reviewCount }),
  ]
  if (p.title) parts.unshift(badgeText.name(p.title.slug) ?? '')
  return parts.filter(Boolean).join(' · ')
})

useSeoMeta({
  /*
   * The name alone. `titleTemplate` in `app.vue` appends the brand, so adding
   * it here produced "Matheus · RENA · RENA" in the tab and in every bookmark.
   */
  title: () => profile.value?.displayName ?? BRAND.name,
  description: () => shareDescription.value,
  ogTitle: () => (profile.value ? `${profile.value.displayName} (@${profile.value.username})` : BRAND.name),
  ogDescription: () => shareDescription.value,
  ogType: 'profile',
  ogUrl: () => (profile.value ? absolute(`/u/${profile.value.username}`) : undefined),
  /*
   * The avatar, when there is one.
   *
   * Most accounts have none -- the UI draws initials instead -- and there is
   * deliberately no placeholder here: an OG card showing the same generic
   * image for every member is worse than a card with no image, which at least
   * renders compactly. A generated card (name, title, badge, counts) is the
   * right answer and wants its own image endpoint.
   */
  ogImage: () => profile.value?.avatarUrl ?? undefined,
  twitterCard: () => (profile.value?.avatarUrl ? 'summary_large_image' : 'summary'),
})
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
      :title="$t('profile.notFound')"
      :description="$t('profile.notFoundBody')"
    >
      <template #action>
        <UiAppButton variant="secondary" @click="navigateTo('/search?tab=people')">
          {{ $t('profile.searchPeople') }}
        </UiAppButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <header class="profile">
        <UiUserAvatar :user="profile" size="xl" ring />

        <h1 class="profile__name">{{ profile.displayName }}</h1>
        <p class="profile__handle">
          @{{ profile.username }}
          <!-- The title: their rarest badge, in italics after a dash. It is a
               name for what they are here, which a level number is not. -->
          <UiUserTitle :slug="profile.title?.slug" />
        </p>
        <p v-if="profile.bio" class="profile__bio">{{ profile.bio }}</p>

        <!-- Level progress makes XP legible; the number alone means nothing. -->
        <div class="level">
          <span class="level__label">{{ $t('profile.level', { n: profile.xp.level }) }}</span>
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
            <dt class="stat__label">{{ $t('profile.ratings') }}</dt>
            <dd class="stat__value"><UiNumberTicker :value="profile.stats.ratingCount" /></dd>
          </div>
          <div class="stat">
            <dt class="stat__label">{{ $t('profile.reviews') }}</dt>
            <dd class="stat__value"><UiNumberTicker :value="profile.stats.reviewCount" /></dd>
          </div>
          <div class="stat">
            <dt class="stat__label">{{ $t('profile.friendCount') }}</dt>
            <dd class="stat__value"><UiNumberTicker :value="profile.stats.friendCount" /></dd>
          </div>
        </dl>

        <!-- ---------------------------------------------------------- *
             The cabinet (SPEC 17)
             ---------------------------------------------------------- -->
        <section v-if="profile.badges.length" class="badges" :aria-label="`Badges`">
          <h2 class="badges__heading">
            {{ $t('profile.badges') }}
            <span class="badges__count">{{ profile.badges.length }}</span>
          </h2>

          <ul class="badges__grid">
            <li v-for="badge in profile.badges" :key="badge.id" class="badges__item">
              <!-- Native title attribute rather than a tooltip component: this
                   is one line of text on hover and a component for that is a
                   component to maintain. -->
              <UiBadgeMedal
                :badge="badge"
                size="md"
                :title="`${badgeText.textFor(badge).name} — ${badgeText.textFor(badge).description}`"
              />
              <span class="badges__name">{{ badgeText.textFor(badge).name }}</span>
            </li>
          </ul>
        </section>

        <div class="profile__action">
          <!--
            Share is always here, including on your own profile -- which is
            where somebody stands when they want the link. The friend and
            message buttons below are conditional; this one is not.
          -->
          <UiAppButton variant="secondary" @click="shareProfile">
            {{ $t('profile.share') }}
          </UiAppButton>

          <UiAppButton
            v-if="friendAction"
            :variant="friendAction.variant"
            :loading="friendPending"
            @click="runFriendAction"
          >
            {{ friendAction.label }}
          </UiAppButton>

          <UiAppButton
            v-if="canMessage"
            variant="primary"
            :loading="messagePending"
            @click="openConversation"
          >
            {{ $t('profile.message') }}
          </UiAppButton>

          <UiAppButton
            v-if="profile.isSelf"
            variant="secondary"
            :loading="signingOut"
            @click="runSignOut"
          >
            {{ $t('auth.signOut') }}
          </UiAppButton>
        </div>

        <!-- One line, self-clearing. Only for the clipboard path: a native
             share sheet was its own feedback. -->
        <p v-if="shareOutcome" class="profile__note" :class="{ 'profile__note--bad': shareOutcome === 'failed' }" role="status">
          {{ shareOutcome === 'copied' ? $t('profile.copied') : $t('profile.shareFailed') }}
        </p>

        <div v-if="signOutFailed" class="profile__action">
          <!--
            Handled rather than fired and forgotten.

            `@click="auth.signOut()"` left a rejected promise with nobody
            listening, so when the request began failing the button did
            nothing and said nothing -- which is how it stayed broken.
          -->
          <UiAppButton variant="secondary" :loading="signingOut" @click="runSignOut">
            {{ $t('auth.signOut') }}
          </UiAppButton>
          <p v-if="signOutFailed" class="profile__error" role="alert">
            {{ $t('auth.signOutFailed') }}
          </p>
        </div>
      </header>

      <div class="body">
        <UiTabNav v-model="tab" :tabs="tabs" />

        <section v-if="tab === 'activity'" class="section">
          <UiEmptyState
            v-if="activity.length === 0"
            :title="emptyActivityTitle"
            :description="
              profile.isSelf
                ? t('profile.noRatingsBody')
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

        <section v-else-if="tab === 'lists'" class="section section--padded">
          <div v-if="listsLoading" class="lists-loading">
            <UiSkeletonBlock v-for="i in 3" :key="i" width="100%" height="3.5rem" />
          </div>

          <UiEmptyState
            v-else-if="lists.length === 0"
            :title="profile.isSelf ? t('profile.noListsSelf') : t('profile.noListsOther')"
            :description="
              profile.isSelf
                ? t('profile.noListsSelfBody')
                : t('profile.noListsOtherBody')
            "
          >
            <template v-if="profile.isSelf" #action>
              <UiAppButton variant="primary" @click="navigateTo('/lists')">
                Create a list
              </UiAppButton>
            </template>
          </UiEmptyState>

          <ListCard v-for="list in lists" v-else :key="list.id" :list="list" />
        </section>

        <section v-else class="section section--padded">
          <UiEmptyState
            v-if="currently.length === 0"
            title="Nothing in progress."
            :description="t('profile.noCurrentlyBody')"
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
        sizes="48px"
                :src="entry.media.coverImageUrl"
                :title="entry.media.title"
                :media-type="entry.media.mediaType"
              />
            </div>
            <div class="current__text">
              <span class="current__status">
                {{ $t(`status.${entry.media.mediaType}_${entry.status}`) }}
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

.badges {
  margin-top: var(--space-6);
  width: 100%;
}

.badges__heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-normal);
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.badges__count {
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.badges__grid {
  display: grid;
  /* Auto-fit rather than a fixed column count: the cabinet holds one badge on
     day one and twenty-five eventually, and both should look deliberate. */
  grid-template-columns: repeat(auto-fit, minmax(5.5rem, max-content));
  justify-content: center;
  gap: var(--space-4) var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.badges__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  width: 5.5rem;
}

.badges__name {
  font-size: var(--text-2xs);
  line-height: var(--leading-snug);
  text-align: center;
  color: var(--text-secondary);
}

.profile__action {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.profile__note {
  margin: var(--space-3) 0 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.profile__note--bad {
  color: var(--danger);
}

.profile__error {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--danger);
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

.lists-loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
