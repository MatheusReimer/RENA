import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Message encryption at rest (SPEC 39, OWASP A02).
 *
 * Every direct message body is sealed with AES-256-GCM before it reaches
 * Postgres and opened again on the way out, so the plaintext exists in the
 * application process and nowhere else that persists. What this buys is
 * specific and worth stating plainly, because "encrypted" is a word that gets
 * oversold:
 *
 *   It protects against  -- a leaked or stolen database dump, a backup or
 *                           snapshot landing somewhere it should not, a read
 *                           replica exposed by a misconfiguration, and any SQL
 *                           injection that can read rows.
 *
 *   It does NOT protect against -- anyone who can run code on the server or
 *                           read its environment. The key is there, so they
 *                           can read messages.
 *
 * That second line is why the product must never describe this as end-to-end
 * encryption. End-to-end would mean the server could not read messages, which
 * would also mean no notification previews, no spam filtering and no way to
 * act on an abuse report -- a trade this product has not made. The honest word
 * for what this is, and the word the interface uses, is private.
 *
 * The other half of the guarantee is authorization: encryption stops someone
 * who has the rows from reading them, and does nothing about someone who asks
 * the API nicely for a conversation they are not in. That check lives in
 * `conversationService` and is not optional.
 */

/** A sealed body, exactly as the three `messages` columns store it. */
export interface SealedMessage {
  /** GCM output with the 16-byte authentication tag appended. */
  ciphertext: Uint8Array
  /** The 96-bit IV this body was sealed with. Unique per message. */
  nonce: Uint8Array
  /** Which key sealed it, so rotation does not invalidate old rows. */
  keyVersion: number
}

/**
 * The context a message is bound to.
 *
 * Passed to GCM as additional authenticated data: it is not encrypted, but the
 * tag covers it, so a ciphertext cannot be opened under a different context
 * than the one it was sealed under. Concretely, somebody with write access to
 * the table cannot move a row into another conversation, replay it under a new
 * message id, or reattribute it to a different sender -- all three would be
 * undetectable if the tag covered only the body.
 */
export interface MessageContext {
  conversationId: string
  messageId: string
  senderId: string
}

export interface MessageCipher {
  seal(plaintext: string, context: MessageContext): SealedMessage
  /** Throws if the row was tampered with, or its key version is unknown. */
  open(sealed: SealedMessage, context: MessageContext): string
  /** The version new messages are sealed under, for logs and diagnostics. */
  readonly activeVersion: number
}

export interface MessageCipherConfig {
  /**
   * Versioned keys as `version:base64,version:base64`.
   *
   * Rotation is additive: append a new entry with a higher version and restart.
   * New messages seal under it; existing rows keep decrypting under theirs, so
   * nothing needs rewriting and nothing becomes unreadable. Retiring an old
   * key means re-sealing the rows that use it, which is a migration, not a
   * config change.
   */
  keyring?: string
  /**
   * Development-only seed, used to derive a key when `keyring` is absent.
   *
   * The session secret is passed here. It is already required for the app to
   * run at all, and deriving from it means a fresh clone can use messaging
   * without generating a second secret first -- while still producing a stable
   * key across restarts, so yesterday's messages still open today.
   */
  fallbackSeed?: string
  /** Production never derives a key; it requires a real one or refuses. */
  isProduction: boolean
}

/** AES-256. Any other length is a configuration error, not a shorter key. */
const KEY_BYTES = 32

/**
 * 96 bits, which is the IV size GCM is specified around: anything else forces
 * an extra GHASH pass and buys nothing.
 */
const NONCE_BYTES = 12

const TAG_BYTES = 16

/** Fits `messages.key_version`, a smallint. */
const MAX_KEY_VERSION = 32_767

/**
 * Builds the cipher, or returns null when no key is available.
 *
 * Null means "messaging is unavailable", and it is the answer in both
 * environments when there is no key -- including production. Throwing there
 * was worse than it looks: this is built inside the request context that every
 * route shares, so one missing environment variable took the whole site down
 * rather than one feature. Disabling messaging and saying so is proportionate;
 * 500ing the home page because direct messages have no key is not.
 *
 * What must never happen is a third option where the feature runs and writes
 * plaintext, and there is no code path here that produces a working cipher
 * without a key. A *malformed* key still throws, because that is an
 * unambiguous mistake rather than a deployment that has not asked for the
 * feature.
 */
