import type { Ref } from 'vue'

/**
 * Calls back when a sentinel element scrolls into view.
 *
 * For lists that are cheap to fetch and expensive to render. Search's browse
 * grid holds over a hundred posters, and putting all of them in the document
 * on load means decoding a hundred images for a reader who will see twelve --
 * every one of them competing with the search field for the network.
 *
 * `rootMargin` fires it a screenful early, so the next batch is already in
 * place by the time the reader reaches where it goes. Done properly there is
 * no spinner and no jump; it should feel like the page was always that long.
 *
 * The element is watched rather than read once: the sentinel sits at the end
 * of a list that is itself conditional, so it mounts and unmounts as the
 * screen changes state, and an observer bound to whatever was there on mount
 * would be pointed at a detached node for the rest of the session.
 *
 * This is an *enhancement*, never the only way forward. Every caller must also
 * render a control that advances the list on click, and must render it
 * unconditionally -- not behind a check for whether the observer seems to be
 * working. The first version of this returned exactly such a flag, set on the
 * first callback, and a browser that delivered one entry and then went quiet
 * satisfied it: the button withdrew itself and the remaining hundred titles
 * became unreachable with nothing on screen admitting it. A silent mechanism
 * cannot be trusted to report its own silence.
 */
export function useInfiniteScroll(
  target: Ref<HTMLElement | null>,
  onReach: () => void,
): void {
  let observer: IntersectionObserver | null = null

  function disconnect() {
    observer?.disconnect()
    observer = null
  }

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') return

    watch(
      target,
      (el) => {
        disconnect()
        if (!el) return

        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) onReach()
          },
          { rootMargin: '100% 0px' },
        )
        observer.observe(el)
      },
      { immediate: true },
    )
  })

  onBeforeUnmount(disconnect)
}
