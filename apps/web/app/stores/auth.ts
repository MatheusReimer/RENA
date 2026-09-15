import type { UserProfile } from '@revy/shared/types'
import { defineStore } from 'pinia'

/**
 * Session state (SPEC 34).
 *
 * SPEC 34 warns against dumping all server data into global state. This store
 * holds only what genuinely belongs there: who is signed in, and the unread
 * badge count -- both read by the navigation on every screen. Media, feeds and
 * profiles are fetched per-route instead.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserProfile | null>(null)
  const unreadNotifications = ref(0)
  /**
   * Unread direct messages across every conversation (SPEC 12).
   *
   * Here for the same reason the notification count is: the shell draws the
   * badge on every screen, so it is genuinely global rather than page state.
   */
  const unreadMessages = ref(0)
  /**
   * Whether this deployment can carry direct messages (SPEC 12).
   *
   * False when no encryption key is configured, in which case the feature is
   * unavailable rather than degraded -- so the navigation leaves it out
   * instead of offering a link to a 503.
   */
  const messagingEnabled = ref(false)
  const initialised = ref(false)
  const pending = ref(false)

  const isSignedIn = computed(() => user.value !== null)

  /**
   * Loads the session. Safe to call repeatedly: it resolves immediately once
   * loaded, so layouts and pages can both ask without duplicating the request.
   */
  async function load(force = false): Promise<void> {
    if (initialised.value && !force) return
    if (pending.value) return

    pending.value = true
    try {
      const result = await useApi().auth.me()
      user.value = result.user
      unreadNotifications.value = result.unreadNotifications
      unreadMessages.value = result.unreadMessages
      messagingEnabled.value = result.messaging
    } catch {
      // A failed session lookup means signed out, not a broken app.
      user.value = null
      unreadNotifications.value = 0
      unreadMessages.value = 0
    } finally {
      initialised.value = true
      pending.value = false
    }
  }

  async function signIn(email: string, password: string): Promise<void> {
    await useApi().auth.signIn({ email, password })
    await load(true)
  }

  async function register(input: {
    email: string
    password: string
    username: string
    displayName: string
  }): Promise<void> {
    await useApi().auth.register(input)
    // Better Auth signs the user in as part of sign-up, so the session is
    // already valid; just refresh what we hold.
    await load(true)
  }

  /**
   * Ends the session, and says so when it cannot.
   *
   * The local state is cleared only after the server confirms, and a failure
   * is rethrown rather than swallowed. Both matter: the cookie is httpOnly, so
   * a client that gives up and navigates to the sign-in screen has not signed
   * anybody out -- it has only stopped displaying them. On a borrowed laptop
   * that is the difference between a bug and a breach.
   *
   * This request used to 415 every time (`ofetch` sends no content type for a
   * bodyless POST, and Better Auth requires JSON), so the throw happened on
   * every attempt and nothing downstream ran. The button appeared inert.
   */
  async function signOut(): Promise<void> {
    if (pending.value) return
    pending.value = true

    try {
      await useApi().auth.signOut()
      user.value = null
      unreadNotifications.value = 0
      unreadMessages.value = 0
      await navigateTo('/signin')
    } finally {
      pending.value = false
    }
  }

  function markNotificationsRead(): void {
    unreadNotifications.value = 0
  }

  /**
   * Re-reads just the badge counts.
   *
   * Separate from `load` on purpose. `load(true)` replaces `user`, and a poll
   * that swaps the user object every minute makes every component bound to it
   * re-render for a number neither of them displays. This touches only the two
   * refs the badges read.
   *
   * Silent on failure: a missed refresh means a badge is briefly stale, which
   * is the state it was already in. Surfacing it would put an error on screen
   * for something the reader did not ask for.
   */
  async function refreshBadges(): Promise<void> {
    if (!user.value) return
    try {
      const result = await useApi().auth.me()
      // A session that expired between polls: stop claiming counts for
      // somebody who is no longer signed in.
      if (!result.user) {
        user.value = null
        unreadNotifications.value = 0
        unreadMessages.value = 0
        return
      }
      unreadNotifications.value = result.unreadNotifications
      unreadMessages.value = result.unreadMessages
    } catch {
      // Left as-is; the next tick corrects it.
    }
  }

  /**
   * Updates the badge from a conversation list the messages screen already
   * fetched, rather than making it re-ask `/api/me` for the same number.
   */
  function setUnreadMessages(count: number): void {
    unreadMessages.value = Math.max(0, count)
  }

  return {
    user,
    unreadNotifications,
    unreadMessages,
    messagingEnabled,
    initialised,
    pending,
    isSignedIn,
    load,
    signIn,
    register,
    signOut,
    markNotificationsRead,
    refreshBadges,
    setUnreadMessages,
  }
})
