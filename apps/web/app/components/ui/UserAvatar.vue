<script setup lang="ts">
import type { UserSummary } from '@revy/shared/types'

/**
 * Avatar with an initials fallback.
 *
 * Most users will not upload a photo, so the fallback is the common case and
 * gets a deterministic colour derived from the id -- the same person is always
 * the same colour, which makes a friends list scannable.
 */
const props = withDefaults(
  defineProps<{
    user: Pick<UserSummary, 'id' | 'displayName' | 'avatarUrl'>
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    /** Shows the online/status ring seen in the friends list. */
    ring?: boolean
  }>(),
  { size: 'md', ring: false },
)

const failed = ref(false)

const initials = computed(() =>
  props.user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase(),
)

/** Stable hue per user, so avatars are recognisable without a photo. */
const hue = computed(() => {
  let hash = 0
  for (const char of props.user.id) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
})
</script>

<template>
  <span
    class="avatar"
    :class="[`avatar--${size}`, { 'avatar--ring': ring }]"
    :style="{ '--avatar-hue': hue }"
  >
    <img
      v-if="user.avatarUrl && !failed"
      :src="user.avatarUrl"
      :alt="user.displayName"
      loading="lazy"
      decoding="async"
      class="avatar__img"
      @error="failed = true"
    />
    <span v-else class="avatar__initials" aria-hidden="true">{{ initials }}</span>
    <span v-if="!user.avatarUrl || failed" class="sr-only">{{ user.displayName }}</span>
  </span>
</template>

<style scoped>
.avatar {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: var(--avatar-size);
  height: var(--avatar-size);
  border-radius: var(--radius-full);
  overflow: hidden;
  background: hsl(var(--avatar-hue) 40% 28%);
  color: hsl(var(--avatar-hue) 60% 88%);
  font-weight: 600;
  user-select: none;
}

.avatar--ring {
  outline: 2px solid var(--surface-base);
  box-shadow: 0 0 0 3px var(--accent-border);
}

.avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar__initials {
  font-size: calc(var(--avatar-size) * 0.38);
  letter-spacing: -0.02em;
}

.avatar--xs { --avatar-size: 1.5rem; }
.avatar--sm { --avatar-size: 2rem; }
.avatar--md { --avatar-size: 2.5rem; }
.avatar--lg { --avatar-size: 3.5rem; }
.avatar--xl { --avatar-size: 6.5rem; }
</style>
