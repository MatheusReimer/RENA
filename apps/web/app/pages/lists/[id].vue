<script setup lang="ts">
import { BRAND, MEDIA_TYPE_LABELS } from '@revy/shared/constants'
import { releaseYear } from '@revy/shared/utils'

/**
 * A single list with its items (SPEC 15).
 *
 * Readable by anyone the list's visibility allows; editable only by its owner,
 * which the API enforces independently of anything hidden here.
 */
const route = useRoute()
const api = useApi()
const auth = useAuthStore()
const { absolute } = useShareLink()
const { t } = useI18n()

const listId = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAsyncData(
  () => `list:${listId.value}`,
  () => api.lists.get(listId.value),
  { watch: [listId] },
)

const list = computed(() => data.value?.list ?? null)
const items = computed(() => list.value?.items ?? [])
const isOwner = computed(() => auth.user && list.value?.user.id === auth.user.id)

const VISIBILITY_LABELS = {
  private: 'Private',
  friends: 'Friends',
  public: 'Public',
} as const

const editing = ref(false)
const removing = ref<string | null>(null)
const deleting = ref(false)

async function removeItem(mediaId: string) {
  if (!list.value || removing.value) return
  removing.value = mediaId
  try {
    await api.lists.removeItem(list.value.id, mediaId)
    await refresh()
  } finally {
    removing.value = null
  }
}

async function deleteList() {
  if (!list.value || deleting.value) return
  deleting.value = true
  try {
    await api.lists.remove(list.value.id)
    await navigateTo('/lists')
  } finally {
    deleting.value = false
  }
}

/**
 * Moves an item one place up or down.
 *
 * Buttons rather than drag-and-drop: it works with a keyboard and on touch
 * without a gesture library, and the API takes a full order either way.
 */
const reordering = ref(false)

async function move(index: number, direction: -1 | 1) {
  if (!list.value || reordering.value) return
  const target = index + direction
  if (target < 0 || target >= items.value.length) return

  const order = items.value.map((item) => item.id)
  const [moved] = order.splice(index, 1)
  order.splice(target, 0, moved!)

  reordering.value = true
  try {
    await api.lists.reorder(list.value.id, order)
    await refresh()
  } finally {
    reordering.value = false
  }
}

useHead(() => ({ title: list.value?.name ?? 'List' }))

/*
 * A shared list is the one piece of member-made content worth indexing
 * (SPEC 22).
 *
 * Somebody's "Best horror of the decade" is exactly the long-tail query this
 * catalogue can answer and IMDb cannot, and every item in it links to a media
 * page -- so the `nofollow` the default policy applied here was costing the
 * catalogue internal link weight as well as the list its own result.
 *
 * Opt-in per load, never per pattern: only a list that actually resolved and
 * is `public`. A `friends`-only or private list is 404 to a signed-out crawler
 * in the API, but this page still answers 200, so the pattern alone cannot
 * tell the two apart. `setIndexPolicy` is scoped to this path and defaults to
 * the private policy, so the failure mode of getting this wrong is an
 * unindexed public list, not an indexed private one.
 */
watchEffect(() => {
  if (list.value?.visibility === 'public') setIndexPolicy('index')
})

/*
 * A real 404 for anything the reader cannot see.
 *
 * Without it every unreachable list is a soft 404: HTTP 200 with an error
 * state in the body, which a crawler files as a thin duplicate page rather
 * than a dead end. The API already collapses "private" and "does not exist"
 * into the same not-found, so this leaks nothing about which it was.
 */
