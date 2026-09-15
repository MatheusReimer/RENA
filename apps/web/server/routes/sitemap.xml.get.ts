import { schema } from '@revy/db'
import { desc, eq, isNotNull } from 'drizzle-orm'
import { useDatabase } from '../utils/db'

/**
 * The sitemap (SPEC 22, 42).
 *
 * Without one, a crawler has to discover the catalogue by following links from
 * the landing page, which reaches whatever the rails happen to show that day
 * and nothing else. The catalogue is the reason this product has any organic
 * search value at all, so telling Google it exists is the single highest-value
 * SEO thing here.
 *
 * Lists exactly what `useIndexPolicy` marks indexable, and nothing it does
 * not. A sitemap that advertises a page carrying `noindex` is not harmful, but
 * it is a contradiction a crawler reports back to you as a warning, and one
 * more thing to keep in step.
 *
 * Capped rather than complete. A sitemap has a 50,000-URL / 50MB ceiling per
 * file and the catalogue will pass that; the cap keeps this correct today and
 * the fix later is a sitemap index, not a bigger number.
 */

/** Per section, well inside the protocol's per-file ceiling. */
const LIMIT = 5_000

type Entry = { loc: string; lastmod?: string; priority: string }

/**
 * The paths, cached; the origin is deliberately not part of this.
 *
 * This was a `defineCachedEventHandler` wrapping the whole response, which
 * looked equivalent and was not: **Nitro gives a cached handler an event with
 * no request headers at all**. Not just a stale value -- an empty set. So
 * `getRequestURL(event)` inside one falls back to `http://localhost` with no
 * port, and reading the `Host` header directly returns undefined. Every `<loc>`
 * in development pointed at a port nothing listens on.
 *
 * Caching the rows instead of the document fixes it at the root: the origin is
 * resolved out in the route handler, which has a real request, and what goes
 * in the cache is host-independent -- so one entry can serve every hostname
 * with no chance of staging publishing production URLs.
 *
 * `lastmod` is formatted here, not at render time, because the cache is JSON:
 * a `Date` written on a miss comes back as a string on a hit, and a
 * `.toISOString()` at the far end would throw on the second request only.
 */
const cachedEntries = defineCachedFunction(
  async (): Promise<Entry[]> => {
    const db = useDatabase()

    const [media, users, lists] = await Promise.all([
      db
        .select({ id: schema.media.id, updatedAt: schema.media.updatedAt })
        .from(schema.media)
        // Artwork is what makes a media page worth a result; a bare row with
        // no cover is a thin page we would rather not have indexed.
        .where(isNotNull(schema.media.coverImageUrl))
        .orderBy(desc(schema.media.updatedAt))
        .limit(LIMIT),
      db
        .select({ username: schema.users.username, updatedAt: schema.users.updatedAt })
        .from(schema.users)
        .orderBy(desc(schema.users.updatedAt))
        .limit(LIMIT),
      /*
       * Public lists only.
       *
       * The `friends` tier is not indexable -- a crawler is signed out and has
       * no friends -- and advertising one would point Google at a page that
       * renders an error for it. Matches the opt-in on the page itself, which
       * only marks `public` lists indexable.
       */
      db
        .select({ id: schema.lists.id, updatedAt: schema.lists.updatedAt })
        .from(schema.lists)
        .where(eq(schema.lists.visibility, 'public'))
        .orderBy(desc(schema.lists.updatedAt))
        .limit(LIMIT),
    ])

    const day = (value: Date) => new Date(value).toISOString().slice(0, 10)

    return [
      { loc: '/', priority: '1.0' },
      { loc: '/discover', priority: '0.8' },
      { loc: '/community', priority: '0.7' },
      ...media.map((row) => ({
        loc: `/media/${row.id}`,
        lastmod: day(row.updatedAt),
        priority: '0.6',
      })),
      ...users.map((row) => ({
        loc: `/u/${encodeURIComponent(row.username)}`,
        lastmod: day(row.updatedAt),
        priority: '0.5',
      })),
      ...lists.map((row) => ({
        loc: `/lists/${row.id}`,
        lastmod: day(row.updatedAt),
        priority: '0.4',
      })),
    ]
  },
  {
    /*
     * An hour.
     *
     * A new title should be crawlable the same day, and no crawler checks more
     * often than that. The alternative -- no cache -- means a badly behaved bot
     * can make this a full table scan per request, which is the most expensive
     * thing on the site.
     */
    maxAge: 60 * 60,
    name: 'sitemap',
    getKey: () => 'entries',
  },
)

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  /*
   * `appUrl` first, then the request's own origin.
   *
   * The configured value is the only correct answer behind a proxy, where the
   * request's host is the proxy's, and in the Capacitor build. `getRequestURL`
   * with `xForwardedHost` covers development and a plain deployment; it works
   * here, unlike inside a cached handler, because this event has its headers.
   */
  const origin = (
    (config.public.appUrl as string) || getRequestURL(event, { xForwardedHost: true }).origin
  ).replace(/\/$/, '')

  const urls = (await cachedEntries())
    .map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''
      return `  <url>\n    <loc>${origin}${entry.loc}</loc>${lastmod}\n    <priority>${entry.priority}</priority>\n  </url>`
    })
    .join('\n')

  setResponseHeader(event, 'content-type', 'application/xml; charset=utf-8')
  // Mirrors the data cache, so a crawler hitting this repeatedly is served by
  // its own CDN rather than by us.
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
})
