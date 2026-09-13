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
          <LayoutNavIcon :name="item.icon" class="sidebar__icon" />
          <span>{{ item.label }}</span>
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
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .sidebar__link:hover {
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .sidebar__link--active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .sidebar__icon {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
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
