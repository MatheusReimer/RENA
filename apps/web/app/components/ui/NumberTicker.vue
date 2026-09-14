<script setup lang="ts">
/**
 * Counts a number up when it first comes into view.
 *
 * Used on figures the design makes large -- profile stats, a media page's
 * aggregate score. A number that arrives already at rest is just text; one
 * that lands makes the size feel earned.
 *
 * Deliberately not used on counts that change in response to a tap, like a
 * like counter: there the number must track the action exactly, and counting
 * would read as lag.
 */
const props = withDefaults(
  defineProps<{
    value: number
    /** Decimal places. Ratings want 1, counts want 0. */
    decimals?: number
    durationMs?: number
  }>(),
  { decimals: 0, durationMs: 900 },
)

const host = ref<HTMLElement | null>(null)
// Starts at the final value so the server renders the real number. Anyone
// without JavaScript, or before hydration, sees the figure rather than a zero.
const shown = ref(props.value)
let frame = 0

function run() {
  const start = performance.now()
  const from = 0
  const to = props.value

  const step = (now: number) => {
    const t = Math.min(1, (now - start) / props.durationMs)
    // Decelerating, matching --ease-out: fast departure, soft landing.
    const eased = 1 - Math.pow(1 - t, 3)
    shown.value = from + (to - from) * eased
    if (t < 1) frame = requestAnimationFrame(step)
  }

  frame = requestAnimationFrame(step)
}

onMounted(() => {
  if (typeof window === 'undefined') return

  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    typeof IntersectionObserver === 'undefined'
  ) {
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        shown.value = 0
        run()
        observer.disconnect()
      }
    },
    { threshold: 0.4 },
  )

  if (host.value) observer.observe(host.value)
  onBeforeUnmount(() => observer.disconnect())
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

const display = computed(() => shown.value.toFixed(props.decimals))
</script>

<template>
  <span ref="host" class="ticker">{{ display }}</span>
</template>

<style scoped>
.ticker {
  /* Tabular figures so the width does not jitter as digits change. */
  font-variant-numeric: tabular-nums;
}
</style>
