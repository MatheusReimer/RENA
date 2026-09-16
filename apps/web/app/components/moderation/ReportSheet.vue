<script setup lang="ts">
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason, type ReportTarget } from '@revy/shared/constants'

/**
 * Reporting something, from wherever it is being read.
 *
 * Both stores require this of an app carrying other people's writing, and the
 * shape follows from who uses it: somebody who has just met something vile and
 * wants it gone in two taps. A reason and an optional sentence, no account
 * required beyond being signed in, and a confirmation that says what happens
 * next rather than thanking them.
 *
 * Same `<dialog>` as the rating sheet -- a bottom sheet on a phone, a centred
 * dialog on a desktop -- so focus trapping, Escape and the inert page behind
 * come from the platform.
 */
const props = defineProps<{
  targetType: ReportTarget
  targetId: string
  /** Whose writing it is, for the sentence at the top. Omitted for a person. */
  authorName?: string
}>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const api = useApi()

const dialog = ref<HTMLDialogElement | null>(null)
const reason = ref<ReportReason | null>(null)
const note = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref<string | null>(null)

watch(open, (isOpen) => {
  const element = dialog.value
  if (!element) return
  if (isOpen && !element.open) {
    // Fresh every time: a half-filled report from last week is never what this
    // one is about.
    reason.value = null
    note.value = ''
    sent.value = false
    error.value = null
    element.showModal()
  }
  if (!isOpen && element.open) element.close()
})

function onClose() {
  open.value = false
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialog.value) open.value = false
}

async function submit() {
  if (!reason.value || sending.value) return

  sending.value = true
  error.value = null

  try {
    await api.moderation.report({
      targetType: props.targetType,
      targetId: props.targetId,
      reason: reason.value,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    })
    sent.value = true
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : t('report.failed')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="sheet" @close="onClose" @click="onBackdropClick">
    <div class="sheet__panel">
      <div class="sheet__grip" aria-hidden="true" />

      <template v-if="sent">
        <h2 class="sheet__title">{{ $t('report.sentTitle') }}</h2>
        <p class="sheet__hint">{{ $t('report.sentBody') }}</p>
        <div class="sheet__actions">
          <UiAppButton variant="primary" block @click="open = false">
            {{ $t('common.done') }}
          </UiAppButton>
        </div>
      </template>

      <template v-else>
        <h2 class="sheet__title">
          {{ authorName ? $t('report.titleFor', { name: authorName }) : $t('report.title') }}
        </h2>
        <p class="sheet__hint">{{ $t('report.hint') }}</p>

        <fieldset class="reasons">
          <legend class="sr-only">{{ $t('report.reasonLegend') }}</legend>
          <label v-for="value in REPORT_REASONS" :key="value" class="reason">
            <input v-model="reason" type="radio" name="reason" :value="value" />
            <span>{{ $t(`report.reason.${value}`) }}</span>
          </label>
        </fieldset>

        <label class="note">
          <span class="note__label">{{ $t('report.noteLabel') }}</span>
          <textarea
            v-model="note"
            class="note__input"
            rows="3"
            :maxlength="REPORT_NOTE_MAX"
            :placeholder="$t('report.notePlaceholder')"
          />
        </label>

        <p v-if="error" class="sheet__error" role="alert">{{ error }}</p>

        <div class="sheet__actions">
          <UiAppButton variant="ghost" block @click="open = false">
            {{ $t('common.cancel') }}
          </UiAppButton>
          <UiAppButton
            variant="primary"
            block
            :disabled="!reason"
            :loading="sending"
            @click="submit"
          >
            {{ $t('report.submit') }}
          </UiAppButton>
        </div>
      </template>
    </div>
  </dialog>
</template>

<style scoped>
/*
 * A bottom sheet under 40rem and a centred dialog above it, which is the same
 * arrangement the rating sheet uses. Two different components sliding in from
 * two different places would read as two different products.
 */
.sheet {
  width: 100%;
  max-width: none;
  margin: 0;
  margin-top: auto;
  padding: 0;
  border: 0;
  background: transparent;
}

.sheet::backdrop {
  background: rgb(4 4 6 / 0.72);
  backdrop-filter: blur(6px);
}

.sheet__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5)
    calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  background: var(--surface-overlay);
  color: var(--text-primary);
}

.sheet__grip {
  width: 2.5rem;
  height: 0.25rem;
  margin-inline: auto;
  border-radius: var(--radius-full);
  background: var(--border-strong);
}

.sheet__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
}

.sheet__hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.sheet__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--danger);
}

.sheet__actions {
  display: flex;
  gap: var(--space-3);
}

.reasons {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

/* A row rather than a dot to aim at: on a phone the whole line is the target. */
.reason {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 2.75rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: var(--cursor-hand);
}

.reason:has(input:checked) {
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.reason input {
  accent-color: var(--accent);
}

.note {
  display: grid;
  gap: var(--space-2);
}

.note__label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.note__input {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-base);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--input-font-size);
  resize: vertical;
}

@media (min-width: 40rem) {
  .sheet {
    max-width: 28rem;
    margin: auto;
  }

  .sheet__panel {
    border-radius: var(--radius-xl);
    padding-bottom: var(--space-6);
  }

  .sheet__grip {
    display: none;
  }
}
</style>
