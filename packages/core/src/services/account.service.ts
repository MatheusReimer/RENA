import type { Executor } from '@revy/db'
import { DELETED_ACCOUNT_NAME, DELETED_ACCOUNT_PREFIX } from '@revy/shared/constants'
import { errors } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { accountRepository, userRepository } from '../repositories'

/**
 * Deleting your own account.
 *
 * Required by both stores of any app that lets people sign up, and the rule
 * they are enforcing is that leaving must be as easy as joining -- from inside
 * the app, without writing to anybody.
 *
 * What happens is not a row delete. The account is anonymised: credentials,
 * profile, library, lists, messages, friendships and everything else about the
 * person are erased, and the reviews and discussion comments they left in
 * public stay, under "Deleted account". A discussion whose opening post
 * vanished is unreadable for everyone who replied to it, and their writing is
 * not only theirs once somebody has answered it.
 *
 * Ratings stay too, unattributed. They are the numbers under every public
 * average, and removing them would silently restate scores across the
 * catalogue -- a change to what other people see, made by somebody leaving.
 */
export const accountService = {
  async deleteOwnAccount(ctx: ServiceContext): Promise<void> {
    const auth = requireViewer(ctx)

    const user = await userRepository.findById(auth.db, auth.viewerId)
    if (!user) throw errors.userNotFound()
    if (user.deletedAt) return

    /*
     * One transaction, and the order inside it matters.
     *
     * The private data goes first, then the profile is anonymised, and the
     * credential record last: it is the credential that lets somebody sign in,
     * so if anything fails the account is still whole and still reachable
     * rather than half-erased and locked.
     */
    await auth.db.transaction(async (tx) => {
      await accountRepository.erasePrivateData(tx, auth.viewerId)
      await accountRepository.anonymise(tx, auth.viewerId, {
        username: await anonymousUsername(tx),
        displayName: DELETED_ACCOUNT_NAME,
      })
      if (user.authUserId) await accountRepository.deleteAuthUser(tx, user.authUserId)
    })
  },
}

/**
 * A free username for an anonymised account.
 *
 * Random rather than sequential: `deleted-1` through `deleted-40` would
 * publish how many people have left, and the order they left in.
 *
 * Collisions are vanishingly unlikely and handled anyway, because the unique
 * index would reject one and take the whole deletion down with it.
 */
async function anonymousUsername(db: Executor): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 10)
    const candidate = `${DELETED_ACCOUNT_PREFIX}${suffix}`
    if (!(await accountRepository.usernameTaken(db, candidate))) return candidate
  }
  // Five collisions in a row is not chance; fall back to something that cannot
  // collide rather than failing the deletion.
  return `${DELETED_ACCOUNT_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