export function createMessageCipher(config: MessageCipherConfig): MessageCipher | null {
  const keys = resolveKeys(config)
  if (!keys) return null

  const activeVersion = Math.max(...keys.keys())
  const activeKey = keys.get(activeVersion)!

  return {
    activeVersion,

    seal(plaintext, context) {
      /*
       * A fresh random nonce per message.
       *
       * Reusing a nonce under one key is the failure that breaks GCM
       * completely -- it leaks the XOR of the two plaintexts and, worse, the
       * authentication subkey, which lets an attacker forge tags. A counter
       * would be tighter but needs coordinated state across every process
       * writing messages, and a counter that resets on deploy is a nonce reuse
       * with extra steps. Random 96-bit nonces avoid shared state at the cost
       * of a birthday bound: NIST SP 800-38D puts the safe ceiling at 2^32
       * messages per key, which is four billion, and `key_version` exists so
       * reaching it is a rotation rather than a rewrite.
       */
      const nonce = randomBytes(NONCE_BYTES)
      const cipher = createCipheriv('aes-256-gcm', activeKey, nonce)
      cipher.setAAD(encodeContext(context))

      const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      // Tag appended rather than stored apart: the two are only ever used
      // together, and a tag in its own column is a tag a query can forget.
      const ciphertext = Buffer.concat([body, cipher.getAuthTag()])

      return { ciphertext: new Uint8Array(ciphertext), nonce: new Uint8Array(nonce), keyVersion: activeVersion }
    },

    open(sealed, context) {
      const key = keys.get(sealed.keyVersion)
      if (!key) {
        // The row was sealed under a key this deployment does not have --
        // a retired key, or a database pointed at the wrong environment.
        throw new Error(`No message key for version ${sealed.keyVersion}.`)
      }
      if (sealed.ciphertext.length < TAG_BYTES) {
        throw new Error('Ciphertext is too short to contain an authentication tag.')
      }

      const buffer = Buffer.from(sealed.ciphertext)
      const body = buffer.subarray(0, buffer.length - TAG_BYTES)
      const tag = buffer.subarray(buffer.length - TAG_BYTES)

      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.nonce))
      decipher.setAAD(encodeContext(context))
      decipher.setAuthTag(tag)

      // `final()` is what verifies the tag, so it is never safe to use the
      // output of `update()` before this line has returned.
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
    },
  }
}

/**
 * Serialises the context to bytes for the AAD.
 *
 * Length-prefixed rather than joined with a separator: three fields glued with
 * a colon are ambiguous the moment any of them could contain one, and an
 * ambiguous AAD is one where two different contexts can produce identical
 * bytes. These three are all UUIDs today, which is exactly the kind of fact
 * that stops being true quietly.
 */
function encodeContext(context: MessageContext): Buffer {
  const parts = [context.conversationId, context.messageId, context.senderId]
  return Buffer.from(parts.map((part) => `${part.length}:${part}`).join(''), 'utf8')
}

/**
 * Resolves the keyring from configuration, or derives a development one.
 *
 * Throws rather than returning null when a keyring is *present but wrong*: a
 * malformed key is a misconfiguration to fix, and quietly disabling messaging
 * would hide it until someone noticed the feature missing in production.
 */
function resolveKeys(config: MessageCipherConfig): Map<number, Buffer> | null {
  const spec = config.keyring?.trim()
  if (spec) return parseKeyring(spec)

  /*
   * No key in production means no messaging.
   *
   * The session secret is deliberately not consulted here. It is the right
   * seed for a developer who has not generated a second secret yet, and the
   * wrong one for a deployed environment: it is rotated on a different
   * schedule for a different reason, and rotating it would silently make every
   * message ever sent unreadable.
   */
  if (config.isProduction) return null

  if (!config.fallbackSeed) return null

  /*
   * Development fallback: derive a key from the session secret.
   *
   * HKDF with a distinct `info` string, so this key and anything else ever
   * derived from the same secret are independent -- reusing a secret across
   * purposes is how one leak becomes two. Deterministic, so messages written
   * before a restart still open after it; and unreachable in production,
   * because the branch above has already thrown.
   */
  const derived = hkdfSync('sha256', config.fallbackSeed, '', 'revy:message-encryption:v1', KEY_BYTES)
  return new Map([[1, Buffer.from(derived)]])
}

/**
 * Parses `version:base64[,version:base64...]`.
 *
 * Exported for the test suite, which is the only place the malformed cases can
 * be exercised -- by the time this runs in the app, a bad key has already
 * stopped the process.
 */
export function parseKeyring(spec: string): Map<number, Buffer> {
  const keys = new Map<number, Buffer>()

  for (const raw of spec.split(',')) {
    const entry = raw.trim()
    if (!entry) continue

    const separator = entry.indexOf(':')
    if (separator === -1) {
      throw new Error('Each message key must be written as "version:base64key".')
    }

    const version = Number(entry.slice(0, separator))
    if (!Number.isInteger(version) || version < 1 || version > MAX_KEY_VERSION) {
      throw new Error(`Message key version must be an integer between 1 and ${MAX_KEY_VERSION}.`)
    }
    if (keys.has(version)) {
      throw new Error(`Message key version ${version} is defined twice.`)
    }

    // Node's base64 decoder accepts the URL-safe alphabet too, but it is
    // lenient about trailing junk -- so the decoded length is what we check,
    // rather than trusting the input to have been well formed.
    const key = Buffer.from(entry.slice(separator + 1).trim(), 'base64')
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `Message key ${version} must decode to ${KEY_BYTES} bytes, got ${key.length}.`,
      )
    }
    if (isAllZero(key)) {
      // An all-zero key is what a placeholder or a truncated secret decodes
      // to, and it would otherwise "work" -- encrypting everything under a
      // key an attacker can guess on the first try.
      throw new Error(`Message key ${version} is all zero bytes.`)
    }

    keys.set(version, key)
  }

  if (keys.size === 0) {
    throw new Error('MESSAGE_ENCRYPTION_KEY was set but contained no usable keys.')
  }

  return keys
}

function isAllZero(key: Buffer): boolean {
  return timingSafeEqual(key, Buffer.alloc(key.length))
}
