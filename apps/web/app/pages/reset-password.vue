<script setup lang="ts">
import { PASSWORD_MIN_LENGTH } from '@revy/shared/constants'
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
const { t } = useI18n()

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
    fieldErrors.value.password = parsed.error.issues[0]?.message ?? t('auth.passwordTooShort')
    return
  }

  // Checked here and not server-side, because the server only ever receives
  // one password -- the confirmation exists to catch a typo, not to be
  // validated.
  if (password.value !== confirm.value) {
    fieldErrors.value.confirm = t('auth.passwordMismatch')
    return
  }

  if (!token.value) {
    formError.value = t('auth.linkDead')
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
    formError.value = t('auth.linkDead')
  } finally {
    submitting.value = false
  }
}

useHead({ title: () => t('auth.resetTitle') })
</script>

<template>
  <div v-if="done" class="auth-form">
    <h1 class="auth-form__title">{{ t('auth.changedTitle') }}</h1>
    <p class="auth-form__subtitle">{{ t('auth.changedBody') }}</p>

    <UiAppButton variant="primary" block @click="navigateTo('/signin')">
      {{ t('common.signIn') }}
    </UiAppButton>
  </div>

  <!-- No token at all: somebody has opened this page directly. Say so rather
       than showing a form that cannot possibly work. -->
  <div v-else-if="!token" class="auth-form">
    <h1 class="auth-form__title">{{ t('auth.incompleteTitle') }}</h1>
    <p class="auth-form__subtitle">{{ t('auth.incompleteBody') }}</p>

    <UiAppButton variant="primary" block @click="navigateTo('/forgot-password')">
      {{ t('auth.requestNewLink') }}
    </UiAppButton>
  </div>

  <form v-else class="auth-form" @submit.prevent="submit">
    <h1 class="auth-form__title">{{ t('auth.resetTitle') }}</h1>
    <p class="auth-form__subtitle">{{ t('auth.resetSubtitle') }}</p>

    <label class="field">
      <span class="field__label">{{ t('auth.newPassword') }}</span>
      <input
        v-model="password"
        type="password"
        class="field__input"
        autocomplete="new-password"
        autofocus
        required
      />
      <!-- Stated before they type, not after they are rejected. The number
           comes from the same constant `passwordSchema` validates against. -->
      <span v-if="!fieldErrors.password" class="field__hint">
        {{ t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH }) }}
      </span>
      <span v-else class="field__error">{{ fieldErrors.password }}</span>
    </label>

    <label class="field">
      <span class="field__label">{{ t('auth.confirmPassword') }}</span>
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
      {{ t('auth.changePassword') }}
    </UiAppButton>

    <NuxtLink to="/signin" class="auth-form__link">{{ t('auth.backToSignIn') }}</NuxtLink>
  </form>
</template>
