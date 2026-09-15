/**
 * Depth parallax: a still photograph that turns under the cursor.
 *
 * A greyscale depth map (white near, black far) displaces the photograph's
 * pixels as the pointer moves, so the desk edge travels further than the
 * window behind it. The result reads as a camera tilting inside the scene
 * rather than as a picture sliding about.
 *
 * Written against raw WebGL on purpose. Three.js is the usual answer to
 * "make this 3D" and it is 150KB of scene graph, cameras, materials and
 * loaders to do what a single quad and eleven lines of GLSL do here -- there
 * is no scene, no camera and no geometry in this effect, only one texture
 * lookup offset by another.
 *
 * Progressive enhancement throughout. The caller renders an ordinary `<img>`
 * and this draws over the top of it; if WebGL is missing, the depth map fails
 * to load, the pointer is coarse or the viewer has asked for less motion,
 * nothing happens at all and the photograph stays exactly as it was. Nothing
 * here runs on the server.
 */

export interface DepthParallaxOptions {
  /** Greyscale depth map. White is near, black is far. */
  depthSrc: string
  /**
   * Peak displacement, in image-UV units. 0.01 is about ten pixels of travel
   * at the near plane on a 1600px-wide scene -- enough to read as depth,
   * small enough that nobody notices it as an effect.
   */
  strength?: number
  /** `object-position`, as fractions, so the crop matches the CSS exactly. */
  focus?: { x: number; y: number }
  /**
   * What the pointer is tracked against. Defaults to the canvas's parent.
   *
   * Worth passing explicitly, and the reason is a trap: the art layer is
   * usually a background sibling of the content, sat behind it with a
   * negative z-index. Anything painted over it -- a statement, a column, an
   * empty positioned container -- is what the cursor actually hits, so a
   * listener on the art layer alone hears almost nothing. Give it the common
   * ancestor and every pointer move inside the composition counts.
   */
  pointerTarget?: Ref<HTMLElement | null>
}

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

/*
 * `uWindow` carries the `object-fit: cover` crop -- origin in xy, size in zw --
 * so the canvas frames the photograph identically to the `<img>` underneath
 * and swapping between them is invisible.
 *
 * Depth is sampled at the undisplaced coordinate. Sampling it at the offset
 * one lets near pixels drag their own depth along with them, which smears
 * every edge in the image into a comet.
 */
const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uPointer;
uniform vec4 uWindow;
uniform float uStrength;

