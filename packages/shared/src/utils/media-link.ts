/**
 * Whether a click on a media card should open the quick-rate sheet instead of
 * following the link (SPEC 10).
 *
 * A pure function rather than logic inside the click handler, because most of
 * what it decides is invisible to manual testing. Nobody cmd-clicks a poster
 * while checking that a sheet opens, so the day somebody simplifies this down
 * to "if mobile, prevent default", opening a title in a new tab quietly stops
 * working and no screenshot shows it.
 */

export interface LinkClick {
  /** Something upstream already handled it -- never take it twice. */
  defaultPrevented: boolean
  /** 0 is the primary button; the others belong to the browser. */
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * `compact` is the caller's answer to "is this a phone", measured at click
 * time. It is passed in rather than read here so this stays testable and so
 * the component keeps the one `matchMedia` call -- which cannot run during
 * server rendering and must therefore never happen during setup.
 */
export function shouldOpenMediaSheet(event: LinkClick, compact: boolean): boolean {
  // A modified click is an explicit instruction to the browser: open in a new
  // tab, a new window, download it. Diverting those would be taking a decision
  // the reader has already made.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false

  // Middle-click and right-click are the browser's, not ours.
  if (event.button !== 0) return false

  if (event.defaultPrevented) return false

  // On a wide screen the media page is the better destination: there is room
  // for the whole title, and no thumb aiming at a half-star under a poster.
  return compact
}
