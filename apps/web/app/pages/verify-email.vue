<script setup lang="ts">
import { AUTH_RESEND_COOLDOWN_SECONDS } from '@revy/shared/constants'

/**
 * The wall (SPEC 26).
 *
 * Every authenticated route refuses an unconfirmed address, so this is the
 * only screen such an account can reach. It has three jobs, in order of how
 * often they matter: say which address the link went to, offer another one,
 * and offer the way out for somebody who typed the address wrong and needs to
 * start again.
 *
 * It uses the `auth` layout rather than the app shell for the same reason the
 * sign-in screen does -- there is nothing to navigate to yet.
 */
definePageMeta({ layout: 'auth' })

const auth = useAuthStore()
const api = useApi()
const notice = useNotice()
const { t } = useI18n()

useHead({ title: () => t('auth.verifyTitle') })

const sending = ref(false)
const sent = ref(false)
/** Set when the server says the send failed, as opposed to the request failing. */
const failed = ref(false)
const cooldown = ref(0)

let timer: ReturnType<typeof setInterval> | undefined
let poll: ReturnType<typeof setInterval> | undefined

/**
 * Whether to lead with "we could not send it" rather than "check your inbox".
 *
 * Seeded from the server, which remembers a send that failed during sign-up,
 * and then owned by whatever the last Resend actually did. Without the first
 * half, somebody whose confirmation mail never left the building would be told
 * to go on waiting for it.
 */
const undelivered = computed(() => failed.value || (!sent.value && auth.verificationMailFailed))

onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(poll)
})

/**
 * The link is usually opened in another tab, or on a phone while this screen
 * is on a laptop -- and confirming there does nothing to the session object
 * being held here. Without this the reader confirms, comes back, and is still
 * looking at the wall with no reason to think refreshing would help.
 *
 * A minute is slow enough to be free and fast enough that nobody sits here
 * wondering. The middleware does the actual redirect once the flag flips.
 */
onMounted(() => {
  poll = setInterval(() => {
    if (!auth.emailVerified) void auth.load(true)
  }, 60_000)
})

function startCooldown() {
  cooldown.value = AUTH_RESEND_COOLDOWN_SECONDS
  clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}

async function send() {
  if (cooldown.value > 0 || sending.value) return

  sending.value = true
  try {
    // No address passed: the server takes it from the session. See
    // `server/api/auth/resend-verification.post.ts`.
    const result = await api.auth.resendVerification()
    failed.value = !result.sent
    sent.value = result.sent
    if (result.sent) auth.verificationMailFailed = false
  } catch {
    /*
     * The request itself did not land -- a dropped connection, a 429 from the
     * rate limiter. Indistinguishable from here, and the reader's next move is
     * the same either way, so it is reported as a send that did not happen
     * rather than guessed at.
     */
    failed.value = true
    sent.value = false
  } finally {
    sending.value = false
    startCooldown()
  }
}

/** Signing out is how somebody who typed the wrong address starts again. */
async function leave() {
  try {
    await auth.signOut()
  } catch (error) {
    /*
     * `signOut` rethrows when the server did not confirm, and staying put is
     * the honest outcome -- the session is still live, and navigating away
     * would only stop displaying somebody who is still signed in.
     *
     * But staying put without a word is a Sign out button that does nothing,
     * on the one screen where signing out is the only way to correct a
     * mistyped address. So the reason goes on screen and they can try again.
     */
    notice.fromError(error)
  }
}
</script>

<template>
  <div class="auth-form">
    <h1 class="auth-form__title">{{ $t('auth.verifyTitle') }}</h1>

    <!--
      `role="status"` rather than `alert`, even for the failure. Nothing is
      urgent, the reader arrived here on purpose, and an assertive region
      interrupts whatever a screen reader was already saying.
    -->
    <p class="auth-form__subtitle" role="status">
      <template v-if="undelivered">{{ $t('auth.verifyUndelivered') }}</template>
      <template v-else-if="auth.verificationEmail">
        <i18n-t keypath="auth.verifySentTo" tag="span" scope="global">
          <template #email><strong class="wall__email">{{ auth.verificationEmail }}</strong></template>
        </i18n-t>
      </template>
      <template v-else>{{ $t('auth.verifyBody') }}</template>
    </p>

    <p v-if="sent" class="wall__sent" role="status">{{ $t('auth.verifySent') }}</p>

    <UiAppButton
      variant="primary"
      size="lg"
      block
      :loading="sending"
      :disabled="cooldown > 0"
      @click="send()"
    >
      {{ cooldown > 0 ? $t('auth.verifySendIn', { seconds: cooldown }) : $t('auth.verifyResend') }}
    </UiAppButton>

    <p class="wall__hint">{{ $t('auth.nothingArrived') }}</p>

    <p class="auth-form__switch">
      {{ $t('auth.verifyWrongAddress') }}
      <button type="button" class="auth-form__link wall__out" @click="leave()">
        {{ $t('auth.signOut') }}
      </button>
    </p>
  </div>
</template>

<style scoped>
.wall__email {
  /* The address is the one thing on this screen somebody has to read
     character by character -- it is where the typo is. */
  color: var(--text-primary);
  word-break: break-all;
}

.wall__sent {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.wall__hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* A button, because it ends a session rather than going somewhere, styled as
   the link beside it so the row reads as one sentence. */
.wall__out {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: var(--cursor-hand);
}
</style>
