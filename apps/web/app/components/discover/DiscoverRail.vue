<script setup lang="ts">
import type { DiscoverItem, DiscoverSection } from '@revy/shared/types'
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

/*
 * Moved into a composable, and the behaviour changed with it.
 *
 * This rail measured its own overflow already, but it only ever *disabled* the
 * arrows -- so a row of three cards still drew a pair of dead controls beside
 * its heading. It also re-measured on window resize alone, which misses the
 * case that matters most: content arriving after mount. The composable watches
 * the rail and its children.
 */
const { overflows, atStart, atEnd } = useRailOverflow(rail)

/** Scrolls by most of a screenful, keeping a card of context. */
function scrollBy(direction: -1 | 1) {
  const el = rail.value
  if (!el) return
  el.scrollBy({ left: direction * (el.clientWidth * 0.8), behavior: 'smooth' })
}

const { t } = useI18n()

/**
 * Why a recommended card is here, as a sentence.
 *
 * Built on the client on purpose. The server returns counts and two display
 * names -- never prose -- because it would have to pick one language to write
 * it in, and this product ships in three. Pluralisation is the other half of
 * that: "1 friend" / "2 friends" is not a rule that survives translation, so
 * it belongs to the i18n layer rather than to a template branch.
 *
 * Friends beat strangers. Somebody you can actually talk to about a film is a
 * better reason to watch it than a similarity statistic, and when both are
 * present the friends are the half worth the line.
 */
function reasonFor(item: DiscoverItem): string | null {
  const reason = item.reason
  if (!reason) return null

  if (reason.friendCount > 0) {
    const [first, second] = reason.friendNames
    if (reason.friendCount === 1 && first) {
      return t('discover.reasonFriend', { name: first })
    }
    if (reason.friendCount === 2 && first && second) {
      return t('discover.reasonTwoFriends', { first, second })
    }
    if (first) {
      return t('discover.reasonFriendsMore', {
        name: first,
        count: reason.friendCount - 1,
      })
    }
    return t('discover.reasonFriendCount', { count: reason.friendCount })
  }

  if (reason.neighbourCount > 0) {
    return t('discover.reasonTaste', { count: reason.neighbourCount })
  }

  return null
}

</script>

<template>
  <section class="rail-section">
    <header class="rail-section__header">
      <!--
        The key when there is one, the server's English only as a fallback.

        These headings used to come down already composed ("Trending movies"),
        which meant the one thing on the page the server named could not be
        translated -- English rails on an otherwise Portuguese screen. The
        server now says what the row *is*; this decides how to say it.
      -->
      <h2 class="rail-section__title">
        {{ section.titleKey ? $t(section.titleKey, section.titleParams ?? {}) : section.title }}
      </h2>

      <div v-if="overflows" class="rail-section__controls">
        <button
          type="button"
          class="arrow"
          :disabled="atStart"
          :aria-label="$t('explore.scrollBack')"
          @click="scrollBy(-1)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          class="arrow"
          :disabled="atEnd"
          :aria-label="$t('explore.scrollForward')"
          @click="scrollBy(1)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </header>

    <ul ref="rail" class="rail">
      <li
        v-for="(item, index) in section.items"
        :key="item.media.id"
        v-reveal="index"
        class="card"
      >
        <MediaQuickLink :media-id="item.media.id" :title="item.media.title" :cover-image-url="item.media.coverImageUrl" class="card__link">
          <UiMediaPoster
            sizes="(min-width: 48rem) 184px, 22vw"
            :src="item.media.coverImageUrl"
            :title="item.media.title"
            :media-type="item.media.mediaType"
          />

          <span class="card__title clamp-2">{{ item.media.title }}</span>

          <span class="card__meta">
            {{ $t(`mediaType.${item.media.mediaType}`) }}
            <template v-if="releaseYear(item.media.releaseDate)">
              · {{ releaseYear(item.media.releaseDate) }}
            </template>
          </span>

          <span v-if="item.averageRating !== null" class="card__score">
            <UiStarRating :score="item.averageRating" size="sm" />
            {{ formatAverage(item.averageRating) }}
          </span>

          <!--
            The provider's, where this community has none.

            Without this the rail simply said nothing for most of its cards --
            The Mandalorian has an 8.4 at TMDB and was showing a blank line.
            On its own scale and named, never converted to stars.
          -->
          <span
            v-else-if="item.media.metadata.externalRating"
            class="card__score card__score--external"
          >
            {{ item.media.metadata.externalRating.score.toFixed(1) }}/10
            <span class="card__source">{{ item.media.metadata.externalRating.source }}</span>
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

          <!--
            Why this card is here (SPEC 21).

            Below the score rather than instead of it: the number says how the
            community felt, this says who specifically. Friends lead, because a
            name you know is worth more than a count of strangers.
          -->
          <span v-if="reasonFor(item)" class="card__reason">{{ reasonFor(item) }}</span>
        </MediaQuickLink>
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
    cursor: var(--cursor-arrow);
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
 * animating just the poster inside a fixed frame keeps the grid still while
 * making the target feel live.
 */
.card :deep(.poster) {
  transition:
    transform var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
  /* Promotes the poster to its own layer so a rail of two dozen animating
     cards does not repaint the row on every frame. */
  will-change: transform;
}

/* The artwork itself scales inside the frame rather than the frame growing,
   so neighbouring cards never shift. */
.card :deep(.poster__img) {
  transition: transform var(--duration-slow) var(--ease-out);
}

.card__link:hover :deep(.poster) {
  transform: translateY(-6px);
  border-color: var(--accent-edge);
  box-shadow: var(--accent-glow-soft);
}

.card__link:hover :deep(.poster__img) {
  transform: scale(1.06);
}

.card__link:active :deep(.poster) {
  transform: translateY(-2px);
  transition-duration: var(--duration-fast);
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

/* Not gold. Gold is reserved for scores this community produced, and a
   borrowed number wearing the same colour claims a provenance it lacks. */
.card__score--external {
  color: var(--text-secondary);
}

.card__source {
  font-weight: 500;
  color: var(--text-tertiary);
}

.card__reason {
  /* Two lines at most: a reason that pushes the card taller than its
     neighbours breaks the row's alignment, and the third line is always the
     least informative one. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: var(--text-2xs);
  line-height: var(--leading-snug);
  color: var(--text-tertiary);
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
