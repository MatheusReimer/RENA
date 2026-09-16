<script setup lang="ts">
import { BRAND, MEDIA_TYPES } from '@revy/shared/constants'

/**
 * The app shell: a sidebar on desktop, a tab bar on mobile.
 *
 * This was two layouts. `default` put a horizontal bar across the top of every
 * screen and `dashboard` put a sidebar down the side of the signed-in home
 * page, which meant the navigation changed shape the moment you clicked
 * anything -- the library counts in the margin, the discover-by-type links and
 * the described-request card all existed on exactly one route, and every other
 * screen in the product offered a row of four words instead.
 *
 * So there is one shell now and it is the sidebar. The bar is gone.
 *
 * The one screen that keeps its own shell is the signed-out home page, which
 * is a pitch rather than a workspace: a margin full of "Your library" links
 * means nothing to somebody who has not got one. Everywhere else a visitor
 * sees the same frame a member does, minus the parts that need an account --
 * because the alternative is that signing up rearranges the furniture.
 *
 * SPEC 31 is still explicit that mobile must not be a shrunken desktop, so the
 * rail is not narrowed below 64rem, it is replaced: a fixed bottom tab bar and
 * a compact header, which is also what the Capacitor build ships.
 */
const auth = useAuthStore()
const route = useRoute()
const api = useApi()

/**
 * The library counts, fetched by the shell rather than handed to it.
 *
 * They used to arrive as a prop, which worked while one page rendered this
 * sidebar and stops working the moment eleven do -- every page would have to
 * fetch a payload it does not use so the margin beside it could be right.
 *
 * The layout outlives the pages inside it, so this runs once per session
 * rather than once per navigation, and the shared key means a page that wants
 * the same counts gets them without a second request.
 */
const { data: library } = await useAsyncData(
  'sidebar-library',
  () => (auth.isSignedIn ? api.auth.library() : Promise.resolve(null)),
  { watch: [() => auth.isSignedIn] },
)

/**
 * Primary navigation.
 *
 * `member` items need a session: notifications and a profile are both empty
 * questions for a visitor, and a link to a sign-in wall dressed as a
 * destination is worse than no link.
 */
const NAV_ITEMS = [
  { to: '/', icon: 'home', label: 'nav.home', member: false, tab: true },
  { to: '/search', icon: 'search', label: 'nav.search', member: false, tab: true },
  { to: '/discover', icon: 'discover', label: 'nav.explore', member: false, tab: true },
  { to: '/community', icon: 'community', label: 'nav.community', member: false, tab: true },
  { to: '/activity', icon: 'activity', label: 'nav.notifications', member: true, tab: true },
  /*
   * Friends, in the rail but not the tab bar (SPEC 12, 32).
   *
   * Same reasoning as messages below: the tab bar is full at 360px. The rail
   * has room, and this is where the friend graph has always been reachable
   * from -- the screen existed, it simply had no entry point in the
   * navigation, so the only way to reach it was a link from somewhere else.
   */
  { to: '/friends', icon: 'friends', label: 'nav.friends', member: true, tab: false },
  /*
   * Messages sits in the rail and in the header, but not in the mobile tab bar
   * (SPEC 12, 32).
   *
   * The tab bar already carries five destinations plus a profile at 360px, and
   * a seventh turns every label into an abbreviation. Notifications solved the
   * same problem the same way -- it is a tab *and* a header icon -- so messages
   * follows it into the header, which is one tap from anywhere on mobile
   * without spending a tab on it.
   */
  { to: '/messages', icon: 'messages', label: 'nav.messages', member: true, tab: false },
] as const

const primary = computed(() =>
  NAV_ITEMS.filter((item) => {
    if (item.member && !auth.isSignedIn) return false
    // A deployment with no encryption key cannot carry messages at all, and a
    // link to a feature that answers 503 is worse than no link.
    if (item.to === '/messages' && !auth.messagingEnabled) return false
    return true
  }),
)

/** The tab bar's subset: the rail can afford more rows than 360px of width. */
const tabs = computed(() => primary.value.filter((item) => item.tab))

/**
 * The unread count a nav item should badge, if any.
 *
 * A lookup rather than a chain of `item.to === '...'` comparisons, because the
 * badge is rendered in three places and the version of this that was a
 * comparison had to be edited in all three every time a count was added.
 */
