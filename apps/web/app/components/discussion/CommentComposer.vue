<script setup lang="ts">
import { LIMITS } from '@revy/shared/constants'

/**
 * Inline composer for a comment or reply (SPEC 14).
 *
 * Used both at the bottom of a thread and inline under a comment being replied
 * to, which is why it is a small inline form rather than a dialog.
 */
const props = withDefaults(
  defineProps<{
    threadId: string
    /** Null posts at the top level of the thread. */
    parentCommentId?: string | null
    placeholder?: string
    autofocus?: boolean
  }>(),
  { parentCommentId: null, placeholder: undefined, autofocus: false },
)

/*
 * The default is resolved here rather than in `withDefaults`.
 *
 * A default in the props declaration is evaluated once, when the component is
 * defined, so a translated one would freeze whichever language happened to be
 * active first and keep it for the rest of the session.
 */
const placeholderText = computed(() => props.placeholder ?? t('discussion.commentPlaceholder'))

const emit = defineEmits<{ posted: []; cancel: [] }>()

const api = useApi()
const { t } = useI18n()

const content = ref('')
const spoiler = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const remaining = computed(() => LIMITS.commentContent.max - content.value.length)
const tooLong = computed(() => remaining.value < 0)
const canSubmit = computed(() => content.value.trim().length > 0 && !tooLong.value)

const textarea = ref<HTMLTextAreaElement | null>(null)

onMounted(() => {
  if (props.autofocus) textarea.value?.focus()
})

async function submit() {
  if (!canSubmit.value || saving.value) return

  saving.value = true
  error.value = null

  try {
    await api.discussions.comment(props.threadId, {
      content: content.value.trim(),
      spoiler: spoiler.value,
      parentCommentId: props.parentCommentId,
    })
    content.value = ''
    spoiler.value = false
    emit('posted')
  } catch (err) {
    if (err instanceof ApiError) {
      // Depth and length failures both come back as readable messages.
      error.value = err.fields?.content?.[0] ?? err.message
    } else {
      error.value = t('discussion.commentFailed')
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <textarea
      ref="textarea"
      v-model="content"
      class="composer__input"
      rows="3"
      :placeholder="placeholderText"
      :maxlength="LIMITS.commentContent.max + 100"
      required
    />

    <div class="composer__row">
      <label class="composer__spoiler">
        <input v-model="spoiler" type="checkbox" />
        <span>Spoilers</span>
      </label>

      <span
        v-if="content.length > LIMITS.commentContent.max * 0.8"
        class="composer__count"
        :class="{ 'composer__count--over': tooLong }"
      >
        {{ remaining }}
      </span>

      <div class="composer__actions">
        <UiAppButton
          v-if="parentCommentId"
          variant="ghost"
          size="sm"
          @click="emit('cancel')"
        >
          Cancel
        </UiAppButton>
        <UiAppButton
          type="submit"
          variant="primary"
          size="sm"
          :loading="saving"
          :disabled="!canSubmit"
        >
          {{ parentCommentId ? 'Reply' : 'Post' }}
        </UiAppButton>
      </div>
    </div>

    <p v-if="error" class="composer__error" role="alert">{{ error }}</p>
  </form>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.composer__input {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--surface-raised);
  color: var(--text-primary);
  font-size: var(--text-input);
  line-height: var(--leading-normal);
  resize: vertical;
}

.composer__input:focus {
  outline: none;
  border-color: var(--border-strong);
}

.composer__input::placeholder {
  color: var(--text-tertiary);
}

.composer__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.composer__spoiler {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  cursor: var(--cursor-hand);
}

.composer__spoiler input {
  accent-color: var(--accent);
  width: 0.875rem;
  height: 0.875rem;
}

.composer__count {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
}

.composer__count--over {
  color: var(--danger);
  font-weight: 600;
}

.composer__actions {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.composer__error {
  font-size: var(--text-xs);
  color: var(--danger);
}
</style>
