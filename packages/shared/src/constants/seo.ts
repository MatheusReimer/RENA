/**
 * Which routes search engines may index (SPEC 22, 42).
 *
 * Shared, because this rule has to be stated twice and the two statements have
 * to agree:
 *
 *  - `useIndexPolicy` turns it into a `robots` meta tag, which is what a
 *    crawler actually obeys when deciding whether a page may appear in a
 *    result.
 *  - `robots.txt` turns it into crawl directives, which stop a crawler
 *    fetching the page at all.
 *
 * Both are needed -- `Disallow` alone does not remove a page from an index if
 * someone links to it, and `noindex` alone means the page still gets fetched.
 * Keeping the paths in one module is what stops a route added to one list and
 * forgotten in the other, which is a silent failure: nothing on screen tells
 * you Google has indexed your messages screen.
 */

/** Signed-in screens. A crawler only ever sees the sign-in wall. */
export const SEO_PRIVATE_PATHS = [
  '/friends',
  '/messages',
  '/activity',
  '/lists',
  '/onboarding',
] as const

/** Credential flows. A reset URL carries a token; it must never be indexed. */
export const SEO_AUTH_PATHS = [
  '/signin',
  '/signup',
  '/forgot-password',
  '/reset-password',
] as const

/** Crawlable, but not worth its own result: infinite URLs, no unique content. */
export const SEO_THIN_PATHS = ['/search'] as const

/**
 * Exceptions carved out of the paths above, for a public child of a private
 * parent.
 *
 * `/lists` is the owner's own shelf and private; `/lists/<id>` is a list
 * somebody shared, which is the one piece of member-made content worth
 * indexing. Expressed as the parent prefix so `robots.txt` can allow the
 * children of exactly these.
 */
export const SEO_PUBLIC_CHILDREN = ['/lists'] as const
