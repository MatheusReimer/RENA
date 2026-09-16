<script setup lang="ts">
import { AUTH_LINK_TTL_MINUTES, AUTH_RESEND_COOLDOWN_SECONDS } from '@revy/shared/constants'
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
 *
 * The same rule decides what the resend button is allowed to do. It reports
 * that it sent, never what happened -- a spinner that resolves differently for
 * a real address than an invented one would hand back the oracle the copy is
 * so careful not to give.
 */
definePageMeta({ layout: 'auth' })

const api = useApi()
const route = useRoute()
const { t } = useI18n()

/*
 * Prefilled from the query, which `/signin` fills in from its own email field.
 *
 * Somebody arriving here has just failed to sign in; asking them to type the
 * address again is asking them to repeat the step they were already stuck on.
 */
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')

const fieldError = ref<string | null>(null)
const submitting = ref(false)
const sent = ref(false)

/** Seconds left before the link can be requested again; 0 means it can. */
const cooldown = ref(0)
/** Shown after a successful resend, cleared when the countdown restarts. */
const resentNotice = ref(false)

let timer: ReturnType<typeof setInterval> | undefined

function startCooldown() {
  cooldown.value = AUTH_RESEND_COOLDOWN_SECONDS
  clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}

// An interval outlives the page without this, and fires against a component
// that is no longer mounted.
onBeforeUnmount(() => clearInterval(timer))

/** Posts the request. Never throws, and never reports what came back. */
async function request(address: string) {
  try {
    await api.auth.requestPasswordReset({
      email: address,
      // Where the link lands. Absolute is built server-side from the app URL;
      // this is the path within it.
      redirectTo: '/reset-password',
    })
  } catch {
    /*
     * Even a failure shows the same screen.
     *
     * A distinguishable error here would reintroduce exactly the enumeration
     * this endpoint is designed to prevent -- "unknown address", "rate
     * limited" and "mail server down" must look the same from outside.
     * Genuine outages surface in the server logs, where they belong.
     */
  }
}

async function submit() {
  fieldError.value = null

  const parsed = emailSchema.safeParse(email.value)
  if (!parsed.success) {
    fieldError.value = parsed.error.issues[0]?.message ?? t('auth.emailInvalid')
    return
  }

  submitting.value = true
  await request(parsed.data)
  submitting.value = false

  sent.value = true
  resentNotice.value = false
  startCooldown()
}

async function resend() {
  if (cooldown.value > 0 || submitting.value) return

  const parsed = emailSchema.safeParse(email.value)
  if (!parsed.success) return

  submitting.value = true
  await request(parsed.data)
  submitting.value = false

  resentNotice.value = true
  startCooldown()
}

function useAnotherAddress() {
  sent.value = false
  resentNotice.value = false
  clearInterval(timer)
  cooldown.value = 0
}

useHead({ title: () => t('auth.forgotTitle') })
</script>

<template>
  <!-- `role="status"` because this replaces the form in place rather than
       navigating: without it a screen reader is left on a submit button that
       no longer exists, with no idea the request succeeded. -->
  <div v-if="sent" class="auth-form" role="status">
    <h1 class="auth-form__title">{{ t('auth.checkEmailTitle') }}</h1>
    <i18n-t keypath="auth.checkEmailBody" tag="p" class="auth-form__subtitle" scope="global">
      <template #email><strong>{{ email }}</strong></template>
      <template #minutes>{{ AUTH_LINK_TTL_MINUTES }}</template>
    </i18n-t>

    <p class="note">{{ t('auth.nothingArrived') }}</p>

    <UiAppButton
      variant="secondary"
      :disabled="cooldown > 0"
      :loading="submitting"
      block
      @click="resend()"
    >
      {{ cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend') }}
    </UiAppButton>

    <!-- Announced separately from the block above, so a resend is audible
         rather than being a button that silently re-disables itself. -->
    <p v-if="resentNotice" class="note note--ok" role="status">{{ t('auth.resent') }}</p>

    <button type="button" class="link" @click="useAnotherAddress()">
      {{ t('auth.tryAnother') }}
    </button>

    <NuxtLink to="/signin" class="auth-form__link">{{ t('auth.backToSignIn') }}</NuxtLink>
  </div>

  <form v-else class="auth-form" @submit.prevent="submit">
    <h1 class="auth-form__title">{{ t('auth.forgotTitle') }}</h1>
    <p class="auth-form__subtitle">{{ t('auth.forgotSubtitle') }}</p>

    <label class="field">
      <span class="field__label">{{ t('auth.email') }}</span>
      <input
        v-model="email"
        type="email"
        class="field__input"
        autocomplete="email"
        autofocus
        required
      />
      <span v-if="fieldError" class="field__error">{{ fieldError }}</span>
    </label>

    <UiAppButton type="submit" variant="primary" :loading="submitting" block>
      {{ t('auth.sendLink') }}
    </UiAppButton>

    <NuxtLink to="/signin" class="auth-form__link">{{ t('auth.backToSignIn') }}</NuxtLink>
  </form>
</template>

<style scoped>
.note {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-tertiary);
}

.note--ok {
  color: var(--text-secondary);
}

/* A button that looks like a link, because it is an action rather than a
   destination -- using an anchor here would promise navigation. */
.link {
  color: var(--text-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