function badgeCount(to: string): number {
  if (to === '/activity') return auth.unreadNotifications
  if (to === '/messages') return auth.unreadMessages
  return 0
}

/**
 * The library links, with their counters.
 *
 * Watchlist, readlist and playlist are one status split by media type -- the
 * model is generic and the labels have always been per-type. They point at
 * Library with a filter rather than at three routes that would each be the
 * same screen.
 */
const libraryLinks = computed(() => {
  const counts = library.value
  return [
    { to: '/lists?status=planned&type=movie', icon: 'lists', label: 'nav.watchlist', count: counts?.watchlist },
    { to: '/lists?status=planned&type=book', icon: 'lists', label: 'nav.readlist', count: counts?.readlist },
    { to: '/lists?status=planned&type=game', icon: 'lists', label: 'nav.playlist', count: counts?.playlist },
    { to: '/lists?tab=reviews', icon: 'activity', label: 'nav.yourReviews', count: counts?.reviews },
    { to: '/lists?tab=liked', icon: 'activity', label: 'nav.liked', count: counts?.liked },
    { to: '/lists?status=completed', icon: 'lists', label: 'nav.history', count: counts?.history },
  ] as const
})

const profileTarget = computed(() => (auth.user ? `/u/${auth.user.username}` : '/signin'))
const profileActive = computed(() => route.path.startsWith('/u/'))

/*
 * Described-request discovery (SPEC 40), offered only when it can answer.
 *
 * The flag is derived server-side from whether an API key is configured, and
 * it is a boolean rather than the key. A deployment without one shows the
 * original promo card and nothing else changes -- which is better than an
 * entry point that opens onto an apology.
 *
 * Read in setup, not inside a computed: `useRuntimeConfig()` must be called
 * while the component instance is active, and a `computed` defers the call to
 * first render, after setup has returned. The value is a build-time constant,
 * so there was never a reason for it to be reactive.
 */
const askEnabled = useRuntimeConfig().public.aiDiscovery
const asking = ref(false)

/*
 * Keeps the badges honest while the app is open (SPEC 23).
 *
 * The session -- and with it both unread counts -- was read exactly once, in
 * `app.vue`, and `load()` returns early once initialised. Client-side
 * navigation does not re-run it, so a friend request arriving while somebody
 * had the app open did not light the dot until they hard-reloaded. The
 * notification was there the whole time; the only broken part was being told
 * about it.
 *
 * The shell is the right home for this: it outlives every page, so one poll
 * covers the whole app rather than each screen arranging its own.
 *
 * A minute, not the four seconds an open conversation uses. Nobody is watching
 * this the way they watch a thread, and `usePolling` already stops entirely
 * while the tab is hidden and catches up the moment it is looked at again --
 * which is when a stale badge would actually be noticed.
 */
const badges = usePolling(() => auth.refreshBadges(), {
  interval: 60_000,
  immediate: false,
})

watch(
  () => auth.isSignedIn,
  (signedIn) => (signedIn ? badges.start() : badges.stop()),
  { immediate: true },
)

