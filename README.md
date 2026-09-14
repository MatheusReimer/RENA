# Revy (RENA)

A social network for rating, reviewing and discussing movies, series and books.

> Letterboxd + Goodreads + a social graph, with one identity across every kind of
> media. Full product scope is in [`docs/SPEC.md`](docs/SPEC.md).

---

## Getting started

You need **Node 22** and **pnpm 11**. Both are already installed if `node -v`
reports 22.x.

```bash
pnpm install
cp .env.example .env        # works as-is: defaults to the embedded database
pnpm db:import              # creates the schema, pulls ~1000 titles
pnpm db:seed                # adds ten people and their activity on top
pnpm dev                    # http://localhost:3000
```

**Import first.** The seed builds demo activity on real catalogue rows rather
than inventing its own, so it needs titles to exist. It no longer touches the
`media` table at all — re-seeding resets the people and their ratings and
leaves your catalogue alone. The import is additive and idempotent, upserting
on `(provider, external_id, media_type)`, so re-running refreshes rather than
duplicates.

That runs with **no database to install**. `DATABASE_URL` defaults to
`pglite://.data/revy`, which is Postgres compiled to WebAssembly running inside
the Node process — no Docker, no server, no account. Point `DATABASE_URL` at
Neon or any Postgres when you want a real one, and use `pnpm db:migrate`
instead of letting the seed apply migrations.

The embedded database is development only: PGlite holds a single connection
from a single process, so the dev server and `pnpm db:seed` cannot run at the
same time. Stop the dev server before either database command — force-killing
the process mid-write can corrupt the data directory, and the fix is
`rm -rf .data` followed by seed and import.

After seeding, sign in as `matheus@example.com` / `password123` (every seeded
account uses that password).

