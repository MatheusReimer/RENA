<script setup lang="ts">
import type { CommunitySummary } from '@revy/shared/types'
import { formatRatingCount, relativeTime } from '@revy/shared/utils'

/**
 * One community in the directory (SPEC 14).
 *
 * Carries its own Join control, which is what makes the Browse tab more than a
 * second catalogue list -- the point of "every title is already a community"
 * is that you can join one without first going to read it.
 *
 * Structured as a container with an overlay link rather than a link wrapping
 * everything, because a button inside an `<a>` is invalid HTML: the nested
 * control is not reliably reachable by keyboard and a click on it still
 * navigates in some browsers. `.card__link::after` stretches the hit area over
 * the whole row, and the button sits above it.
 */
const props = defineProps<{ community: CommunitySummary }>()

const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()

/*
 * `joined` is a tri-state and each value means something different here:
 * `true` you are in, `false` you are not, `null` we do not know who you are.
 * A signed-out reader still gets the button -- it routes to sign-in -- because
 * hiding it would make the directory look read-only.
 */
const joined = computed(() => props.community.joined === true)

/** Friends here besides the one the sentence names. */
const friendOthers = computed(
  () => (props.community.friendCount ?? props.community.friendMembers?.length ?? 0) - 1,
)
</script>

<template>
  <article class="card">
    <!-- Straight at the media page's discussions tab. The community *is* the
         media item, and `/community/[id]` is now only a redirect here. -->
    <NuxtLink
      :to="{ path: `/media/${community.media.id}`, query: { tab: 'discussions' } }"
      class="card__link"
    >
      <div class="card__poster">
        <UiMediaPoster
          sizes="56px"
          :src="community.media.coverImageUrl"
          :title="community.media.title"
          :media-type="community.media.mediaType"
        />
      </div>

      <div class="card__text">
        <span class="card__title clamp-2">{{ community.media.title }}</span>

        <span class="card__meta">
          {{ t('community.threadCount', { count: community.threadCount }) }}
          <template v-if="community.memberCount">
            ·
            {{
              t('community.memberCount', {
                count: community.memberCount,
                formatted: formatRatingCount(community.memberCount),
              })
            }}
          </template>
        </span>

        <!-- Faces beat a number: the reason to join is usually who is in
             there, and "Ana and 2 others" says that where "3 friends" does
             not. Only the friends tab populates this. -->
        <span v-if="community.friendMembers?.length" class="card__friends">
          <span class="card__faces">
            <UiUserAvatar
              v-for="friend in community.friendMembers"
              :key="friend.id"
              :user="friend"
              size="sm"
              class="card__face"
            />
          </span>
          <span class="card__friends-text">
            {{
              t('community.friendsHere', {
                /*
                 * The plural is chosen by `others`, not by the total.
                 *
                 * The sentence names the first friend and counts the rest, so
                 * two friends here means "and 1 other" -- driving the choice
                 * off the total produced "Marina and 1 others are here". Three
                 * forms, because `others` of 0, 1 and many are three different
                 * sentences rather than two.
                 */
                count: friendOthers,
                others: friendOthers,
                name: community.friendMembers[0]?.displayName ?? '',
              })
            }}
          </span>
        </span>

        <span v-else-if="community.lastActivityAt" class="card__activity">
          {{ t('community.activeAgo', { ago: relativeTime(community.lastActivityAt) }) }}
        </span>
      </div>
    </NuxtLink>

    <button
      type="button"
      class="card__join"
      :class="{ 'card__join--in': joined }"
      :aria-pressed="joined"
      @click="emit('toggle')"
    >
      {{ joined ? t('community.joined') : t('community.join') }}
    </button>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.card__link {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex: 1;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

/* Stretches the link over the whole row, so the text is not the only target.
   The button is given a higher stacking order below so it stays clickable. */
.card__link::after {
  content: '';
  position: absolute;
  inset: 0;
}

.card__poster {
  width: 3.5rem;
  flex-shrink: 0;
}

.card__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.card__title {
  font-size: var(--text-base);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.card__meta {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.card__friends {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 2px;
}

/* Overlapped, so three faces cost about the width of two. */
.card__faces {
  display: flex;
  flex-shrink: 0;
}

.card__face:not(:first-child) {
  margin-left: -0.4rem;
}

.card__friends-text {
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  min-width: 0;
}

.card__activity {
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}

.card__join {
  position: relative;
  /* Above the link's stretched ::after, or the row would swallow the click. */
  z-index: 1;
  flex-shrink: 0;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  border: 1px solid var(--accent);
  background: var(--accent-fill);
  color: #fff;
  font-size: var(--text-2xs);
  font-weight: 600;
  cursor: var(--cursor-hand);
  transition:
    background var(--duration-fast),
    color var(--duration-fast);
}

.card__join:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

/* Already a member: recedes to a state label, so the loud affordance is only
   ever on the action the reader has not taken. */
.card__join--in {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent-text);
}

.card__join--in:hover {
  background: var(--accent-border);
  border-color: var(--accent);
}

.card__join:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
