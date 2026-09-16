import { describe, expect, it } from 'vitest'
import { VERIFY_WALL_OPEN_PATHS, VERIFY_WALL_PATH, verifyWallRedirect } from '@revy/shared/utils'

/**
 * The rule that decides whether somebody can use the product (SPEC 26).
 *
 * Confirming an address is a wall rather than a soft gate, which makes this
 * the difference between a member reaching their feed and a member reaching a
 * screen asking them to check their inbox. Both mistakes are severe and in
 * opposite directions: too strict locks out people who confirmed, too loose
 * lets an unconfirmed account roam a product where every request 403s.
 */

const VISITOR = { signedIn: false, emailVerified: false }
const UNCONFIRMED = { signedIn: true, emailVerified: false }
const MEMBER = { signedIn: true, emailVerified: true }

describe('verifyWallRedirect', () => {
  describe('an unconfirmed account', () => {
    it('is sent to the wall from an ordinary screen', () => {
      expect(verifyWallRedirect('/', UNCONFIRMED)).toBe(VERIFY_WALL_PATH)
      expect(verifyWallRedirect('/discover', UNCONFIRMED)).toBe(VERIFY_WALL_PATH)
      expect(verifyWallRedirect('/u/scahr', UNCONFIRMED)).toBe(VERIFY_WALL_PATH)
    })

    it('is left alone on the wall itself, or it would redirect forever', () => {
      expect(verifyWallRedirect(VERIFY_WALL_PATH, UNCONFIRMED)).toBeNull()
    })

    it('can still reach every credential screen', () => {
      // Signing out and starting again is the only way out for somebody who
      // typed their own address wrong, and a password reset must not require
      // the confirmation that is currently failing.
      for (const path of VERIFY_WALL_OPEN_PATHS) {
        expect(verifyWallRedirect(path, UNCONFIRMED)).toBeNull()
      }
    })

    it('does not treat a path merely ending in an open one as open', () => {
      // `/u/signin` is somebody's profile. A suffix match would have made it a
      // hole in the wall on every route that ends in one of these words.
      expect(verifyWallRedirect('/u/signin', UNCONFIRMED)).toBe(VERIFY_WALL_PATH)
      expect(verifyWallRedirect('/lists/verify-email', UNCONFIRMED)).toBe(VERIFY_WALL_PATH)
      expect(verifyWallRedirect('/pt-BR/signin', UNCONFIRMED)).toBe(VERIFY_WALL_PATH)
    })
  })

  describe('a confirmed member', () => {
    it('is never redirected away from an ordinary screen', () => {
      for (const path of ['/', '/discover', '/lists', '/u/scahr', '/messages']) {
        expect(verifyWallRedirect(path, MEMBER)).toBeNull()
      }
    })

    it('is moved off the wall rather than left on it', () => {
      // The common way to be here: they followed the link, or confirmed in
      // another tab and this one caught up on its next poll.
      expect(verifyWallRedirect(VERIFY_WALL_PATH, MEMBER)).toBe('/')
    })

    it('is still allowed on the credential screens', () => {
      // Signing out is reached from inside the app, not only from the wall.
      expect(verifyWallRedirect('/signin', MEMBER)).toBeNull()
    })
  })

  describe('a signed-out visitor', () => {
    it('browses without ever meeting the wall', () => {
      for (const path of ['/', '/discover', '/community', '/search']) {
        expect(verifyWallRedirect(path, VISITOR)).toBeNull()
      }
    })

    it('is sent to sign in if they land on the wall', () => {
      // There is no address to confirm and nothing to resend: the screen would
      // render with an empty address and a button that 401s.
      expect(verifyWallRedirect(VERIFY_WALL_PATH, VISITOR)).toBe('/signin')
    })
  })

  it('never redirects a path to itself', () => {
    const paths = ['/', '/discover', '/signin', '/signup', VERIFY_WALL_PATH, '/u/scahr']
    for (const state of [VISITOR, UNCONFIRMED, MEMBER]) {
      for (const path of paths) {
        expect(verifyWallRedirect(path, state)).not.toBe(path)
      }
    }
  })
})
