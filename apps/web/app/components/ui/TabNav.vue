<script setup lang="ts">
/**
 * The underlined tab row used across Feed, Search, Profile and Community.
 *
 * Generic over the value so each screen keeps its own union type rather than
 * passing strings around.
 */
defineProps<{
  tabs: ReadonlyArray<{ value: string; label: string; badge?: number }>
}>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="tabs" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      class="tab"
      :class="{ 'tab--active': model === tab.value }"
      :aria-selected="model === tab.value"
      @click="model = tab.value"
    >
      {{ tab.label }}
      <span v-if="tab.badge" class="tab__badge">{{ tab.badge }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: var(--space-6);
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-block: var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-tertiary);
  transition: color var(--duration-fast) var(--ease-out);
}

.tab:hover {
  color: var(--text-secondary);
}

.tab--active {
  color: var(--text-primary);
}

/*
 * The indicator sits on the shared bottom border rather than adding height,
 * so switching tabs never shifts the content below.
 *
 * Every tab carries one, scaled to nothing until it is active. Animating
 * scaleX on a per-tab element gives the same growing-underline motion as a
 * travelling bar without measuring positions in JavaScript -- and it survives
 * the tab row reflowing, which a measured bar would not.
 */
.tab::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
  border-radius: var(--radius-full);
  transform: scaleX(0);
  transform-origin: center;
  transition: transform var(--duration-base) var(--ease-out);
}

.tab--active::after {
  transform: scaleX(1);
}

.tab__badge {
  display: inline-grid;
  place-items: center;
  min-width: 1.125rem;
  height: 1.125rem;
  padding-inline: var(--space-1);
  border-radius: var(--radius-full);
  background: var(--accent);
  color: #fff;
  font-size: var(--text-2xs);
  font-weight: 700;
}
</style>
