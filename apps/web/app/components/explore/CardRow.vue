<script setup lang="ts">
import type { ExploreCard } from '@revy/shared/types'
import { formatAverage, formatRatingCount, imageAtWidth, imageSrcSet } from '@revy/shared/utils'

/**
 * A titled, scrolling row of Explore cards.
 *
 * Every card carries two scores and they are not interchangeable. RENA's is
 * this community's and leads wherever it exists; the provider's sits under it,
 * named, for the large majority of titles nobody here has rated yet. A card
 * that can only say "no ratings" is a dead end, and the whole point of this
 * screen is that nothing on it should be one.
 */
defineProps<{
  /** An accent mark beside the heading. Only the editorial rows get one. */
  icon?: 'flame'
  eyebrow?: string
  title: string
  subtitle?: string
  items: ExploreCard[]
  seeAllTo?: string
}>()

const rail = ref<HTMLElement | null>(null)

/** Arrows only where there is something past the edge. See the composable. */
const { overflows, atStart, atEnd } = useRailOverflow(rail)

/** Pages by what is visible, less a card's overlap, so a partial poster stays
 *  on screen after the jump and the row obviously continued. */
function page(direction: 1 | -1) {
  const el = rail.value
  if (!el) return

  const step = Math.max(el.clientWidth - 120, 200)
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollBy({ left: step * direction, behavior: still ? 'auto' : 'smooth' })
}
</script>

<template>
  <section class="row">
    <header v-reveal class="row__head">
      <div class="row__heading">
        <span v-if="icon === 'flame'" class="row__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3s4.5 3.6 4.5 8a4.5 4.5 0 0 1-9 0c0-1.5.6-2.7 1.3-3.6.3 1 1 1.9 1.9 1.9 1.2 0 1.8-1 1.8-2.3 0-1.5-.5-3-.5-4zM8.6 14.5A5.9 5.9 0 0 0 12 21a5.9 5.9 0 0 0 3.4-6.5" />
          </svg>
        </span>
        <div>
          <p v-if="eyebrow" class="row__eyebrow">{{ eyebrow }}</p>
          <h2 class="row__title">{{ title }}</h2>
          <p v-if="subtitle" class="row__sub">{{ subtitle }}</p>
        </div>
      </div>

      <div class="row__controls">
        <NuxtLink v-if="seeAllTo" :to="seeAllTo" class="row__all">{{ $t('common.seeAll') }}</NuxtLink>

        <template v-if="overflows">
          <button
            type="button"
            class="row__arrow"
            :disabled="atStart"
            :aria-label="$t('explore.scrollBack')"
            @click="page(-1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            class="row__arrow"
            :disabled="atEnd"
            :aria-label="$t('explore.scrollForward')"
            @click="page(1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </template>
      </div>
    </header>

    <ul ref="rail" class="rail">
      <li v-for="item in items" :key="item.id" class="card">
        <NuxtLink :to="`/media/${item.id}`">
          <span class="card__frame">
            <img
              v-if="item.coverImageUrl"
              :src="imageAtWidth(item.coverImageUrl, 500) ?? item.coverImageUrl"
              :srcset="imageSrcSet(item.coverImageUrl, [342, 500, 780]) ?? undefined"
              sizes="(min-width: 64rem) 286px, 224px"
              :alt="item.title"
              loading="lazy"
              decoding="async"
            />

            <!-- RENA's own score, where this community has one. -->
            <span v-if="item.ratingAverage !== null" class="card__score">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z" />
              </svg>
              {{ formatAverage(item.ratingAverage) }}
            </span>
          </span>

          <span class="card__title">{{ item.title }}</span>
          <UiMediaTypeTag class="card__tag" :media-type="item.mediaType" size="sm" />

          <!--
            What the number underneath actually counts.

            With local ratings it says how many people here have weighed in.
            Without them it names the provider instead -- "TMDB 8.4" is a
            different claim from "4.2 from nine members", and blurring the two
            into one anonymous score is how a catalogue starts feeling
            invented.
          -->
          <!--
            Pluralised by the locale, not by an inline ternary.

            `rating`/`ratings` is an English rule and only an English rule;
            every language here forms plurals differently, and a few of the
            ones we may add later have more than two forms. The `|` branches in
            the locale file are the translator's to decide.
          -->
          <span v-if="item.ratingCount" class="card__meta">
            {{ $t('common.ratings', { count: formatRatingCount(item.ratingCount) }, item.ratingCount) }}
            <template v-if="item.reviewCount">
              ·
              {{ $t('common.reviews', { count: formatRatingCount(item.reviewCount) }, item.reviewCount) }}
            </template>
          </span>

          <span v-else-if="item.externalRating" class="card__meta card__meta--external">
            {{ item.externalRating.source }} {{ item.externalRating.score.toFixed(1) }}
            <span class="card__hint">· not yet rated here</span>
          </span>

          <span v-else class="card__meta card__meta--external">Be the first to rate it</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.row {
  padding: var(--space-12) 0 0;
}

