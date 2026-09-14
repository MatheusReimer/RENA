/**
 * `v-reveal` — animates an element in the first time it enters the viewport.
 *
 * Client-only by filename, so the server renders markup in its final state and
 * the animation is layered on after hydration. That ordering matters: if the
 * hidden state were server-rendered, anyone with JavaScript disabled or a
 * failed hydration would be left with a permanently invisible page.
 *
 * Usage:
 *   <li v-reveal>                  fade and rise
 *   <li v-reveal="index">          same, delayed by its position in a group
 *
 * One observer for the whole app rather than one per element: a Discover page
 * holds nearly three hundred cards, and three hundred IntersectionObservers is
 * a measurable cost for an effect nobody asked to pay for.
 */
export default defineNuxtPlugin((nuxtApp) => {
  // Someone who has asked for less motion gets none. Checked once here rather
  // than per element, and deliberately not re-checked on change: flipping the
  // setting mid-session and re-animating the page would itself be motion.
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let observer: IntersectionObserver | null = null

  function getObserver(): IntersectionObserver | null {
    if (typeof IntersectionObserver === 'undefined') return null

    observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-revealed')
          // Reveal is one-way. Re-hiding something on scroll-out means the
          // page flickers as you move back up it.
          observer?.unobserve(entry.target)
        }
      },
      {
        // A small negative bottom margin means the element animates as it
        // comes properly into view, not the instant its first pixel does.
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.01,
      },
    )

    return observer
  }

  nuxtApp.vueApp.directive('reveal', {
    mounted(el: HTMLElement, binding: { value?: number }) {
      if (prefersReducedMotion) return

      const index = typeof binding.value === 'number' ? binding.value : 0
      // Capped so a long rail's last card is not held back by half a second
      // of accumulated delay.
      el.style.setProperty('--reveal-delay', `${Math.min(index, 8) * 45}ms`)
      el.classList.add('reveal')

      const active = getObserver()
      if (active) active.observe(el)
      // Without IntersectionObserver the element simply appears, which is the
      // correct degradation for a decorative effect.
      else el.classList.add('is-revealed')
    },

    unmounted(el: HTMLElement) {
      observer?.unobserve(el)
    },
  })
})
