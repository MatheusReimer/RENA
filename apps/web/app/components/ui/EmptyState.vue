<script setup lang="ts">
/**
 * Empty states (SPEC 37).
 *
 * SPEC 36 and 37 both require that a screen with nothing in it explains
 * itself. Every empty list in the app renders one of these rather than
 * collapsing to nothing.
 */
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="empty">
    <!-- A rule rather than a glyph. An emoji in an empty state is decoration
         standing in for a sentence; the sentence is already here. -->
    <span class="empty__rule" aria-hidden="true" />
    <p class="empty__title">{{ title }}</p>
    <p v-if="description" class="empty__description">{{ description }}</p>
    <div v-if="$slots.action" class="empty__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-12) var(--space-4);
}

.empty__rule {
  width: 1.75rem;
  height: 2px;
  margin-bottom: var(--space-5);
  border-radius: var(--radius-full);
  background: var(--accent);
  opacity: 0.8;
}

.empty__title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.empty__description {
  margin-top: var(--space-2);
  max-width: 28rem;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.empty__action {
  margin-top: var(--space-5);
}
</style>
