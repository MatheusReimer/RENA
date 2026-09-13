<script setup lang="ts">
import { LIMITS } from '@revy/shared/constants'
import { signUpSchema } from '@revy/shared/schemas'

/**
 * Registration (SPEC 26).
 *
 * Validates with the same Zod schema the server uses, so the form and the API
 * can never disagree about what is acceptable. SPEC 25 is clear that this is
 * for UX only -- the server re-validates everything regardless.
 */
definePageMeta({ layout: 'auth' })

const auth = useAuthStore()
const api = useApi()

const form = reactive({ displayName: '', username: '', email: '', password: '' })
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)
const submitting = ref(false)

/** Live availability check. Purely an affordance; registration re-checks. */
const usernameState = ref<'idle' | 'checking' | 'available' | 'taken'>('idle')
let checkTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => form.username,
  (value) => {
    clearTimeout(checkTimer)
    usernameState.value = 'idle'

    const parsed = usernameSchemaSafe(value)
    if (!parsed) return

    usernameState.value = 'checking'
    checkTimer = setTimeout(async () => {
      try {
        const { available } = await api.auth.checkUsername(value)
        // Ignore a response for a username the user has since edited away from.
        if (form.username !== value) return
        usernameState.value = available ? 'available' : 'taken'
      } catch {
        usernameState.value = 'idle'
      }
    }, 400)
  },
)

function usernameSchemaSafe(value: string): boolean {
  return signUpSchema.shape.username.safeParse(value).success
}

async function submit() {
  fieldErrors.value = {}
  formError.value = null

  const parsed = signUpSchema.safeParse(form)
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
    await auth.register(parsed.data)
    await navigateTo('/')
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.fields) fieldErrors.value = error.fields
      else if (error.code === 'USERNAME_TAKEN') {
        fieldErrors.value = { username: [error.message] }
      } else if (error.code === 'EMAIL_TAKEN') {
        fieldErrors.value = { email: [error.message] }
      } else {
        formError.value = error.message
      }
    } else {
      formError.value = 'Could not create your account. Please try again.'
    }
  } finally {
    submitting.value = false
  }
}

useHead({ title: 'Create account' })
</script>

<template>
  <form class="auth-form" @submit.prevent="submit">
    <h1 class="auth-form__title">Create your account</h1>
    <p class="auth-form__subtitle">Rate what you watch and read. Share it with friends.</p>

    <label class="field">
      <span class="field__label">Name</span>
      <input
        v-model="form.displayName"
        type="text"
        class="field__input"
        autocomplete="name"
        :maxlength="LIMITS.displayName.max"
        required
      />
      <span v-if="fieldErrors.displayName" class="field__error">
        {{ fieldErrors.displayName[0] }}
      </span>
    </label>

    <label class="field">
      <span class="field__label">Username</span>
      <div class="field__wrap">
        <span class="field__prefix">@</span>
        <input
          v-model="form.username"
          type="text"
          class="field__input field__input--prefixed"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          :maxlength="LIMITS.username.max"
          required
        />
        <span
          v-if="usernameState === 'available'"
          class="field__badge field__badge--ok"
          aria-label="Username available"
        >
          Available
        </span>
        <span
          v-else-if="usernameState === 'taken'"
          class="field__badge field__badge--bad"
          aria-label="Username taken"
        >
          Taken
        </span>
      </div>
      <span v-if="fieldErrors.username" class="field__error">{{ fieldErrors.username[0] }}</span>
      <span v-else class="field__hint">Letters, numbers and underscores.</span>
    </label>

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
        autocomplete="new-password"
        minlength="8"
        required
      />
      <span v-if="fieldErrors.password" class="field__error">{{ fieldErrors.password[0] }}</span>
      <span v-else class="field__hint">At least 8 characters.</span>
    </label>

    <p v-if="formError" class="auth-form__error" role="alert">{{ formError }}</p>

    <UiAppButton type="submit" variant="primary" size="lg" block :loading="submitting">
      Create account
    </UiAppButton>

    <p class="auth-form__switch">
      Already have an account?
      <NuxtLink to="/signin" class="auth-form__link">Sign in</NuxtLink>
    </p>
  </form>
</template>

<style scoped>
@import '~/assets/css/auth-form.css';
</style>
