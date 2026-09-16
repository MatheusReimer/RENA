<script setup lang="ts">
import { shouldOpenMediaSheet } from '@revy/shared/utils'
/**
 * A link to a title that opens the quick-rate sheet instead, on a phone.
 *
 * Every media card in the product goes through this. It is a real `NuxtLink`
 * with a real `href`, and that is not incidental: middle-click, "open in new
 * tab", a shared URL and a crawler all have to keep working, and a `<button>`
 * that navigates by script breaks every one of them. The divert happens in the
 * click handler and only there.
 *
 * Deciding the width at click time rather than during setup is what keeps this
 * safe to render on the server. `matchMedia` does not exist while rendering,
 * and a component that guessed would either hydrate into the wrong behaviour
 * or need a flash of the right one.
 */
const props = defineProps<{
  mediaId: string
  /**
   * What the card already knows, so the sheet has a title and a cover in the
   * same frame it opens rather than a moment later.
   */
  title?: string
  coverImageUrl?: string | null
  /** Extra query for the underlying route, e.g. landing on a specific tab. */
  query?: Record<string, string>
}>()

const sheet = useMediaSheetStore()

/**
 * The same breakpoint the shell swaps its navigation at.
 *
 * "Mobile" has to mean one thing in this codebase, and it already means "below
 * 64rem" -- that is where the sidebar becomes a tab bar. A second, different
 * answer here would be a phone that gets the sheet but not the tab bar, or the
 * reverse, at some width nobody tested.
 */
function isCompact(): boolean {
  return !window.matchMedia('(min-width: 64rem)').matches
}

function onClick(event: MouseEvent) {
  // The rule itself lives in `@revy/shared` -- see `shouldOpenMediaSheet` for
  // why a four-line condition is worth a tested function.
  if (!shouldOpenMediaSheet(event, isCompact())) return

  event.preventDefault()
  sheet.open(props.mediaId, {
    title: props.title ?? '',
    coverImageUrl: props.coverImageUrl ?? null,
  })
}
</script>

<template>
  <!--
    `.capture`, and that modifier is the whole trick.

    `NuxtLink` binds its own click handler inside the component; ours arrives
    as a fallthrough listener on the same anchor and therefore runs *after* it.
    By then the router has already navigated and `preventDefault` is a no-op --
    which is exactly what this did on the first attempt: the sheet was mounted,
    the handler was correct, and every tap still went to the media page.

    Capturing runs ours on the way down instead, so the default is prevented
    before the router's handler ever sees the event and its own `guardEvent`
    check declines to navigate.
  -->
  <NuxtLink :to="{ path: `/media/${mediaId}`, query }" @click.capture="onClick">
    <slot />
  </NuxtLink>
</template>
