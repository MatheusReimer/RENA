<script setup lang="ts">
import type { PopularItem, RecommendedItem } from '@revy/shared/types'
import { imageAtWidth, imageSrcSet } from '@revy/shared/utils'

/**
 * A titled row of posters, used for "Continue exploring" and the
 * recommendations.
 *
 * One component for both because they are the same object -- a heading, a
 * subtitle, a link out, and a scrolling row of covers. The only thing that
 * differs is the optional progress bar, which is what "continue" means and
 * what a recommendation has no equivalent of.
 */
defineProps<{
  title: string
  subtitle?: string
  seeAllTo?: string
  items: PopularItem[] | RecommendedItem[]
  /** Per-item completion, 0-100, keyed by media id. Absent for most rows. */
  progress?: Record<string, number>
  /**
   * The title this row was derived from, shown beside the heading.
   *
   * "Because you liked X" is a claim, and a thumbnail of X is the cheapest
   * way to make it checkable at a glance -- the reader recognises the poster
   * before they finish reading the sentence.
   */
  anchor?: PopularItem
}>()

/** Narrows an item to one carrying a reason, for the caption under the card. */
function reasonOf(item: PopularItem | RecommendedItem): RecommendedItem | null {
  return 'reasonKey' in item ? item : null
}
</script>

<template>
  <section class="row">
    <header v-reveal class="row__head">
      <div class="row__heading">
        <!-- The title the row is derived from. Recognising the poster is
             faster than reading the sentence that names it. -->
        <NuxtLink
          v-if="anchor"
          :to="`/media/${anchor.id}`"
          class="row__anchor"
          :aria-label="anchor.title"
        >
          <img
            v-if="anchor.coverImageUrl"
            :src="imageAtWidth(anchor.coverImageUrl, 185) ?? anchor.coverImageUrl"
            :alt="anchor.title"
            loading="lazy"
            decoding="async"
          />
        </NuxtLink>

        <div>
          <h2 class="row__title">{{ title }}</h2>
          <p v-if="subtitle" class="row__sub">{{ subtitle }}</p>
        </div>
      </div>

      <NuxtLink v-if="seeAllTo" :to="seeAllTo" class="row__all">
        See all
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </NuxtLink>
    </header>

    <ul class="rail">
      <li v-for="item in items" :key="item.id" class="poster">
        <MediaQuickLink :media-id="item.id" :title="item.title" :cover-image-url="item.coverImageUrl">
          <span class="poster__frame">
            <img
              v-if="item.coverImageUrl"
              :src="imageAtWidth(item.coverImageUrl, 342) ?? item.coverImageUrl"
              :srcset="imageSrcSet(item.coverImageUrl, [185, 342, 500]) ?? undefined"
              sizes="(min-width: 64rem) 180px, 140px"
              :alt="item.title"
              loading="lazy"
              decoding="async"
            />

            <!--
              The progress bar sits on the artwork rather than under it, so the
              row reads as one height whether or not a card has one.
            -->
            <span
              v-if="progress?.[item.id] !== undefined"
              class="poster__bar"
              role="img"
              :aria-label="`${Math.round(progress[item.id]!)}% complete`"
            >
              <span :style="{ width: `${Math.min(100, Math.max(0, progress[item.id]!))}%` }" />
            </span>

            <!--
              The score, on hover, with whose score it is.

              Only where the item carries one: "Continue exploring" is a row
              of things you are already part-way through, and a score band
              would fight the progress bar for the same strip of artwork.
            -->
            <UiCardOverlay
              v-if="reasonOf(item)"
              :rating-average="reasonOf(item)!.ratingAverage"
              :rating-count="reasonOf(item)!.ratingCount"
              :external-rating="reasonOf(item)!.externalRating"
              :blurb="reasonOf(item)!.blurb"
            />
          </span>

          <span class="poster__title">{{ item.title }}</span>

          <!--
            The reason, where the item carries one.

            It replaces the type tag rather than sitting beside it: "Directed
            by Christopher Nolan" is why this card is here, and "Movie" is
            something the poster already said.
          -->
          <span v-if="reasonOf(item)" class="poster__reason">
            {{ $t(reasonOf(item)!.reasonKey, reasonOf(item)!.reasonParams) }}
          </span>

          <span v-else class="poster__meta">
            <UiMediaTypeTag :media-type="item.mediaType" size="sm" />
            <template v-if="progress?.[item.id] !== undefined">
              {{ Math.round(progress[item.id]!) }}%</template>
          </span>
        </MediaQuickLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.row {
  padding: var(--space-10) 0 0;
}

