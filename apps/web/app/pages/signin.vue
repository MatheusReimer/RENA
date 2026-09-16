<script setup lang="ts">
import { signInSchema } from '@revy/shared/schemas'

/** Sign in (SPEC 26). */
definePageMeta({ layout: 'auth' })

const auth = useAuthStore()

const form = reactive({ email: '', password: '' })
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)
const submitting = ref(false)

async function submit() {
  fieldErrors.value = {}
  formError.value = null

  const parsed = signInSchema.safeParse(form)
  if (!parsed.success) {
    const errors: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_'
      ;(errors[key] ??= []).push(issue.message)
    }
    fieldErrors.value = errors
    return
  }

  submitting.value = true
  try {
    await auth.signIn(parsed.data.email, parsed.data.password)
    await navigateTo('/')
  } catch {
    // Deliberately generic: distinguishing "no such email" from "wrong
    // password" tells an attacker which accounts exist (OWASP A07).
    formError.value = 'That email and password do not match.'
  } finally {
    submitting.value = false
  }
}

useHead({ title: 'Sign in' })
</script>

<template>
  <form class="auth-form" @submit.prevent="submit">
    <h1 class="auth-form__title">Welcome back</h1>
    <p class="auth-form__subtitle">Pick up where you left off.</p>

    <label class="field">
      <span class="field__label">Email</span>
      <input
        v-model="form.email"
        type="email"
        class="field__input"
        autocomplete="email"
        required
      />
      <span v-if="fieldErrors.email" class="field__error">{{ fieldErrors.email[0] }}</span>
    </label>

    <label class="field">
      <span class="field__label">Password</span>
      <input
        v-model="form.password"
        type="password"
        class="field__input"
        autocomplete="current-password"
        required
      />
      <span v-if="fieldErrors.password" class="field__error">{{ fieldErrors.password[0] }}</span>
    </label>

    <!-- Beside the password field, where somebody realises they have
         forgotten it, rather than buried under the submit button.

         The address travels with them. Whoever clicks this has just failed to
         sign in, and making them retype the email is making them repeat the
         step they were already stuck on. -->
    <NuxtLink
      :to="{ path: '/forgot-password', query: form.email ? { email: form.email } : undefined }"
      class="auth-form__link forgot"
    >
      Forgot your password?
    </NuxtLink>

    <p v-if="formError" class="auth-form__error" role="alert">{{ formError }}</p>

    <UiAppButton type="submit" variant="primary" size="lg" block :loading="submitting">
      Sign in
    </UiAppButton>

    <p class="auth-form__switch">
      New here?
      <NuxtLink to="/signup" class="auth-form__link">Create an account</NuxtLink>
    </p>
  </form>
</template>

<style scoped>
/* Shared form styles come from the `auth` layout. */
</style>
