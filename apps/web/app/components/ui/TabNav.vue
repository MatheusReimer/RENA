<script setup lang="ts">
/**
 * The underlined tab row used across Feed, Search, Profile and Community.
 *
 * Generic over the value so each screen keeps its own union type rather than
 * passing strings around.
 *
 * Below 40rem it is not a row at all. Search carries six tabs and the media
 * page five with counts beside them, which is comfortably more than a 360px
 * phone can show -- and the row scrolled with its scrollbar hidden, so the
 * tabs past the edge were not merely cramped, they were invisible. Landing on
 * `/search?tab=people` selected a tab the reader could not see and offered no
 * sign that the rest of the row existed.
 *
 * So the narrow screen gets a select instead. It is a native one: the picker
 * it opens is the one the platform already uses everywhere else, it is
 * keyboard and screen-reader complete without any of it being written here,
 * and it cannot be clipped by a parent's overflow the way a custom popup
 * would be on the sticky, scrolling headers these sit in.
 *
 * Both controls are rendered and CSS chooses between them. The alternative is
 * matching the viewport in JavaScript, which the server cannot do -- it would
 * render one control, hydrate into the other, and flash on every phone.
 */
defineProps<{
  tabs: ReadonlyArray<{ value: string; label: string; badge?: number }>
}>()

const model = defineModel<string>({ required: true })

/**
 * The label a select option carries.
 *
 * A badge is a shape in the row and there is nowhere to put a shape in an
 * option, so the count comes along in the text. Without it the unread and
 * unanswered counts -- the whole reason those badges exist -- would simply
 * disappear on the screens that most need them.
 */
function optionLabel(tab: { label: string; badge?: number }): string {
  return tab.badge ? `${tab.label} (${tab.badge})` : tab.label
}
</script>

<template>
  <div class="tabnav">
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

    <div class="picker">
      <select v-model="model" class="picker__control" :aria-label="$t('common.chooseSection')">
        <option v-for="tab in tabs" :key="tab.value" :value="tab.value">
          {{ optionLabel(tab) }}
        </option>
      </select>

      <svg
        class="picker__chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
/* ------------------------------------------------------------------ *
 * Narrow: the select
 * ------------------------------------------------------------------ */

.tabs {
  display: none;
}

.picker {
  position: relative;
  display: flex;
  align-items: center;
}

.picker__control {
  width: 100%;
  /* Room on the right for the chevron the native arrow was removed to make
     way for. */
  padding: var(--space-3) var(--space-10) var(--space-3) var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  color: var(--text-primary);
  /*
   * 17px, and not because it reads better at that size.
   *
   * Mobile Safari zooms the whole page in when a control smaller than 16px
   * takes focus, and does not zoom back out when it is dismissed -- which
   * leaves the reader on a page they now have to scroll sideways. Every
   * control that opens a keyboard or a picker has to clear 16px.
   */
  font-size: var(--text-base);
  font-weight: 600;
  /* The row is the thing being replaced, so the control that replaces it
     should be at least as easy to hit as one. */
  min-height: 2.75rem;
  appearance: none;
  cursor: var(--cursor-hand);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.picker__control:focus-visible {
  outline: none;
  border-color: var(--border-strong);
}

/*
 * The option list is drawn by the platform, not by this stylesheet.
 *
 * Only the two colours are ours to set, and they have to be: a dark page
 * whose select inherits a light system menu renders white text on white on
 * some Android builds.
 */
.picker__control option {
  background: var(--surface-raised);
  color: var(--text-primary);
}

.picker__chevron {
  position: absolute;
  right: var(--space-4);
  width: 1.125rem;
  height: 1.125rem;
  color: var(--text-tertiary);
  /* The control beneath owns every click in this box, including this corner
     of it. */
  pointer-events: none;
}

/* ------------------------------------------------------------------ *
 * Wide: the row
 * ------------------------------------------------------------------ */

@media (min-width: 40rem) {
  .picker {
    display: none;
  }

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

@media (prefers-reduced-motion: reduce) {
  .tab,
  .tab::after,
  .picker__control {
    transition: none;
  }
}
</style>