.row__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  padding-inline: var(--space-6);
}

@media (min-width: 64rem) {
  .row__head {
    padding-inline: var(--space-8);
  }
}

.row__heading {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
}

/* Small enough to read as a reference rather than as a card of its own --
   the row's subject is what is in the rail, not what it came from. */
.row__anchor {
  flex-shrink: 0;
  width: 2.75rem;
  overflow: hidden;
  aspect-ratio: var(--poster-ratio);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.row__anchor:hover {
  border-color: var(--accent-edge);
}

.row__anchor img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.row__title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.row__sub {
  margin: 0.2rem 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.row__all {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
  /*
   * Tall enough to hit with a thumb.
   *
   * One line of 15px type is a 23px box, and WCAG 2.2 asks for 24 (2.5.8).
   * One pixel sounds like pedantry until it is a standalone control in a
   * section header being aimed at on a moving train; the padding is symmetric,
   * so nothing moves visually.
   */
  padding-block: var(--space-1);
}

.row__all svg {
  width: 0.9rem;
  height: 0.9rem;
  transition: transform var(--duration-base) var(--ease-out);
}

.row__all:hover {
  color: var(--text-primary);
}

.row__all:hover svg {
  transform: translateX(3px);
}

/*
 * Scrolls sideways and bleeds off the right edge.
 *
 * The gutter is asymmetric on purpose: the row has to start under its own
 * heading and still run past the window, which is the affordance that says
 * there is more without needing a control to say it.
 */
.rail {
  display: flex;
  gap: var(--space-4);
  margin: 0;
  padding: 0 var(--space-6);
  list-style: none;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  /*
   * Snapping has to respect the gutter, or it eats it.
   *
   * `scroll-snap-align: start` aligns an item to the *scrollport* edge, and
   * the scrollport edge is inside the padding. So on arrival the browser
   * snapped the first card flush to the screen and left `scrollLeft` sitting
   * at exactly the padding -- every row rendered looking as though somebody
   * had already swiped it, with its first card breaking the left margin that
   * its own heading still observed.
   */
  scroll-padding-inline: var(--space-6);
}

.rail::-webkit-scrollbar {
  display: none;
}

@media (min-width: 64rem) {
  .rail {
    padding-inline: var(--space-8);
    scroll-padding-inline: var(--space-8);
  }
}

.poster {
  flex: 0 0 auto;
  width: 8.75rem;
  scroll-snap-align: start;
}

@media (min-width: 64rem) {
  .poster {
    width: 11rem;
  }
}

.poster__frame {
  position: relative;
  display: block;
  aspect-ratio: var(--poster-ratio);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  transition:
    transform var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

.poster__frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.poster__bar {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  display: block;
  height: 0.2rem;
  background: rgb(8 8 10 / 0.72);
}

.poster__bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}

.poster__title {
  display: block;
  margin-top: var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  /* One line: a rail whose cards are different heights because one title
     wrapped reads as broken rather than as generous. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 0.3rem;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* Two lines at most, then clipped. The reason is a caption, and a caption
   that pushes one card taller than its neighbours breaks the row. */
.poster__reason {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  margin-top: 0.3rem;
  min-height: 2.1em;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-tertiary);
}

@media (hover: hover) and (pointer: fine) {
  .poster:hover .poster__frame {
    transform: translateY(-4px);
    border-color: var(--accent-edge);
    box-shadow: var(--accent-glow-soft);
  }

  /* The score band belongs to the card, so the card reveals it. Keyboard
     users get it too -- the link is what takes focus, not the frame. */
  .poster:hover :deep(.score),
  .poster:focus-within :deep(.score) {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .poster__frame,
  .row__all,
  .row__all svg {
    transition: none;
  }

  .poster:hover .poster__frame {
    transform: none;
  }
}
</style>
