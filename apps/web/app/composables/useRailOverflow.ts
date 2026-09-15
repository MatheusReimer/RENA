import type { Ref } from 'vue'

/**
 * Whether a horizontal rail actually has anywhere to scroll.
 *
 * Every rail on the site drew its paging arrows unconditionally, so a row with
 * three cards in it -- which fits, with room to spare -- still offered a
 * previous and a next. Pressing them did nothing. A control that is visible,
 * enabled and inert is worse than no control: it makes the reader doubt the
 * page rather than the button.
 *
 * So this answers three questions the arrows need: is there overflow at all,
 * and if so are we already against either end. A rail that fits hides its
 * arrows entirely; one that overflows dims the end it has reached.
 */
export interface RailOverflow {
  /** True when the content is wider than the rail. */
  overflows: Ref<boolean>
  /** True when scrolled to the far left (or not scrollable). */
  atStart: Ref<boolean>
  /** True when scrolled to the far right (or not scrollable). */
  atEnd: Ref<boolean>
}

/**
 * The smallest gap that still counts as "not at the end".
 *
 * Two pixels is the obvious number and it is wrong here. These rails use
 * `scroll-snap` and carry their own inline padding, so a rail sitting at rest
 * against its first card reports `scrollLeft: 24`, not 0 -- with a two-pixel
 * tolerance the back arrow would never once dim, at any scroll position, on
 * any rail. The previous hand-rolled version had the same bug with eight.
 *
 * So the slack scales with the rail: a small fraction of a screenful absorbs
 * whatever the snap offset happens to be, without ever being large enough to
 * call the middle of a long row an end.
 */
const MIN_SLACK = 4
const SLACK_RATIO = 0.04

export function useRailOverflow(el: Ref<HTMLElement | null>): RailOverflow {
  const overflows = ref(false)
  const atStart = ref(true)
  const atEnd = ref(false)

  function measure() {
    const node = el.value
    if (!node) return

    const scrollable = node.scrollWidth - node.clientWidth
    const slack = Math.max(MIN_SLACK, node.clientWidth * SLACK_RATIO)

    // Overflow uses the tight threshold: a row that is a few pixels too wide
    // genuinely has somewhere to go, even if it is not far.
    overflows.value = scrollable > MIN_SLACK
    atStart.value = node.scrollLeft <= slack
    atEnd.value = node.scrollLeft >= scrollable - slack
  }

  onMounted(() => {
    measure()

    const node = el.value
    if (!node) return

    node.addEventListener('scroll', measure, { passive: true })

    /*
     * Watched rather than measured once.
     *
     * The rail's contents arrive asynchronously and its width changes with the
     * window, so a single measurement on mount is right only until the data
     * lands. `ResizeObserver` on the rail catches the window; observing the
     * children catches the images, which change the scroll width as they
     * decode.
     */
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    for (const child of node.children) observer.observe(child)

    // Children are replaced when the payload changes, so the observer has to
    // be pointed at the new ones.
    const mutations = new MutationObserver(() => {
      observer.disconnect()
      observer.observe(node)
      for (const child of node.children) observer.observe(child)
      measure()
    })
    mutations.observe(node, { childList: true })

    onBeforeUnmount(() => {
      node.removeEventListener('scroll', measure)
      observer.disconnect()
      mutations.disconnect()
    })
  })

  return { overflows, atStart, atEnd }
}