### Filling in `.env`

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | `pglite://.data/revy` for the embedded database (default, zero setup). For [Neon](https://console.neon.tech): create a project and copy the **pooled** URL (the host containing `-pooler`). |
| `AUTH_SECRET` | **yes** | Session signing key. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. |
| `TMDB_API_KEY` | no | Free key from [TMDB](https://www.themoviedb.org/settings/api), for movies and series. |
| `NUXT_PUBLIC_APP_URL` | no | Deployed origin. Leave blank locally. |
| `NUXT_PUBLIC_API_BASE` | no | Absolute API origin. Blank on web; **required** for the Capacitor build. |
| `RAWG_API_KEY` | no | Free key from [RAWG](https://rawg.io/apidocs), for games. Without it game search returns nothing. |

### Before going public

Rate limiting uses Nitro's in-memory store by default, which is exact on a
single server but per-instance on serverless. Repoint the `ratelimit` mount in
`nuxt.config.ts` at Redis or Vercel KV — no application code changes:

```ts
storage: { ratelimit: { driver: 'redis', url: process.env.REDIS_URL } }
```

---

## Commands

```bash
pnpm dev            # Nuxt dev server
pnpm build          # production build
pnpm test           # unit tests
pnpm typecheck      # every package
pnpm lint           # eslint

pnpm db:generate    # generate a migration from schema changes
pnpm db:migrate     # apply migrations
pnpm db:push        # push schema directly (dev only, skips migration history)
pnpm db:seed        # reset demo users and activity (leaves the catalogue)
pnpm db:import      # bulk-import the catalogue from the providers
                    #   --pages 30   to pull more per media type
pnpm db:verify      # check rating aggregates still match the ratings table
pnpm db:studio      # Drizzle Studio
```

---

## Where media comes from

Nothing is hardcoded — every title is fetched live from a catalogue through the
`MediaProvider` abstraction (§8), then persisted locally the first time someone
opens it. That local row is what ratings, reviews, lists and discussions point
at, so the app keeps working if a provider is down.

| Type | Provider | Key needed |
| --- | --- | --- |
| Movies, series | [TMDB](https://www.themoviedb.org) | `TMDB_API_KEY` |
| Books | [Open Library](https://openlibrary.org) | none |
| Games | [IGDB](https://igdb.com) → [RAWG](https://rawg.io) → [Steam](https://store.steampowered.com) | none (best with IGDB) |

Keys are optional and independent: a type without a configured provider simply
returns no search results instead of breaking the app. Books and games work
with no key at all.

Games try three catalogues in order of coverage, and always have one:

1. **IGDB** — every platform back to the 1970s, including console and retro.
   Authenticates through Twitch (`IGDB_CLIENT_ID` + `IGDB_CLIENT_SECRET`); the
   token exchange is handled for you.
2. **RAWG** — broad and console-aware, one key (`RAWG_API_KEY`).
3. **Steam** — keyless, so games always work, but PC storefront only: no
   Zelda, no Mario, no PlayStation exclusive.

Set IGDB if you want the whole history of games. Twitch credentials take about
two minutes: https://dev.twitch.tv/console/apps → Register Your Application →
redirect `http://localhost`, category "Application Integration" → copy the
Client ID, then Manage → New Secret.

TMDB issues two credentials and does not make the difference obvious. Either
works: the v3 "API Key" or the v4 "API Read Access Token" (a long JWT). The
provider detects which one it was given.

Per TMDB's terms, an app using their data must display an attribution notice.

## Architecture

The spec's §28 layout assumed a standalone `server/`, but Nitro requires
`server/` to live inside the Nuxt app. Rather than follow that literally, the
architectural principle it exists to protect — a backend that can be lifted out
later — is enforced by **`packages/core`**: all business logic lives there, with
zero Nuxt or Nitro imports. `apps/web/server/api/` holds nothing but thin
handlers.

```
apps/
  web/                    Nuxt 4 app + Nitro API + Capacitor shell
    app/                  pages, components, layouts, stores
    server/
      api/                thin HTTP handlers — validate, call a service, return
      utils/              auth, request context, error envelope

packages/
  shared/                 types, Zod schemas, constants  (web + mobile + server)
  db/                     Drizzle schema, migrations, client
  core/                   services, repositories, media providers  ← the domain
  seed/                   development fixtures
```

### The request path

```
HTTP handler          validate input with a shared Zod schema
   ↓
ServiceContext        { db, providers, viewerId }
   ↓
Service               business rules, authorization, transactions
   ↓
Repository            queries only — no rules, no side effects
   ↓
Drizzle → Postgres
```

A service takes its context as an argument rather than importing a singleton.
That is what makes the domain testable against a rolled-back transaction, and
what keeps `packages/core` free of framework imports.

### Decisions worth knowing about

**Ratings are stored as integers.** The scale is 0.5–5.0 in half steps, but the
column holds 1–10. Floats make `WHERE score = 4.5` unreliable and let `AVG()`
drift. `toScore` / `toHalfSteps` in `@revy/shared/utils` are the only places the
two representations meet, and a `CHECK` constraint enforces the range in the
database too.

**Rating aggregates are denormalised and transactional.** `media_rating_stats`
is updated inside the same transaction as the rating itself, so a media page
never recomputes `AVG()` over 128k rows, and the aggregate is exactly consistent
rather than eventually consistent.

**Duplicate friendships are impossible at the database level.** A unique index
on `LEAST(requester_id, receiver_id), GREATEST(...)` means a request in either
direction hits the same row. This is a constraint, not a read-then-write check
that would race.

**Media providers are behind one interface.** Nothing outside
`packages/core/src/providers/` knows TMDB or Open Library exist. Adding a
provider is one file plus a line in the registry; a provider outage degrades
search rather than failing it.

**Comment depth is derived, never accepted.** `createCommentSchema` has no
`depth` field at all. The server reads the parent's depth, adds one, and rejects
anything past the limit — a client-supplied depth would be a client-supplied way
past it. A reply is also checked to actually belong to the thread it claims,
so a crafted request cannot graft a comment from one discussion onto another.

**A hidden list reports 404, not 403.** Confirming that a private list exists
is itself a small leak, so an unauthorised read is indistinguishable from a
missing one (OWASP A01).

**An update schema never invents a value.** `updateListSchema` is written out
rather than derived from `createListSchema.partial()` — `.partial()` keeps
field defaults, so an empty PATCH body parsed to `{ visibility: 'private' }`
and quietly made public lists private.

**Highest Rated is a weighted average, not a raw one.** Each title's mean is
pulled toward the global mean in proportion to how few ratings it has
(a Bayesian average). Without it, one person rating something 5.0 outranks a
4.6 from ten thousand people — with the seed data, a raw average puts a title
with 3 ratings above one with 8. Still arithmetic, not a recommendation model,
which §21 rules out.

**Motion explains, it does not decorate.** The tokens in `tokens.css` name
four curves and four durations, and the rule is that movement should say
something: where a thing came from, that it responded, that more of it exists
offscreen. Entrances are slower than reactions — a reaction must feel instant,
an entrance has to be seen to be understood. The overshoot curve is used in
exactly one place, on the like button, because on everything it reads as
wobbly.

Reveal-on-scroll is a client-only directive (`v-reveal`), so the hidden state
is never server-rendered — otherwise a failed hydration would leave a
permanently invisible page. One shared IntersectionObserver serves the whole
app; Discover alone holds nearly three hundred cards.

**User content is never trusted as HTML.** It is stored raw and escaped at
render time — sanitising on input mangles legitimate text and gives false
confidence. `vue/no-v-html` is an error in the lint config.

**SSR forwards the session cookie.** Server-rendering calls our own API over
HTTP, and plain `$fetch` sends no cookies — so a signed-in user would render
signed-out and hydrate that way. `useApi` resolves `useRequestFetch` on the
server, which forwards the incoming request's headers.

**Rate limits key on the user where there is one.** Signed-in writes count
against the user id, not the IP, so everyone behind one office NAT does not
share a budget — which means those limits are applied *after* the session is
resolved, not before. Unauthenticated traffic falls back to IP, and the global
backstop bounds what that costs.

**The limiter fails open.** If the storage backend is unreachable the request
is allowed and the failure logged. A broken limiter turning into a total outage
is a worse failure than a briefly unenforced ceiling.

**Artwork is built from ids, not taken from payloads.** Steam's search returns
`tiny_image` — a 184×69 landscape sliver that is blurry at card size and shows
a thin horizontal slice when placed in a portrait frame. The CDN exposes
`library_600x900` at a predictable path, which is the same 2:3 as a film
poster. Every type now serves a portrait cover of usable resolution: 500×750
from TMDB, 326×500 from Open Library, 300×450 from Steam.

**Errors have a stable contract.** Every failure returns
`{ "error": { "code", "message", "fields"? } }` with a machine-readable code.
Anything that is not a `DomainError` is logged server-side and reported as a
generic `INTERNAL_ERROR` — internals never reach a client.

---

## Mobile

iOS and Android wrap this same codebase with Capacitor rather than a second
Ionic app. The layout is genuinely mobile-first — a bottom tab bar, safe-area
insets, touch-sized targets — and switches to a sidebar at 60rem, so the phone
build is not a shrunken desktop.

```bash
pnpm --filter @revy/web exec cap add ios       # once
pnpm --filter @revy/web exec cap add android   # once
pnpm --filter @revy/web cap:sync               # build + copy into native projects
```

`NUXT_PUBLIC_API_BASE` must point at the deployed API when generating, because
the native WebView serves from `capacitor://localhost` and relative `/api` URLs
would resolve against it.

---

## Status

**Done — Phase 1 and the §50 vertical slice:**

- Monorepo, shared types and Zod schemas, full 23-table schema and migration
- Media provider abstraction (TMDB + Open Library), search, resolve, detail
- Email/password auth, sessions, protected routes
- Ratings, consumption status, reviews, likes
- Activity feed, friend requests and the friend graph, notifications
- XP and badge evaluation
- Communities: join/leave, member lists, and a directory ranked by activity
- Progress tracking: episode for series, page for books, with bars on Home
- Design system and the Home, Search, Discover, Community, Friends, Lists,
  Media, Profile, Notifications and auth screens

**Done — Phase 5, discussions (§14):**

- Threads per media item, ordered by last activity
- Nested replies to `COMMENT_MAX_DEPTH`, with depth derived server-side
- Spoiler flags on both threads and comments, masked until revealed
- Reply notifications, XP and the Discussion Starter badge
- Discussions tab on the media page, plus a dedicated thread page

**Done — lists (§15) and games:**

- Lists with private / friends / public visibility, enforced in the query so a
  private list never leaves the database for the wrong viewer
- Add to list from any media page, reorder, per-item notes
- Games as a fourth media type, via RAWG

**Done — discover (§21):**

- Trending, Popular, Highest rated, Friends are watching, Friends recently rated
- Lives on the Search screen's idle state, following the mockup — the nav has
  no Discover slot, and browsing belongs where someone with nothing typed is
- Friend sections are omitted, not shown empty, when signed out or friendless

That completes the MVP as §48 defines it.

**Done — rate limiting (§39):**

- Global backstop on every `/api` route, plus stricter rules on the credential
  endpoints, registration, search and content creation
- Standard `X-RateLimit-*` headers on every response, `Retry-After` on refusals

**Not built yet:**

- Integration and E2E tests (§43) — unit tests cover the pure logic only
- Avatar upload

`inListIds` is returned as `[]` on the media detail payload so the field does
not change shape when lists land.
