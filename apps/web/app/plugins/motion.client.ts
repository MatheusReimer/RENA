/**
 * Pointer-reactive motion directives: `v-magnetic` and `v-tilt`.
 *
 * Both publish custom properties and never write `transform` themselves --
 * the component keeps control of how it moves, and these only say where the
 * cursor is relative to it. An inline `style.transform` from a directive sits
 * at a specificity the stylesheet cannot answer, which would quietly break
 * every hover treatment on the element.
 */

/**
 * `v-magnetic` — a control that leans toward the cursor as it approaches.
 *
 * Usage:
 *   <a v-magnetic>          pulls up to 8px
 *   <a v-magnetic="14">     pulls up to 14px
 *
 * The directive only publishes two custom properties, `--mx` and `--my`, in
 * pixels. It never writes `transform` itself, and that restraint is the whole
 * design: these elements already transition their own background and border on
 * hover, and an inline `style.transform` from here would sit at a specificity
 * nothing in the stylesheet can answer -- so the component keeps control of
 * how it moves, and this only says where the cursor is relative to it.
 *
 * The pull is deliberately sub-linear. A control that tracks the pointer one
 * for one reads as a bug in the layout; one that leans a few pixels and
 * resists reads as a physical object with some weight to it.
 */
export default defineNuxtPlugin((nuxtApp) => {
  // Checked once, not per element, and deliberately not re-checked on change:
  // flipping the setting mid-session and re-animating would itself be motion.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches

  /** How far outside its own box a control starts to feel the cursor. */
  const FIELD = 28

  nuxtApp.vueApp.directive('magnetic', {
    mounted(el: HTMLElement, binding: { value?: number }) {
      // There is nothing to lean toward on a touch screen: the first the page
      // hears of a finger is the tap itself.
      if (prefersReducedMotion || !finePointer) return

      const pull = typeof binding.value === 'number' ? binding.value : 8
      let frame = 0
      let x = 0
      let y = 0

      function publish() {
        frame = 0
        el.style.setProperty('--mx', `${x.toFixed(2)}px`)
        el.style.setProperty('--my', `${y.toFixed(2)}px`)
      }

      function onMove(event: PointerEvent) {
        const box = el.getBoundingClientRect()
        if (!box.width || !box.height) return

        // -1..1 from the centre, so the pull is symmetrical whatever the
        // control's aspect ratio.
        const dx = (event.clientX - (box.left + box.width / 2)) / (box.width / 2 + FIELD)
        const dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2 + FIELD)

        x = Math.max(-1, Math.min(1, dx)) * pull
        y = Math.max(-1, Math.min(1, dy)) * pull
        if (!frame) frame = requestAnimationFrame(publish)
      }

      function onLeave() {
        x = 0
        y = 0
        if (!frame) frame = requestAnimationFrame(publish)
      }

      /*
       * Listened for on the window rather than the element.
       *
       * The point of a magnetic control is that it reacts *before* you reach
       * it. `pointermove` on the element itself only fires once the cursor is
       * already inside, by which time the lean has nothing left to
       * anticipate.
       */
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerleave', onLeave, { passive: true })

      // Kept on the element so `unmounted` can find them again; a WeakMap here
      // would be the same thing with more machinery.
      Object.assign(el, { __magnetic: { onMove, onLeave, cancel: () => frame && cancelAnimationFrame(frame) } })
    },

    unmounted(el: HTMLElement) {
      const handlers = (el as unknown as { __magnetic?: { onMove: (e: PointerEvent) => void; onLeave: () => void; cancel: () => void } }).__magnetic
      if (!handlers) return
      window.removeEventListener('pointermove', handlers.onMove)
      window.removeEventListener('pointerleave', handlers.onLeave)
      handlers.cancel()
    },
  })

  registerTilt(nuxtApp.vueApp)
})

/**
 * `v-tilt` — a card that leans toward the cursor in three dimensions.
 *
 * Usage:
 *   <a v-tilt>        tilts up to 6deg
 *   <a v-tilt="10">   tilts up to 10deg
 *
 * Publishes `--tilt-x` and `--tilt-y` in degrees, and `--glare-x`/`--glare-y`
 * as percentages for a highlight to follow. As with `v-magnetic`, no transform
 * is written here: the component decides whether to rotate, where its
 * perspective origin is, and what else it is already doing on hover.
 *
 * Listened for on the element rather than the window, unlike the magnetic
 * pull. A tilt has no anticipation to express -- there is nothing to lean
 * toward until the cursor is actually over the surface.
 */
function registerTilt(app: import('vue').App) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches

  app.directive('tilt', {
    mounted(el: HTMLElement, binding: { value?: number }) {
      if (prefersReducedMotion || !finePointer) return

      const maxDeg = typeof binding.value === 'number' ? binding.value : 6
      let frame = 0
      let rx = 0
      let ry = 0
      let gx = 50
      let gy = 50

      function publish() {
        frame = 0
        el.style.setProperty('--tilt-x', `${rx.toFixed(2)}deg`)
        el.style.setProperty('--tilt-y', `${ry.toFixed(2)}deg`)
        el.style.setProperty('--glare-x', `${gx.toFixed(1)}%`)
        el.style.setProperty('--glare-y', `${gy.toFixed(1)}%`)
      }

      function onMove(event: PointerEvent) {
        const box = el.getBoundingClientRect()
        if (!box.width || !box.height) return

        const px = (event.clientX - box.left) / box.width
        const py = (event.clientY - box.top) / box.height

        // Y movement tips the card about the X axis and vice versa, which is
        // the part that is easy to get backwards: pushing the cursor up should
        // lift the far edge away, not the near one.
        rx = (0.5 - py) * maxDeg * 2
        ry = (px - 0.5) * maxDeg * 2
        gx = px * 100
        gy = py * 100
        if (!frame) frame = requestAnimationFrame(publish)
      }

      function onLeave() {
        rx = 0
        ry = 0
        gx = 50
        gy = 50
        if (!frame) frame = requestAnimationFrame(publish)
      }

      el.addEventListener('pointermove', onMove, { passive: true })
      el.addEventListener('pointerleave', onLeave, { passive: true })

      Object.assign(el, {
        __tilt: { onMove, onLeave, cancel: () => frame && cancelAnimationFrame(frame) },
      })
    },

    unmounted(el: HTMLElement) {
      const handlers = (el as unknown as { __tilt?: { onMove: (e: PointerEvent) => void; onLeave: () => void; cancel: () => void } }).__tilt
      if (!handlers) return
      el.removeEventListener('pointermove', handlers.onMove)
      el.removeEventListener('pointerleave', handlers.onLeave)
      handlers.cancel()
    },
  })
}
