/**
 * Translation audit (SPEC 31).
 *
 * Answers "what is not translated yet" in one command, across the four ways a
 * string can go missing. They are genuinely different problems and only the
 * first is the one people think of:
 *
 *  1. **Hardcoded English.** A literal in a template or a script that never
 *     went through `$t` at all. The large, mechanical category.
 *  2. **Broken keys.** `$t('foo.bar')` where `foo.bar` is in no locale file.
 *     These render as the raw key on screen -- worse than English.
 *  3. **Gaps between locales.** A key present in `en` and missing from
 *     `pt-BR`, which silently falls back to English for that reader. Invisible
 *     unless you go looking, which is what this is for.
 *  4. **Server-side strings.** Every `DomainError` message is written in
 *     English on the server and rendered verbatim by the client. No amount of
 *     client i18n reaches them, so they are reported separately.
 *
 * Run with: pnpm i18n:audit
 * Exits non-zero when it finds a broken key or a locale gap -- those are bugs.
 * Hardcoded English is reported but does not fail, because the sweep is
 * deliberately incremental.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const APP = join(HERE, '..', 'app')
const SERVER = join(HERE, '..', 'server')
const CORE = join(HERE, '..', '..', '..', 'packages')
const LOCALES = ['en', 'pt-BR', 'es']
const BASE = 'en'

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, exts, out)
    else if (exts.some((ext) => entry.endsWith(ext))) out.push(path)
  }
  return out
}

/** `{ nav: { home: 'Home' } }` -> `{ 'nav.home': 'Home' }`. */
function flatten(value, prefix = '', out = {}) {
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) flatten(entry, path, out)
    else out[path] = entry
  }
  return out
}

const locales = Object.fromEntries(
  LOCALES.map((code) => [
    code,
    flatten(JSON.parse(readFileSync(join(HERE, 'locales', `${code}.json`), 'utf8'))),
  ]),
)

/* ------------------------------------------------------------------ *
 * 1. Keys referenced in code
 * ------------------------------------------------------------------ */

const appFiles = walk(APP, ['.vue', '.ts'])

/*
 * Only literal keys are collected. A computed key -- `$t(item.label)` in the
 * shell's nav loop -- cannot be resolved statically, so those are counted
 * separately rather than reported as broken.
 */