void main() {
  vec2 uv = uWindow.xy + vUv * uWindow.zw;
  float depth = texture2D(uDepth, uv).r;
  vec2 shift = uPointer * (depth - 0.5) * uStrength;
  gl_FragColor = texture2D(uImage, clamp(uv + shift, 0.001, 0.999));
}`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function upload(gl: WebGLRenderingContext, image: TexImageSource) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  /*
   * WebGL puts texture coordinate 0,0 at the bottom-left; every image format
   * on the web puts pixel 0,0 at the top-left. Without this the scene renders
   * upside down -- which, on a photograph of a room, is obvious enough that it
   * looked like the shader had failed rather than like an axis convention.
   *
   * Both textures go through here, so the depth map and the photograph can
   * never end up flipped relative to each other.
   */
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  // Clamped, so a displaced sample at the edge repeats the edge pixel rather
  // than wrapping round to the opposite side of the photograph.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
  return texture
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

export function useDepthParallax(
  canvas: Ref<HTMLCanvasElement | null>,
  source: Ref<HTMLImageElement | null>,
  options: DepthParallaxOptions,
) {
  /** Drives the caller's fade from `<img>` to canvas; false until it works. */
  const active = ref(false)

  const strength = options.strength ?? 0.01
  const focus = options.focus ?? { x: 0.5, y: 0.5 }

  /*
   * Teardown is registered synchronously, here, and filled in later.
   *
   * The setup below is async, and Vue only associates a lifecycle hook with a
   * component while its setup is on the stack -- so an `onBeforeUnmount` call
   * placed after an `await` silently attaches to nothing and the listeners
   * outlive the component. Registering the hook now and letting the async
   * work assign into `teardown` keeps the two facts in the same place without
   * depending on when they happen.
   */
  let teardown: (() => void) | null = null
  onBeforeUnmount(() => teardown?.())

  onMounted(async () => {
    /*
     * Mouse only, and only for people who want motion.
     *
     * On a touch device there is no hovering pointer to drive this, and
     * `pointermove` fires during a scroll -- so the whole scene would lurch
     * sideways every time somebody swiped the page.
     */
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const el = canvas.value
    const img = source.value
    if (!el || !img) return

    const gl =
      el.getContext('webgl', { alpha: false, antialias: false, depth: false }) ??
      (el.getContext('experimental-webgl') as WebGLRenderingContext | null)
    if (!gl) return

    let depthImage: HTMLImageElement
    try {
      const [depth] = await Promise.all([
        load(options.depthSrc),
        // The hero image is already in the document and usually decoded by
        // now; this covers the case where it is not.
        img.complete ? Promise.resolve() : load(img.currentSrc || img.src),
      ])
      depthImage = depth
    } catch {
      // No depth map, no effect. The photograph underneath is untouched.
      return
    }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vertex || !fragment || !program) return

    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    upload(gl, img)
    gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0)

    gl.activeTexture(gl.TEXTURE1)
    upload(gl, depthImage)
    gl.uniform1i(gl.getUniformLocation(program, 'uDepth'), 1)

    const uPointer = gl.getUniformLocation(program, 'uPointer')
    const uWindow = gl.getUniformLocation(program, 'uWindow')
    gl.uniform1f(gl.getUniformLocation(program, 'uStrength'), strength)

    /**
     * Reproduces `object-fit: cover` plus `object-position` as a UV window.
     *
     * The canvas has to frame the photograph exactly as the `<img>` beneath it
     * does, or the crossfade between them is a visible jump.
     */
    function frame() {
      const box = el!.getBoundingClientRect()
      if (!box.width || !box.height) return false

      // Capped: a hero on a 4K display does not need a 4K drawing buffer for
      // an effect measured in single pixels, and the fill rate is not free.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      el!.width = Math.round(box.width * dpr)
      el!.height = Math.round(box.height * dpr)
      gl!.viewport(0, 0, el!.width, el!.height)

      const boxAspect = box.width / box.height
      const imageAspect = img!.naturalWidth / img!.naturalHeight

      let w = 1
      let h = 1
      if (imageAspect > boxAspect) w = boxAspect / imageAspect
      else h = imageAspect / boxAspect

      /*
       * The vertical origin is inverted relative to CSS.
       *
       * `object-position` measures from the top of the image; the flipped
       * texture has v increasing upward from the bottom. So the vertical
       * offset is taken from the far side -- get this wrong and the canvas
       * frames the scene a few per cent off from the `<img>` beneath it,
       * which shows up as a jump at the exact moment the two crossfade.
       */
      gl!.uniform4f(uWindow, (1 - w) * focus.x, (1 - h) * (1 - focus.y), w, h)
      return true
    }

    let pointerX = 0
    let pointerY = 0
    let currentX = 0
    let currentY = 0
    let raf = 0
    let running = true

    function draw() {
      if (!running) return
      // Eased towards the pointer rather than snapped to it. The lag is what
      // gives the scene weight; without it the image is welded to the cursor.
      currentX += (pointerX - currentX) * 0.075
      currentY += (pointerY - currentY) * 0.075
      gl!.uniform2f(uPointer, currentX, currentY)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)

      // Park the loop once it has settled. A hero that repaints sixty times a
      // second forever is a laptop fan and a flat battery, and this effect is
      // only ever interesting while the pointer is actually moving.
      if (Math.abs(pointerX - currentX) < 0.0005 && Math.abs(pointerY - currentY) < 0.0005) {
        raf = 0
        return
      }
      raf = requestAnimationFrame(draw)
    }

    function wake() {
      if (!raf && running) raf = requestAnimationFrame(draw)
    }

    function onPointerMove(event: PointerEvent) {
      const box = el!.getBoundingClientRect()
      if (!box.width || !box.height) return
      pointerX = (event.clientX - box.left) / box.width - 0.5
      pointerY = (event.clientY - box.top) / box.height - 0.5
      wake()
    }

    function onPointerLeave() {
      pointerX = 0
      pointerY = 0
      wake()
    }

    function onResize() {
      if (frame()) wake()
    }

    if (!frame()) return
    gl.uniform2f(uPointer, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    active.value = true

    const target = options.pointerTarget?.value ?? el.parentElement ?? el
    target.addEventListener('pointermove', onPointerMove, { passive: true })
    target.addEventListener('pointerleave', onPointerLeave, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })

    /*
     * A lost context is normal, not exceptional: the GPU is a shared resource
     * and the browser reclaims it when the tab is backgrounded for long
     * enough. Stopping cleanly and revealing the `<img>` again is the whole
     * recovery -- the page is identical either way.
     */
    el.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      running = false
      active.value = false
    })

    teardown = () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      target.removeEventListener('pointermove', onPointerMove)
      target.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', onResize)
    }
  })

  return { active }
}
