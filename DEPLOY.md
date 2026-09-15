# Deploying Rena

A first deploy, in order. Roughly two to three hours, most of it waiting.

The order matters: each step needs something from the one above it. Do not
start with the domain — it is the one thing you can add at the end without
redoing anything.

---

## 0. Commit and push (nothing works until this is done)

There is no git remote and a large amount of uncommitted work. Every hosting
option below deploys *from a repository*, so this is the real first step.

```bash
git add -A
git commit -m "..."

# a private repo; this code has no licence and the .env is gitignored
gh repo create rena --private --source=. --push
```

**Check before pushing:** `git status` must not list `.env`. It is ignored at
`.gitignore:17`, and the keys in it are live.

---

## 1. Postgres

Development runs PGlite — an embedded database inside the Node process. It
cannot back a deployed server: one process, one writer, and it disappears with
the container. Production needs real Postgres.

[Neon](https://neon.tech) has a free tier and takes about five minutes. Create a
project, copy the pooled connection string.

```
DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/rena?sslmode=require
```

Then apply the schema. **`pnpm db:migrate`, not `db:migrate:dev`** — the latter
is the PGlite path added because drizzle-kit cannot reach an embedded database:

```bash
DATABASE_URL="postgresql://..." pnpm db:migrate
```

### The catalogue does not come with it

This is the step that is easy to miss. Your 2,020 media rows live in the local
PGlite file. **The production database starts empty**, and an empty catalogue
means every screen in the product is blank.

```bash
DATABASE_URL="postgresql://..." pnpm db:import     # pulls from TMDB/RAWG/IGDB/OpenLibrary
DATABASE_URL="postgresql://..." pnpm db:badges     # the 25 badge definitions
```

`db:import` is slow and rate-limited by the providers. Start it early — it can
run while you set up everything else.

Do **not** run `pnpm db:seed` against production. It clears the database first.

---

## 2. Secrets

Two must be generated, and one of them is unrecoverable if lost.

```bash
node -e "const {randomBytes}=require('node:crypto');
console.log('AUTH_SECRET='+randomBytes(32).toString('base64'));
console.log('MESSAGE_ENCRYPTION_KEY=1:'+randomBytes(32).toString('base64'))"
```

- `AUTH_SECRET` — signs sessions. Changing it signs everyone out. Recoverable.
- `MESSAGE_ENCRYPTION_KEY` — seals direct messages with AES-256-GCM. **Lose it
  and every message ever sent is permanently unreadable.** There is no reset.
  Put it in a password manager before you paste it into a hosting dashboard.

  The format is `version:base64`. Rotation is additive — append
  `,2:<newkey>` and restart; new messages seal under the highest version and
  old rows keep opening under theirs.

---

## 3. Host

The app needs a **Node runtime, not edge**: the message cipher uses
`node:crypto` and the database driver needs a TCP socket.

[Vercel](https://vercel.com) auto-detects Nuxt and needs no config file. Import
the repo, paste the environment variables from §4, deploy.

Azure Container Apps is the equivalent if this needs to sit with other
ThinkLogic infrastructure — more moving parts for a first deploy, same result.

### Redis

`nuxt.config.ts` mounts two in-memory stores: `ratelimit` and `cache`. On one
instance they are exact. On serverless, each instance keeps its own — rate
limits get multiplied by the instance count and the cache hit rate drops.
Neither is *wrong*, both are weaker.

[Upstash](https://upstash.com) has a free tier. Then in `nuxt.config.ts`:

```ts
storage: {
  ratelimit: { driver: 'redis', url: process.env.REDIS_URL },
  cache: { driver: 'redis', url: process.env.REDIS_URL },
}
```

Fine to skip on day one and add when a second instance exists.

---

## 4. Environment variables

See `.env.production.example` for the full list with notes on what breaks
without each one. The ones that will stop the app starting:

| Variable | Without it |
|---|---|
| `DATABASE_URL` | every route 503s |
| `AUTH_SECRET` | nobody can sign in |
| `MESSAGE_ENCRYPTION_KEY` | **the server refuses to start** |
| `NUXT_PUBLIC_APP_URL` | share links, canonicals, sitemap and OG all point at the wrong origin |

`NUXT_PUBLIC_APP_URL` is your final domain with scheme and no trailing slash.
Set it to the Vercel URL first, then change it when the domain is live.

---

## 5. Domain

Last, deliberately — everything above works on the hosting provider's URL, and
DNS is the slowest thing to propagate.

Buy from [Cloudflare Registrar](https://domains.cloudflare.com) (at cost, no
renewal markup) or Namecheap. Roughly $10–15/year for a `.com`.

Then:

1. Add the domain in your host's dashboard; it will give you a CNAME or A record.
2. Add that record at the registrar.
3. Wait — usually minutes, occasionally hours.
4. **Update `NUXT_PUBLIC_APP_URL` to the real domain and redeploy.** Skipping
   this leaves every share link and canonical pointing at the old URL.

---

## Before you call it live

- [ ] `https://<domain>/` loads
- [ ] Sign up works, and lands on `/onboarding`
- [ ] `https://<domain>/sitemap.xml` shows your domain, not `localhost`
- [ ] `https://<domain>/robots.txt` has an absolute `Sitemap:` line
- [ ] Paste a `/u/<you>/<mediaId>` link into WhatsApp — the card shows a poster
- [ ] Rate something, reload, and the score is still there
- [ ] Send yourself a message, restart the server, and it still decrypts

---

## Known before you start

- **Password reset emails do not send** unless `MAIL_RESEND_API_KEY` is set.
  Without it the mailer logs to the console, so in production a reset silently
  goes nowhere. Set it, or accept that password reset is not available yet.
- **No integration tests.** 424 unit tests, none of which touch an HTTP route.
  Every bug found during this project lived in that layer. Nothing is stopping
  a deploy; it is the thing most likely to bite after one.
- **The AI providers are free tiers.** Gemini and Groq both have daily caps. The
  discovery panel degrades to an error when they are hit, and the provider chain
  already routes around one being unavailable.
