<script setup lang="ts">
/**
 * Feed loading placeholder (SPEC 36).
 *
 * Mirrors ActivityCard's geometry -- avatar, headline, 16:9 art, stars, two
 * lines of text -- so the real card lands in the same place the skeleton was
 * and the page does not jump.
 */
</script>

<template>
  <div class="skeleton-card" aria-hidden="true">
    <div class="skeleton-card__header">
      <UiSkeletonBlock width="2.5rem" height="2.5rem" circle />
      <div class="skeleton-card__lines">
        <UiSkeletonBlock width="60%" height="0.875rem" />
        <UiSkeletonBlock width="30%" height="0.75rem" />
      </div>
    </div>

    <UiSkeletonBlock
      width="100%"
      height="auto"
      radius="var(--radius-lg)"
      class="skeleton-card__art"
    />

    <UiSkeletonBlock width="40%" height="1.25rem" />
    <UiSkeletonBlock width="90%" height="0.875rem" />
    <UiSkeletonBlock width="70%" height="0.875rem" />
  </div>
</template>

<style scoped>
.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.skeleton-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-1);
}

.skeleton-card__lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}

.skeleton-card__art {
  aspect-ratio: var(--backdrop-ratio);
  margin-bottom: var(--space-2);
}
</style>
