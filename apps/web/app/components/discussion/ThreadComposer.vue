<script setup lang="ts">
import { LIMITS } from '@revy/shared/constants'

/**
 * Starts a new discussion on a media item (SPEC 14).
 *
 * The opening message is optional but posted in the same request when present,
 * so a thread never exists as a bare title with no body.
 */
const props = defineProps<{
  mediaId: string
  mediaTitle: string
}>()

const emit = defineEmits<{ close: []; created: [threadId: string] }>()

const api = useApi()
const { t } = useI18n()

const title = ref('')
const content = ref('')
const spoiler = ref(false)
const saving = ref(false)
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)

const canSubmit = computed(
  () =>
    title.value.trim().length >= LIMITS.discussionTitle.min &&
    title.value.length <= LIMITS.discussionTitle.max,
)

const dialog = ref<HTMLDialogElement | null>(null)

onMounted(() => dialog.value?.showModal())

async function submit() {
  if (!canSubmit.value || saving.value) return

  saving.value = true
  fieldErrors.value = {}
  formError.value = null

  try {
    const { thread } = await api.discussions.create({
      mediaId: props.mediaId,
      title: title.value.trim(),
      spoiler: spoiler.value,
      ...(content.value.trim() ? { content: content.value.trim() } : {}),
    })
    emit('created', thread.id)
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.fields) fieldErrors.value = err.fields
      else formError.value = err.message
    } else {
      formError.value = t('discussion.startFailed')
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="modal"
    @close="emit('close')"
    @click="(e) => e.target === dialog && emit('close')"
  >
    <form class="modal__panel" @submit.prevent="submit">
      <header class="modal__header">
        <h2 class="modal__title">Start a discussion</h2>
        <button type="button" class="modal__close" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>

      <p class="modal__context">on {{ mediaTitle }}</p>

      <label class="field">
        <span class="field__label">Title</span>
        <input
          v-model="title"
          type="text"
          class="field__input"
          :placeholder="t('discussion.titlePlaceholder')"
          :maxlength="LIMITS.discussionTitle.max"
          required
        />
        <span v-if="fieldErrors.title" class="field__error">{{ fieldErrors.title[0] }}</span>
        <span v-else class="field__hint">
          Keep the title itself spoiler-free — it shows in the list.
        </span>
      </label>

      <label class="field">
        <span class="field__label">Opening message (optional)</span>
        <textarea
          v-model="content"
          class="field__input field__input--area"
          rows="5"
          :placeholder="t('discussion.bodyPlaceholder')"
          :maxlength="LIMITS.commentContent.max"
        />
        <span v-if="fieldErrors.content" class="field__error">{{ fieldErrors.content[0] }}</span>
      </label>

      <label class="modal__spoiler">
        <input v-model="spoiler" type="checkbox" />
        <span>This discussion contains spoilers</span>
      </label>

      <p v-if="formError" class="modal__error" role="alert">{{ formError }}</p>

      <div class="modal__actions">
        <UiAppButton variant="ghost" block @click="emit('close')">Cancel</UiAppButton>
        <UiAppButton
          type="submit"
          variant="primary"
          block
          :loading="saving"
          :disabled="!canSubmit"
        >
          Start discussion
        </UiAppButton>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.modal {
  padding: 0;
  border: none;
  background: transparent;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  color: var(--text-primary);
}

.modal::backdrop {
  background: rgb(0 0 0 / 0.6);
}

.modal:not([open]) {
  display: none;
}

.modal__panel {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: 92dvh;
  overflow-y: auto;
  padding: var(--space-5) var(--space-5)
    calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
  background: var(--surface-raised);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  border-top: 1px solid var(--border-default);
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.modal__title {
  font-size: var(--text-lg);
}

.modal__context {
  margin-top: calc(var(--space-2) * -1);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.modal__close {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  font-size: var(--text-2xl);
  line-height: 1;
  color: var(--text-tertiary);
}

.modal__close:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field__label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}

.field__input {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--surface-base);
  color: var(--text-primary);
  font-size: var(--text-base);
}

.field__input--area {
  line-height: var(--leading-normal);
  resize: vertical;
}

.field__input:focus {
  outline: none;
  border-color: var(--border-strong);
}

.field__input::placeholder {
  color: var(--text-tertiary);
}

.field__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.field__error {
  font-size: var(--text-xs);
  color: var(--danger);
}

.modal__spoiler {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: var(--cursor-hand);
}

.modal__spoiler input {
  accent-color: var(--accent);
  width: 1rem;
  height: 1rem;
}

.modal__error {
  font-size: var(--text-sm);
  color: var(--danger);
}

.modal__actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

@media (min-width: 40rem) {
  .modal {
    display: grid;
    place-items: center;
  }

  .modal__panel {
    position: static;
    max-width: 32rem;
    margin: auto;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
  }
}
</style>
