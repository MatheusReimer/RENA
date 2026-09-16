<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'

/**
 * Layout for the four credential screens: sign in, sign up, forgot password
 * and reset password.
 *
 * No navigation: there is nothing to navigate to until there is a session, and
 * a tab bar on an auth screen is an invitation to bounce off.
 *
 * It owns `auth-form.css` because all four pages render an `.auth-form`.
 * That import used to sit inside `signin.vue` and `signup.vue`, which meant
 * the reset screens were styled only if somebody had already been to one of
 * those two in the same session -- so arriving at `/forgot-password` from a
 * bookmark, or at `/reset-password` straight from an email link, got raw
 * unstyled markup. Emailed links are always a first page load, which is the
 * one case that was guaranteed to be broken.
 */
</script>

<template>
  <div class="auth-layout">
    <NuxtLink to="/" class="auth-layout__brand" :aria-label="BRAND.name">
      <LayoutAppLogo size="lg" tagline />
    </NuxtLink>

    <div class="auth-layout__panel">
      <slot />
    </div>

    <p class="auth-layout__footnote">{{ BRAND.description }}</p>
  </div>
</template>

<!-- Not scoped: these class names belong to the page rendered into the slot,
     and a scoped block would not reach it. -->
<style>
@import '~/assets/css/auth-form.css';
</style>

<style scoped>
.auth-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-8);
  min-height: 100dvh;
  padding: var(--space-6) var(--space-4);
  /* No background of its own, but it still needs its own layer to paint above
     the ambient backdrop. */
  position: relative;
  z-index: 1;
}

.auth-layout__panel {
  display: flex;
  justify-content: center;
  width: 100%;
}

.auth-layout__footnote {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
</style>
