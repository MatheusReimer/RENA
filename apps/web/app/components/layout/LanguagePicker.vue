<script setup lang="ts">
/**
 * The language switch.
 *
 * This was a restyled `<select>`, on the argument that the platform does focus,
 * keyboard and mobile better than a hand-rolled menu -- which is true, and is
 * why most custom dropdowns are worse than the thing they replace. What it did
 * not account for is the one thing a `<select>` gives you no control over: the
 * options render in the *operating system's* menu, not the page's. On a dark
 * interface that is a slab of Windows grey with its own font, sitting under a
 * bar that has been styled to the pixel.
 *
 * So it is a listbox now, and the cost of that is paid rather than skipped:
 * arrow keys, Home and End, Enter and Space, Escape, click-outside, focus
 * returned to the trigger, `aria-activedescendant` for screen readers, and tap
 * targets big enough to hit with a thumb. If any of that is missing this is
 * worse than what it replaced, not better.
 *
 * Languages are named in their own language -- "Português", not "Portuguese".
 * Somebody hunting for their language cannot necessarily read the one the
 * interface is currently in, which is the entire situation this control exists
 * to fix.
 */
const { locale, locales, setLocale, t } = useI18n()

const options = computed(() =>
  (locales.value as Array<{ code: string; name?: string }>).map((entry) => ({
    code: entry.code,
    name: entry.name ?? entry.code,
  })),
)

const current = computed(
  () => options.value.find((option) => option.code === locale.value) ?? options.value[0],
)

const open = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const list = ref<HTMLElement | null>(null)

/**
 * Which option the keyboard is on, which is not which one is selected.
 *
 * A listbox moves a highlight before it commits to anything -- arrowing past
 * an option must not switch the interface language on the way through.
 */
const activeIndex = ref(0)

function openMenu(startAt?: number) {
  activeIndex.value =
    startAt ?? Math.max(0, options.value.findIndex((option) => option.code === locale.value))
  open.value = true

  // After the list exists, so the element is there to receive it.
  nextTick(() => list.value?.focus())
}

function closeMenu(restoreFocus = true) {
  if (!open.value) return
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function choose(index: number) {
  const option = options.value[index]
  if (!option) return

  closeMenu()
  if (option.code !== locale.value) setLocale(option.code as typeof locale.value)
}

function onKeydown(event: KeyboardEvent) {
  const last = options.value.length - 1

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      activeIndex.value = activeIndex.value >= last ? 0 : activeIndex.value + 1
      break
    case 'ArrowUp':
      event.preventDefault()
      activeIndex.value = activeIndex.value <= 0 ? last : activeIndex.value - 1
      break
    case 'Home':
      event.preventDefault()
      activeIndex.value = 0
      break
    case 'End':
      event.preventDefault()
      activeIndex.value = last
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      choose(activeIndex.value)
      break
    case 'Escape':
      event.preventDefault()
      closeMenu()
      break
    case 'Tab':
      // Not trapped: tabbing away is a legitimate way to dismiss a menu, and
      // trapping focus in a three-item list would be hostile.
      closeMenu(false)
      break
  }
}

/**
 * Anything outside closes it.
 *
 * `pointerdown` rather than `click`, so the menu is gone before whatever was
 * underneath receives the press -- with `click` the first tap elsewhere is
 * spent dismissing this instead of doing what the reader meant.
 */
const root = ref<HTMLElement | null>(null)

onMounted(() => {
  function onPointerDown(event: PointerEvent) {
    if (!open.value) return
    if (root.value?.contains(event.target as Node)) return
    closeMenu(false)
  }

  window.addEventListener('pointerdown', onPointerDown)
  onBeforeUnmount(() => window.removeEventListener('pointerdown', onPointerDown))
})
</script>

<template>
  <div ref="root" class="picker">
    <button
      ref="trigger"
      type="button"
      class="picker__trigger"
      :aria-label="t('language.switch')"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open ? closeMenu() : openMenu()"
      @keydown.down.prevent="openMenu()"
      @keydown.up.prevent="openMenu(options.length - 1)"
    >
      <svg class="picker__globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 9h17M3.5 15h17M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
      </svg>

      <span class="picker__name">{{ current?.name }}</span>

      <svg class="picker__chevron" :class="{ 'picker__chevron--open': open }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <Transition name="picker">
      <!--
        The list takes focus, not the individual options.

        One tab stop with `aria-activedescendant` is the pattern a listbox is
        supposed to use: moving a roving `tabindex` between options works, but
        it fires a focus change on every arrow press, which some screen readers
        announce as a new context rather than as a moved highlight.
      -->
      <ul
        v-if="open"
        ref="list"
        class="menu"
        role="listbox"
        tabindex="-1"
        :aria-activedescendant="`locale-option-${activeIndex}`"
        :aria-label="t('language.label')"
        @keydown="onKeydown"
      >
        <li
          v-for="(option, index) in options"
          :id="`locale-option-${index}`"
          :key="option.code"
          class="menu__item"
          :class="{
            'menu__item--active': index === activeIndex,
            'menu__item--on': option.code === locale,
          }"
          role="option"
          :aria-selected="option.code === locale"
          @click="choose(index)"
          @mousemove="activeIndex = index"
        >
          <span class="menu__check" aria-hidden="true">
            <svg v-if="option.code === locale" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          </span>

          <span class="menu__name">{{ option.name }}</span>

          <!-- The tag is what disambiguates two languages with similar
               endonyms, and it is what somebody actually recognises when the
               interface is in a script they cannot read. -->
          <span class="menu__code">{{ option.code }}</span>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
  display: inline-flex;
}

