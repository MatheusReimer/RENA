import { toContentLanguage } from '@revy/shared/constants'

/**
 * The interface follows the account, once there is one (SPEC 31).
 *
 * Without this, the language is whatever the browser asked for, which is right
 * for a visitor and wrong for a member: somebody who chose Portuguese at
 * sign-up and then opens the site on a borrowed laptop, or a phone set to
 * English, should not be handed an interface they cannot read. The preference
 * belongs to the person, so it travels with the session rather than the device.
 *
 * Client-only, and deliberately after the session loads -- `app.vue` resolves
 * that before anything renders, so by the time this runs the answer is known
 * and there is no flash of the wrong language.
 *
 * An explicit change made with the picker still wins for the rest of the
 * visit: this watches the *user*, not the locale, so switching language by
 * hand is never undone a moment later by the account's stored value.
 */
export default defineNuxtPlugin((nuxtApp) => {
  /*
   * Reached through the Nuxt app, not through `useI18n()`.
   *
   * `useI18n()` is a component composable and must be called during setup; in
   * a plugin there is no active component instance, so it throws "Must be
   * called at the top of a setup function" -- which surfaces as a 500 on the
   * first screen that renders. The injected instance is the same object
   * without that requirement.
   */
  const i18n = nuxtApp.$i18n as {
    locale: { value: string }
    setLocale: (code: string) => Promise<void> | void
  }

  const auth = useAuthStore()

  watch(
    () => auth.user?.language,
    (preferred) => {
      if (!preferred) return

      const wanted = toContentLanguage(preferred)
      if (wanted === i18n.locale.value) return

      void i18n.setLocale(wanted)
    },
    { immediate: true },
  )
})
