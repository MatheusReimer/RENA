<script setup lang="ts">
/**
 * Spoiler protection (SPEC 11, 14).
 *
 * SPEC 11 requires spoiler content stay hidden until explicitly revealed.
 * The content is rendered but visually masked and marked `inert`, so it cannot
 * be focused, selected or read out before the user opts in -- hiding it with
 * a blur alone would still leak it to a screen reader.
 */
const props = defineProps<{ spoiler: boolean }>()

const revealed = ref(false)

// A list can reuse a component instance for a different item; reset so one
// revealed spoiler never uncovers the next.
watch(
  () => props.spoiler,
  () => {
    revealed.value = false
  },
)
</script>

<template>
  <div v-if="!spoiler || revealed" class="spoiler-content">
    <slot />
  </div>

  <div v-else class="spoiler">
    <div class="spoiler__masked" inert aria-hidden="true">
      <slot />
    </div>
    <button type="button" class="spoiler__reveal" @click="revealed = true">
      Contains spoilers — tap to reveal
    </button>
  </div>
</template>

<style scoped>
.spoiler {
  position: relative;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.spoiler__masked {
  filter: blur(7px);
  opacity: 0.4;
  user-select: none;
  pointer-events: none;
}

.spoiler__reveal {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-3);
  background: var(--scrim-soft);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-align: center;
}

.spoiler__reveal:hover {
  color: var(--text-primary);
}
</style>
