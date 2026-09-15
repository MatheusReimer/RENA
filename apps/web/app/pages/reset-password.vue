<script setup lang="ts">
import { passwordSchema } from '@revy/shared/schemas'

/**
 * Set a new password from an emailed link (SPEC 26).
 *
 * The token arrives in the query string. It is single-use and expires in an
 * hour, both enforced server-side by Better Auth -- nothing here is trusted to
 * police that, because anything this page checks can be skipped by posting to
 * the endpoint directly.
 *
 * Completing a reset revokes every existing session (`revokeSessionsOnPasswordReset`).
 * The usual reason somebody resets a password is that they believe another
 * person has it, so leaving that person signed in on their own device would
 * make the whole exercise theatre.
 */
definePageMeta({ layout: 'auth' })

const api = useApi()
const route = useRoute()

const token = computed(() => {
  const value = route.query.token
  return typeof value === 'string' && value.length > 0 ? value : null
})

const password = ref('')
const confirm = ref('')
const fieldErrors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)
const submitting = ref(false)
const done = ref(false)

async function submit() {
  fieldErrors.value = {}
  formError.value = null

  const parsed = passwordSchema.safeParse(password.value)
  if (!parsed.success) {
    fieldErrors.value.password = parsed.error.issues[0]?.message ?? 'Choose a longer password.'
    return
  }

  // Checked here and not server-side, because the server only ever receives
  // one password -- the confirmation exists to catch a typo, not to be
  // validated.
  if (password.value !== confirm.value) {
    fieldErrors.value.confirm = 'These two do not match.'
    return
  }

  if (!token.value) {
    formError.value = 'This link is missing its token. Request a new one.'
    return
  }

  submitting.value = true
  try {
    await api.auth.resetPassword({ newPassword: parsed.data, token: token.value })
    done.value = true
  } catch {
    /*
     * One message for every failure, and it is the useful one.
     *
     * Expired, already used, and never valid are indistinguishable to the
     * person reading it and the action is the same in all three cases. Naming
     * which it was would tell somebody holding a stolen link whether it is
     * worth trying another.
     */
    formError.value = 'That link has expired or has already been used. Request a new one.'
  } finally {
    submitting.value = false
  }
}

useHead({ title: 'Set a new password' })
</script>

<template>
  <div v-if="done" class="auth-form">
    <h1 class="auth-form__title">Password changed</h1>
    <p class="auth-form__subtitle">
      You have been signed out everywhere else, on every device. Sign in with your new
      password.
    </p>

    <UiAppButton variant="primary" block @click="navigateTo('/signin')">Sign in</UiAppButton>
  </div>

  <!-- No token at all: somebody has opened this page directly. Say so rather
       than showing a form that cannot possibly work. -->
  <div v-else-if="!token" class="auth-form">
    <h1 class="auth-form__title">This link is incomplete</h1>
    <p class="auth-form__subtitle">
      Password reset links only work in full, straight from the email. Ask for a new one
      and open it from your inbox.
    </p>

    <UiAppButton variant="primary" block @click="navigateTo('/forgot-password')">
      Request a new link
    </UiAppButton>
  </div>

  <form v-else class="auth-form" @submit.prevent="submit">
    <h1 class="auth-form__title">Set a new password</h1>
    <p class="auth-form__subtitle">Pick something you are not using anywhere else.</p>

    <label class="field">
      <span class="field__label">New password</span>
      <input
        v-model="password"
        type="password"
        class="field__input"
        autocomplete="new-password"
        required
      />
      <span v-if="fieldErrors.password" class="field__error">{{ fieldErrors.password }}</span>
    </label>

    <label class="field">
      <span class="field__label">Confirm new password</span>
      <input
        v-model="confirm"
        type="password"
        class="field__input"
        autocomplete="new-password"
        required
      />
      <span v-if="fieldErrors.confirm" class="field__error">{{ fieldErrors.confirm }}</span>
    </label>

    <p v-if="formError" class="auth-form__error" role="alert">{{ formError }}</p>

    <UiAppButton type="submit" variant="primary" :loading="submitting" block>
      Change password
    </UiAppButton>

    <NuxtLink to="/signin" class="auth-form__link">Back to sign in</NuxtLink>
  </form>
</template>
