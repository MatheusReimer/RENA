import { createMessageCipher, parseKeyring, type MessageContext } from '@revy/core'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

/**
 * Message encryption (SPEC 12, 39, 43).
 *
 * These assert the properties the feature's privacy claim actually rests on,
 * not that AES works -- Node's crypto is not ours to test. What is ours is the
 * wiring: that the context is really bound into the tag, that a wrong key
 * fails closed, that rotation does not strand old rows, and that a
 * misconfigured key is rejected rather than quietly used.
 *
 * Every one of these is a test that fails loudly if someone later "simplifies"
 * the cipher in a way that keeps the tests passing and removes the guarantee.
 */

function key(): string {
  return randomBytes(32).toString('base64')
}

const CONTEXT: MessageContext = {
  conversationId: '3f0c1a5e-9b2d-4c7a-8e1f-2b6d4a9c0e13',
  messageId: '7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
  senderId: 'b2c3d4e5-6f70-4a8b-9c0d-1e2f3a4b5c6d',
}

function cipherWith(keyring: string) {
  const cipher = createMessageCipher({ keyring, isProduction: true })
  if (!cipher) throw new Error('expected a cipher')
  return cipher
}

describe('message cipher', () => {
  it('round-trips a message', () => {
    const cipher = cipherWith(`1:${key()}`)
    const sealed = cipher.seal('have you finished it yet?', CONTEXT)

    expect(cipher.open(sealed, CONTEXT)).toBe('have you finished it yet?')
  })

  it('round-trips text the database would otherwise mangle', () => {
    const cipher = cipherWith(`1:${key()}`)
    // Emoji, newlines, quotes and a NUL -- the last of which Postgres rejects
    // outright in a text column and accepts happily inside a bytea.
    const awkward = 'não\n\t"quoted" 📚 \u0000 <script>'

    expect(cipher.open(cipher.seal(awkward, CONTEXT), CONTEXT)).toBe(awkward)
  })

  it('never produces the same ciphertext twice for the same message', () => {
    const cipher = cipherWith(`1:${key()}`)
    const a = cipher.seal('same words', CONTEXT)
    const b = cipher.seal('same words', CONTEXT)

    // A repeated nonce under one key breaks GCM completely, so this is the
    // single most important property here.
    expect(Buffer.from(a.nonce).equals(Buffer.from(b.nonce))) .toBe(false)
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false)
  })

  it('stores nothing that resembles the plaintext', () => {
    const cipher = cipherWith(`1:${key()}`)
    const sealed = cipher.seal('meet me at the library', CONTEXT)

    expect(Buffer.from(sealed.ciphertext).toString('utf8')).not.toContain('library')
  })

  it('refuses a body moved to another conversation', () => {
    const cipher = cipherWith(`1:${key()}`)
    const sealed = cipher.seal('private', CONTEXT)

    // The attack this blocks: someone with write access to the table copying a
    // row into a conversation they are in. Without the AAD it would decrypt.
    expect(() =>
      cipher.open(sealed, { ...CONTEXT, conversationId: CONTEXT.senderId }),
    ).toThrow()
  })

  it('refuses a body reattributed to another sender', () => {
    const cipher = cipherWith(`1:${key()}`)
    const sealed = cipher.seal('private', CONTEXT)

    expect(() => cipher.open(sealed, { ...CONTEXT, senderId: CONTEXT.messageId })).toThrow()
  })

  it('refuses a body replayed under a different message id', () => {
    const cipher = cipherWith(`1:${key()}`)
    const sealed = cipher.seal('private', CONTEXT)

    expect(() =>
      cipher.open(sealed, { ...CONTEXT, messageId: CONTEXT.conversationId }),
    ).toThrow()
  })

  it('refuses a tampered ciphertext', () => {
    const cipher = cipherWith(`1:${key()}`)
    const sealed = cipher.seal('transfer approved', CONTEXT)

    const tampered = Uint8Array.from(sealed.ciphertext)
    tampered[0] ^= 0xff

    expect(() => cipher.open({ ...sealed, ciphertext: tampered }, CONTEXT)).toThrow()
  })

  it('refuses a truncated ciphertext rather than reading past it', () => {
    const cipher = cipherWith(`1:${key()}`)
    const sealed = cipher.seal('hello', CONTEXT)

    expect(() =>
      cipher.open({ ...sealed, ciphertext: sealed.ciphertext.slice(0, 4) }, CONTEXT),
    ).toThrow()
  })

  it('refuses a body sealed under a different key', () => {
    const sealed = cipherWith(`1:${key()}`).seal('private', CONTEXT)
    const other = cipherWith(`1:${key()}`)

    expect(() => other.open(sealed, CONTEXT)).toThrow()
  })
})

