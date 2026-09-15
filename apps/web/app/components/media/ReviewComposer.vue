<script setup lang="ts">
import { LIMITS } from '@revy/shared/constants'

/**
 * Review composer (SPEC 11).
 *
 * An attached score rates the media in the same request, so writing a review
 * with a rating is one atomic action rather than two that could half-fail.
 */
const props = defineProps<{
  mediaId: string
  mediaTitle: string
  initialScore: number | null
}>()

const emit = defineEmits<{ close: []; created: [] }>()

const api = useApi()

const content = ref('')
const score = ref<number | null>(props.initialScore)
const spoiler = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const remaining = computed(() => LIMITS.reviewContent.max - content.value.length)
const tooLong = computed(() => remaining.value < 0)
const canSubmit = computed(() => content.value.trim().length > 0 && !tooLong.value)

const dialog = ref<HTMLDialogElement | null>(null)

onMounted(() => dialog.value?.showModal())

async function submit() {
  if (!canSubmit.value || saving.value) return

  saving.value = true
  error.value = null

  try {
    await api.reviews.create({
      mediaId: props.mediaId,
      content: content.value.trim(),
      spoiler: spoiler.value,
      ...(score.value !== null ? { score: score.value } : {}),
    })
    emit('created')
  } catch (err) {
    // Field errors from the server are shown verbatim: they were written to
    // be read by a person (SPEC 35).
    if (err instanceof ApiError) {
      error.value = err.fields?.content?.[0] ?? err.message
    } else {
      error.value = 'Could not post your review.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="composer"
    @close="emit('close')"
    @click="(e) => e.target === dialog && emit('close')"
  >
    <form class="composer__panel" @submit.prevent="submit">
      <header class="composer__header">
        <h2 class="composer__title">Review {{ mediaTitle }}</h2>
        <button type="button" class="composer__close" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>

      <div class="composer__rating">
        <span class="composer__label">Your rating (optional)</span>
        <UiStarInput v-model="score" />
      </div>

      <label class="composer__label" for="review-body">Your review</label>
      <textarea
        id="review-body"
        v-model="content"
        class="composer__textarea"
        rows="7"
        placeholder="What did you think?"
        :maxlength="LIMITS.reviewContent.max + 100"
        required
      />

      <div class="composer__meta">
        <label class="composer__spoiler">
          <input v-model="spoiler" type="checkbox" />
          <span>Contains spoilers</span>
        </label>
        <span class="composer__count" :class="{ 'composer__count--over': tooLong }">
          {{ remaining }}
        </span>
      </div>

      <p v-if="error" class="composer__error" role="alert">{{ error }}</p>

      <div class="composer__actions">
        <UiAppButton variant="ghost" block @click="emit('close')">Cancel</UiAppButton>
        <UiAppButton
          type="submit"
          variant="primary"
          block
          :loading="saving"
          :disabled="!canSubmit"
        >
          Post review
        </UiAppButton>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.composer {
  padding: 0;
  border: none;
  background: transparent;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  color: var(--text-primary);
}

.composer::backdrop {
  background: rgb(0 0 0 / 0.6);
}

.composer:not([open]) {
  display: none;
}

.composer__panel {
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

.composer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.composer__title {
  font-size: var(--text-lg);
}

.composer__close {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  font-size: var(--text-2xl);
  line-height: 1;
  color: var(--text-tertiary);
}

.composer__close:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.composer__rating {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-block: var(--space-2);
}

.composer__label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
}

.composer__textarea {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--surface-base);
  color: var(--text-primary);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  resize: vertical;
}

.composer__textarea:focus {
  outline: none;
  border-color: var(--border-strong);
}

.composer__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.composer__spoiler {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: var(--cursor-hand);
}

.composer__spoiler input {
  accent-color: var(--accent);
  width: 1rem;
  height: 1rem;
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

.composer__error {
  font-size: var(--text-sm);
  color: var(--danger);
}

.composer__actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

@media (min-width: 40rem) {
  .composer {
    display: grid;
    place-items: center;
  }

  .composer__panel {
    position: static;
    max-width: 32rem;
    margin: auto;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
  }
}
</style>
