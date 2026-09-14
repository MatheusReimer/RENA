<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'

/**
 * The app shell (SPEC 31, 32).
 *
 * SPEC 31 is explicit that mobile must not be a shrunken desktop, so this is
 * two genuinely different layouts over one set of screens: a slim top bar on
 * desktop, and a fixed bottom tab bar with a compact header on mobile -- which
 * is also what the Capacitor build ships, giving the native apps a
 * native-feeling navigation without a second codebase.
 *
 * The desktop navigation was a 15rem sidebar. It is a bar now, because the
 * sidebar was spending a sixth of every screen on seven links that never
 * change, on a product whose whole argument is large artwork. A bar costs one
 * row and gives the width back.
 */
const auth = useAuthStore()
const route = useRoute()

// Returns a value rather than void: a handler resolving to `undefined` makes
// Nuxt refetch on the client, duplicating the session lookup on every page.
await useAsyncData('session', async () => {
  await auth.load()
  return { loaded: true }
})

/**
 * Primary navigation.
 *
 * `barOnly` items appear in the desktop bar but not the mobile tab bar: five
 * tabs is the practical ceiling on a phone, and Lists and Friends are both
 * reachable from the profile.
 */
const navItems = [
  { to: '/', icon: 'home', label: 'Home', barOnly: false },
  { to: '/search', icon: 'search', label: 'Search', barOnly: false },
  { to: '/discover', icon: 'discover', label: 'Discover', barOnly: false },
  { to: '/community', icon: 'community', label: 'Community', barOnly: false },
  { to: '/friends', icon: 'friends', label: 'Friends', barOnly: true },
  // "Library" rather than "Lists", per the design. It is the same screen; the
  // word covers what is on it better -- lists, watched, read and played.
  { to: '/lists', icon: 'lists', label: 'Library', barOnly: true },
  { to: '/activity', icon: 'activity', label: 'Notifications', barOnly: false },
] as const

const tabBarItems = navItems.filter((item) => !item.barOnly)

/**
 * What the bar itself shows as words: four destinations, no more.
 *
 * Search is a field on the right, Notifications is the mark on the avatar, and
 * Friends lives on the profile. Putting all seven in a row is what makes a nav
 * bar look like a site map.
 */
const BAR_ROUTES = ['/', '/discover', '/community', '/lists'] as const

const barItems = BAR_ROUTES.map(
  (route) => navItems.find((item) => item.to === route)!,
)

/** The bar's search field. Submitting hands off to the search screen. */
const term = ref('')

function submitSearch() {
  const value = term.value.trim()
  if (!value) return navigateTo('/search')
  return navigateTo({ path: '/search', query: { q: value } })
}

/** The profile link points at the signed-in user, or sign-in when signed out. */
const profileTarget = computed(() => (auth.user ? `/u/${auth.user.username}` : '/signin'))

