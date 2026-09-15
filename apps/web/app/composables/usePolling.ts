/**
 * Repeats a request on an interval, politely (SPEC 12).
 *
 * The product has no realtime transport and SPEC 49.7 says not to build one
 * yet, so "new messages appear" is a poll. What makes a poll acceptable rather
 * than wasteful is entirely in the details this composable exists to hold in
 * one place:
 *
 *  - **It stops when nobody is looking.** A hidden tab polls nothing. Without
 *    this, every tab anyone ever left open keeps asking forever, and the cost
 *    of the feature scales with abandoned tabs rather than with use.
 *  - **It never overlaps itself.** The next tick is scheduled after the
 *    previous one resolves, not on a fixed `setInterval`. On a slow connection
 *    a fixed interval stacks requests until the slowest one wins and messages
 *    arrive out of order.
 *  - **It backs off when the server is unhappy.** A failing endpoint polled at
 *    full rate is a client-side denial of service against your own API.
 *  - **It catches up on return.** Coming back to a hidden tab polls once
 *    immediately rather than waiting out the interval, which is what makes
 *    switching back to the tab feel instant.
 */
export interface PollingOptions {
  /** Milliseconds between the end of one run and the start of the next. */
  interval: number
  /** Start polling straight away. False leaves it to a manual `start()`. */
  immediate?: boolean
}

export interface PollingHandle {
  start: () => void
  stop: () => void
  /** Runs once now, outside the schedule. Used after sending a message. */
  poll: () => Promise<void>
  /** True while a run is in flight. */
  active: Readonly<Ref<boolean>>
}

/** Longest the backoff will stretch a failing poll to. */
const MAX_BACKOFF_MS = 60_000

export function usePolling(
  task: () => Promise<void>,
  options: PollingOptions,
): PollingHandle {
  const active = ref(false)
  const running = ref(false)

  let timer: ReturnType<typeof setTimeout> | null = null
  let failures = 0
  let disposed = false

  function clear() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  /**
   * Exponential backoff on consecutive failures, capped.
   *
   * Reset to the base interval by the first success, so a blip costs a few
   * slow ticks rather than degrading the thread until it is reopened.
   */
  function nextDelay(): number {
    if (failures === 0) return options.interval
    return Math.min(options.interval * 2 ** failures, MAX_BACKOFF_MS)
  }

  function schedule() {
    clear()
    if (!running.value || disposed) return
    timer = setTimeout(() => void run(), nextDelay())
  }

  async function run(): Promise<void> {
    // Overlap guard. Also covers the manual `poll()` landing on top of a tick.
    if (active.value || disposed) return

    active.value = true
    try {
      await task()
      failures = 0
    } catch {
      // Swallowed on purpose: a failed poll is not an error the screen should
      // show. The thread still has whatever it last loaded, and the backoff
      // above is the response. A hard failure surfaces through the initial
      // fetch, which is not this.
      failures += 1
    } finally {
      active.value = false
      schedule()
    }
  }

  function start() {
    /*
     * Never on the server.
     *
     * Page components call this from `onMounted`, which cannot run during SSR
     * -- but the app shell starts its badge poll from a watcher in setup,
     * which does. Without this guard that scheduled a `setTimeout` inside the
     * render, to fire a minute later with no request context around it and no
     * unmount hook to clear it. Guarding the composable rather than each call
     * site means the next one cannot reintroduce it.
     */
    if (import.meta.server) return
    if (running.value || disposed) return
    running.value = true
    if (options.immediate !== false) void run()
    else schedule()
  }

  function stop() {
    running.value = false
    clear()
  }

  /*
   * Visibility, on the client only.
   *
   * `document` does not exist during SSR, and this composable is called from
   * page setup -- which runs on the server too.
   */
  onMounted(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        // Catch up immediately rather than waiting out the interval, which is
        // what makes returning to the tab feel like the messages were already
        // there.
        failures = 0
        if (running.value) void run()
      } else {
        clear()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
  })

  onBeforeUnmount(() => {
    disposed = true
    stop()
  })

  return { start, stop, poll: run, active: readonly(active) }
}
