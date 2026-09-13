<script setup lang="ts">
import { MEDIA_TYPE_LABELS } from '@revy/shared/constants'
import type { DiscoverSection } from '@revy/shared/types'
import { formatAverage, releaseYear } from '@revy/shared/utils'

/**
 * A horizontally scrolling row of media cards (SPEC 21).
 *
 * The rail hides its scrollbar, which looks right but leaves a desktop mouse
 * user with no way to reach the rest of the row -- the cards are there and
 * simply unreachable. So it also carries arrow controls, shown only when there
 * is actually something to scroll to and only on pointers that need them.
 */
defineProps<{ section: DiscoverSection }>()

const rail = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function measure() {
  const el = rail.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 8
  // A pixel of slack: sub-pixel widths mean scrollLeft rarely lands exactly on
  // the maximum, which would leave the arrow enabled forever.
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 8
}

/** Scrolls by most of a screenful, keeping a card of context. */
function scrollBy(direction: -1 | 1) {
  const el = rail.value
  if (!el) return
  el.scrollBy({ left: direction * (el.clientWidth * 0.8), behavior: 'smooth' })
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure, { passive: true })
})

onBeforeUnmount(() => window.removeEventListener('resize', measure))
</script>

<template>
  <section class="rail-section">
    <header class="rail-section__header">
      <h2 class="rail-section__title">{{ section.title }}</h2>

      <div class="rail-section__controls">
        <button
          type="button"
          class="arrow"
          :disabled="!canScrollLeft"
          aria-label="Scroll left"
          @click="scrollBy(-1)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          class="arrow"
          :disabled="!canScrollRight"
          aria-label="Scroll right"
          @click="scrollBy(1)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </header>

    <ul ref="rail" class="rail" @scroll.passive="measure">
      <li v-for="item in section.items" :key="item.media.id" class="card">
        <NuxtLink :to="`/media/${item.media.id}`" class="card__link">
          <UiMediaPoster
            :src="item.media.coverImageUrl"
            :title="item.media.title"
            :media-type="item.media.mediaType"
          />

          <span class="card__title clamp-2">{{ item.media.title }}</span>

          <span class="card__meta">
            {{ MEDIA_TYPE_LABELS[item.media.mediaType] }}
            <template v-if="releaseYear(item.media.releaseDate)">
              · {{ releaseYear(item.media.releaseDate) }}
            </template>
          </span>

          <span v-if="item.averageRating !== null" class="card__score">
            <UiStarRating :score="item.averageRating" size="sm" />
            {{ formatAverage(item.averageRating) }}
          </span>

          <!-- Friend sections carry avatars instead of an aggregate score:
               whose opinion it is matters more than the number. -->
          <span v-else-if="item.friends.length" class="card__friends">
            <UiUserAvatar
              v-for="friend in item.friends.slice(0, 3)"
              :key="friend.id"
              :user="friend"
              size="xs"
              class="card__friend"
            />
            <span v-if="item.friends.length > 3" class="card__friend-more">
              +{{ item.friends.length - 3 }}
            </span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.rail-section {
  margin-bottom: var(--space-10);
}

.rail-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.rail-section__title {
  /*
   * Section headings carry the structure of the screen, so they are sized to
   * be read from across the room rather than to be polite. Tight tracking
   * keeps a long heading from sprawling.
   */
  font-size: clamp(var(--text-lg), 2.4vw, var(--text-2xl));
  letter-spacing: var(--tracking-tight);
}

.rail-section__controls {
  display: flex;
  gap: var(--space-2);
}

/*
 * Touch devices scroll the rail directly, so the arrows would be clutter.
 * `hover: hover` is the honest test -- it asks whether there is a pointer,
 * not how wide the screen is.
 */
.arrow {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .arrow {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-full);
    background: var(--surface-overlay);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    transition:
      background-color var(--duration-fast) var(--ease-out),
      opacity var(--duration-fast) var(--ease-out);
  }

  .arrow:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--text-primary);
  }

  .arrow:disabled {
    opacity: 0.3;
    cursor: default;
  }
}

.arrow svg {
  width: 1.125rem;
  height: 1.125rem;
}

/*
 * Card width.
 *
 * The design shows posters as the substance of the screen, not as icons beside
 * text. These scale with the viewport between a phone-friendly floor and a
 * size that still fits several per row on a desktop.
 */
.card {
  width: clamp(8.5rem, 22vw, 11.5rem);
}

.card__link {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

/*
 * The only motion on the card, and it is on the artwork alone.
 *
 * Lifting the whole card moves its text, which is harder to read mid-hover;
 * scaling just the poster inside a fixed frame keeps the grid still while
 * making the target feel live.
 */
.card :deep(.poster) {
  transition:
    transform var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.card__link:hover :deep(.poster) {
  transform: translateY(-4px);
  border-color: var(--border-strong);
}

.card__link:hover .card__title {
  color: var(--accent);
}

.card__title {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: var(--leading-snug);
  transition: color var(--duration-fast) var(--ease-out);
}

.card__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.card__score {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--star);
}

.card__friends {
  display: flex;
  align-items: center;
  margin-top: var(--space-1);
}

/* Avatars overlap into a small stack, matching the friend rows elsewhere. */
.card__friend:not(:first-child) {
  margin-left: -0.4rem;
}

.card__friend-more {
  margin-left: var(--space-1);
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}
</style>
