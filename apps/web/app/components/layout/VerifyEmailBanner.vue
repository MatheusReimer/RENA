<script setup lang="ts">
import { AUTH_RESEND_COOLDOWN_SECONDS } from '@revy/shared/constants'

/**
 * "Confirm your email" (SPEC 26).
 *
 * The visible half of the soft gate. An unconfirmed account can read, rate and
 * keep its own lists; what it cannot do is publish, message, or land in
 * somebody's notifications -- see `useVerifiedContext`. This is what makes
 * that legible before somebody writes a review and has it refused.
 *
 * Dismissible, and the dismissal is per tab rather than remembered. A banner
 * that stays gone is a banner somebody closes on day one and never sees again
 * while wondering why they cannot post; coming back on the next visit is the
 * point of it. `sessionStorage` rather than `localStorage` for exactly that.
 */
const auth = useAuthStore()
const api = useApi()
const { t } = useI18n()

const DISMISS_KEY = 'rena.verify-banner.dismissed'

const dismissed = ref(false)
const sending = ref(false)
const sent = ref(false)
const cooldown = ref(0)

let timer: ReturnType<typeof setInterval> | undefined

/*
 * Read on mount, not during setup.
 *
 * `sessionStorage` does not exist while rendering on the server, and reading
 * it in setup would make the server and the client disagree about whether the
 * banner is there -- a hydration mismatch on every screen in the app.
 */
onMounted(() => {
  try {
    dismissed.value = sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Private browsing, or site data blocked. Showing the banner is the safe
    // side of that failure.
  }
})

onBeforeUnmount(() => clearInterval(timer))

const show = computed(() => auth.isSignedIn && !auth.emailVerified && !dismissed.value)

function dismiss() {
  dismissed.value = true
  try {
    sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Not remembering is an acceptable outcome; failing to close is not.
  }
}

async function send() {
  if (cooldown.value > 0 || sending.value) return

  sending.value = true
  try {
    // No address passed: the server takes it from the session. See
    // `server/api/auth/resend-verification.post.ts`.
    await api.auth.resendVerification()
  } catch {
    /*
     * Reported as sent either way.
     *
     * Better Auth does not say whether the address was already confirmed, and
     * an error here would mostly mean "already done" -- which reads as a fault
     * when it is the outcome somebody wanted. A genuine outage is in the
     * server logs, where it belongs.
     */
  }
  sending.value = false

  sent.value = true
  cooldown.value = AUTH_RESEND_COOLDOWN_SECONDS
  clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}
</script>

<template>
  <!-- `role="status"`, not `alert`: nothing is wrong and nothing is urgent, and
       an assertive live region interrupts whatever is being read. -->
  <div v-if="show" class="verify" role="status">
    <p class="verify__text">
      <span class="verify__full">{{ t('auth.verifyBanner') }}</span>
      <span class="verify__short">{{ t('auth.verifyBannerShort') }}</span>
    </p>

    <div class="verify__actions">
      <span v-if="sent" class="verify__sent">{{ t('auth.verifySent') }}</span>

      <button
        type="button"
        class="verify__send"
        :disabled="cooldown > 0 || sending"
        @click="send()"
      >
        {{ cooldown > 0 ? t('auth.verifySendIn', { seconds: cooldown }) : t('auth.verifySend') }}
      </button>

      <button type="button" class="verify__dismiss" @click="dismiss()">
        {{ t('auth.verifyDismiss') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.verify {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  /* Tinted rather than solid accent. This is a standing condition, not an
     error, and a full-strength red bar on every screen reads as a fault the
     reader cannot fix. */
  background: var(--accent-soft);
  border-bottom: 1px solid var(--border-default);
  font-size: var(--text-sm);
}

.verify__text {
  margin: 0;
  color: var(--text-primary);
}

/* The long sentence explains the gate, which is worth the room when there is
   room. Narrow screens get the label only -- a banner that wraps to three
   lines pushes the actual page below the fold. */
.verify__short {
  display: none;
}

@media (max-width: 34rem) {
  .verify__full {
    display: none;
  }

  .verify__short {
    display: inline;
  }
}

.verify__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.verify__sent {
  color: var(--text-secondary);
}

.verify__send {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--accent);
  border-radius: var(--radius-full);
  color: var(--accent);
  font-weight: 600;
  cursor: var(--cursor-hand);
}

.verify__send:disabled {
  border-color: var(--border-default);
  color: var(--text-tertiary);
  cursor: default;
}

.verify__dismiss {
  color: var(--text-tertiary);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: var(--cursor-hand);
}
</style>
