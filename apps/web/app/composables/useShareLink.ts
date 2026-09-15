/**
 * Shares a link, by whatever route the device actually offers.
 *
 * Three tiers, and the order matters more than it looks:
 *
 *  1. **The native share sheet**, where it exists. On a phone this is what
 *     people expect -- it reaches WhatsApp, Instagram and Messages, which is
 *     where a profile link is actually going. Desktop Chrome does not have it.
 *  2. **The clipboard**, which covers desktop.
 *  3. **Neither**, and the caller is told so rather than left showing a
 *     success state. `navigator.clipboard` is unavailable outside a secure
 *     context and can be refused by permissions policy, so "it worked" is not
 *     something to assume.
 *
 * The share sheet can also be *dismissed*, which rejects with an AbortError.
 * That is the reader changing their mind, not a failure, and reporting it as
 * one would put an error on screen for somebody who simply tapped away.
 */
export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed'

export function useShareLink() {
  const config = useRuntimeConfig()

  /*
   * The origin, resolved once here rather than inside `absolute`.
   *
   * `useRequestURL` is a Nuxt composable and has to be called while the setup
   * context is active. `absolute` is handed to `useSeoMeta` as a lazy getter,
   * which runs later during render -- calling it in there threw and 500'd the
   * whole page. Capturing the value at composable time is what makes it safe
   * to call `absolute` from anywhere afterwards.
   *
   * `appUrl` wins when set, because it is the only correct value inside the
   * Capacitor build: there the page's own origin is `capacitor://localhost`
   * and a link to it reaches nothing. Otherwise the request's own origin,
   * which is right both on the server and in the browser.
   */
  const origin = ((config.public.appUrl as string) || useRequestURL().origin).replace(/\/$/, '')

  /**
   * Turns a path into the URL somebody can paste anywhere.
   *
   * Absolute, always. Open Graph tags are read from the server-rendered HTML
   * by crawlers that never run our JavaScript, and a relative `og:url` is
   * simply a broken card.
   */
  function absolute(path: string): string {
    return `${origin}${path}`
  }

  async function share(options: {
    path: string
    title?: string
    text?: string
  }): Promise<ShareOutcome> {
    const url = absolute(options.path)

    if (import.meta.client && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          url,
          ...(options.title ? { title: options.title } : {}),
          ...(options.text ? { text: options.text } : {}),
        })
        return 'shared'
      } catch (error) {
        // Tapped away. Not an error, and must not fall through to the
        // clipboard -- silently copying something they declined to share is
        // its own small surprise.
        if (error instanceof Error && error.name === 'AbortError') return 'dismissed'
        // Anything else: the sheet is unavailable for this content. Fall
        // through and try the clipboard rather than giving up.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      return 'copied'
    } catch {
      return 'failed'
    }
  }

  return { share, absolute }
}
