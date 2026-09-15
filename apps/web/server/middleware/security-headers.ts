/**
 * Security response headers (SPEC 39, OWASP A05).
 *
 * The application sent none of these. Each one below closes a specific class
 * of attack that no amount of correct application code prevents, because the
 * decision is the browser's and it needs to be told.
 *
 * Deliberately hand-written rather than pulling in `nuxt-security`: that
 * module brings a large surface and a lot of configuration for a set of
 * headers that is eight lines and needs to be read and understood rather than
 * trusted.
 *
 * **Maintaining the allowlists:** derive them from a rendered page, never from
 * grepping the source. This policy shipped broken twice for that reason -- the
 * book covers, which come from a host reached by two redirects, and then all
 * three typefaces, which are requested from `nuxt.config` rather than from any
 * provider module. Both failed silently. The check that works is:
 *
 *   curl -s http://localhost:3000/ | grep -oE 'https://[a-zA-Z0-9.-]+' | sort -u
 *
 * run across a few different screens, with the redirects followed.
 */

/**
 * Where images may come from.
 *
 * Every provider CDN in use, enumerated rather than wildcarded -- the point of
 * the directive is that an injected `<img src>` cannot reach an attacker's
 * host, and `https:` would give that away for nothing. `data:` is needed for
 * the cursors and inline SVGs; `blob:` for anything the client generates.
 *
 * **CSP applies to every hop of a redirect, not just the URL we wrote.** This
 * list was first built by grepping the provider code for hostnames, which is
 * how the book covers broke: Open Library serves `covers.openlibrary.org` as a
 * 302 to `archive.org`, which 302s again to a numbered `ia######.us.archive.org`
 * -- a host that appears nowhere in this codebase and changes between requests
 * (`ia600505` and `ia800505` answered the same URL minutes apart). The visible
 * symptom was half the book covers rendering and half showing alt text, from
 * one host that was allowlisted.
 *
 * So the rule for adding to this list is to follow the redirects and allow
 * where the bytes actually come from, not where we asked for them.
 */
const IMAGE_HOSTS = [
  "'self'",
  'data:',
  'blob:',
  'https://image.tmdb.org',
  'https://covers.openlibrary.org',
  // Where Open Library's covers actually live, via two redirects. The
  // wildcard is required: the `ia######` prefix is a rotating storage node.
  'https://archive.org',
  'https://*.us.archive.org',
  'https://images.igdb.com',
  'https://media.rawg.io',
  'https://cdn.akamai.steamstatic.com',
  'https://shared.akamai.steamstatic.com',
].join(' ')

/**
 * The policy.
 *
 * `script-src` carries `'unsafe-inline'`, and pretending otherwise would be
 * worse than admitting it: Nuxt inlines the hydration payload, so a strict
 * policy needs per-request nonces threaded through the renderer. What this
 * still buys is real -- an injected `<script src="//attacker">` is refused
 * even though an injected inline script would run -- and the inline case is
 * already covered by Vue escaping every interpolation (there is no `v-html`
 * anywhere in this app, checked).
 *
 * The directives that cost nothing and block the most are the last four:
 *
 *  - `frame-ancestors 'none'` is clickjacking, and it is the modern spelling
 *    of `X-Frame-Options` (both are sent; old browsers read only the header).
 *  - `base-uri 'self'` stops an injected `<base>` re-pointing every relative
 *    URL on the page at somebody else's server.
 *  - `form-action 'self'` stops an injected form posting credentials offsite.
 *  - `object-src 'none'` retires Flash-era plugin embedding entirely.
 */
const CSP = [
  "default-src 'self'",
  `img-src ${IMAGE_HOSTS}`,
  "script-src 'self' 'unsafe-inline'",
  /*
   * Vue injects component styles as inline `<style>` blocks, and the three
   * typefaces come from Google Fonts -- the stylesheet from `googleapis`, the
   * font files themselves from `gstatic`. Two hosts, two directives, and
   * missing either one silently drops the whole typographic design to system
   * fallbacks without erroring anywhere a person would look.
   */
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Same-origin only: every external provider is called from the server, never
  // from the browser, so the page has no legitimate reason to reach outwards.
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export default defineEventHandler((event) => {
  const headers = event.node.res

  headers.setHeader('Content-Security-Policy', CSP)

  /*
   * Stops the browser guessing a content type against the one we declared --
   * the mechanism that turns an uploaded "image" into executable script.
   */
  headers.setHeader('X-Content-Type-Options', 'nosniff')

  /** Clickjacking, for browsers predating `frame-ancestors`. */
  headers.setHeader('X-Frame-Options', 'DENY')

  /*
   * Send the full URL to ourselves and only the origin to anyone else.
   *
   * The default leaks whole paths in the `Referer` of every outbound link, and
   * this app's paths name people: `/u/<username>`, `/messages/<id>`.
   */
  headers.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

  /** Hardware this app never uses; denying it costs nothing. */
  headers.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  )

  /*
   * HSTS.
   *
   * Browsers ignore this over plain HTTP, so sending it unconditionally is
   * safe in development. No `preload`, and no `includeSubDomains`: both are
   * effectively irreversible for the registrable domain, and that is a
   * deployment decision rather than one to make from application code.
   */
  headers.setHeader('Strict-Transport-Security', 'max-age=31536000')

  /** Says which framework and version to target. Nothing needs it. */
  headers.removeHeader('X-Powered-By')
})
