<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'

/**
 * The session is loaded here rather than in the app shell.
 *
 * It used to live in `layouts/default.vue`, which worked while every screen
 * used that layout. The home screen now picks its layout from whether anyone
 * is signed in -- a visitor gets the landing shell, a member gets the app
 * shell -- and a session loaded inside the layout cannot answer the question
 * that decides which layout to load. Above both, it can.
 *
 * Returns a value rather than void: a handler resolving to `undefined` makes
 * Nuxt refetch on the client, duplicating the session lookup on every page.
 */
const auth = useAuthStore()

await useAsyncData('session', async () => {
  await auth.load()
  return { loaded: true }
})

/**
 * `<html lang>`, from the active locale.
 *
 * The module does not set this on its own under `no_prefix` -- there are no
 * locale-prefixed routes for it to infer from -- and the hardcoded `lang="en"`
 * that used to be in `nuxt.config` had to go, because it would have told every
 * screen reader and every translation tool that a Portuguese page was English.
 * `useLocaleHead` is the documented way to put it back correctly.
 */
const localeHead = useLocaleHead()

/*
 * Whether this page may be indexed (SPEC 22).
 *
 * Applied here, above the layout, so it covers every route including ones
 * added later. Per-page `robots` tags are the arrangement where the next page
 * is added without one, and nothing on screen would ever tell you.
 */
useIndexPolicy()

/*
 * Server data is refetched when the language changes (SPEC 31).
 *
 * The interface strings are reactive -- vue-i18n swaps them on the spot -- but
 * the catalogue text is not: titles, descriptions and section headings are
 * resolved on the server from the request's locale and arrive as fetched data.
 * Nothing was refetching it, so switching to Portuguese on the search screen
 * left "Avengers: Infinity War" sitting there while the chrome around it
 * turned Portuguese. The row was not wrong, it was stale, and every screen
 * showing catalogue text had the same bug.
 *
 * Fixed once here rather than by each page remembering to watch the locale --
 * which is the arrangement where the next page is written without it.
 *
 * After a tick, because `setLocale` writes the `rena_locale` cookie that the
 * server reads to decide the language. Refetching in the same tick would send
 * the old cookie and fetch the language we just left.
 */
const { locale } = useI18n()

watch(locale, async () => {
  await nextTick()
  await refreshNuxtData()
})

useHead(() => ({
  htmlAttrs: localeHead.value.htmlAttrs,
  link: localeHead.value.link,
  meta: localeHead.value.meta,
  titleTemplate: (title?: string) => (title ? `${title} · ${BRAND.name}` : BRAND.name),
}))
</script>

<template>
  <!-- Above the layout, not inside one: all three shells navigate, and a
       progress indicator that only exists on some screens is worse than none.
       Fixed-position and pointer-events:none, so it overlays without
       participating in any layout. -->
  <LayoutBrandProgress />

  <!-- Above the layout for the same reason the progress bar is: all three
       shells want it, and an ambient light that only exists on some screens
       reads as a rendering bug rather than a design. -->
  <UiAmbientBackdrop />

  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
