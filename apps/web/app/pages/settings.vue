<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import type { UserSummary } from '@revy/shared/types'

/**
 * Settings: the things you do to your account rather than with it.
 *
 * Three sections, and two of them exist because the stores require them: the
 * list of people you have blocked has to be somewhere you can reach *without*
 * opening their profile -- which, being blocked, you cannot -- and deleting
 * your account has to be possible from inside the app.
 */
const api = useApi()
const auth = useAuthStore()
const notice = useNotice()
const { t } = useI18n()

useSeoMeta({ title: () => `${t('nav.settings')} · ${BRAND.name}`, robots: 'noindex' })

// Nothing here means anything to a visitor, and every request on the page
// would 401. The server refuses them regardless; this is the courtesy.
watchEffect(() => {
  if (auth.initialised && !auth.isSignedIn) navigateTo('/signin')
})

/* ------------------------------------------------------------------ *
 * Blocked accounts
 * ------------------------------------------------------------------ */

/*
 * Failure is an empty list rather than an error screen.
 *
 * This page is reachable from behind the confirm-your-address wall, where the
 * endpoint refuses -- and somebody who came here to delete their account
 * should not meet a broken screen on the way.
 */
const { data, refresh, status } = await useAsyncData('settings-blocks', () =>
  api.moderation.blocked().catch(() => ({ users: [] })),
)

const blocked = computed<UserSummary[]>(() => data.value?.users ?? [])
const unblocking = ref<string | null>(null)

async function unblock(user: UserSummary) {
  unblocking.value = user.username
  try {
    await api.moderation.unblock(user.username)
    await refresh()
  } catch (error) {
    notice.fromError(error)
  } finally {
    unblocking.value = null
  }
}

/* ------------------------------------------------------------------ *
 * Deleting the account
 * ------------------------------------------------------------------ */

const deleteOpen = ref(false)
const confirmUsername = ref('')
const deleting = ref(false)
const deleteError = ref<string | null>(null)

/** Typed back exactly, so this cannot happen by tapping twice. */
const canDelete = computed(
  () =>
    confirmUsername.value.trim().toLowerCase() === (auth.user?.username ?? '').toLowerCase() &&
    !deleting.value,
)

async function runDelete() {
  if (!canDelete.value) return

  deleting.value = true
  deleteError.value = null

  try {
    await api.account.remove(confirmUsername.value.trim())
    /*
     * The session died with the account, so the store has to be told rather
     * than asked: `signOut` would call an endpoint that no longer has a
     * session to end. A full page load clears every cached payload with it.
     */
    window.location.href = '/'
  } catch (error) {
    deleteError.value = error instanceof ApiError ? error.message : t('settings.deleteFailed')
    deleting.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page__head">
      <h1 class="page__title">{{ $t('nav.settings') }}</h1>
    </header>

    <section class="card">
      <h2 class="card__title">{{ $t('settings.blockedTitle') }}</h2>
      <p class="card__hint">{{ $t('settings.blockedHint') }}</p>

      <p v-if="status === 'pending'" class="card__hint">{{ $t('common.loading') }}</p>

      <p v-else-if="blocked.length === 0" class="card__hint">
        {{ $t('settings.blockedEmpty') }}
      </p>

      <ul v-else class="blocked">
        <li v-for="user in blocked" :key="user.id" class="blocked__row">
          <UiUserAvatar :user="user" size="sm" />
          <span class="blocked__name">{{ user.displayName }}</span>
          <UiAppButton
            variant="secondary"
            size="sm"
            :loading="unblocking === user.username"
            @click="unblock(user)"
          >
            {{ $t('settings.unblock') }}
          </UiAppButton>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2 class="card__title">{{ $t('settings.legalTitle') }}</h2>
      <p class="card__hint">{{ $t('settings.legalHint') }}</p>
      <NuxtLink class="card__link" to="/privacy">{{ $t('legal.privacy') }}</NuxtLink>
    </section>

    <section class="card card--danger">
      <h2 class="card__title">{{ $t('settings.deleteTitle') }}</h2>
      <p class="card__hint">{{ $t('settings.deleteHint') }}</p>

      <ul class="what">
        <li>{{ $t('settings.deleteKeeps') }}</li>
        <li>{{ $t('settings.deleteRemoves') }}</li>
        <li>{{ $t('settings.deleteFinal') }}</li>
      </ul>

      <UiAppButton v-if="!deleteOpen" variant="secondary" @click="deleteOpen = true">
        {{ $t('settings.deleteAction') }}
      </UiAppButton>

      <template v-else>
        <label class="confirm">
          <span class="confirm__label">
            {{ $t('settings.deleteConfirmLabel', { username: auth.user?.username ?? '' }) }}
          </span>
          <input
            v-model="confirmUsername"
            class="confirm__input"
            type="text"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
          />
        </label>

        <p v-if="deleteError" class="card__error" role="alert">{{ deleteError }}</p>

        <div class="confirm__actions">
          <UiAppButton variant="ghost" @click="deleteOpen = false">
            {{ $t('common.cancel') }}
          </UiAppButton>
          <UiAppButton
            variant="primary"
            :disabled="!canDelete"
            :loading="deleting"
            @click="runDelete"
          >
            {{ $t('settings.deleteConfirm') }}
          </UiAppButton>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: var(--space-5);
  max-width: var(--content-max);
  margin-inline: auto;
  padding: var(--space-5) var(--space-4) var(--space-10);
}

.page__title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  justify-items: start;
}

/* The one section that cannot be undone says so before it is read. */
.card--danger {
  border-color: var(--accent-border);
}

.card__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
}

.card__hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.card__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--danger);
}

.card__link {
  font-size: var(--text-sm);
  color: var(--accent-text);
  text-decoration: underline;
}

.what {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding-left: var(--space-5);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.blocked {
  display: grid;
  gap: var(--space-3);
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.blocked__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.blocked__name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.confirm {
  display: grid;
  gap: var(--space-2);
  width: 100%;
}

.confirm__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.confirm__input {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-base);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--input-font-size);
}

.confirm__actions {
  display: flex;
  gap: var(--space-3);
}
</style>
