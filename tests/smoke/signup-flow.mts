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

console.log(failures === 0 ? '\n  all checks passed\n' : `\n  ${failures} check(s) failed\n`)
process.exit(failures === 0 ? 0 : 1)