function isActive(to: string): boolean {
  const path = to.split('?')[0]!
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

/**
 * The shell's search field. Submitting hands off to the search screen.
 *
 * Hidden on that screen, because it has one of its own. Two search fields on
 * one page, one above the other, is a question about which of them is the real
 * one -- and the page's is: it carries the query in the URL, drives the tabs
 * and keeps its results. This one only ever forwards you there.
 *
 * The shell checks the route rather than the page declaring it, because a page
 * cannot reach into the frame around it and this is the only route it is ever
 * true for. The bar keeps its height either way (`min-height` on `.bar`), so
 * nothing below it shifts.
 */
const showSearch = computed(() => route.path !== '/search')

const term = ref('')

function submitSearch() {
  const value = term.value.trim()
  return navigateTo(value ? { path: '/search', query: { q: value } } : '/search')
}

/**
 * Ctrl/Cmd-K focuses search, as the keycap in the field promises.
 *
 * The hint is printed in the field, so the shortcut has to exist -- a keycap
 * drawn on a control that ignores it is worse than no hint. Bound to the
 * window because the point is to reach the field from anywhere on the page.
 *
 * A no-op on the search screen, where the field above is not rendered. That
 * page binds the same shortcut to its own field, so the combination still
 * reaches a search box everywhere -- which is the whole argument for having
 * it. A shortcut that works on some screens is worse than one that works on
 * none, because the reader has to remember which.
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
</script>

<template>
  <div class="shell">
    <a class="skip" href="#content">{{ $t('nav.skipToContent') }}</a>

    <!-- ---------------------------------------------------------- *
         Sidebar (desktop)
         ---------------------------------------------------------- -->
    <aside class="rail">
      <NuxtLink to="/" class="rail__brand" :aria-label="BRAND.name">
        <LayoutAppLogo size="sm" spaced />
      </NuxtLink>

      <nav class="rail__nav" :aria-label="$t('dash.main')">
        <NuxtLink
          v-for="item in primary"
          :key="item.to"
          :to="item.to"
          class="rail__link"
          :class="{ 'rail__link--active': isActive(item.to) }"
        >
          <LayoutNavIcon :name="item.icon" />
          {{ $t(item.label) }}
          <span v-if="badgeCount(item.to)" class="rail__dot" aria-hidden="true" />
        </NuxtLink>

        <NuxtLink
          v-if="auth.isSignedIn"
          :to="profileTarget"
          class="rail__link"
          :class="{ 'rail__link--active': profileActive }"
        >
          <LayoutNavIcon name="profile" />
          {{ $t('nav.profile') }}
        </NuxtLink>
      </nav>

      <!--
        Members only, and the heading goes with it: "Your library" over six
        links that all lead to a sign-in wall is a promise the screen cannot
        keep.
      -->
      <template v-if="auth.isSignedIn">
        <p class="rail__heading">{{ $t('nav.yourLibrary') }}</p>
        <nav class="rail__nav" :aria-label="$t('nav.yourLibrary')">
          <NuxtLink v-for="item in libraryLinks" :key="item.label" :to="item.to" class="rail__link">
            <LayoutNavIcon :name="item.icon" />
            {{ $t(item.label) }}
            <!-- Absent rather than zero while the payload is in flight: a
                 counter that reads 0 and then jumps to 12 said something false
                 for a moment. -->
            <span v-if="item.count" class="rail__count">{{ item.count }}</span>
          </NuxtLink>
        </nav>
      </template>

      <p class="rail__heading">{{ $t('nav.discover') }}</p>
      <nav class="rail__nav" :aria-label="$t('dash.discoverByType')">
        <NuxtLink
          v-for="mediaType in MEDIA_TYPES"
          :key="mediaType"
          :to="{ path: '/discover', query: { type: mediaType } }"
          class="rail__link"
        >
          <LayoutNavIcon name="discover" />
          {{ $t(`mediaType.${mediaType}_plural`) }}
        </NuxtLink>
      </nav>

      <!--
        The one piece of decoration in the margin became the way in to the one
        feature that answers the question the margin cannot: not "where do I
        go" but "I don't know what I want". It sits at the bottom, where it
        does not compete with navigation, and where you arrive having already
        scrolled past everything that did not appeal.
      -->
      <button v-if="askEnabled" type="button" class="rail__promo rail__promo--action" @click="asking = true">
        <span class="rail__orb" aria-hidden="true" />
        <p>{{ $t('ask.cardTitle') }}</p>
        <span class="rail__cue">{{ $t('ask.cardCue') }}</span>
      </button>

      <div v-else class="rail__promo">
        <span class="rail__orb" aria-hidden="true" />
        <p>{{ $t('ask.promoFallback') }}</p>
      </div>
    </aside>

    <div class="main">
      <header class="bar safe-top">
        <!-- The wordmark rides the bar only where the rail is not there to
             carry it, so the desktop screen does not show it twice. -->
        <NuxtLink to="/" class="bar__brand" :aria-label="BRAND.name">
          <LayoutAppLogo size="sm" />
        </NuxtLink>

        <div v-if="showSearch" class="bar__search">
          <form role="search" @submit.prevent="submitSearch">
            <label class="sr-only" for="shell-search">{{ $t('nav.search') }}</label>
            <LayoutNavIcon name="search" class="bar__search-icon" />
            <input
              id="shell-search"
              ref="searchField"
              v-model="term"
              type="search"
              class="bar__search-input"
              :placeholder="$t('nav.searchPlaceholder')"
              autocomplete="off"
            />
            <kbd class="bar__key" aria-hidden="true">Ctrl K</kbd>
          </form>
        </div>

        <div class="bar__actions">
          <LayoutLanguagePicker />

          <NuxtLink
            v-if="auth.isSignedIn && auth.messagingEnabled"
            to="/messages"
            class="bar__icon"
            :aria-label="
              auth.unreadMessages
                ? `Messages, ${auth.unreadMessages} unread`
                : 'Messages'
            "
          >
            <LayoutNavIcon name="messages" />
            <span v-if="auth.unreadMessages" class="bar__dot" aria-hidden="true" />
          </NuxtLink>

          <NuxtLink
            v-if="auth.isSignedIn"
            to="/activity"
            class="bar__icon"
            :aria-label="
              auth.unreadNotifications
                ? `Notifications, ${auth.unreadNotifications} unread`
                : 'Notifications'
            "
          >
            <LayoutNavIcon name="activity" />
            <span v-if="auth.unreadNotifications" class="bar__dot" aria-hidden="true" />
          </NuxtLink>

          <NuxtLink v-if="auth.user" :to="profileTarget" class="bar__me">
            <UiUserAvatar :user="auth.user" size="sm" />
            <span class="bar__me-name">{{ auth.user.displayName.split(' ')[0] }}</span>
          </NuxtLink>

          <NuxtLink v-else to="/signin" class="bar__signin">{{ $t('nav.signIn') }}</NuxtLink>
        </div>
      </header>

      <!-- Above the content and below the header: it is a standing condition
           of the account, not of the page, so it should not scroll away with
           one screen's content or sit inside the page transition. -->
      <LayoutVerifyEmailBanner />

      <main id="content" class="main__body" tabindex="-1">
        <slot />
      </main>
    </div>

    <!-- Mobile tab bar (SPEC 32) -->
    <nav class="tabbar safe-bottom" :aria-label="$t('dash.main')">
      <NuxtLink
        v-for="item in tabs"
        :key="item.to"
        :to="item.to"
        class="tabbar__link"
        :class="{ 'tabbar__link--active': isActive(item.to) }"
      >
        <span class="tabbar__icon-wrap">
          <LayoutNavIcon :name="item.icon" class="tabbar__icon" />
          <span v-if="badgeCount(item.to)" class="tabbar__dot" aria-hidden="true" />
        </span>
        <span class="tabbar__label">{{ $t(item.label) }}</span>
      </NuxtLink>

      <NuxtLink
        :to="profileTarget"
        class="tabbar__link"
        :class="{ 'tabbar__link--active': profileActive }"
      >
        <span class="tabbar__icon-wrap">
          <LayoutNavIcon name="profile" class="tabbar__icon" />
        </span>
        <span class="tabbar__label">
          {{ auth.isSignedIn ? $t('nav.profile') : $t('nav.signIn') }}
        </span>
      </NuxtLink>
    </nav>

    <!-- Teleports to the body, so it is never clipped by the shell's grid or
         by the sidebar's own scroll container. -->
    <DiscoverAskPanel v-if="askEnabled" v-model="asking" />
  </div>
</template>

<style scoped>
/*
 * One column until there is room for a margin.
 *
 * Below 64rem the sidebar is not shrunk, it is gone -- a 15rem rail of links
 * on a phone is most of the screen. The tab bar takes over there.
 */
.shell {
  /*
   * The bar's height, published for the pages inside it.
   *
   * Two elements can both be `position: sticky; top: 0`, and only one of them
   * is on top. Search pins its own field and tab row, and under this bar --
   * which outranks it, `--z-nav` over `--z-sticky` -- that row scrolled
   * underneath and disappeared. A page has no way to measure the shell around
   * it, so the shell states its height and the page offsets against it.
   */
  --shell-bar: 5.25rem;

  min-height: 100dvh;
  /*
   * Transparent, and stacked above the ambient backdrop.
   *
   * This used to repaint `--surface-base` over the whole viewport, which is
   * what `html` and `body` already do -- harmless until something was put
   * *between* them, at which point the shell was painting over it. The
   * `z-index` is the other half: a fixed, positioned backdrop paints above
   * ordinary static content, so the shell has to claim a layer of its own to
   * stay on top of it.
   */
  position: relative;
  z-index: 1;
}

.rail {
  display: none;
}

@media (min-width: 64rem) {
  .shell {
    display: grid;
    grid-template-columns: 15.5rem minmax(0, 1fr);
  }

  .rail {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    height: 100dvh;
    padding: var(--space-6) var(--space-4);
    overflow-y: auto;
    border-right: 1px solid var(--border-subtle);
    background: #08080a;
  }
}

/*
 * Off-screen until focused. Hidden with a position offset rather than
 * display:none, because a display:none element cannot receive focus at all,
 * which would make the link useless to the people it exists for.
 */
.skip {
  position: absolute;
  left: var(--space-4);
  top: calc(var(--space-4) * -4);
  z-index: var(--z-modal);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-overlay);
  transition: top var(--duration-fast) var(--ease-out);
}

