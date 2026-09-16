/**
 * The sign-up -> session -> onboarding chain, over real HTTP.
 *
 * This exists because every unit test in this repo stops at the service
 * boundary, and the bug this file was written for lived past it: registration
 * returned 200, wrote a user row and wrote a session row, and forwarded no
 * `Set-Cookie`. Nothing below an HTTP client could see it -- the services were
 * all behaving correctly.
 *
 * Deliberately not part of `pnpm test`: it needs a server, and a suite that
 * cannot run without one is a suite people stop running.
 *
 *   pnpm dev                       # or preview, or point BASE at production
 *   pnpm test:smoke
 *
 * Against production it creates a real account, so it defaults to localhost
 * and makes you opt in by setting BASE.
 */
const BASE = process.env.BASE ?? 'http://localhost:3000'

let failures = 0

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}${detail ? `  -- ${detail}` : ''}`)
  if (!ok) failures += 1
}

const stamp = Date.now()
const username = `smoke${stamp}`

console.log(`\n  ${BASE}  (as ${username})\n`)

// --- register -------------------------------------------------------------
const registered = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: `${username}@example.com`,
    password: 'hunter2hunter2',
    username,
    displayName: 'Smoke Test',
    language: 'en',
  }),
})

check('register returns 200', registered.status === 200, `got ${registered.status}`)

/*
 * `getSetCookie`, not `get`. Sign-up sets two cookies -- the session token and
 * the session-data cache -- and `get('set-cookie')` returns them joined into a
 * single malformed string.
 */
const setCookies = registered.headers.getSetCookie()
check('register sets a session cookie', setCookies.length > 0, `${setCookies.length} cookie(s)`)
check(
  'the session cookie is httpOnly',
  setCookies.every((c) => /httponly/i.test(c)),
  'a readable session cookie is an XSS session theft (OWASP A07)',
)

const cookie = setCookies.map((c) => c.split(';')[0]).join('; ')

// --- the session actually works -------------------------------------------
const seeds = await fetch(`${BASE}/api/taste/seeds?mediaTypes=movie,game&limit=12`, {
  headers: { cookie },
})
check('onboarding seeds are reachable with that cookie', seeds.status === 200, `got ${seeds.status}`)

if (seeds.ok) {
  const body = (await seeds.json()) as { titles?: Array<{ title: string; mediaType: string }> }
  const titles = body.titles ?? []
  check('seeds returns titles', titles.length > 0, `${titles.length} titles`)
  // The grid ignoring the chosen kinds was its own bug once.
  check(
    'seeds honours the requested kinds',
    titles.every((t) => t.mediaType === 'movie' || t.mediaType === 'game'),
    [...new Set(titles.map((t) => t.mediaType))].join(', '),
  )
}

// --- the soft gate --------------------------------------------------------
/*
 * A fresh account is unconfirmed by definition, so this is the one place the
 * closed side of the gate can be checked without touching the database.
 *
 * Both halves matter. If the blocked calls start returning 200 the gate is
 * off; if the allowed ones start returning 403 it has been fitted to the wrong
 * doorway and is shutting everybody in.
 */
const pick = await fetch(`${BASE}/api/taste/seeds?mediaTypes=movie&limit=1`, {
  headers: { cookie },
})
const mediaId = pick.ok
  ? ((await pick.json()) as { titles: Array<{ id: string }> }).titles[0]?.id
  : null

if (!mediaId) {
  check('found a media id to exercise the gate with', false)
} else {
  const post = (path: string, body: unknown) =>
    fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  const review = await post('/api/reviews', {
    mediaId,
    content: 'A smoke-test review, long enough to clear the minimum length rule for content.',
    spoiler: false,
  })
  const code = review.ok
    ? null
    : ((await review.json()) as { error?: { code?: string } }).error?.code
  check(
    'unconfirmed account cannot post a review',
    review.status === 403 && code === 'EMAIL_NOT_VERIFIED',
    `got ${review.status} ${code ?? ''}`,
  )

  const join = await post(`/api/communities/${mediaId}/membership`, { joined: true })
  check('unconfirmed account cannot join a community', join.status === 403, `got ${join.status}`)

  // What the gate must NOT block.
  const rate = await post('/api/ratings', { mediaId, score: 4 })
  check('unconfirmed account can still rate', rate.status === 200, `got ${rate.status}`)

  const leave = await post(`/api/communities/${mediaId}/membership`, { joined: false })
  check('unconfirmed account can still leave', leave.status === 200, `got ${leave.status}`)
}

console.log(failures === 0 ? '\n  all checks passed\n' : `\n  ${failures} check(s) failed\n`)
process.exit(failures === 0 ? 0 : 1)
