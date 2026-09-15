/**
 * Which pages search engines are allowed to index (SPEC 22, 42).
 *
 * One rule in one place, applied above the layout, rather than a `robots` meta
 * remembered on each of nineteen pages. The version that lived per-page is the
 * version where the twentieth page is added without one -- and the failure is
 * silent, because nothing on screen tells you Google has indexed your
 * messages screen.
 *
 * Three categories, and only the first is the obvious one:
 *
 *  - **Private.** Signed-in-only screens. A crawler reaches these signed out,
 *    so what it can actually see is "Sign in to see your messages" -- not a
 *    data leak, but a set of identical, worthless pages under your domain.
 *  - **Auth.** Sign-in, sign-up, password reset. Nobody should arrive at these
 *    from a search result, and a password-reset URL carries a token.
 *  - **Thin.** Search results. Classic duplicate content: infinite URLs, no
 *    unique value. Still `follow`, so links out of them keep their weight.
 *
 * Everything not listed is public and indexable, which is the right default
 * for a catalogue -- the media and profile pages are the reason to have SEO at
 * all.
 */

import {
  SEO_AUTH_PATHS,
  SEO_PRIVATE_PATHS,
  SEO_THIN_PATHS,
} from '@revy/shared/constants'

function startsWithAny(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export type IndexPolicy = 'index' | 'noindex' | 'noindex-follow'

export function indexPolicyFor(path: string): IndexPolicy {
  if (startsWithAny(path, SEO_AUTH_PATHS) || startsWithAny(path, SEO_PRIVATE_PATHS))
    return 'noindex'
  if (startsWithAny(path, SEO_THIN_PATHS)) return 'noindex-follow'
  return 'index'
}

/**
 * Applies the policy for the current route.
 *
 * Called once from `app.vue`, so it covers every page including ones added
 * later. The meta is reactive on the path because client-side navigation does
 * not re-run setup -- without that, the tag from the first page visited would
 * stick for the rest of the session.
 */
export function useIndexPolicy() {
  const route = useRoute()
  const override = useIndexOverride()

  const robots = computed(() => {
    const declared = override.value?.path === route.path ? override.value.policy : null

    switch (declared ?? indexPolicyFor(route.path)) {
      case 'noindex':
        return 'noindex, nofollow'
      case 'noindex-follow':
        return 'noindex, follow'
      default:
        return 'index, follow'
    }
  })

  useHead(() => ({ meta: [{ name: 'robots', content: robots.value }] }))

  return { robots }
}

/*
 * The escape hatch, for pages whose indexability depends on what loaded.
 *
 * `/lists/<id>` is the case that forced it. A public list is real, linkable,
 * long-tail content and should be indexed; a private one must never be. The
 * crawler is signed out, so it sees only public lists -- but the page answers
 * **200** for a list it cannot see, not 404, so a blanket `index` on the
 * pattern would hand Google an unbounded set of OK-but-empty pages.
 *
 * So the default stays `noindex` and a page opts *in*. The fail-safe direction
 * is the silent one: forget to call this and a public list goes unindexed,
 * which costs traffic. The alternative default loses control of a private list,
 * which is not recoverable.
 *
 * Scoped to the path it was set for rather than reset on navigation. A reset
 * would race with the next page's setup -- both run on a path change, in an
 * order this does not want to depend on -- and the failure mode of losing that
 * race is one page inheriting the previous page's policy.
 */
type Override = { path: string; policy: IndexPolicy }

function useIndexOverride() {
  return useState<Override | null>('index-policy-override', () => null)
}

/** Declares this route's policy, overriding the path-based default. */
export function setIndexPolicy(policy: IndexPolicy) {
  const route = useRoute()
  useIndexOverride().value = { path: route.path, policy }
}