.skip:focus {
  top: var(--space-4);
}

/* The target is programmatically focusable, so it must never draw a ring of
   its own when focus lands there from the skip link. */
.main__body:focus {
  outline: none;
}

.rail__brand {
  padding: var(--space-2) var(--space-3) var(--space-6);
}

.rail__nav {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.rail__heading {
  margin: var(--space-6) 0 var(--space-2);
  padding-inline: var(--space-3);
  font-size: var(--text-2xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--text-tertiary);
}

/*
 * Rows are lit from the left when you touch them.
 *
 * The hover and active states were white at 4% and 7%, which is the safe
 * choice and the reason the margin read as grey furniture: the one red thing
 * in it was the promo card at the bottom. The bar on the left edge is the
 * brand mark doing the work a background tint cannot -- it says *which* row
 * without washing the row itself.
 */
.rail__link {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  transition:
    color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

/* Scales from nothing rather than appearing: a bar that grows out of the
   edge reads as the row lighting up, which is what it is. */
.rail__link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 1.15rem;
  border-radius: var(--radius-full);
  background: var(--accent-lit);
  transform: translateY(-50%) scaleY(0);
  transition: transform var(--duration-base) var(--ease-spring);
}

.rail__link :deep(svg) {
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
}

.rail__link:hover {
  color: var(--text-primary);
  background: linear-gradient(90deg, rgb(232 53 43 / 0.1), transparent 85%);
}

.rail__link:hover::before {
  transform: translateY(-50%) scaleY(0.6);
}

/*
 * The active row is filled, not underlined.
 *
 * In a vertical list a rule under the word reads as a divider between two
 * items rather than as a state, which is the opposite of what it does in a
 * horizontal bar.
 */
.rail__link--active {
  color: var(--text-primary);
  background: linear-gradient(90deg, rgb(232 53 43 / 0.16), transparent 88%);
}

.rail__link--active::before {
  transform: translateY(-50%) scaleY(1);
  box-shadow: 0 0 0.75rem rgb(232 53 43 / 0.6);
}

/* The icon picks up the colour too, so the row reads as one lit object
   rather than as a red bar next to a grey link. */
.rail__link--active :deep(svg) {
  color: var(--accent);
}

.rail__count {
  margin-left: auto;
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
}

.rail__dot {
  width: 0.4rem;
  height: 0.4rem;
  margin-left: auto;
  border-radius: var(--radius-full);
  background: var(--accent-lit);
  box-shadow: 0 0 0.5rem rgb(232 53 43 / 0.7);
}

.rail__promo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  margin-top: auto;
  padding: var(--space-6) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--accent-wash);
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.rail__promo p {
  margin: 0;
  line-height: 1.5;
}

