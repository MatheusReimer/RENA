<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'

/**
 * Layout for sign-in and sign-up.
 *
 * No navigation: there is nothing to navigate to until there is a session, and
 * a tab bar on an auth screen is an invitation to bounce off.
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

<style scoped>
.auth-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-8);
  min-height: 100dvh;
  padding: var(--space-6) var(--space-4);
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
