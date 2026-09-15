<script setup lang="ts">
import { CREDIT_ROLE_LABELS } from '@revy/shared/constants'
import type { CreditRole, MediaCredit } from '@revy/shared/types'

/**
 * Who made this, as a row of faces.
 *
 * The way into a person's page, and the reason the page is worth having: the
 * question "what else has this director done" is asked *while looking at a
 * film*, so the answer has to be reachable from here rather than from a
 * search box somebody would have to think to use.
 *
 * Crew first, then cast. Not alphabetical and not billing order across the
 * whole list: the four people who made a thing and the twelve who are in it
 * are different questions, and running them together makes the director the
 * fifth face in a row of actors.
 */
const props = defineProps<{ credits: MediaCredit[] }>()

const rail = ref<HTMLElement | null>(null)
const { overflows, atStart, atEnd } = useRailOverflow(rail)

/** Grouped by role, in the order the roles are worth reading. */
const groups = computed(() => {
  const byRole = new Map<CreditRole, MediaCredit[]>()

  for (const credit of props.credits) {
    const existing = byRole.get(credit.role)
    if (existing) existing.push(credit)
    else byRole.set(credit.role, [credit])
  }

  // `credits` arrives already ordered by role then billing, so insertion
  // order is the server's ordering and does not need re-deriving here.
  return [...byRole.entries()].map(([role, items]) => ({ role, items }))
})

function page(direction: 1 | -1) {
  const el = rail.value
  if (!el) return

  const step = Math.max(el.clientWidth - 120, 200)
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollBy({ left: step * direction, behavior: still ? 'auto' : 'smooth' })
}
</script>

<template>
  <section v-if="credits.length" class="credits">
    <header class="credits__head">
      <h3 class="credits__title">{{ $t('credits.heading') }}</h3>

      <div v-if="overflows" class="credits__controls">
        <button
          type="button"
          class="arrow"
          :disabled="atStart"
          :aria-label="$t('explore.scrollBack')"
          @click="page(-1)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          class="arrow"
          :disabled="atEnd"
          :aria-label="$t('explore.scrollForward')"
          @click="page(1)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </header>

    <ul ref="rail" class="rail">
      <template v-for="group in groups" :key="group.role">
        <li v-for="credit in group.items" :key="`${credit.person.id}:${credit.role}`" class="person">
          <NuxtLink :to="`/person/${credit.person.id}`" class="person__link">
            <span class="person__frame">
              <img
                v-if="credit.person.imageUrl"
                :src="credit.person.imageUrl"
                :alt="credit.person.name"
                loading="lazy"
                decoding="async"
              />
              <!-- Initials rather than a generic silhouette: TMDB has no photo
                   for a good share of crew, and a row of identical grey
                   outlines is harder to read than a row of letters. -->
              <span v-else class="person__initials" aria-hidden="true">
                {{ credit.person.name.slice(0, 1) }}
              </span>
            </span>

            <span class="person__name clamp-2">{{ credit.person.name }}</span>
            <span class="person__role">
              {{ credit.character || CREDIT_ROLE_LABELS[credit.role] }}
            </span>
          </NuxtLink>
        </li>
      </template>
    </ul>
  </section>
</template>

<style scoped>
.credits {
  margin-top: var(--space-8);
}

.credits__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.credits__title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
}

.credits__controls {
  display: flex;
  gap: var(--space-2);
}

.arrow {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .arrow {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-full);
    background: var(--surface-overlay);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    transition: background-color var(--duration-fast) var(--ease-out);
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
  width: 1rem;
  height: 1rem;
}

.rail {
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}

.rail::-webkit-scrollbar {
  display: none;
}

.person {
  flex: 0 0 auto;
  width: 5.5rem;
  scroll-snap-align: start;
}

.person__link {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.person__frame {
  position: relative;
  display: grid;
  place-items: center;
  width: 5.5rem;
  height: 5.5rem;
  overflow: hidden;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  transition:
    transform var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

.person__frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.person__initials {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-tertiary);
}

.person__link:hover .person__frame {
  transform: translateY(-3px);
  border-color: var(--accent-edge);
  box-shadow: var(--accent-glow);
}

.person__name {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: var(--leading-snug);
  transition: color var(--duration-fast) var(--ease-out);
}

.person__link:hover .person__name {
  color: var(--accent);
}

.person__role {
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .person__frame,
  .person__name,
  .arrow {
    transition: none;
  }

  .person__link:hover .person__frame {
    transform: none;
  }
}
</style>
