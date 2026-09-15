<script setup lang="ts">
import type { MediaType, Presence } from '@revy/shared/types'
import { MEDIA_TYPE_VERBS } from '@revy/shared/constants'
import { relativeTime } from '@revy/shared/utils'

/**
 * "Has anybody else been here?"
 *
 * The question this product exists to answer, and the one a rating average
 * cannot. Somebody standing in a shop holding a book does not want to know it
 * scored 4.2 -- they want to know whether there is anyone to talk to about it.
 *
 * So this is people, not a number. The counts are underneath, in small type,
 * because they are the by-product.
 */
const props = defineProps<{
  presence: Presence
  mediaType: MediaType
  /** Shown when nobody has been here yet, to make that the invitation. */
  mediaTitle: string
}>()

const verbs = computed(() => MEDIA_TYPE_VERBS[props.mediaType])

const nobody = computed(
  () => props.presence.completedCount === 0 && props.presence.inProgressCount === 0,
)

/**
 * The sentence above the faces.
 *
 * Built rather than templated because the interesting version is the one with
 * friends in it: "3 friends and 9 others" is a completely different message
 * from "12 people", and it is the whole reason friends are sorted first.
 */
const summary = computed(() => {
  const { completedCount, friendCount } = props.presence

  if (friendCount > 0) {
    const friends = `${friendCount} ${friendCount === 1 ? 'friend' : 'friends'}`
    const others = completedCount - friendCount
    if (others > 0) {
      return `${friends} and ${others} other${others === 1 ? '' : 's'} here have ${verbs.value.past} this.`
    }
    return `${friends} here ${friendCount === 1 ? 'has' : 'have'} ${verbs.value.past} this.`
  }

  if (completedCount > 0) {
    return `${completedCount} ${completedCount === 1 ? 'person' : 'people'} here ${
      completedCount === 1 ? 'has' : 'have'
    } ${verbs.value.past} this.`
  }

  return `Nobody here has ${verbs.value.past} this yet.`
})
</script>

<template>
  <section class="presence">
    <h2 class="presence__title">Who else has been here</h2>

    <!--
      The empty state is the invitation, not an apology.

      "No data" would be the honest-but-useless version. Being the first person
      here to read something is a genuinely appealing thing to be told, and it
      is the only moment this page can offer it.
    -->
    <div v-if="nobody" class="empty">
      <span class="empty__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3.5v17M3.5 12h17" />
        </svg>
      </span>
      <p class="empty__line">You would be the first.</p>
      <p class="empty__sub">
        Nobody here has {{ verbs.past }} {{ mediaTitle }} yet. Mark it finished and
        the next person will find you.
      </p>
    </div>

    <template v-else>
      <p class="presence__summary">{{ summary }}</p>

      <ul class="people">
        <li v-for="reader in presence.readers" :key="reader.user.id" class="person">
          <NuxtLink :to="`/u/${reader.user.username}`" class="person__link">
            <UiUserAvatar :user="reader.user" size="md" />

            <span class="person__text">
              <span class="person__name">
                {{ reader.user.displayName }}
                <span v-if="reader.isFriend" class="person__tag">Friend</span>
              </span>
              <span class="person__when">
                <!-- Someone part-way through is company too, and saying which
                     is the difference between "has read it" and "is reading it
                     right now" -- the second is the better conversation. -->
                {{ reader.status === 'completed' ? 'Finished' : 'Reading now,' }}
                {{ relativeTime(reader.at) }}
              </span>
            </span>

            <span v-if="reader.score !== null" class="person__score">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z" />
              </svg>
              {{ reader.score.toFixed(1) }}
            </span>
          </NuxtLink>
        </li>
      </ul>

      <p v-if="presence.inProgressCount" class="presence__foot">
        {{ presence.inProgressCount }}
        {{ presence.inProgressCount === 1 ? 'person is' : 'people are' }}
        part-way through right now.
      </p>
    </template>
  </section>
</template>

<style scoped>
.presence {
  padding: var(--space-6) 0;
  border-top: 1px solid var(--border-subtle);
}

.presence__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.presence__summary {
  margin: 0 0 var(--space-5);
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.presence__foot {
  margin: var(--space-5) 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

.people {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 40rem) {
  .people {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.person__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  transition: background-color var(--duration-fast) var(--ease-out);
}

.person__link:hover {
  background: var(--surface-raised);
}

.person__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.1rem;
}

.person__name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Friends are marked as well as sorted first: in a two-column grid the
   ordering alone is not visible enough to be read as meaning. */
.person__tag {
  flex-shrink: 0;
  padding: 0.1rem var(--space-2);
  border-radius: var(--radius-full);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  font-size: var(--text-2xs);
  font-weight: 500;
  color: var(--text-primary);
}

.person__when {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.person__score {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.person__score svg {
  width: 0.8rem;
  height: 0.8rem;
  fill: var(--star);
}

/* ------------------------------------------------------------------ *
 * Nobody yet
 * ------------------------------------------------------------------ */

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-4);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-lg);
  text-align: center;
}

.empty__mark {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent);
}

.empty__mark svg {
  width: 1.25rem;
  height: 1.25rem;
}

.empty__line {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}

.empty__sub {
  margin: 0;
  max-width: 32ch;
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--text-tertiary);
}

@media (prefers-reduced-motion: reduce) {
  .person__link {
    transition: none;
  }
}
</style>
