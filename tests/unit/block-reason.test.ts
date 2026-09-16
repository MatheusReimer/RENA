import { describe, expect, it } from 'vitest'
import { API_ERROR_CODES } from '@revy/shared/types'
import { blockReason, isFieldLevel } from '@revy/shared/utils'
import enLocale from '../../apps/web/i18n/locales/en.json'
import ptLocale from '../../apps/web/i18n/locales/pt-BR.json'
import esLocale from '../../apps/web/i18n/locales/es.json'

/**
 * What the product says when it refuses something.
 *
 * The rule is that a block always names its cause and offers the step that
 * clears it. That is only true if every code resolves to a real, translated
 * sentence -- a missing key renders as the key itself, which is a worse
 * refusal than the silence this replaced.
 */

const LOCALES = { en: enLocale, 'pt-BR': ptLocale, es: esLocale } as Record<
  string,
  Record<string, Record<string, string>>
>

function lookup(locale: Record<string, Record<string, string>>, key: string): string | undefined {
  const [head, ...rest] = key.split('.')
  let node: unknown = locale[head!]
  for (const part of rest) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

describe('blockReason', () => {
  it('answers for every error code the API can return', () => {
    // Including the ones with no bespoke entry: an unanticipated refusal still
    // has to say something.
    for (const code of API_ERROR_CODES) {
      expect(blockReason(code).messageKey, code).toBeTruthy()
    }
  })

  it('answers for an unknown code and for no code at all', () => {
    // A network failure carries no code, and a newer server may send one this
    // build has never heard of.
    // @ts-expect-error -- deliberately outside the union.
    expect(blockReason('SOMETHING_NEW').messageKey).toBe('block.internal')
    expect(blockReason(undefined).messageKey).toBe('block.internal')
  })

  it('sends an unconfirmed address to the screen that confirms it', () => {
    // The case this table was written for.
    const reason = blockReason('EMAIL_NOT_VERIFIED')
    expect(reason.to).toBe('/verify-email')
    expect(reason.actionKey).toBeTruthy()
  })

  it('offers no button where waiting is the only fix', () => {
    // A "try again" that reproduces the same failure is worse than no button.
    for (const code of ['RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'INTERNAL_ERROR'] as const) {
      expect(blockReason(code).to, code).toBeUndefined()
      expect(blockReason(code).retryable, code).toBe(true)
    }
  })

  it('leaves field-level failures to the form that raised them', () => {
    // These belong against the input, not in a notice in the corner.
    expect(isFieldLevel('VALIDATION_FAILED')).toBe(true)
    expect(isFieldLevel('USERNAME_TAKEN')).toBe(true)
    expect(isFieldLevel('EMAIL_NOT_VERIFIED')).toBe(false)
  })
})

describe('every reason resolves to real copy', () => {
  for (const [name, locale] of Object.entries(LOCALES)) {
    it(`has a ${name} string for every message and action`, () => {
      const missing: string[] = []
      for (const code of API_ERROR_CODES) {
        const reason = blockReason(code)
        if (!lookup(locale, reason.messageKey)) missing.push(`${code} -> ${reason.messageKey}`)
        if (reason.actionKey && !lookup(locale, reason.actionKey)) {
          missing.push(`${code} -> ${reason.actionKey}`)
        }
      }
      expect(missing, `missing ${name} keys:\n${missing.join('\n')}`).toEqual([])
    })
  }
})
