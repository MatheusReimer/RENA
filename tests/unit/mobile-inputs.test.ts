import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The 16px floor on anything a reader types into.
 *
 * Mobile Safari zooms the whole page in when a focused control is smaller
 * than 16px, and it does not zoom back out when the keyboard closes -- the
 * reader is left on a page they have to drag sideways for the rest of the
 * visit. Six controls had drifted under the line before this was added: the
 * header search on every screen, the community filter, both composers, the
 * media progress field and the Ask panel.
 *
 * It is a source test rather than a rendered one because the failure has no
 * observable symptom anywhere a headless browser could see it -- the bug is
 * in what iOS does with the number, and iOS is not in the test runner. The
 * number is the only thing there is to check, so this checks the number.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const APP = join(ROOT, 'apps', 'web', 'app')

/** Rules whose selector names a control that opens a keyboard or a picker. */
const CONTROL = /input|textarea|select\b/i

/** `--text-input` is the floor itself, so a rule using it is correct by construction. */
const FONT_SIZE = /font-size:\s*([^;}]+)/

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(vue|css)$/.test(entry) ? [path] : []
  })
}

/**
 * The tokens that are under 16px, read from the stylesheet rather than listed
 * here -- a scale that is retuned should not quietly leave this test asserting
 * against values nobody uses any more.
 */
function tokensUnder16px(): Set<string> {
  const css = readFileSync(join(APP, 'assets', 'css', 'tokens.css'), 'utf8')
  const small = new Set<string>()
  for (const [, name, rem] of css.matchAll(/(--text-[a-z0-9]+):\s*([\d.]+)rem/g)) {
    if (Number(rem) * 16 < 16) small.add(name!)
  }
  return small
}

describe('text controls clear the iOS zoom threshold', () => {
  const small = tokensUnder16px()

  it('finds the sub-16px tokens it is meant to be guarding against', () => {
    // If the scale is ever rewritten so that nothing is under 16px, the sweep
    // below would pass vacuously and stop protecting anything.
    expect(small.size).toBeGreaterThan(0)
    expect(small).toContain('--text-sm')
  })

  it('sizes every input, textarea and select at 16px or more', () => {
    const offenders: string[] = []

    for (const file of sources(APP)) {
      const css = readFileSync(file, 'utf8')

      // Each `selector { ... }` block. Nested at-rules do not matter here:
      // an inner block is still visited as a block of its own.
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1]!.trim().split('\n').pop()!.trim()
        if (!CONTROL.test(selector)) continue

        const size = FONT_SIZE.exec(match[2]!)?.[1]?.trim()
        if (!size) continue

        const token = /var\((--text-[a-z0-9]+)\)/.exec(size)?.[1]
        const literal = /^([\d.]+)rem$/.exec(size)

        const tooSmall =
          (token && small.has(token)) || (literal && Number(literal[1]) * 16 < 16)

        if (tooSmall) {
          const line = css.slice(0, match.index).split('\n').length
          offenders.push(
            `${relative(ROOT, file).split(sep).join('/')}:${line}  ${selector} -> ${size}`,
          )
        }
      }
    }

    expect(offenders, `use var(--text-input) instead:\n${offenders.join('\n')}`).toEqual([])
  })
})