describe('key rotation', () => {
  const oldKey = key()
  const newKey = key()

  it('seals new messages under the highest version', () => {
    expect(cipherWith(`1:${oldKey},2:${newKey}`).activeVersion).toBe(2)
  })

  it('is order-independent, so appending a key is enough', () => {
    // Rotation instructions say "append"; if ordering mattered, following them
    // would silently keep encrypting under the old key.
    expect(cipherWith(`2:${newKey},1:${oldKey}`).activeVersion).toBe(2)
  })

  it('still opens messages written before the rotation', () => {
    const before = cipherWith(`1:${oldKey}`)
    const sealed = before.seal('written last year', CONTEXT)
    expect(sealed.keyVersion).toBe(1)

    const after = cipherWith(`1:${oldKey},2:${newKey}`)
    expect(after.open(sealed, CONTEXT)).toBe('written last year')
  })

  it('refuses a row whose key version is no longer configured', () => {
    const sealed = cipherWith(`1:${oldKey}`).seal('written last year', CONTEXT)
    const rotatedAway = cipherWith(`2:${newKey}`)

    // Retiring a key without re-sealing its rows must fail loudly, not return
    // something plausible.
    expect(() => rotatedAway.open(sealed, CONTEXT)).toThrow(/version 1/)
  })
})

describe('keyring parsing', () => {
  it('accepts a single valid key', () => {
    expect(parseKeyring(`1:${key()}`).size).toBe(1)
  })

  it('accepts the URL-safe base64 alphabet', () => {
    const urlSafe = randomBytes(32).toString('base64url')
    expect(parseKeyring(`1:${urlSafe}`).size).toBe(1)
  })

  it('ignores surrounding whitespace', () => {
    expect(parseKeyring(` 1: ${key()} , 2:${key()} `).size).toBe(2)
  })

  it.each([
    ['no version', key()],
    ['a non-numeric version', `v1:${key()}`],
    ['a zero version', `0:${key()}`],
    ['a version past smallint', `40000:${key()}`],
    ['a short key', `1:${randomBytes(16).toString('base64')}`],
    ['a long key', `1:${randomBytes(64).toString('base64')}`],
    ['an empty key', '1:'],
    ['nothing usable', '   '],
  ])('rejects %s', (_label, spec) => {
    expect(() => parseKeyring(spec)).toThrow()
  })

  it('rejects an all-zero key', () => {
    // What a placeholder or a truncated secret decodes to. It would otherwise
    // work, encrypting everything under a key guessable on the first try.
    expect(() => parseKeyring(`1:${Buffer.alloc(32).toString('base64')}`)).toThrow(/zero/)
  })

  it('rejects a duplicated version', () => {
    // Silently keeping one of the two would make which messages decrypt depend
    // on the order of an environment variable.
    expect(() => parseKeyring(`1:${key()},1:${key()}`)).toThrow(/twice/)
  })
})

describe('configuration', () => {
  it('derives a usable key from the session secret in development', () => {
    const cipher = createMessageCipher({
      fallbackSeed: 'a-development-session-secret',
      isProduction: false,
    })

    expect(cipher).not.toBeNull()
    expect(cipher!.open(cipher!.seal('hello', CONTEXT), CONTEXT)).toBe('hello')
  })

  it('derives the same key every time, so a restart does not orphan messages', () => {
    const config = { fallbackSeed: 'a-development-session-secret', isProduction: false }
    const first = createMessageCipher(config)!
    const second = createMessageCipher(config)!

    expect(second.open(first.seal('survives a restart', CONTEXT), CONTEXT)).toBe(
      'survives a restart',
    )
  })

  it('derives different keys from different secrets', () => {
    const a = createMessageCipher({ fallbackSeed: 'secret-a', isProduction: false })!
    const b = createMessageCipher({ fallbackSeed: 'secret-b', isProduction: false })!

    expect(() => b.open(a.seal('private', CONTEXT), CONTEXT)).toThrow()
  })

  it('disables messaging rather than inventing a key when nothing is configured', () => {
    expect(createMessageCipher({ isProduction: false })).toBeNull()
  })

  it('disables messaging in production rather than taking the app down', () => {
    // This is built inside the request context every route shares. Throwing
    // here would mean one missing variable 500s the home page, which is a
    // worse outcome than the feature being unavailable and saying so.
    expect(createMessageCipher({ isProduction: true })).toBeNull()
  })

  it('never falls back to the session secret in production', () => {
    // The session secret is rotated on its own schedule for its own reasons.
    // Deriving from it on a deployed host would make a routine rotation
    // silently destroy every message ever sent.
    expect(createMessageCipher({ fallbackSeed: 'a-secret', isProduction: true })).toBeNull()
  })

  it('still refuses a malformed key in production', () => {
    // Somebody set the variable and got it wrong. That is a mistake to fix,
    // not a deployment that has chosen to go without messaging.
    expect(() => createMessageCipher({ keyring: '1:nonsense', isProduction: true })).toThrow()
  })

  it('reports a malformed key instead of disabling the feature', () => {
    // A misconfiguration to fix, not a reason to quietly ship without
    // messaging and have somebody notice in production.
    expect(() => createMessageCipher({ keyring: '1:nonsense', isProduction: false })).toThrow()
  })
})
