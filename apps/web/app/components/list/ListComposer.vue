<script setup lang="ts">
import { LIMITS, LIST_VISIBILITIES } from '@revy/shared/constants'
import type { ListSummary, ListVisibility } from '@revy/shared/types'

/**
 * Create or edit a list (SPEC 15).
 *
 * One component for both, because the fields are identical and the only
 * difference is which request it sends.
 */
const props = withDefaults(
  defineProps<{
    /** Passing a list switches the form to edit mode. */
    list?: ListSummary | null
  }>(),
  { list: null },
)

const emit = defineEmits<{ close: []; created: [list: ListSummary]; updated: [list: ListSummary] }>()

const api = useApi()
const { t } = useI18n()

const isEdit = computed(() => props.list !== null)

const name = ref(props.list?.name ?? '')
const description = ref(props.list?.description ?? '')
const visibility = ref<ListVisibility>(props.list?.visibility ?? 'private')

const saving = ref(false)
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)

const canSubmit = computed(
  () => name.value.trim().length > 0 && name.value.length <= LIMITS.listName.max,
)

/** Plain-language explanation of each visibility (SPEC 15). */
const VISIBILITY_COPY: Record<ListVisibility, { label: string; hint: string }> = {
  private: { label: 'Private', hint: 'Only you can see this list.' },
  friends: { label: 'Friends', hint: 'Your friends can see it.' },
  public: { label: 'Public', hint: 'Anyone can see it. Earns XP.' },
}

const dialog = ref<HTMLDialogElement | null>(null)

onMounted(() => dialog.value?.showModal())

async function submit() {
  if (!canSubmit.value || saving.value) return

  saving.value = true
  fieldErrors.value = {}
  formError.value = null

  const body = {
    name: name.value.trim(),
    description: description.value.trim() || null,
    visibility: visibility.value,
  }

  try {
    if (props.list) {
      const { list } = await api.lists.update(props.list.id, body)
      emit('updated', list)
    } else {
      const { list } = await api.lists.create(body)
      emit('created', list)
    }
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.fields) fieldErrors.value = err.fields
      else formError.value = err.message
    } else {
      formError.value = t('lists.saveFailed')
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
        <h2 class="modal__title">{{ isEdit ? t('lists.edit') : t('lists.new') }}</h2>
        <button type="button" class="modal__close" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>

      <label class="field">
        <span class="field__label">Name</span>
        <input
          v-model="name"
          type="text"
          class="field__input"
          :placeholder="t('lists.namePlaceholder')"
          :maxlength="LIMITS.listName.max"
          required
        />
        <span v-if="fieldErrors.name" class="field__error">{{ fieldErrors.name[0] }}</span>
      </label>

      <label class="field">
        <span class="field__label">Description (optional)</span>
        <textarea
          v-model="description"
          class="field__input field__input--area"
          rows="3"
          :placeholder="t('lists.notePlaceholder')"
          :maxlength="LIMITS.listDescription.max"
        />
      </label>

      <fieldset class="visibility">
        <legend class="field__label">Who can see it</legend>
        <label
          v-for="option in LIST_VISIBILITIES"
          :key="option"
          class="visibility__option"
          :class="{ 'visibility__option--active': visibility === option }"
        >
          <input v-model="visibility" type="radio" :value="option" name="visibility" />
          <span class="visibility__text">
            <span class="visibility__name">{{ VISIBILITY_COPY[option].label }}</span>
            <span class="visibility__hint">{{ VISIBILITY_COPY[option].hint }}</span>
          </span>
        </label>
      </fieldset>

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
          {{ isEdit ? t('lists.saveChanges') : t('lists.create') }}
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

.field__error {
  font-size: var(--text-xs);
  color: var(--danger);
}

.visibility {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: none;
  padding: 0;
}

.visibility__option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  cursor: var(--cursor-hand);
  transition:
    border-color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.visibility__option--active {
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.visibility__option input {
  margin-top: 2px;
  accent-color: var(--accent);
}

.visibility__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.visibility__name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.visibility__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
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
    max-width: 30rem;
    margin: auto;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
  }
}
</style>