.row__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  max-width: var(--page-max);
  margin-inline: auto;
  margin-bottom: var(--space-5);
  padding-inline: var(--space-6);
}

@media (min-width: 64rem) {
  .row__head,
  .rail {
    padding-inline: var(--space-10);
  }
}

.row__heading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.row__mark {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  color: var(--accent);
}

.row__mark svg {
  width: 1.35rem;
  height: 1.35rem;
}

.row__eyebrow {
  margin: 0 0 var(--space-3);
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: var(--text-tertiary);
}

.row__title {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(1.6rem, 3vw, 2.25rem);
  letter-spacing: -0.03em;
}

.row__sub {
  margin: 0.25rem 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.row__controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.row__all {
  display: inline-flex;
  align-items: center;
  /* See `PosterRow.vue`: one line of 15px type is 23px, and 2.5.8 wants 24. */
  padding-block: var(--space-1);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
}

.row__all:hover {
  color: var(--text-primary);
}

/* Hidden where there is no pointer: the rail scrolls under a finger, and the
   half-visible card at the edge is the affordance. */
.row__arrow {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .row__arrow {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
    color: var(--text-secondary);
    transition:
      color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out);
  }

  .row__arrow:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
    background: var(--surface-raised);
  }
}

.row__arrow svg {
  width: 1rem;
  height: 1rem;
}

.rail {
  display: flex;
  gap: var(--space-4);
  max-width: var(--page-max);
  margin-inline: auto;
  padding: 0 var(--space-6);
  list-style: none;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}

.rail::-webkit-scrollbar {
  display: none;
}

/*
 * Well up from where these started, and then trimmed back.
 *
 * They were 8.25rem -- about 130px -- which is roughly the size a poster gets
 * in a file browser. At that scale the artwork is a colour swatch: you can
 * tell a horror film from a comedy and nothing else, and the title underneath
 * does all the work. A rail whose premise is that the artwork sells the title
 * should show the artwork.
 *
 * Doubling it was a step too far in the other direction, so this is that
 * minus fifteen percent: about 286px on a desktop, roughly 1.7x the original.
 * Big enough to read a poster, small enough that the row still obviously
 * continues past the edge of the screen.
 */
.card {
  flex: 0 0 auto;
  width: 14rem;
  scroll-snap-align: start;
}

/*
 * The row settles as it scrolls into view.
 *
 * Scrubbed to the scroll position rather than triggered once: scroll back up
 * and it runs backwards. `view(block)` measures vertical progress, and every
 * card in a horizontal rail shares a vertical position -- so the row arrives
 * as one object rather than as a stagger. That is right here; it is worth
 * stating because `view()` per element reads like it should stagger and does
 * not.
 */
@keyframes card-settle {
  from {
    opacity: 0;
    transform: translateY(2rem) scale(0.95);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .card {
      animation: card-settle linear both;
      animation-timeline: view(block);
      /* Finished well before the row reaches the middle of the screen: a card
         still assembling while you read its title is an effect in the way. */
      animation-range: entry 8% cover 20%;
    }
  }
}

@media (min-width: 64rem) {
  .card {
    width: 17.85rem;
  }
}

.card__frame {
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

.card__frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card__score {
  position: absolute;
  left: var(--space-2);
  bottom: var(--space-2);
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem var(--space-2);
  border-radius: var(--radius-sm);
  background: rgb(8 8 10 / 0.85);
  font-size: var(--text-2xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.card__score svg {
  width: 0.7rem;
  height: 0.7rem;
  fill: var(--star);
}

.card__title {
  display: block;
  margin-top: var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__tag {
  margin-top: 0.25rem;
}

.card__meta {
  display: block;
  margin-top: 0.1rem;
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
}

/* The provider's number is set quieter than RENA's would be. It is here to
   stop the card being a dead end, not to be the card's headline. */
.card__meta--external {
  color: var(--text-tertiary);
}

.card__hint {
  opacity: 0.7;
}

@media (hover: hover) and (pointer: fine) {
  .card:hover .card__frame {
    transform: translateY(-4px);
    border-color: var(--accent-edge);
    box-shadow: var(--accent-glow-soft);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card__frame,
  .row__arrow,
  .row__all {
    transition: none;
  }

  .card:hover .card__frame {
    transform: none;
  }
}
</style>