.picker__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: transparent;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: var(--cursor-hand);
  transition:
    color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.picker__trigger:hover,
.picker__trigger[aria-expanded='true'] {
  color: var(--text-primary);
  background: var(--surface-raised);
  border-color: var(--border-default);
}

.picker__trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.picker__globe {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

/* The name is the first thing to go when the bar is tight: the globe and the
   chevron already say what the control is. */
.picker__name {
  display: none;
}

@media (min-width: 48rem) {
  .picker__name {
    display: block;
  }
}

.picker__chevron {
  width: 0.8rem;
  height: 0.8rem;
  flex-shrink: 0;
  transition: transform var(--duration-base) var(--ease-out);
}

.picker__chevron--open {
  transform: rotate(180deg);
}

/* ------------------------------------------------------------------ *
 * The menu
 * ------------------------------------------------------------------ */

/*
 * Absolute, not fixed.
 *
 * The bar this sits in has a `backdrop-filter`, which makes it a containing
 * block for fixed-position descendants -- so `position: fixed` here would be
 * measured from the bar rather than the viewport, and land in the wrong place
 * for reasons nothing in this file would explain.
 */
.menu {
  position: absolute;
  top: calc(100% + var(--space-2));
  right: 0;
  /* Above the bar it hangs from, which is `--z-nav`. */
  z-index: var(--z-menu);
  min-width: 12rem;
  margin: 0;
  padding: var(--space-2);
  list-style: none;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--surface-overlay);
  box-shadow: var(--shadow-menu);
  /* The page behind it is artwork; without this the menu reads as a floating
     rectangle of text rather than as a surface above the page. */
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.menu:focus-visible {
  outline: none;
}

.menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  /* 2.75rem: a thumb target, not a mouse target. This menu is reachable on a
     phone and the old native one gave the platform's own sizing for free. */
  min-height: 2.75rem;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: var(--cursor-hand);
  transition:
    color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

/*
 * Hover and keyboard share one highlight.
 *
 * Two separate ones -- a hover colour and a focus ring -- means the menu can
 * show two "current" rows at once, and the reader has to work out which the
 * Enter key will take. `mousemove` moves the keyboard's own index instead.
 */
.menu__item--active {
  color: var(--text-primary);
  background: linear-gradient(90deg, rgb(200 16 46 / 0.16), transparent 88%);
}

.menu__item--on {
  color: var(--text-primary);
}

.menu__check {
  display: grid;
  place-items: center;
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--accent-text);
}

.menu__check svg {
  width: 100%;
  height: 100%;
}

.menu__name {
  flex: 1;
  white-space: nowrap;
}

/* `nowrap`, because a regional tag has a hyphen in it: without this "pt-BR"
   breaks across two lines and that one row stands half an inch taller than
   its neighbours. */
.menu__code {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

/* Opens from the corner it is anchored to, so it reads as unfolding out of
   the button rather than appearing beside it. */
.picker-enter-active,
.picker-leave-active {
  transition:
    opacity var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
  transform-origin: top right;
}

/*
 * A closing menu cannot be clicked.
 *
 * Vue removes the element on `transitionend`, and a tab that is not getting
 * animation frames never fires one -- so a dismissed menu can sit at opacity
 * zero indefinitely. It is absolutely positioned over the page, so without
 * this it goes on swallowing clicks meant for whatever is underneath, while
 * being completely invisible. Cheap insurance against a state that should not
 * happen and occasionally does.
 */
.picker-leave-active {
  pointer-events: none;
}

.picker-enter-from,
.picker-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-0.25rem);
}

@media (prefers-reduced-motion: reduce) {
  .picker__trigger,
  .picker__chevron,
  .menu__item,
  .picker-enter-active,
  .picker-leave-active {
    transition: none;
  }
}
</style>
