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
    } catch {
      // A failed session lookup means signed out, not a broken app.
      user.value = null
      unreadNotifications.value = 0
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

  async function signOut(): Promise<void> {
    await useApi().auth.signOut()
    user.value = null
    unreadNotifications.value = 0
    await navigateTo('/signin')
  }

  function markNotificationsRead(): void {
    unreadNotifications.value = 0
  }

  return {
    user,
    unreadNotifications,
    initialised,
    pending,
    isSignedIn,
    load,
    signIn,
    register,
    signOut,
    markNotificationsRead,
  }
})
