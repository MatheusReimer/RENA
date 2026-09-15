import { createMessageCipher } from '@revy/core'

/**
 * Reports the messaging configuration once, at boot (SPEC 12, 39).
 *
 * The cipher is built lazily per process, which means a bad key would
 * otherwise first show up as a failed request some time after a deploy looked
 * successful. Building it here moves both answers into the startup log, where
 * whoever ran the deploy is actually looking:
 *
 *  - a malformed key throws and the process does not start, which is right:
 *    somebody set the variable and got it wrong, and serving traffic that
 *    silently has no messaging would hide that.
 *  - a missing key in production logs a warning and leaves messaging
 *    unavailable. Deliberately not fatal -- a deployment that has not asked
 *    for this feature should not be unable to serve its home page because of
 *    it. Nothing writes a message body without a cipher, so the guarantee
 *    holds either way.
 */
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const isProduction = process.env.NODE_ENV === 'production'

  // Throws on a malformed key, which is the point: fail at boot, not on the
  // first person who tries to send something.
  const cipher = createMessageCipher({
    keyring: config.messageEncryptionKey || undefined,
    fallbackSeed: config.authSecret || undefined,
    isProduction,
  })

  if (cipher) {
    console.info(
      `[revy] messaging enabled, encrypting at rest under key version ${cipher.activeVersion}` +
        (config.messageEncryptionKey ? '' : ' (derived from AUTH_SECRET -- development only)'),
    )
    return
  }

  console.warn(
    '[revy] messaging is DISABLED: no MESSAGE_ENCRYPTION_KEY is configured.\n' +
      '       Direct messages are never stored unencrypted, so the feature is off\n' +
      '       rather than degraded. Generate a key with:\n' +
      '         node -e "console.log(\'1:\' + require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
  )
})