function isActive(to: string): boolean {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

const profileActive = computed(() => route.path.startsWith('/u/'))

/**
 * Whether the page has been scrolled at all.
 *
 * The bar is transparent over the top of a screen -- which on the home page
 * means it sits over the artwork rather than cutting a strip out of it -- and
 * takes on a ground and a hairline once anything has scrolled under it.
 */
const scrolled = ref(false)

onMounted(() => {
  const onScroll = () => {
    scrolled.value = window.scrollY > 8
  }

  onScroll()
  // Passive: this listener never calls preventDefault, and saying so keeps it
  // off the critical path of the scroll itself.
  window.addEventListener('scroll', onScroll, { passive: true })
  onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
})
</script>

<template>
  <div class="shell">
    <!--
      First tab stop on every screen. The home wall alone is forty-eight links,
      so reaching the page content by keyboard without this means tabbing
      through the catalogue first.
    -->
    <a class="skip" href="#content">Skip to content</a>

    <!-- Desktop top bar -->
    <header class="topbar" :class="{ 'topbar--scrolled': scrolled }">
      <div class="topbar__inner">
        <NuxtLink to="/" class="topbar__brand" :aria-label="BRAND.name">
          <LayoutAppLogo size="sm" />
        </NuxtLink>

        <nav class="topbar__nav" aria-label="Main">
          <NuxtLink
            v-for="item in barItems"
            :key="item.to"
            :to="item.to"
            class="topbar__link"
            :class="{ 'topbar__link--active': isActive(item.to) }"
          >
            {{ item.label }}
            <!-- The active mark. A rule under the word rather than a filled
                 pill: at this size a pill is a button, and these are not. -->
            <span class="topbar__mark" aria-hidden="true" />
          </NuxtLink>
        </nav>

        <div class="topbar__actions">
          <!-- A plain div, not <search>: the element is valid HTML but Vue's
               compiler treats an unknown tag as a component and warns on
               every render. `role="search"` on the form says the same thing
               to assistive tech. -->
          <div class="topbar__search">
            <form role="search" @submit.prevent="submitSearch">
              <label class="sr-only" for="topbar-search">Search</label>
              <LayoutNavIcon name="search" class="topbar__search-icon" />
              <input
                id="topbar-search"
                v-model="term"
                type="search"
                class="topbar__search-input"
                placeholder="Search for movies, books, games..."
                autocomplete="off"
              />
            </form>
          </div>

          <span class="topbar__divider" aria-hidden="true" />

          <!--
            The design marks notifications with a dot on the avatar and nothing
            else. That works right up until you have none unread, at which
            point the screen has no route to them at all -- so the bell stays,
            quietly, and carries the mark.
          -->
          <NuxtLink
            v-if="auth.user"
            to="/activity"
            class="topbar__bell"
            :class="{ 'topbar__bell--active': isActive('/activity') }"
            :aria-label="
              auth.unreadNotifications
                ? `Notifications, ${auth.unreadNotifications} unread`
                : 'Notifications'
            "
          >
            <LayoutNavIcon name="activity" />
            <span v-if="auth.unreadNotifications" class="topbar__dot" aria-hidden="true" />
          </NuxtLink>

          <NuxtLink
            v-if="auth.user"
            :to="profileTarget"
            class="topbar__avatar"
            :class="{ 'topbar__avatar--active': profileActive }"
            :aria-label="`${auth.user.displayName} — your profile`"
          >
            <UiUserAvatar :user="auth.user" size="sm" />
          </NuxtLink>
          <NuxtLink v-else to="/signin" class="topbar__signin">Sign in</NuxtLink>
        </div>
      </div>
    </header>

    <!-- Mobile header -->
    <header class="mobile-header safe-top">
      <NuxtLink to="/" :aria-label="BRAND.name">
        <LayoutAppLogo size="sm" />
      </NuxtLink>
      <div class="mobile-header__actions">
        <NuxtLink to="/search" class="mobile-header__icon" aria-label="Search">
          <LayoutNavIcon name="search" />
        </NuxtLink>
        <NuxtLink v-if="auth.user" :to="profileTarget" aria-label="Your profile">
          <UiUserAvatar :user="auth.user" size="sm" />
        </NuxtLink>
        <NuxtLink v-else to="/signin" class="mobile-header__signin">Sign in</NuxtLink>
      </div>
    </header>

    <main id="content" class="content" tabindex="-1">
      <slot />
    </main>

    <!-- Mobile tab bar (SPEC 32) -->
    <nav class="tabbar safe-bottom" aria-label="Main">
      <NuxtLink
        v-for="item in tabBarItems"
        :key="item.to"
        :to="item.to"
        class="tabbar__link"
        :class="{ 'tabbar__link--active': isActive(item.to) }"
      >
        <span class="tabbar__icon-wrap">
          <LayoutNavIcon :name="item.icon" class="tabbar__icon" />
          <span
            v-if="item.to === '/activity' && auth.unreadNotifications"
            class="tabbar__dot"
            aria-hidden="true"
          />
        </span>
        <span class="tabbar__label">{{ item.label }}</span>
      </NuxtLink>

      <NuxtLink
        :to="profileTarget"
        class="tabbar__link"
        :class="{ 'tabbar__link--active': profileActive }"
      >
        <span class="tabbar__icon-wrap">
          <LayoutNavIcon name="profile" class="tabbar__icon" />
        </span>
        <span class="tabbar__label">Profile</span>
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
}

/*
 * Off-screen until focused. Hidden with a position offset rather than
 * display:none, because a display:none element cannot receive focus at all,
 * which would make the link useless to the people it exists for.
 */
.skip {
  position: absolute;
  top: var(--space-3);
  left: var(--space-3);
  z-index: 100;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: 600;
  transform: translateY(-250%);
  transition: transform var(--duration-base) var(--ease-out);
}

.skip:focus-visible {
  transform: none;
}

/* The target is programmatically focusable, so it must never draw a ring of
   its own when focus lands there from the skip link. */
.content:focus {
  outline: none;
}

/* ------------------------------------------------------------------ *
 * Mobile first (SPEC 31): header, scrolling content, fixed tab bar.
 * ------------------------------------------------------------------ */

.topbar {
  display: none;
}

.mobile-header {
  position: sticky;
  top: 0;
  z-index: var(--z-nav);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-base);
  border-bottom: 1px solid var(--border-subtle);
}

.mobile-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.mobile-header__icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  color: var(--text-secondary);
}

.mobile-header__icon svg {
  width: 1.25rem;
  height: 1.25rem;
}

.mobile-header__signin {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--accent);
}

