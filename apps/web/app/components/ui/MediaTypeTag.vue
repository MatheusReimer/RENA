<script setup lang="ts">
import type { MediaType } from '@revy/shared/types'

/**
 * What kind of thing this is, said plainly.
 *
 * RENA mixes films, television, books and games in one feed, one rail and one
 * review row -- which is the whole premise, and also the one thing that makes
 * it briefly disorienting. Reading "a beautiful, haunting story about what it
 * means to be human" tells you nothing about whether to expect a novel or a
 * six-hour game, and the poster beside it often will not either.
 *
 * So every surface that lists something carries one of these. It is small,
 * it is always in the same place, and it is the same four words everywhere.
 */
withDefaults(
  defineProps<{
    mediaType: MediaType
    /**
     * `solid` for listings over artwork, where a hairline disappears.
     * `quiet` for listings on a panel, where a filled chip would shout.
     */
    tone?: 'solid' | 'quiet'
    size?: 'sm' | 'md'
  }>(),
  { tone: 'quiet', size: 'md' },
)

/**
 * One glyph per type, and deliberately the same set the sidebar uses.
 *
 * A tag that is only a word is fine until it sits next to three other tags in
 * a column, at which point the shapes are what you read and the words are what
 * you confirm.
 */
const ICONS: Record<MediaType, string> = {
  movie: 'M3.2 7.2h17.6v12.3H3.2zM3.2 7.2 6 3.3M9 7 11.8 3.1M15 7l2.8-3.9M3.2 11.4h17.6',
  series: 'M3.2 4.8h17.6v11.4H3.2zM8.4 20.7h7.2',
  game: 'M7.6 9.2v3.6M5.8 11h3.6M15.2 10.4h.1M17.8 12.2h.1M7.3 6.9h9.4a4.6 4.6 0 0 1 4.5 3.8l.6 3.6a2.7 2.7 0 0 1-5 1.8l-1-1.6H8.2l-1 1.6a2.7 2.7 0 0 1-5-1.8l.6-3.6a4.6 4.6 0 0 1 4.5-3.8Z',
  book: 'M12 6.4v13M12 6.4C10.6 5 8.5 4.3 5.4 4.3a1 1 0 0 0-1 1v11.5a1 1 0 0 0 1 1c3.1 0 5.2.7 6.6 2.1 1.4-1.4 3.5-2.1 6.6-2.1a1 1 0 0 0 1-1V5.3a1 1 0 0 0-1-1c-3.1 0-5.2.7-6.6 2.1Z',
}
</script>

<template>
  <span class="tag" :class="[`tag--${tone}`, `tag--${size}`]">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path :d="ICONS[mediaType]" />
    </svg>
    {{ $t(`mediaType.${mediaType}`) }}
  </span>
</template>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.tag svg {
  width: 1em;
  height: 1em;
}

.tag--md {
  padding: 0.2rem var(--space-2);
  font-size: var(--text-2xs);
}

.tag--sm {
  padding: 0.1rem 0.4rem;
  font-size: 0.625rem;
}

/*
 * The accent, at a tenth strength.
 *
 * The brand red is reserved for the primary action and the active navigation
 * state, and a solid red chip on every card in a twelve-card rail would spend
 * that meaning completely. A tinted ground with a red border reads as the same
 * family without competing with the one button on the screen that is asking to
 * be pressed.
 */
.tag--quiet {
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: var(--text-primary);
}

/* Over artwork, where a hairline and a 12% tint both disappear. */
.tag--solid {
  border: 1px solid transparent;
  background: rgb(8 8 10 / 0.85);
  color: var(--text-primary);
}

.tag--solid svg {
  color: var(--accent);
}
</style>
