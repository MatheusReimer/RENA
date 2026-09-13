<script setup lang="ts">
import type { ListSummary } from '@revy/shared/types'

/**
 * "Add to list" sheet, opened from a media page (SPEC 15).
 *
 * Shows every list the viewer owns with a checkmark on the ones already
 * containing this title, so one sheet both adds and removes.
 */
const props = defineProps<{
  mediaId: string
  mediaTitle: string
  /** Ids of the viewer's lists already containing this media. */
  inListIds: string[]
}>()

const emit = defineEmits<{ close: []; changed: [] }>()

const api = useApi()

const lists = ref<ListSummary[]>([])
const loading = ref(true)
const failed = ref(false)
const pendingId = ref<string | null>(null)
const composerOpen = ref(false)

/** Local view of membership, updated optimistically as the user taps. */
const membership = ref(new Set(props.inListIds))

const dialog = ref<HTMLDialogElement | null>(null)

onMounted(async () => {
  dialog.value?.showModal()
  await load()
})

async function load() {
  loading.value = true
  failed.value = false
  try {
    const result = await api.lists.mine()
    lists.value = result.lists
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

async function toggle(list: ListSummary) {
  if (pendingId.value) return

  const wasIn = membership.value.has(list.id)
  pendingId.value = list.id

  // Optimistic: a checkbox that waits for the network feels broken.
  if (wasIn) membership.value.delete(list.id)
  else membership.value.add(list.id)
  membership.value = new Set(membership.value)

  try {
    if (wasIn) {
      await api.lists.removeItem(list.id, props.mediaId)
      list.itemCount = Math.max(0, list.itemCount - 1)
    } else {
      const result = await api.lists.addItem(list.id, { mediaId: props.mediaId, note: null })
      list.itemCount = result.itemCount
    }
    emit('changed')
  } catch {
    // Roll back so the checkmark never disagrees with the server.
    if (wasIn) membership.value.add(list.id)
    else membership.value.delete(list.id)
    membership.value = new Set(membership.value)
  } finally {
    pendingId.value = null
  }
}

async function onCreated(list: ListSummary) {
  composerOpen.value = false
  lists.value = [list, ...lists.value]
  // A list created from here is almost certainly meant to hold this title.
  await toggle(list)
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    @close="emit('close')"
    @click="(e) => e.target === dialog && emit('close')"
  >
    <div class="sheet__panel">
      <div class="sheet__grip" aria-hidden="true" />

      <header class="sheet__header">
        <h2 class="sheet__title">Add to list</h2>
        <button type="button" class="sheet__close" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>
      <p class="sheet__context clamp-1">{{ mediaTitle }}</p>

      <div v-if="loading" class="sheet__loading">
        <UiSkeletonBlock v-for="i in 3" :key="i" width="100%" height="2.75rem" />
      </div>

      <UiEmptyState
        v-else-if="failed"
        icon="⚠️"
        title="We couldn't load your lists."
      >
        <template #action>
          <UiAppButton variant="secondary" size="sm" @click="load">Try again</UiAppButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="lists.length === 0"
        icon="📁"
        title="No lists yet."
        description="Create one to start collecting."
      />

      <ul v-else class="options">
        <li v-for="list in lists" :key="list.id">
          <button
            type="button"
            class="option"
            :class="{ 'option--checked': membership.has(list.id) }"
            :aria-pressed="membership.has(list.id)"
            :disabled="pendingId === list.id"
            @click="toggle(list)"
          >
            <span class="option__check" aria-hidden="true">
              <svg v-if="membership.has(list.id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span class="option__text">
              <span class="option__name clamp-1">{{ list.name }}</span>
              <span class="option__meta">
                {{ list.itemCount }} {{ list.itemCount === 1 ? 'item' : 'items' }}
              </span>
            </span>
          </button>
        </li>
      </ul>

      <UiAppButton variant="secondary" block @click="composerOpen = true">
        + New list
      </UiAppButton>
    </div>

    <ListComposer
      v-if="composerOpen"
      @close="composerOpen = false"
      @created="onCreated"
    />
  </dialog>
</template>

<style scoped>
.sheet {
  padding: 0;
  border: none;
  background: transparent;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  color: var(--text-primary);
}

.sheet::backdrop {
  background: rgb(0 0 0 / 0.6);
}

.sheet:not([open]) {
  display: none;
}

.sheet__panel {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: 88dvh;
  overflow-y: auto;
  padding: var(--space-3) var(--space-5)
    calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
  background: var(--surface-raised);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  border-top: 1px solid var(--border-default);
}

.sheet__grip {
  width: 2.25rem;
  height: 4px;
  margin-inline: auto;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-full);
  background: var(--border-strong);
}

.sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.sheet__title {
  font-size: var(--text-lg);
}

.sheet__close {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  font-size: var(--text-2xl);
  line-height: 1;
  color: var(--text-tertiary);
}

.sheet__context {
  margin-top: calc(var(--space-2) * -1);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.sheet__loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.options {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radius-md);
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.option:hover:not(:disabled) {
  background: var(--surface-overlay);
}

.option:disabled {
  opacity: 0.5;
}

.option__check {
  display: grid;
  place-items: center;
  width: 1.375rem;
  height: 1.375rem;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  color: #fff;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.option__check svg {
  width: 0.875rem;
  height: 0.875rem;
}

.option--checked .option__check {
  background: var(--accent);
  border-color: var(--accent);
}

.option__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.option__name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.option__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

@media (min-width: 40rem) {
  .sheet {
    display: grid;
    place-items: center;
  }

  .sheet__panel {
    position: static;
    max-width: 26rem;
    margin: auto;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
  }

  .sheet__grip {
    display: none;
  }
}
</style>