.content {
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

/* ------------------------------------------------------------------ *
 * Desktop: a bar across the top, and the full width underneath it.
 * ------------------------------------------------------------------ */

@media (min-width: 60rem) {
  .mobile-header,
  .tabbar {
    display: none;
  }

  /*
   * Fixed rather than sticky, and the content is not pushed down for it.
   *
   * The home wall and every media backdrop start at the very top of the page
   * and run under the bar, which is the point: the artwork is the first thing
   * on screen, not a strip of chrome above it. Screens that open with type
   * add their own top padding.
   */
  .topbar {
    position: fixed;
    inset-inline: 0;
    top: 0;
    z-index: var(--z-nav);
    display: block;
    /*
     * Transparent at the top of the page. `background-color` and the hairline
     * are the only things that change on scroll -- both composite cheaply, and
     * neither moves anything.
     */
    background: transparent;
    border-bottom: 1px solid transparent;
    transition:
      background-color var(--duration-base) var(--ease-out),
      border-color var(--duration-base) var(--ease-out),
      backdrop-filter var(--duration-base) var(--ease-out);
  }

  .topbar--scrolled {
    background: rgb(10 10 12 / 0.72);
    border-bottom-color: var(--border-subtle);
    backdrop-filter: blur(16px) saturate(1.4);
    -webkit-backdrop-filter: blur(16px) saturate(1.4);
  }

  /*
   * Three tracks, and the outer two are equal so the nav sits on the true
   * centre of the window rather than the centre of what is left over. That is
   * what the design does, and it is the reason the bar reads as composed
   * instead of as a row of things pushed apart.
   */
  .topbar__inner {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-6);
    height: var(--topbar-height);
    /* The same container as the page under it, so the wordmark lines up with
       the content rather than sitting out on the window edge. */
    max-width: var(--page-max);
    margin-inline: auto;
    padding-inline: var(--space-6);
  }

  .topbar__brand {
    justify-self: start;
  }

  .topbar__nav {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    justify-self: center;
  }

  .topbar__link {
    position: relative;
    padding-block: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--text-secondary);
    white-space: nowrap;
    transition: color var(--duration-base) var(--ease-out);
  }

  .topbar__link:hover,
  .topbar__link--active {
    color: var(--text-primary);
  }

  /*
   * The rule under the active item.
   *
   * Every link owns one and scales it in, so moving between items reads as the
   * mark growing in the new place rather than a single bar being measured and
   * moved -- which breaks the moment anything reflows.
   */
  .topbar__mark {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -2px;
    height: 2px;
    border-radius: var(--radius-full);
    background: var(--accent);
    transform: scaleX(0);
    transform-origin: center;
    transition: transform var(--duration-base) var(--ease-spring);
  }

  .topbar__link:hover .topbar__mark {
    transform: scaleX(0.4);
    background: var(--border-strong);
  }

  .topbar__link--active .topbar__mark,
  .topbar__link--active:hover .topbar__mark {
    transform: scaleX(1);
    background: var(--accent);
  }

  .topbar__actions {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    justify-self: end;
    min-width: 0;
  }

  /*
   * The search field has no box.
   *
   * A bordered input in a transparent bar over artwork puts a rectangle in the
   * middle of the picture. An icon and a placeholder are enough to say what it
   * is, and the field only draws an underline once you are in it.
   */
  .topbar__search form {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-2);
    border-bottom: 1px solid transparent;
    transition: border-color var(--duration-base) var(--ease-out);
  }

  .topbar__search form:focus-within {
    border-bottom-color: var(--border-default);
  }

  .topbar__search-icon {
    width: 1.125rem;
    height: 1.125rem;
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .topbar__search-input {
    width: clamp(9rem, 18vw, 17rem);
    min-width: 0;
    border: 0;
    background: none;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-family: inherit;
  }

  .topbar__search-input::placeholder {
    color: var(--text-tertiary);
  }

  .topbar__search-input:focus {
    outline: none;
  }

  /* Chrome draws its own clear button on type=search; it does not match
     anything else here. */
  .topbar__search-input::-webkit-search-cancel-button {
    appearance: none;
  }

  .topbar__divider {
    width: 1px;
    height: 1.5rem;
    background: var(--border-default);
    flex-shrink: 0;
  }

  .topbar__bell {
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

  .topbar__bell:hover,
  .topbar__bell--active {
    color: var(--text-primary);
    background: var(--surface-raised);
  }

  .topbar__bell svg {
    width: 1.125rem;
    height: 1.125rem;
  }

  .topbar__avatar {
    position: relative;
    display: grid;
    place-items: center;
    border-radius: var(--radius-full);
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color var(--duration-base) var(--ease-out);
  }

  .topbar__avatar:hover,
  .topbar__avatar--active {
    outline-color: var(--accent);
  }

  .topbar__dot {
    position: absolute;
    top: 0.35rem;
    right: 0.4rem;
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--accent);
    /* Reads over the bar whether it is transparent or blurred. */
    outline: 2px solid var(--surface-base);
  }

  .topbar__signin {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-full);
    background: var(--accent);
    color: #fff;
    font-size: var(--text-sm);
    font-weight: 600;
    transition: background-color var(--duration-fast) var(--ease-out);
  }

  .topbar__signin:hover {
    background: var(--accent-hover);
  }

  .content {
    padding-top: var(--topbar-height);
    padding-bottom: var(--space-16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .topbar,
  .topbar__mark,
  .topbar__link,
  .topbar__icon,
  .topbar__avatar {
    transition: none;
  }
}
</style>