const KEY_CALL = /\$?\b(?:t|te|tm)\(\s*['"`]([a-zA-Z0-9_.-]+)['"`]/g
const DYNAMIC_CALL = /\$?\b(?:t|te|tm)\(\s*(?![`'"])/g

const used = new Map() // key -> [files]
let dynamic = 0

function note(key, where) {
  const list = used.get(key) ?? []
  list.push(where)
  used.set(key, list)
}

for (const file of appFiles) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(KEY_CALL)) note(match[1], relative(APP, file))
  dynamic += [...text.matchAll(DYNAMIC_CALL)].length
}

/*
 * Keys the server supplies rather than the client naming.
 *
 * Discover rails carry a `titleKey` chosen in `discover.service`, rendered as
 * `$t(section.titleKey)` -- so the key exists, is used, and is invisible to a
 * scan of the client. Without this the audit reported ten live keys as dead,
 * which is the sort of noise that gets a check ignored rather than fixed.
 *
 * The dot in the value is load-bearing. `titleKey` is overloaded in this
 * codebase: `localise.service` uses it to name which *column* on a row holds a
 * title -- `'title'` or `'mediaTitle'` -- and nothing to do with i18n.
 * Requiring a dotted path separates a translation key from a field name
 * without needing a list of exceptions.
 */
const SUPPLIED_KEY =
  /\b(?:titleKey|labelKey|messageKey)\s*:\s*'([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)'/g
for (const file of walk(CORE, ['.ts'])) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(SUPPLIED_KEY)) note(match[1], 'server')
}

/* ------------------------------------------------------------------ *
 * 2. Hardcoded English
 * ------------------------------------------------------------------ */

const TEMPLATE_TEXT = />\s*([A-Z][A-Za-z][^<>{}\n]{3,80})\s*</g
const TEMPLATE_ATTR = /(?<!:)\b(placeholder|title|aria-label|description|label)="([A-Z][^"]{3,90})"/g
/* Script-side user-facing strings: page titles, tab labels, toast text. */
const SCRIPT_STRING = /\b(?:title|label|placeholder|message)\s*:\s*['"]([A-Z][^'"]{3,80})['"]/g

const hardcoded = []

for (const file of appFiles) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(APP, file)
  const templateAt = text.indexOf('<template')
  const template = templateAt === -1 ? '' : text.slice(templateAt)
  const script = templateAt === -1 ? text : text.slice(0, templateAt)

  const found = [
    ...[...template.matchAll(TEMPLATE_TEXT)].map((m) => m[1].trim()),
    ...[...template.matchAll(TEMPLATE_ATTR)].map((m) => m[2]),
    ...[...script.matchAll(SCRIPT_STRING)].map((m) => m[1]),
  ].filter((s) => !/^[A-Z][a-z]+\.(js|ts|vue|png)$/.test(s))

  if (found.length) hardcoded.push({ file: rel, strings: found })
}

/* ------------------------------------------------------------------ *
 * 3. Server-side messages the client renders verbatim
 * ------------------------------------------------------------------ */

const DOMAIN_MESSAGE = /new DomainError\(\s*'[A-Z_]+',\s*'([^']{6,})'/g
const ERROR_HELPER = /=>\s*new DomainError\(\s*'[A-Z_]+',\s*`([^`]{6,})`/g

const serverStrings = new Set()
for (const file of [...walk(SERVER, ['.ts']), ...walk(CORE, ['.ts'])]) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(DOMAIN_MESSAGE)) serverStrings.add(match[1])
  for (const match of text.matchAll(ERROR_HELPER)) serverStrings.add(match[1])
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const baseKeys = new Set(Object.keys(locales[BASE]))
const broken = [...used.keys()].filter((key) => !baseKeys.has(key)).sort()

const gaps = {}
for (const code of LOCALES) {
  if (code === BASE) continue
  gaps[code] = [...baseKeys].filter((key) => !(key in locales[code])).sort()
}

const unused = [...baseKeys]
  .filter((key) => !used.has(key))
  // Badge and nav entries are reached through computed keys; a static scan
  // cannot see them and calling them dead would be wrong.
  .filter((key) => !key.startsWith('badges.') && !key.startsWith('mediaType.'))
  .sort()

const line = '─'.repeat(64)
console.log(`\n${line}\n  TRANSLATION AUDIT\n${line}`)

console.log(`\n  Locale files`)
for (const code of LOCALES) {
  console.log(`    ${code.padEnd(6)} ${String(Object.keys(locales[code]).length).padStart(4)} keys`)
}
console.log(`    ${'used'.padEnd(6)} ${String(used.size).padStart(4)} literal keys referenced in code`)
console.log(`    ${'dynamic'.padEnd(6)} ${String(dynamic).padStart(4)} computed $t() calls (not statically checkable)`)

console.log(`\n  1. Broken keys — referenced in code, absent from ${BASE}.json`)
if (broken.length === 0) console.log('     none')
for (const key of broken) {
  console.log(`     ${key}  (${[...new Set(used.get(key))].join(', ')})`)
}

console.log(`\n  2. Locale gaps — present in ${BASE}, missing elsewhere`)
let gapTotal = 0
for (const [code, missing] of Object.entries(gaps)) {
  gapTotal += missing.length
  console.log(`     ${code}: ${missing.length} missing`)
  for (const key of missing.slice(0, 12)) console.log(`       ${key}`)
  if (missing.length > 12) console.log(`       ... and ${missing.length - 12} more`)
}

const hardcodedTotal = hardcoded.reduce((sum, entry) => sum + entry.strings.length, 0)
console.log(`\n  3. Hardcoded English — ${hardcodedTotal} strings in ${hardcoded.length} files`)
for (const entry of hardcoded.sort((a, b) => b.strings.length - a.strings.length)) {
  console.log(`     ${String(entry.strings.length).padStart(3)}  ${entry.file}`)
}

console.log(`\n  4. Server messages — English, rendered verbatim by the client`)
console.log(`     ${serverStrings.size} distinct DomainError messages`)
for (const message of [...serverStrings].sort().slice(0, 8)) {
  console.log(`       "${message.slice(0, 68)}"`)
}
if (serverStrings.size > 8) console.log(`       ... and ${serverStrings.size - 8} more`)

console.log(`\n  5. Possibly unused keys in ${BASE}.json — ${unused.length}`)
for (const key of unused.slice(0, 10)) console.log(`     ${key}`)
if (unused.length > 10) console.log(`     ... and ${unused.length - 10} more`)

console.log(`\n${line}`)
const failures = broken.length + gapTotal
console.log(
  failures === 0
    ? '  No broken keys and no locale gaps.\n'
    : `  ${broken.length} broken key(s), ${gapTotal} locale gap(s) — these are bugs.\n`,
)

process.exit(failures === 0 ? 0 : 1)
