<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * The error page (SPEC 35).
 *
 * Shows the friendly message from our error envelope when there is one, and a
 * generic line otherwise. It never renders a stack trace, which is what SPEC 39
 * requires of every surface, this one included.
 */
const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()

const message = computed(() => {
  const data = props.error.data as { error?: { message?: string } } | undefined
  if (data?.error?.message) return data.error.message
  return props.error.statusCode === 404 ? t('errors.notFound') : t('errors.server')
})
</script>

<template>
  <div class="error-page">
    <LayoutAppLogo size="lg" />
    <p class="error-page__code">{{ error.statusCode }}</p>
    <p class="error-page__message">{{ message }}</p>
    <UiAppButton variant="primary" @click="clearError({ redirect: '/' })">
      Back to home
    </UiAppButton>
  </div>
</template>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  min-height: 100dvh;
  padding: var(--space-6);
  text-align: center;
}

.error-page__code {
  font-size: var(--text-3xl);
  font-weight: 800;
  color: var(--text-tertiary);
}

.error-page__message {
  color: var(--text-secondary);
  max-width: 26rem;
}
</style>
