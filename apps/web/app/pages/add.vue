<script setup lang="ts">
/**
 * Quick add.
 *
 * The "+" tab is the fastest path into the core loop: find something you
 * finished, score it, optionally say why. Rather than duplicating the search
 * screen, this frames the intent and sends you there -- rating and reviewing
 * already live on the media page, where they belong.
 */
const auth = useAuthStore()

const shortcuts = [
  {
    type: 'movie',
    icon: '\u{1F3AC}',
    title: 'Rate a movie',
    description: 'Search the catalogue and give it a score.',
  },
  {
    type: 'series',
    icon: '\u{1F4FA}',
    title: 'Rate a series',
    description: 'Track what you are watching, season by season.',
  },
  {
    type: 'book',
    icon: '\u{1F4D6}',
    title: 'Rate a book',
    description: 'Log what you have read and what is next.',
  },
] as const

useHead({ title: 'Add' })
</script>

<template>
  <div class="page">
    <h1 class="page__title">What did you finish?</h1>
    <p class="page__subtitle">
      Find it, score it, and it shows up in your friends' feeds.
    </p>

    <UiEmptyState
      v-if="!auth.isSignedIn && auth.initialised"
      icon="🔒"
      title="Sign in to rate and review."
      description="Your ratings, lists and reviews live on your account."
    >
      <template #action>
        <UiAppButton variant="primary" @click="navigateTo('/signup')">
          Create account
        </UiAppButton>
      </template>
    </UiEmptyState>

    <div v-else class="shortcuts">
      <NuxtLink
        v-for="shortcut in shortcuts"
        :key="shortcut.type"
        :to="{ path: '/search', query: { type: shortcut.type } }"
        class="shortcut"
      >
        <span class="shortcut__icon" aria-hidden="true">{{ shortcut.icon }}</span>
        <span class="shortcut__text">
          <span class="shortcut__title">{{ shortcut.title }}</span>
          <span class="shortcut__description">{{ shortcut.description }}</span>
        </span>
        <svg
          class="shortcut__chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
  padding: var(--space-6) var(--space-4);
}

.page__title {
  font-size: var(--text-2xl);
}

.page__subtitle {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-8);
}

.shortcut {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.shortcut:hover {
  background: var(--surface-overlay);
  border-color: var(--border-default);
}

.shortcut__icon {
  font-size: 1.5rem;
}

.shortcut__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.shortcut__title {
  font-size: var(--text-base);
  font-weight: 600;
}

.shortcut__description {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.shortcut__chevron {
  width: 1.125rem;
  height: 1.125rem;
  color: var(--text-tertiary);
}
</style>