/*
 * The same card, now pressable.
 *
 * It lifts and lights rather than changing colour: the card already carries
 * the accent as a wash, and a hover that deepens that wash reads as the panel
 * warming up, which is what it is about to do.
 */
.rail__promo--action {
  width: 100%;
  cursor: var(--cursor-hand);
  transition: border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}

.rail__promo--action:hover {
  border-color: var(--accent-border);
  background: var(--accent-wash-strong);
  transform: translateY(-2px);
}

.rail__promo--action:hover .rail__orb {
  box-shadow: 0 0 2.25rem rgb(232 53 43 / 0.75);
}

.rail__promo--action .rail__orb {
  transition: box-shadow var(--dur-base) var(--ease-out);
}

.rail__cue {
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--accent);
}

/* The brand mark as an object rather than a glyph: the same red circle the
   wordmark carries, lit. */
.rail__orb {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-full);
  background: var(--accent-lit);
  box-shadow: var(--accent-glow);
}

/* ------------------------------------------------------------------ *
 * Top bar
 * ------------------------------------------------------------------ */

.main {
  min-width: 0;
}

.bar {
  position: sticky;
  top: 0;
  z-index: var(--z-nav);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  /* `min-height` rather than `height`: the notch padding `safe-top` adds on a
     phone has to push the bar taller, not squash what is in it. */
  min-height: var(--shell-bar);
  padding: var(--space-4) var(--space-5);
  background: rgb(10 10 12 / 0.86);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border-subtle);
}