if (import.meta.server && error.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

const shareDescription = computed(() => {
  const value = list.value
  if (!value) return BRAND.description
  if (value.description) return value.description
  return t('lists.metaItems', { count: value.itemCount })
})

useSeoMeta({
  description: () => shareDescription.value,
  ogTitle: () =>
    list.value ? `${list.value.name} · ${list.value.user.displayName}` : BRAND.name,
  ogDescription: () => shareDescription.value,
  ogType: 'website',
  ogUrl: () => (list.value ? absolute(`/lists/${list.value.id}`) : undefined),
  /*
   * The first cover, which is already the page's own visual identity -- the
   * stacked thumbnails are built from the same array.
   */
  ogImage: () => list.value?.previewCovers?.[0] ?? undefined,
  twitterCard: () => (list.value?.previewCovers?.length ? 'summary_large_image' : 'summary'),
})
</script>

<template>
  <div class="page">
    <div v-if="status === 'pending' && !list" class="loading">
      <UiSkeletonBlock width="55%" height="1.75rem" />
      <UiSkeletonBlock width="30%" height="0.875rem" />
      <UiSkeletonBlock v-for="i in 4" :key="i" width="100%" height="4rem" />
    </div>

    <UiEmptyState
      v-else-if="error || !list"
      title="We couldn't find that list."
      description="It may have been deleted, or it is private."
    >
      <template #action>
        <UiAppButton variant="secondary" @click="navigateTo('/lists')">
          Back to lists
        </UiAppButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <header class="header">
        <h1 class="header__title">{{ list.name }}</h1>
        <p v-if="list.description" class="header__description">{{ list.description }}</p>

        <div class="header__meta">
          <NuxtLink :to="`/u/${list.user.username}`" class="header__owner">
            <UiUserAvatar :user="list.user" size="xs" />
            <span>{{ list.user.displayName }}</span>
          </NuxtLink>
          <span aria-hidden="true">·</span>
          <span>{{ list.itemCount }} {{ list.itemCount === 1 ? 'item' : 'items' }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ VISIBILITY_LABELS[list.visibility] }}</span>
        </div>

        <div v-if="isOwner" class="header__actions">
          <UiAppButton variant="secondary" size="sm" @click="editing = true">Edit</UiAppButton>
          <UiAppButton variant="danger" size="sm" :loading="deleting" @click="deleteList">
            Delete list
          </UiAppButton>
        </div>
      </header>

      <UiEmptyState
        v-if="items.length === 0"
        title="Nothing in this list yet."
        :description="
          isOwner
            ? 'Open any title and use Add to list.'
            : undefined
        "
      >
        <template v-if="isOwner" #action>
          <UiAppButton variant="primary" @click="navigateTo('/search')">
            Find something
          </UiAppButton>
        </template>
      </UiEmptyState>

      <ol v-else class="items">
        <li v-for="(item, index) in items" :key="item.id" class="item">
          <span class="item__position">{{ index + 1 }}</span>

          <NuxtLink :to="`/media/${item.media.id}`" class="item__poster">
            <UiMediaPoster
        sizes="44px"
              :src="item.media.coverImageUrl"
              :title="item.media.title"
              :media-type="item.media.mediaType"
            />
          </NuxtLink>

          <NuxtLink :to="`/media/${item.media.id}`" class="item__text">
            <span class="item__title clamp-2">{{ item.media.title }}</span>
            <span class="item__meta">
              {{ MEDIA_TYPE_LABELS[item.media.mediaType] }}
              <template v-if="releaseYear(item.media.releaseDate)">
                · {{ releaseYear(item.media.releaseDate) }}
              </template>
            </span>
            <span v-if="item.note" class="item__note clamp-2">{{ item.note }}</span>
          </NuxtLink>

          <div v-if="isOwner" class="item__controls">
            <button
              type="button"
              class="item__control"
              aria-label="Move up"
              :disabled="index === 0 || reordering"
              @click="move(index, -1)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              class="item__control"
              aria-label="Move down"
              :disabled="index === items.length - 1 || reordering"
              @click="move(index, 1)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              class="item__control item__control--remove"
              aria-label="Remove from list"
              :disabled="removing === item.media.id"
              @click="removeItem(item.media.id)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </li>
      </ol>

      <ListComposer
        v-if="editing"
        :list="list"
        @close="editing = false"
        @updated="
          () => {
            editing = false
            refresh()
          }
        "
      />
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin-inline: auto;
  padding: var(--space-5) var(--space-4) var(--space-12);
}

.loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.header {
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.header__title {
  font-size: var(--text-2xl);
}

.header__description {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.header__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.header__owner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
  color: var(--text-secondary);
}

.header__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.items {
  display: flex;
  flex-direction: column;
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.item__position {
  width: 1.25rem;
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  text-align: right;
}

.item__poster {
  width: 2.75rem;
  flex-shrink: 0;
}

.item__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.item__title {
  font-size: var(--text-base);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.item__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.item__note {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-style: italic;
}

.item__controls {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.item__control {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.item__control svg {
  width: 1rem;
  height: 1rem;
}

.item__control:hover:not(:disabled) {
  background: var(--surface-overlay);
  color: var(--text-primary);
}

.item__control:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.item__control--remove:hover:not(:disabled) {
  color: var(--danger);
}
</style>
