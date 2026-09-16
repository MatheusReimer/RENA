/**
 * A note that the confirmation mail did not go out (SPEC 26).
 *
 * Confirming an address is a wall, so the send that puts somebody in front of
 * that wall is the send that has to work -- and it is the one send in the app
 * that is allowed to fail quietly, because throwing during registration takes
 * the sign-up down with it. That leaves a gap: the account exists, the wall is
 * up, and the only thing standing between the reader and an explanation is a
 * line in a log they cannot read.
 *
 * This closes it. `sendVerificationEmail` records the failure here, `/api/me`
 * reports it, and the wall screen says "we could not send it" instead of
 * "check your inbox" for a mail that was never sent. Resending clears it.
 *
 * Storage rather than a column, for the same reason the rate limiter and the
 * read-through cache are: it is a transient operational fact with a natural
 * expiry, not something about the account worth keeping. The trade is the one
 * `nuxt.config.ts` already documents for the other two mounts -- exact on a
 * single server, per-instance on serverless, where a warning can be missed by
 * an instance that did not handle the sign-up.
 *
 * Missing it is survivable, and that is the point of the design: the wall
 * always offers Resend, and Resend always reports the truth. The note makes
 * the common case immediate; it is not what makes the case recoverable.
 */

/** Long enough to outlive the sign-up that failed, short enough to be news. */
const TTL_SECONDS = 60 * 60 * 24

function store() {
  return useStorage('cache')
}

function key(authUserId: string): string {
  return `verify-mail-failed:${authUserId}`
}

/** Records that a confirmation mail could not be sent for this account. */
export async function recordVerificationMailFailure(authUserId: string): Promise<void> {
  try {
    await store().setItem(key(authUserId), Date.now(), { ttl: TTL_SECONDS })
  } catch {
    // A warning that cannot be stored is a warning that is not shown. It is
    // never worth failing the request it rode in on.
  }
}

/** Clears the note once a send succeeds. */
export async function clearVerificationMailFailure(authUserId: string): Promise<void> {
  try {
    await store().removeItem(key(authUserId))
  } catch {
    // As above: the worst case is a stale warning on a screen that is about
    // to be left, and the reader has already been told to check their inbox.
  }
}

/** Whether the last confirmation mail for this account failed to send. */
export async function verificationMailFailed(authUserId: string): Promise<boolean> {
  try {
    return (await store().getItem(key(authUserId))) !== null
  } catch {
    return false
  }
}
