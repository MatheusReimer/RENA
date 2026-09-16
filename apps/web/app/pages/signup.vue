<script setup lang="ts">
import {
  CONTENT_LANGUAGES,
  LANGUAGE_NAMES,
  LIMITS,
  PASSWORD_MIN_LENGTH,
  toContentLanguage,
} from '@revy/shared/constants'
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

const { locale, t } = useI18n()

/*
 * Prefilled from the active locale, which is itself whatever the browser
 * asked for. Somebody arriving with a Portuguese browser should find
 * "Portugues" already chosen, not have to notice a field and set it.
 */
const form = reactive({
  displayName: '',
  username: '',
  email: '',
  password: '',
  language: toContentLanguage(locale.value),
})
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
    /*
     * Straight to onboarding, not to the home screen (SPEC 21).
     *
     * This is the one moment a reader has agreed to spend time on us and has
     * nothing to look at yet -- a home screen with no personalised rows is a
     * worse first impression than four questions. It is skippable, and the
     * skip is recorded, so nobody who declines is asked again.
     */
    await navigateTo('/onboarding')
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
      formError.value = $t('auth.signUpFailed')
    }
  } finally {
    submitting.value = false
  }
}

useHead({ title: () => t('auth.signUpAction') })
</script>

<template>
  <form class="auth-form" @submit.prevent="submit">
    <h1 class="auth-form__title">{{ $t('auth.createAccount') }}</h1>
    <p class="auth-form__subtitle">{{ $t('auth.signUpSub') }}</p>

    <label class="field">
      <span class="field__label">{{ $t('auth.name') }}</span>
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
      <span class="field__label">{{ $t('auth.username') }}</span>
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
          :aria-label="$t('auth.usernameAvailable')"
        >
          {{ $t('auth.available') }}
        </span>
        <span
          v-else-if="usernameState === 'taken'"
          class="field__badge field__badge--bad"
          :aria-label="$t('auth.usernameTaken')"
        >
          {{ $t('auth.taken') }}
        </span>
      </div>
      <span v-if="fieldErrors.username" class="field__error">{{ fieldErrors.username[0] }}</span>
      <span v-else class="field__hint">{{ $t('auth.usernameHint') }}</span>
    </label>

    <label class="field">
      <span class="field__label">{{ $t('auth.email') }}</span>
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
      <span class="field__label">{{ $t('auth.password') }}</span>
      <input
        v-model="form.password"
        type="password"
        class="field__input"
        autocomplete="new-password"
        minlength="8"
        required
      />
      <span v-if="fieldErrors.password" class="field__error">{{ fieldErrors.password[0] }}</span>
      <span v-else class="field__hint">
        {{ $t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH }) }}
      </span>
    </label>

    <!--
      Asked, not assumed.

      It is prefilled from whatever the browser already told us, so for most
      people this is a glance rather than a decision. It is still a question
      because the answer is used for something a guess gets wrong: reviews
      written from this account are recorded as being in this language, and
      that is what a translation elsewhere will be attributed to.
    -->
    <label class="field">
      <span class="field__label">{{ $t('language.label') }}</span>
      <select v-model="form.language" class="field__input">
        <option v-for="tag in CONTENT_LANGUAGES" :key="tag" :value="tag">
          {{ LANGUAGE_NAMES[tag] }}
        </option>
      </select>
      <span class="field__hint">{{ $t('language.hint') }}</span>
    </label>

    <p v-if="formError" class="auth-form__error" role="alert">{{ formError }}</p>

    <UiAppButton type="submit" variant="primary" size="lg" block :loading="submitting">
      {{ $t('auth.signUpAction') }}
    </UiAppButton>

    <p class="auth-form__switch">
      {{ $t('auth.haveAccount') }}
      <NuxtLink to="/signin" class="auth-form__link">{{ $t('auth.signInAction') }}</NuxtLink>
    </p>
  </form>
</template>

<style scoped>
/* Shared form styles come from the `auth` layout. */
</style>
