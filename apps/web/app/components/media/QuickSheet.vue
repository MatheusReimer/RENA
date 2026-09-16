<script setup lang="ts">
import type { MediaDetail } from '@revy/shared/types'

/**
 * Rate a title without leaving the screen you found it on (SPEC 10).
 *
 * Mounted once by the shell. Any media card on a phone opens this instead of
 * navigating -- see `QuickLink.vue` for why that is a link which sometimes
 * refuses to be one.
 *
 * Same `<dialog>` mechanic as `RatingSheet`: the native element gives focus
 * trapping, Escape, and inertness of the page behind for free. A separate
 * component rather than a prop on that one, because the two answer different
 * questions -- that sheet rates a title you are already looking at, this one
 * has to introduce it first.
 */
const store = useMediaSheetStore()
const api = useApi()
const auth = useAuthStore()
const notice = useNotice()
const { t } = useI18n()

const dialog = ref<HTMLDialogElement | null>(null)
const detail = ref<MediaDetail | null>(null)
const loading = ref(false)
const score = ref<number | null>(null)
const saving = ref(false)

/** The card's own title and cover until the fetch lands, so nothing is blank. */
const title = computed(() => detail.value?.title ?? store.seed?.title ?? '')
const cover = computed(() => detail.value?.coverImageUrl ?? store.seed?.coverImageUrl ?? null)
const year = computed(() => detail.value?.releaseDate?.slice(0, 4) ?? '')

const community = computed(() => {
  const summary = detail.value?.ratingSummary
  if (!summary || summary.average === null) return null
  return { average: summary.average, count: summary.count }
})

watch(
  () => store.mediaId,
  async (id) => {
    const element = dialog.value
    if (element) {
      if (id && !element.open) element.showModal()
      if (!id && element.open) element.close()
    }

    if (!id) {
      detail.value = null
      score.value = null
      return
    }

    loading.value = true
    try {
      const result = await api.media.getById(id)
      // A second tap while the first was in flight: never let an older
      // response overwrite a newer title.
      if (store.mediaId !== id) return
      detail.value = result.media
      score.value = result.media.viewerState?.score ?? null
    } catch (error) {
      notice.fromError(error)
      store.close()
    } finally {
      loading.value = false
    }
  },
)

/** Escape and backdrop clicks close via the element, so sync state back. */
function onClose() {
  store.close()
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialog.value) store.close()
}

async function save() {
  const id = store.mediaId
  if (score.value === null || !id) return
  if (!auth.isSignedIn) return navigateTo('/signin')

  saving.value = true
  try {
    await api.ratings.upsert(id, score.value)
    notice.say(t('score.saved'))
    store.close()
  } catch (error) {
    notice.fromError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="quick" @close="onClose" @click="onBackdropClick">
    <div class="quick__panel">
      <div class="quick__grip" aria-hidden="true" />

      <div class="quick__head">
        <img v-if="cover" :src="cover" alt="" class="quick__cover" decoding="async" />
        <div v-else class="quick__cover quick__cover--empty" aria-hidden="true" />

        <div class="quick__meta">
          <h2 class="quick__title">{{ title }}</h2>

          <p v-if="detail" class="quick__sub">
            {{ $t(`mediaType.${detail.mediaType}`) }}<template v-if="year"> · {{ year }}</template>
          </p>

          <p v-if="community" class="quick__score">
            <span class="quick__star" aria-hidden="true">★</span>
            {{ community.average.toFixed(1) }}
            <span class="quick__count">{{ $t('common.ratings', community.count) }}</span>
          </p>
        </div>
      </div>

      <!--
        Three lines, and only when there is any.

        Enough to answer "is this the one I am thinking of", which is the
        question somebody rating from a rail actually has. The full synopsis is
        one tap away and is what the media page is for.
      -->
      <p v-if="detail?.description" class="quick__blurb clamp-3">{{ detail.description }}</p>
      <p v-else-if="loading" class="quick__blurb quick__blurb--loading">{{ $t('common.loading') }}</p>

      <div class="quick__stars">
        <UiStarInput v-model="score" />
      </div>

      <UiAppButton
        variant="primary"
        size="lg"
        block
        :loading="saving"
        :disabled="score === null"
        @click="save()"
      >
        {{ $t('score.save') }}
      </UiAppButton>

      <NuxtLink
        v-if="store.mediaId"
        :to="`/media/${store.mediaId}`"
        class="quick__more"
        @click="store.close()"
      >
        {{ $t('score.openFullPage') }}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </NuxtLink>
    </div>
  </dialog>
</template>

<style scoped>
.quick {
  padding: 0;
  border: none;
  background: transparent;
  max-width: none;
  max-height: none;
  width: 100%;
  height: 100%;
  color: var(--text-primary);
}

.quick::backdrop {
  background: rgb(0 0 0 / 0.62);
  backdrop-filter: blur(2px);
}

.quick__panel {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  /* Never taller than the screen. A long description on a short phone would
     otherwise push the stars and the save button off the bottom edge. */
  max-height: 88dvh;
  overflow-y: auto;
  padding: var(--space-3) var(--space-5) calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
  background: var(--surface-raised);
  border-top: 1px solid var(--border-default);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  animation: quick-up var(--duration-base) var(--ease-out);
}

@keyframes quick-up {
  from {
    transform: translateY(100%);
  }
}

.quick__grip {
  flex: none;
  width: 2.25rem;
  height: 4px;
  margin-inline: auto;
  border-radius: var(--radius-full);
  background: var(--border-strong);
}

.quick__head {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}

.quick__cover {
  flex: none;
  width: 4rem;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--radius-md);
  background: var(--surface-base);
}

.quick__cover--empty {
  border: 1px solid var(--border-subtle);
}

.quick__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.quick__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.quick__sub {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.quick__score {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  font-weight: 600;
}

.quick__star {
  color: var(--accent);
}

.quick__count {
  font-weight: 400;
  color: var(--text-tertiary);
}

.quick__blurb {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
}

.quick__blurb--loading {
  color: var(--text-tertiary);
}

/*
 * Bigger than anywhere else in the product, which is the point of the sheet.
 *
 * Rating from a rail meant aiming at a star under a poster in a scrolling row.
 * Here there is a whole sheet to spend, and a half-star target 1.375rem wide
 * is one somebody can hit without looking twice.
 */
.quick__stars {
  --star-size: 2.75rem;
  display: grid;
  place-items: center;
  padding-block: var(--space-2);
}

/* The way out to the whole title, and deliberately the quietest thing here:
   the sheet exists so that leaving it is optional. */
.quick__more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 1.75rem;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
}

.quick__more:hover {
  color: var(--text-primary);
}

.quick__more svg {
  width: 1rem;
  height: 1rem;
}

/*
 * A centred dialog once there is room for one.
 *
 * `QuickLink` only diverts a tap below 64rem, so on a desktop this is reached
 * only by something that opened it deliberately -- but a bottom sheet pinned
 * to the edge of a 27-inch monitor is not a thing anybody meant.
 */
@media (min-width: 40rem) {
  .quick {
    display: grid;
    place-items: center;
  }

  .quick__panel {
    position: static;
    max-width: 28rem;
    margin: auto;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    animation: none;
  }

  .quick__grip {
    display: none;
  }
}

/* `dialog` is display:none until opened; the grid above would override it. */
.quick:not([open]) {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .quick__panel {
    animation: none;
  }
}
</style>
