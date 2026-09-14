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
  { to: '/lists', icon: 'lists', label: 'Lists', barOnly: true },
  { to: '/activity', icon: 'activity', label: 'Notifications', barOnly: false },
] as const

const tabBarItems = navItems.filter((item) => !item.barOnly)

/**
 * What the bar itself shows as words.
 *
 * Search and Notifications are deliberately absent: they are controls, not
 * destinations, and they sit on the right as icons. Putting all seven items in
 * a row is what makes a nav bar look like a site map.
 */
const barItems = navItems.filter(
  (item) => item.to !== '/search' && item.to !== '/activity',
)

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
          <NuxtLink to="/search" class="topbar__icon" aria-label="Search">
            <LayoutNavIcon name="search" />
          </NuxtLink>

          <NuxtLink to="/activity" class="topbar__icon" aria-label="Notifications">
            <LayoutNavIcon name="activity" />
            <span
              v-if="auth.unreadNotifications"
              class="topbar__dot"
              :aria-label="`${auth.unreadNotifications} unread`"
            />
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

  .topbar__inner {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    height: var(--topbar-height);
    padding-inline: var(--space-6);
  }

  .topbar__brand {
    flex-shrink: 0;
    /* The wordmark reads as the first nav item otherwise; a little air to its
       right makes it the mark it is. */
    margin-right: var(--space-2);
  }

  .topbar__nav {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    min-width: 0;
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

  .topbar__link:hover {
    color: var(--text-primary);
  }

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
    bottom: 0;
    height: 2px;
    border-radius: var(--radius-full);
    background: var(--accent);
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform var(--duration-base) var(--ease-spring);
  }

  .topbar__link:hover .topbar__mark {
    transform: scaleX(0.35);
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
    gap: var(--space-2);
    /* Pushed to the far edge: the bar is brand, then destinations, then a gap,
       then the two controls and you. */
    margin-left: auto;
  }

  .topbar__icon {
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

  .topbar__icon:hover {
    color: var(--text-primary);
    background: var(--surface-raised);
  }

  .topbar__icon svg {
    width: 1.125rem;
    height: 1.125rem;
  }

  .topbar__dot {
    position: absolute;
    top: 0.4rem;
    right: 0.45rem;
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    background: var(--accent);
    /* Reads over the bar whether it is transparent or blurred. */
    outline: 2px solid var(--surface-base);
  }

  .topbar__avatar {
    display: grid;
    place-items: center;
    margin-left: var(--space-1);
    border-radius: var(--radius-full);
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color var(--duration-base) var(--ease-out);
  }

  .topbar__avatar:hover,
  .topbar__avatar--active {
    outline-color: var(--accent);
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

  /*
   * Clears the fixed bar. A screen that wants its artwork to run underneath
   * pulls this back with a negative margin on that one element, rather than
   * every other screen having to remember to add it.
   */
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
