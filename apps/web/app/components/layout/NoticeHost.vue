<script setup lang="ts">
/**
 * Where a refusal is shown.
 *
 * One host per layout, teleported to the body so it is never clipped by the
 * shell's grid, by a sticky header, or by the overflow on a card that happened
 * to raise it.
 *
 * It sits above the mobile tab bar rather than over it: the bar is the way out
 * of whatever screen the reader is stuck on, and covering it with the
 * explanation of why they are stuck would be its own small joke.
 */
const notice = useNoticeStore()
</script>

<template>
  <Teleport to="body">
    <!--
      `status`, not `alert`. These are raised by something the reader just
      pressed, so they are already looking at the result; an assertive region
      interrupts whatever a screen reader is mid-sentence on to say the same
      thing. `aria-live` is on the wrapper rather than the notice so the
      region exists before the text arrives -- a live region created at the
      same moment as its content is not announced at all.
    -->
    <div class="host" role="status" aria-live="polite">
      <Transition name="notice">
        <div v-if="notice.current" :key="notice.current.id" class="notice" :class="`notice--${notice.current.tone}`">
          <p class="notice__text">{{ notice.current.message }}</p>

          <NuxtLink
            v-if="notice.current.action"
            :to="notice.current.action.to"
            class="notice__action"
            @click="notice.dismiss()"
          >
            {{ notice.current.action.label }}
          </NuxtLink>

          <button type="button" class="notice__close" :aria-label="$t('common.dismiss')" @click="notice.dismiss()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.host {
  position: fixed;
  inset-inline: 0;
  /* Clear of the tab bar and the home indicator on a phone; the bar is not
     rendered above 64rem, so there the offset is just a margin. */
  bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-3));
  z-index: var(--z-toast);
  display: flex;
  justify-content: center;
  padding-inline: var(--space-4);
  /* The host spans the screen so the notice can be centred in it; only the
     notice itself should ever swallow a tap. */
  pointer-events: none;
}

@media (min-width: 64rem) {
  .host {
    bottom: var(--space-6);
  }
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  max-width: 30rem;
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--surface-overlay);
  box-shadow: var(--shadow-lg, 0 12px 32px rgb(0 0 0 / 0.45));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  pointer-events: auto;
}

/* Tinted, not filled. A refusal is a condition to explain, not an alarm --
   and the accent is already the colour of the button they just pressed. */
.notice--blocked {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-default));
}

.notice__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  color: var(--text-primary);
}

.notice__action {
  flex: none;
  display: inline-flex;
  align-items: center;
  min-height: 1.75rem;
  padding-inline: var(--space-3);
  border-radius: var(--radius-full);
  background: var(--accent);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
}

.notice__close {
  flex: none;
  display: grid;
  place-items: center;
  /* 28px: the smallest thing here, and still over the 24px floor. */
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-full);
  color: var(--text-tertiary);
  cursor: var(--cursor-hand);
}

.notice__close svg {
  width: 0.9rem;
  height: 0.9rem;
}

.notice__close:hover {
  color: var(--text-primary);
}

.notice-enter-active,
.notice-leave-active {
  transition:
    opacity var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .notice-enter-active,
  .notice-leave-active {
    transition: none;
  }
}
</style>