.bar__brand {
  flex-shrink: 0;
}

@media (min-width: 64rem) {
  .bar {
    padding-inline: var(--space-8);
  }

  /* The rail carries it up here. */
  .bar__brand {
    display: none;
  }
}

.bar__search {
  flex: 1;
  max-width: 30rem;
  min-width: 0;
}

.bar__search form {
  position: relative;
  display: flex;
  align-items: center;
}

.bar__search-icon {
  position: absolute;
  left: var(--space-4);
  width: 1rem;
  height: 1rem;
  color: var(--text-tertiary);
  pointer-events: none;
}

.bar__search-input {
  width: 100%;
  padding: var(--space-3) var(--space-4) var(--space-3) var(--space-10);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  background: var(--surface-raised);
  font-size: var(--text-sm);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.bar__search-input::placeholder {
  color: var(--text-tertiary);
}

.bar__search-input:focus {
  outline: none;
  border-color: var(--border-strong);
}

/* Chrome draws its own clear button on type=search; it does not match
   anything else here. */
.bar__search-input::-webkit-search-cancel-button {
  appearance: none;
}

/* Hidden where there is no keyboard to press it with. */
.bar__key {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .bar__key {
    position: absolute;
    right: var(--space-3);
    display: block;
    padding: 0.15rem var(--space-2);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
  }
}

.bar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-left: auto;
}

.bar__icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  transition:
    color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.bar__icon:hover {
  color: var(--text-primary);
  background: var(--surface-raised);
}

.bar__dot {
  position: absolute;
  top: 0.35rem;
  right: 0.4rem;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: var(--radius-full);
  background: var(--accent-lit);
  box-shadow: 0 0 0.5rem rgb(232 53 43 / 0.7);
  outline: 2px solid var(--surface-base);
}

.bar__me {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0.3rem;
  border-radius: var(--radius-full);
  transition: background-color var(--duration-fast) var(--ease-out);
}

.bar__me:hover {
  background: var(--surface-raised);
}

.bar__me-name {
  display: none;
  font-size: var(--text-sm);
  font-weight: 500;
}

@media (min-width: 48rem) {
  .bar__me-name {
    display: block;
    padding-right: var(--space-3);
  }
}

.bar__signin {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  background: var(--accent);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.bar__signin:hover {
  background: var(--accent-hover);
}

/* ------------------------------------------------------------------ *
 * Mobile tab bar (SPEC 32)
 * ------------------------------------------------------------------ */

.main__body {
  /* Clears the fixed tab bar plus the home indicator. */
  padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-4));
}

.tabbar {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: var(--z-nav);
  display: flex;
  background: var(--surface-base);
  border-top: 1px solid var(--border-subtle);
}

.tabbar__link {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: var(--nav-height);
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
}

.tabbar__link--active {
  color: var(--accent);
}

.tabbar__icon-wrap {
  position: relative;
  display: grid;
  place-items: center;
}

.tabbar__icon {
  width: 1.375rem;
  height: 1.375rem;
}

.tabbar__dot {
  position: absolute;
  top: -1px;
  right: -3px;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--accent);
  outline: 2px solid var(--surface-base);
}

.tabbar__label {
  font-size: var(--text-2xs);
  font-weight: 500;
}

@media (min-width: 64rem) {
  .tabbar {
    display: none;
  }

  .main__body {
    padding-bottom: var(--space-16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rail__link,
  .tabbar__link,
  .bar__icon,
  .bar__me,
  .bar__signin,
  .bar__search-input,
  .skip {
    transition: none;
  }
}
</style>
