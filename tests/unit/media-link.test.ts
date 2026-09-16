import { describe, expect, it } from 'vitest'
import { shouldOpenMediaSheet, type LinkClick } from '@revy/shared/utils'

/**
 * When a tap on a media card becomes a sheet instead of a navigation.
 *
 * Almost everything here is invisible to manual testing: nobody cmd-clicks a
 * poster while checking that a bottom sheet opens. The interesting cases are
 * the ones where the answer must be "no" despite being on a phone.
 */

const plain: LinkClick = {
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
}

describe('shouldOpenMediaSheet', () => {
  it('opens the sheet for an ordinary tap on a narrow screen', () => {
    expect(shouldOpenMediaSheet(plain, true)).toBe(true)
  })

  it('lets the link navigate on a wide screen', () => {
    // The media page is the better destination where there is room for it.
    expect(shouldOpenMediaSheet(plain, false)).toBe(false)
  })

  describe('never takes a click the browser was meant to have', () => {
    it('leaves cmd- and ctrl-click to open a new tab', () => {
      expect(shouldOpenMediaSheet({ ...plain, metaKey: true }, true)).toBe(false)
      expect(shouldOpenMediaSheet({ ...plain, ctrlKey: true }, true)).toBe(false)
    })

    it('leaves shift-click to open a new window', () => {
      expect(shouldOpenMediaSheet({ ...plain, shiftKey: true }, true)).toBe(false)
    })

    it('leaves alt-click to download', () => {
      expect(shouldOpenMediaSheet({ ...plain, altKey: true }, true)).toBe(false)
    })

    it('leaves middle- and right-click alone', () => {
      // Middle-click is "new tab" on every desktop browser; the context menu
      // is not ours to pre-empt.
      expect(shouldOpenMediaSheet({ ...plain, button: 1 }, true)).toBe(false)
      expect(shouldOpenMediaSheet({ ...plain, button: 2 }, true)).toBe(false)
    })
  })

  it('does not act on a click something else already handled', () => {
    // A card nested inside another control: whoever called preventDefault
    // first has already decided what this click meant.
    expect(shouldOpenMediaSheet({ ...plain, defaultPrevented: true }, true)).toBe(false)
  })
})
