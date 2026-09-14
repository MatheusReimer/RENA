<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'

/**
 * The app shell (SPEC 31, 32).
 *
 * SPEC 31 is explicit that mobile must not be a shrunken desktop. So this is
 * two genuinely different layouts sharing one set of screens: a persistent
 * sidebar on desktop, and a fixed bottom tab bar with a compact header on
 * mobile -- which is also what the Capacitor build ships, giving the native
 * apps a native-feeling navigation without a second codebase.
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
 * `sidebarOnly` items appear in the desktop sidebar but not the mobile tab
 * bar: five tabs is the practical ceiling on a phone, and Lists is reachable
 * from the profile and from any media page.
 */
const navItems = [
  { to: '/', icon: 'home', label: 'Home', sidebarOnly: false },
  { to: '/search', icon: 'search', label: 'Search', sidebarOnly: false },
  { to: '/discover', icon: 'discover', label: 'Discover', sidebarOnly: false },
  { to: '/community', icon: 'community', label: 'Community', sidebarOnly: false },
  { to: '/friends', icon: 'friends', label: 'Friends', sidebarOnly: true },
  { to: '/lists', icon: 'lists', label: 'Lists', sidebarOnly: true },
  { to: '/activity', icon: 'activity', label: 'Notifications', sidebarOnly: false },
] as const

const tabBarItems = navItems.filter((item) => !item.sidebarOnly)

/** The profile tab points at the signed-in user, or sign-in when signed out. */
const profileTarget = computed(() =>
  auth.user ? `/u/${auth.user.username}` : '/signin',
)

function isActive(to: string): boolean {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

const profileActive = computed(() => route.path.startsWith('/u/'))
</script>

<template>
  <div class="shell">
    <!-- Desktop sidebar -->
    <aside class="sidebar">
      <NuxtLink to="/" class="sidebar__brand" :aria-label="BRAND.name">
        <LayoutAppLogo size="md" />
      </NuxtLink>

      <nav class="sidebar__nav" aria-label="Main">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="sidebar__link"
          :class="{ 'sidebar__link--active': isActive(item.to) }"
        >
          <!-- The active pill, drawn per item and scaled in. Every link owns
               one, so it grows in place rather than a single bar being
               measured and moved -- which would break on a reflow. -->
          <span class="sidebar__pill" aria-hidden="true" />
          <span class="sidebar__rule" aria-hidden="true" />
          <LayoutNavIcon :name="item.icon" class="sidebar__icon" />
          <span class="sidebar__label">{{ item.label }}</span>
          <span
            v-if="item.to === '/activity' && auth.unreadNotifications"
            class="sidebar__badge"
          >
            {{ auth.unreadNotifications > 9 ? '9+' : auth.unreadNotifications }}
          </span>
        </NuxtLink>

        <NuxtLink
          :to="profileTarget"
          class="sidebar__link"
          :class="{ 'sidebar__link--active': profileActive }"
        >
          <LayoutNavIcon name="profile" class="sidebar__icon" />
          <span>Profile</span>
        </NuxtLink>
      </nav>

      <div v-if="auth.user" class="sidebar__user">
        <UiUserAvatar :user="auth.user" size="sm" />
        <div class="sidebar__user-text">
          <span class="sidebar__user-name clamp-1">{{ auth.user.displayName }}</span>
          <span class="sidebar__user-handle clamp-1">@{{ auth.user.username }}</span>
        </div>
        <button
          type="button"
          class="sidebar__signout"
          aria-label="Sign out"
          @click="auth.signOut()"
        >
          Sign out
        </button>
      </div>
    </aside>

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

    <main class="content">
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

/* ------------------------------------------------------------------ *
 * Mobile first (SPEC 31): header, scrolling content, fixed tab bar.
 * ------------------------------------------------------------------ */

.sidebar {
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
 * Desktop: sidebar + centred content. Not a scaled-up phone (SPEC 31).
 * ------------------------------------------------------------------ */

@media (min-width: 60rem) {
  .shell {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
  }

  .mobile-header,
  .tabbar {
    display: none;
  }

  .sidebar {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    height: 100dvh;
    padding: var(--space-6) var(--space-4);
    border-right: 1px solid var(--border-subtle);
  }

  .sidebar__brand {
    padding-inline: var(--space-3);
    margin-bottom: var(--space-8);
  }

  .sidebar__nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .sidebar__link {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--text-secondary);
    isolation: isolate;
    transition: color var(--duration-base) var(--ease-out);
  }

  /*
   * The tinted pill behind an active item.
   *
   * Scaled and faded rather than toggled, so moving between items reads as the
   * highlight growing in the new place and releasing the old, instead of
   * blinking. Sits behind the label via z-index rather than opacity tricks.
   */
  .sidebar__pill {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    opacity: 0;
    transform: scale(0.94);
    transition:
      opacity var(--duration-base) var(--ease-out),
      transform var(--duration-base) var(--ease-spring);
  }

  /* A short accent bar on the leading edge -- the one piece of chrome that
     says "you are here" without relying on colour alone. */
  .sidebar__rule {
    position: absolute;
    left: 0;
    top: 50%;
    width: 3px;
    height: 1.25rem;
    border-radius: var(--radius-full);
    background: var(--accent);
    transform: translateY(-50%) scaleY(0);
    transform-origin: center;
    transition: transform var(--duration-base) var(--ease-spring);
  }

  .sidebar__link:hover {
    color: var(--text-primary);
  }

  .sidebar__link:hover .sidebar__pill {
    opacity: 0.55;
    transform: scale(1);
    background: var(--surface-raised);
  }

  .sidebar__link--active {
    color: var(--accent);
    font-weight: 600;
  }

  .sidebar__link--active .sidebar__pill,
  .sidebar__link--active:hover .sidebar__pill {
    opacity: 1;
    transform: scale(1);
    background: var(--accent-soft);
  }

  .sidebar__link--active .sidebar__rule {
    transform: translateY(-50%) scaleY(1);
  }

  .sidebar__label {
    transition: transform var(--duration-base) var(--ease-out);
  }

  /* The label shifts a hair toward the accent rule on hover: a small physical
     cue that the row is live, without moving the icon out of its column. */
  .sidebar__link:hover .sidebar__label {
    transform: translateX(2px);
  }

  .sidebar__icon {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
    transition: transform var(--duration-base) var(--ease-spring);
  }

  .sidebar__link:hover .sidebar__icon,
  .sidebar__link--active .sidebar__icon {
    transform: scale(1.12);
  }

  .sidebar__badge {
    margin-left: auto;
    min-width: 1.25rem;
    padding-inline: var(--space-1);
    border-radius: var(--radius-full);
    background: var(--accent);
    color: #fff;
    font-size: var(--text-2xs);
    font-weight: 700;
    text-align: center;
  }

  .sidebar__user {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: auto;
    padding: var(--space-3);
    border-top: 1px solid var(--border-subtle);
  }

  .sidebar__user-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: var(--leading-tight);
  }

  .sidebar__user-name {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .sidebar__user-handle {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .sidebar__signout {
    margin-left: auto;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .sidebar__signout:hover {
    color: var(--text-primary);
  }

  .content {
    padding-bottom: var(--space-16);
  }
}
</style>
