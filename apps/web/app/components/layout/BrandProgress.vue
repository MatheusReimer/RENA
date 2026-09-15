<script setup lang="ts">
/**
 * The brand, as the thing that happens while you wait.
 *
 * Two pieces, and they are deliberately different jobs.
 *
 * A bar across the top reports progress on a navigation -- it is the honest
 * one: it appears when a route starts loading and leaves when it finishes, so
 * its width means something. A wash of red bleeding down from the top edge
 * runs *once per screen*, on arrival, and reports nothing at all. It is there
 * because a dark site changing from one dark screen to another gives the eye
 * no event to latch onto, and the moment of arrival is the one place the
 * accent can be spent freely -- nothing else is asking for attention yet.
 *
 * Neither is a spinner. A spinner says "something is happening somewhere"; a
 * bar says how far along, and a sweep says "this is a new page".
 */
const router = useRouter()

/** 0 to 1 while a navigation runs. Null when nothing is loading. */
const progress = ref<number | null>(null)

/** Bumped on every arrival, to restart the sweep animation. */
const arrival = ref(0)

let creep: ReturnType<typeof setInterval> | null = null
let settle: ReturnType<typeof setTimeout> | null = null

function stopCreep() {
  if (creep) clearInterval(creep)
  creep = null
}

function begin() {
  if (settle) clearTimeout(settle)
  stopCreep()

  progress.value = 0.08

  /*
   * It creeps, and it never arrives on its own.
   *
   * Each tick closes a fraction of the remaining distance, so the bar slows as
   * it advances and asymptotes short of the end. That is the honest shape for
   * a wait of unknown length: it keeps moving, so the page never looks stuck,
   * and it cannot reach 100% before the thing it is measuring has.
   */
  creep = setInterval(() => {
    if (progress.value === null) return
    progress.value += (0.9 - progress.value) * 0.12
  }, 180)
}

function finish() {
  stopCreep()
  if (progress.value === null) return

  progress.value = 1
  arrival.value += 1

  // Held briefly at full width before it goes, so the completion is seen
  // rather than inferred from the bar vanishing.
  settle = setTimeout(() => {
    progress.value = null
  }, 420)
}

router.beforeEach((to, from) => {
  // A query-only change -- a filter, a tab -- is not an arrival, and flashing
  // the whole treatment for one would make the effect meaningless by
  // repetition.
  if (to.path !== from.path) begin()
})

router.afterEach(finish)
router.onError(finish)

onBeforeUnmount(() => {
  stopCreep()
  if (settle) clearTimeout(settle)
})
</script>

<template>
  <div class="brand-progress" aria-hidden="true">
    <Transition name="bar">
      <div v-if="progress !== null" class="bar">
        <span class="bar__fill" :style="{ transform: `scaleX(${progress})` }" />
      </div>
    </Transition>

    <!-- Keyed on the arrival count so Vue replaces the node each time, which
         is what restarts a CSS animation that has already run to completion. -->
    <span v-if="arrival > 0" :key="arrival" class="sweep" />
  </div>
</template>

<style scoped>
.brand-progress {
  position: fixed;
  inset: 0 0 auto;
  z-index: var(--z-modal, 200);
  /* Decoration only: it must never eat a click meant for the top bar. */
  pointer-events: none;
}

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

.bar {
  height: 2px;
  overflow: hidden;
}

.bar__fill {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: 0 50%;
  background: linear-gradient(90deg, #7d1611, var(--accent) 45%, #ff8a7d);
  /* Lit rather than painted, so on a near-black bar it reads as a filament. */
  box-shadow: 0 0 0.75rem rgb(232 53 43 / 0.75);
  transition: transform 220ms var(--ease-out);
}

.bar-leave-active {
  transition: opacity 320ms var(--ease-out);
}

.bar-leave-to {
  opacity: 0;
}

/* ------------------------------------------------------------------ *
 * The arrival sweep
 * ------------------------------------------------------------------ */

/*
 * A wash of the accent down from the top edge, once, fast.
 *
 * Tall and very transparent: at 40vh it reads as light entering the screen
 * rather than as a red rectangle, and it is gone before anybody decides
 * whether they like it. `scaleY` and `opacity` only, so it stays on the
 * compositor and cannot cost a frame on the screen it is introducing.
 */
.sweep {
  position: absolute;
  inset: 0 0 auto;
  display: block;
  height: 40vh;
  transform-origin: 50% 0;
  background: linear-gradient(
    180deg,
    rgb(232 53 43 / 0.28),
    rgb(232 53 43 / 0.08) 45%,
    transparent
  );
  animation: sweep 900ms var(--ease-out) forwards;
}

@keyframes sweep {
  0% {
    opacity: 0;
    transform: scaleY(0.4);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scaleY(1);
  }
}

/*
 * Reduced motion keeps the bar and drops the sweep.
 *
 * They are not the same promise. The bar carries information -- how far along
 * a navigation is -- and removing it would cost somebody that. The sweep is
 * pure decoration, and a full-width flash of colour is exactly what this
 * preference is usually set to avoid.
 */
@media (prefers-reduced-motion: reduce) {
  .sweep {
    display: none;
  }

  .bar__fill {
    transition-duration: 1ms;
  }
}
</style>
