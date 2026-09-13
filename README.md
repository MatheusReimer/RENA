# Revy (VYBE)

A social network for rating, reviewing and discussing movies, series and books.

> Letterboxd + Goodreads + a social graph, with one identity across every kind of
> media. Full product scope is in [`docs/SPEC.md`](docs/SPEC.md).

---

## Getting started

You need **Node 22** and **pnpm 11**. Both are already installed if `node -v`
reports 22.x.

```bash
pnpm install
cp .env.example .env        # then fill it in, see below
pnpm db:migrate             # create the schema
pnpm db:seed                # 10 users, 20 titles, ratings, reviews, discussions
pnpm dev                    # http://localhost:3000
```

After seeding you can sign in as `matheus@example.com` / `password123`
(every seeded account uses that password).

### Filling in `.env`

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Postgres connection string. For [Neon](https://console.neon.tech): create a project and copy the **pooled** URL (the host containing `-pooler`). |
| `AUTH_SECRET` | **yes** | Session signing key. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. |
| `TMDB_API_KEY` | no | Free key from [TMDB](https://www.themoviedb.org/settings/api). Without it the app runs and **book** search works, but movie and series search returns nothing. |
| `NUXT_PUBLIC_APP_URL` | no | Deployed origin. Leave blank locally. |
| `NUXT_PUBLIC_API_BASE` | no | Absolute API origin. Blank on web; **required** for the Capacitor build. |

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
pnpm db:seed        # reset and reseed development data
pnpm db:studio      # Drizzle Studio
```

---

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

**User content is never trusted as HTML.** It is stored raw and escaped at
render time — sanitising on input mangles legitimate text and gives false
confidence. `vue/no-v-html` is an error in the lint config.

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
- Design system and the Home, Search, Media, Profile, Activity and auth screens

**Done — Phase 5, discussions (§14):**

- Threads per media item, ordered by last activity
- Nested replies to `COMMENT_MAX_DEPTH`, with depth derived server-side
- Spoiler flags on both threads and comments, masked until revealed
- Reply notifications, XP and the Discussion Starter badge
- Discussions tab on the media page, plus a dedicated thread page

**Not built yet:**

- Lists (§15) — schema, indexes and API types exist; services and UI do not
- Discover page (§21)
- Integration and E2E tests (§43) — unit tests cover the pure logic only
- Rate limiting (§39) and avatar upload

`inListIds` is returned as `[]` on the media detail payload so the field does
not change shape when lists land.
