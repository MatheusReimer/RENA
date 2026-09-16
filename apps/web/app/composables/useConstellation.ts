/**
 * A drifting field of points, joined by lines where they come close.
 *
 * The page opens with "a line connects us all" set small in the corner of the
 * hero; this is that sentence drawn rather than written, and it closes the
 * page on the same idea. Points wander, and wherever two are near enough a
 * line appears between them and fades as they part -- so the graph is never
 * the same twice and never finished, which is the honest picture of what a
 * community is.
 *
 * Canvas 2D, not WebGL. Sixty points is about 1,800 distance checks a frame,
 * which is nothing, and the whole effect is thin strokes on a dark ground --
 * exactly what a 2D context is already good at. Reaching for a shader here
 * would buy nothing but a second WebGL context on one page.
 */

export interface ConstellationOptions {
  /** Points at a reference width of 1440px; scaled by area from there. */
  density?: number
  /** How near two points must be, in px, before a line is drawn. */
  linkDistance?: number
  /** Roughly one point in this many is drawn in the brand colour. */
  accentEvery?: number
}

interface Point {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  accent: boolean
}

export function useConstellation(
  canvas: Ref<HTMLCanvasElement | null>,
  options: ConstellationOptions = {},
) {
  const density = options.density ?? 58
  const linkDistance = options.linkDistance ?? 132
  const accentEvery = options.accentEvery ?? 9

  onMounted(() => {
    const el = canvas.value
    if (!el) return

    const ctx = el.getContext('2d')
    if (!ctx) return

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let points: Point[] = []
    let width = 0
    let height = 0
    let frame = 0
    let visible = false
    // Off-canvas until the pointer arrives, so nothing is highlighted at rest.
    let pointerX = -9999
    let pointerY = -9999

    function build() {
      const box = el!.getBoundingClientRect()
      if (!box.width || !box.height) return false

      // Capped: this is hairlines on near-black, and a 4K backing store costs
      // real fill rate to render something nobody can see the extra detail in.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = box.width
      height = box.height
      el!.width = Math.round(width * dpr)
      el!.height = Math.round(height * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

      /*
       * Scaled by area, not held constant.
       *
       * A fixed count looks sparse on a wide monitor and cluttered on a
       * laptop, because what the eye reads is points per square inch rather
       * than points. Clamped at both ends so an ultrawide does not turn it
       * into soup.
       */
      const scale = (width * height) / (1440 * 520)
      const total = Math.round(Math.max(22, Math.min(110, density * scale)))

      points = Array.from({ length: total }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        // Slow: these should look like they are drifting, not swarming.
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 0.9 + Math.random() * 1.5,
        accent: i % accentEvery === 0,
      }))

      return true
    }

    function render() {
      ctx!.clearRect(0, 0, width, height)

      for (const p of points) {
        p.x += p.vx
        p.y += p.vy
        // Wrapped rather than bounced. A point that turns around at an invisible
        // wall draws the wall; one that reappears on the far side implies the
        // field carries on past the edge of the section.
        if (p.x < -20) p.x = width + 20
        if (p.x > width + 20) p.x = -20
        if (p.y < -20) p.y = height + 20
        if (p.y > height + 20) p.y = -20
      }

      // Lines first, so the points sit on top of their own connections.
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i]!

        for (let j = i + 1; j < points.length; j += 1) {
          const b = points[j]!
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist > linkDistance) continue

          // Fades with distance, so links form and dissolve rather than
          // snapping in and out at the threshold.
          const strength = 1 - dist / linkDistance
          const near =
            Math.hypot((a.x + b.x) / 2 - pointerX, (a.y + b.y) / 2 - pointerY) < 150

          ctx!.strokeStyle = near
            ? `rgba(200, 16, 46, ${strength * 0.5})`
            : `rgba(255, 255, 255, ${strength * 0.16})`
          ctx!.lineWidth = near ? 1 : 0.7
          ctx!.beginPath()
          ctx!.moveTo(a.x, a.y)
          ctx!.lineTo(b.x, b.y)
          ctx!.stroke()
        }
      }

      for (const p of points) {
        const near = Math.hypot(p.x - pointerX, p.y - pointerY) < 150
        ctx!.fillStyle = p.accent
          ? `rgba(200, 16, 46, ${near ? 0.95 : 0.7})`
          : `rgba(255, 255, 255, ${near ? 0.75 : 0.34})`
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fill()
      }
    }

    function loop() {
      frame = 0
      if (!visible) return
      render()
      frame = requestAnimationFrame(loop)
    }

    function start() {
      if (!frame && visible && !still) frame = requestAnimationFrame(loop)
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    }

    if (!build()) return

    // Under reduced motion the field is drawn once and left alone. A single
    // still frame is a picture; a blank rectangle would be a missing section.
    render()
    if (still) return

    /*
     * Only while it is on screen.
     *
     * This sits at the bottom of a long page, so for most of a visit it is
     * nowhere near the viewport -- and an animation loop running against a
     * section nobody can see is pure battery.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? false
        if (visible) start()
        else stop()
      },
      { threshold: 0.01 },
    )
    observer.observe(el)

    function onPointerMove(event: PointerEvent) {
      const box = el!.getBoundingClientRect()
      pointerX = event.clientX - box.left
      pointerY = event.clientY - box.top
    }

    function onPointerLeave() {
      pointerX = -9999
      pointerY = -9999
    }

    function onResize() {
      if (build()) render()
    }

    el.addEventListener('pointermove', onPointerMove, { passive: true })
    el.addEventListener('pointerleave', onPointerLeave, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })

    onBeforeUnmount(() => {
      stop()
      observer.disconnect()
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', onResize)
    })
  })
}
