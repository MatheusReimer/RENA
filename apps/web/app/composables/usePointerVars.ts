/**
 * Publishes the pointer's position on an element as two custom properties.
 *
 * `--px` and `--py`, in pixels, relative to the element's own top-left corner.
 * Nothing is styled here -- CSS decides what, if anything, to do with them,
 * which means one listener can drive a light, a glow, a gradient or nothing at
 * all without this file knowing about any of them.
 *
 * Pixels rather than fractions on purpose: a fraction has to be multiplied by
 * the element's size to be useful, and CSS cannot read an element's size
 * without container queries and the layout containment they demand. A pixel
 * offset is directly usable in a `translate` -- which is the composited,
 * repaint-free way to move something, and the only one worth doing at pointer
 * frequency.
 */
export function usePointerVars(target: Ref<HTMLElement | null>) {
  onMounted(() => {
    // A light that follows a cursor needs a cursor. On touch there is none,
    // and `pointermove` there fires only during a drag.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const el = target.value
    if (!el) return

    let frame = 0
    let x = 0
    let y = 0

    function publish() {
      frame = 0
      el!.style.setProperty('--px', `${x.toFixed(1)}px`)
      el!.style.setProperty('--py', `${y.toFixed(1)}px`)
    }

    function onMove(event: PointerEvent) {
      const box = el!.getBoundingClientRect()
      x = event.clientX - box.left
      y = event.clientY - box.top
      // One write per frame however many moves the browser delivers.
      if (!frame) frame = requestAnimationFrame(publish)
    }

    el.addEventListener('pointermove', onMove, { passive: true })

    onBeforeUnmount(() => {
      el.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
    })
  })
}
