import { defineStore } from 'pinia'

/**
 * Which title the quick-rate sheet is showing, if any (SPEC 10).
 *
 * A store rather than state on a page, because the thing that opens it is a
 * poster in a rail inside a card inside whichever screen the reader happens to
 * be on -- twelve components, none of which should own a dialog. The sheet is
 * mounted once by the shell and listens here.
 *
 * Holds an id, not a payload. The cards that raise it carry a title and a
 * cover and nothing else -- no description, no community score, and no record
 * of what the viewer already gave it -- so the sheet fetches what it needs when
 * it opens. One request per tap, and only when tapped: the alternative is
 * putting a description on every item of every listing in the product to serve
 * the few that get opened.
 */
export const useMediaSheetStore = defineStore('mediaSheet', () => {
  const mediaId = ref<string | null>(null)

  /**
   * What the card already knew, shown while the fetch is in flight.
   *
   * Without it the sheet opens empty and fills in a moment later, which reads
   * as a slow dialog. With it the title and cover are on screen in the same
   * frame as the sheet, and only the description and the score arrive late.
   */
  const seed = ref<{ title: string; coverImageUrl: string | null } | null>(null)

  function open(id: string, hint?: { title: string; coverImageUrl: string | null }): void {
    mediaId.value = id
    seed.value = hint ?? null
  }

  function close(): void {
    mediaId.value = null
    seed.value = null
  }

  return { mediaId, seed, open, close }
})
