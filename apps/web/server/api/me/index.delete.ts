import { accountService, userRepository } from '@revy/core'
import { deleteAccountSchema } from '@revy/shared/schemas'
import { errors } from '@revy/shared/utils'
import { useUnverifiedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/**
 * Deletes the viewer's own account.
 *
 * Required by both stores of any app that lets people sign up: leaving has to
 * be possible from inside the app, without writing to anybody.
 *
 * `useUnverifiedContext`, deliberately. Everything else refuses a session whose
 * address is unconfirmed, and this is the one thing somebody stuck behind that
 * wall must still be able to do -- somebody who signed up with a typo in their
 * address cannot confirm it, and would otherwise be left with an account they
 * can neither use nor remove.
 *
 * The username has to be typed back. It is checked here as well as in the form,
 * because a confirmation that only exists on the client is decoration.
 */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, deleteAccountSchema)
  const ctx = await useUnverifiedContext(event)

  const user = await userRepository.findById(ctx.db, ctx.viewerId)
  if (!user) throw errors.userNotFound()

  if (input.confirmUsername.trim().toLowerCase() !== user.username.toLowerCase()) {
    throw errors.validation({ confirmUsername: ['That is not your username.'] })
  }

  await accountService.deleteOwnAccount(ctx)

  /*
   * The session dies with the credential record -- `auth_session` cascades from
   * `auth_user` -- so there is no cookie to clear and nothing to sign out of.
   * The client navigates home and `/api/me` reports a visitor.
   */
  return { deleted: true }
})
