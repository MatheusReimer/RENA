<script setup lang="ts">
/**
 * The rating sheet (SPEC 10).
 *
 * A bottom sheet on mobile and a centred dialog on desktop, from one
 * `<dialog>` element -- the native element gives focus trapping, Escape to
 * close and inertness of the page behind for free, none of which is worth
 * reimplementing.
 */
const props = defineProps<{
  title: string
  saving: boolean
  error: string | null
}>()

const open = defineModel<boolean>('open', { required: true })
const score = defineModel<number | null>('score', { required: true })

const emit = defineEmits<{ save: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)

watch(open, (isOpen) => {
  const element = dialog.value
  if (!element) return
  if (isOpen && !element.open) element.showModal()
  if (!isOpen && element.open) element.close()
})

/** Escape and backdrop clicks close via the element, so sync state back. */
function onClose() {
  open.value = false
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialog.value) open.value = false
}
</script>

<template>
  <dialog ref="dialog" class="sheet" @close="onClose" @click="onBackdropClick">
    <div class="sheet__panel">
      <div class="sheet__grip" aria-hidden="true" />

      <h2 class="sheet__title">Rate {{ props.title }}</h2>
      <p class="sheet__hint">Tap the left or right half of a star for half ratings.</p>

      <div class="sheet__stars">
        <UiStarInput v-model="score" />
      </div>

      <p v-if="error" class="sheet__error" role="alert">{{ error }}</p>

      <div class="sheet__actions">
        <UiAppButton variant="ghost" block @click="open = false">Cancel</UiAppButton>
        <UiAppButton
          variant="primary"
          block
          :loading="saving"
          :disabled="score === null"
          @click="emit('save')"
        >
          Save rating
        </UiAppButton>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  padding: 0;
  border: none;
  background: transparent;
  max-width: none;
  max-height: none;
  width: 100%;
  height: 100%;
  color: var(--text-primary);
}

.sheet::backdrop {
  background: rgb(0 0 0 / 0.6);
  backdrop-filter: blur(2px);
}

.sheet__panel {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5)
    calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
  background: var(--surface-raised);
  border-top: 1px solid var(--border-default);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  animation: slide-up var(--duration-base) var(--ease-out);
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
}

.sheet__grip {
  width: 2.25rem;
  height: 4px;
  margin-inline: auto;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-full);
  background: var(--border-strong);
}

.sheet__title {
  font-size: var(--text-lg);
}

.sheet__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.sheet__stars {
  display: grid;
  place-items: center;
  padding-block: var(--space-4);
}

.sheet__error {
  font-size: var(--text-sm);
  color: var(--danger);
}

.sheet__actions {
  display: flex;
  gap: var(--space-3);
}

@media (min-width: 40rem) {
  .sheet__panel {
    position: static;
    max-width: 26rem;
    margin: auto;
    border-radius: var(--radius-xl);
    border: 1px solid var(--border-default);
    animation: none;
  }

  .sheet {
    display: grid;
    place-items: center;
  }

  .sheet__grip {
    display: none;
  }
}

/* `dialog` is display:none until opened; the grid above would override it. */
.sheet:not([open]) {
  display: none;
}
</style>
