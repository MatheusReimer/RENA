<script setup lang="ts">
import { emailSchema } from '@revy/shared/schemas'

/**
 * Ask for a reset link (SPEC 26).
 *
 * The whole screen is built around one rule: it must never reveal whether an
 * address has an account. Better Auth answers identically either way, and the
 * copy here has to keep that promise -- "we've sent you an email" is a leak,
 * because it is only true for addresses that exist.
 *
 * So the success state says *if*. It reads slightly awkwardly and that is the
 * correct trade: the alternative turns this form into a tool for checking
 * whether someone you know is a member.
 */
definePageMeta({ layout: 'auth' })

const api = useApi()

const email = ref('')
const fieldError = ref<string | null>(null)
const formError = ref<string | null>(null)
const submitting = ref(false)
const sent = ref(false)

async function submit() {
  fieldError.value = null
  formError.value = null

  const parsed = emailSchema.safeParse(email.value)
  if (!parsed.success) {
    fieldError.value = parsed.error.issues[0]?.message ?? 'Enter a valid email address.'
    return
  }

  submitting.value = true
  try {
    await api.auth.requestPasswordReset({
      email: parsed.data,
      // Where the link lands. Absolute is built server-side from the app URL;
      // this is the path within it.
      redirectTo: '/reset-password',
    })
    sent.value = true
  } catch {
    /*
     * Even a failure shows the same screen.
     *
     * A distinguishable error here would reintroduce exactly the enumeration
     * this endpoint is designed to prevent -- "unknown address" and "mail
     * server down" must look the same from outside. Genuine outages surface in
     * the server logs, where they belong.
     */
    sent.value = true
  } finally {
    submitting.value = false
  }
}

useHead({ title: 'Reset your password' })
</script>

<template>
  <div v-if="sent" class="auth-form">
    <h1 class="auth-form__title">Check your email</h1>
    <p class="auth-form__subtitle">
      If <strong>{{ email }}</strong> has a RENA account, a reset link is on its way. It
      works once and expires in an hour.
    </p>

    <p class="note">
      Nothing arrived? Check the spam folder, then
      <button type="button" class="link" @click="sent = false">try another address</button>.
    </p>

    <NuxtLink to="/signin" class="auth-form__link">Back to sign in</NuxtLink>
  </div>

  <form v-else class="auth-form" @submit.prevent="submit">
    <h1 class="auth-form__title">Forgot your password?</h1>
    <p class="auth-form__subtitle">
      Give us the address you signed up with and we'll send you a link to set a new one.
    </p>

    <label class="field">
      <span class="field__label">Email</span>
      <input
        v-model="email"
        type="email"
        class="field__input"
        autocomplete="email"
        required
      />
      <span v-if="fieldError" class="field__error">{{ fieldError }}</span>
    </label>

    <p v-if="formError" class="auth-form__error" role="alert">{{ formError }}</p>

    <UiAppButton type="submit" variant="primary" :loading="submitting" block>
      Send the link
    </UiAppButton>

    <NuxtLink to="/signin" class="auth-form__link">Back to sign in</NuxtLink>
  </form>
</template>

<style scoped>
.note {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-tertiary);
}

/* A button that looks like a link, because it is an action rather than a
   destination -- using an anchor here would promise navigation. */
.link {
  color: var(--text-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
