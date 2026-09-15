import { MEDIA_TYPES, RESERVED_USERNAMES, toContentLanguage } from '@revy/shared/constants'
import type { UpdateProfileInput } from '@revy/shared/schemas'
import type { EarnedBadge, MediaType, User, UserProfile, UserSummary } from '@revy/shared/types'
import { errors, normalizeUsername } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toUserSummary } from '../mappers'
import { gamificationRepository, userRepository } from '../repositories'
import { friendshipService } from './friendship.service'
import { xpService } from './xp.service'

/** The user domain: profiles, registration linkage and search (SPEC 6, 22). */
export const userService = {
  /**
   * Creates the domain user for a freshly registered auth account (SPEC 26).
   *
   * Called by the auth layer after Better Auth has created its own record.
   * Username uniqueness is checked here *and* enforced by a unique index, so a
   * race between two signups fails at the database rather than producing two
   * users who both think they own the name.
   */
  async createForAuthUser(
    ctx: ServiceContext,
    params: { authUserId: string; username: string; displayName: string; language?: string },
  ): Promise<User> {
    if (RESERVED_USERNAMES.includes(normalizeUsername(params.username))) {
      throw errors.notFound('USERNAME_RESERVED', 'That username is not available.')
    }

    if (await userRepository.usernameExists(ctx.db, params.username)) {
      throw errors.notFound('USERNAME_TAKEN', 'That username is already taken.')
    }

    const row = await userRepository.create(ctx.db, {
      authUserId: params.authUserId,
      username: params.username,
      displayName: params.displayName,
      // Narrowed rather than trusted, and defaulted when absent: the column is
      // not nullable, because "we never asked" is not a language.
      language: toContentLanguage(params.language),
    })

    return toUser(row)
  },

  async getById(ctx: ServiceContext, userId: string): Promise<User> {
    const row = await userRepository.findById(ctx.db, userId)
    if (!row) throw errors.userNotFound()
    return toUser(row)
  },

  async getByAuthUserId(ctx: ServiceContext, authUserId: string): Promise<User | null> {
    const row = await userRepository.findByAuthUserId(ctx.db, authUserId)
    return row ? toUser(row) : null
  },

  /** The profile screen payload (SPEC 22). */
  async getProfileByUsername(ctx: ServiceContext, username: string): Promise<UserProfile> {
    const row = await userRepository.findByUsername(ctx.db, username)
    if (!row) throw errors.userNotFound()
    return buildProfile(ctx, row)
  },

  async getProfileById(ctx: ServiceContext, userId: string): Promise<UserProfile> {
    const row = await userRepository.findById(ctx.db, userId)
    if (!row) throw errors.userNotFound()
    return buildProfile(ctx, row)
  },

  /** Edits the viewer's own profile. Ownership is implicit (SPEC 27). */
  async updateProfile(ctx: ServiceContext, input: UpdateProfileInput): Promise<User> {
    const auth = requireViewer(ctx)

    const row = await userRepository.update(auth.db, auth.viewerId, {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    })
    if (!row) throw errors.userNotFound()

    return toUser(row)
  },

  async search(ctx: ServiceContext, query: string, limit: number): Promise<UserSummary[]> {
    const trimmed = query.trim()
    if (trimmed.length === 0) return []
    const rows = await userRepository.search(ctx.db, trimmed, limit)
    return rows.map(toUserSummary)
  },

  async isUsernameAvailable(ctx: ServiceContext, username: string): Promise<boolean> {
    if (RESERVED_USERNAMES.includes(normalizeUsername(username))) return false
    return !(await userRepository.usernameExists(ctx.db, username))
  },

  /** 'Currently watching / reading' for the profile (SPEC 22). */
  async getCurrentlyConsuming(ctx: ServiceContext, userId: string, limit = 5) {
    const rows = await userRepository.getCurrentlyConsuming(ctx.db, userId, limit)
    return rows.map((row) => ({
      status: row.userMedia.status,
      media: row.media,
      progress: row.userMedia.progress,
      updatedAt: row.userMedia.updatedAt.toISOString(),
    }))
  },
}

async function buildProfile(
  ctx: ServiceContext,
  row: Awaited<ReturnType<typeof userRepository.findById>> & object,
): Promise<UserProfile> {
  const [stats, byType, xp, friendship, earned] = await Promise.all([
    userRepository.getStats(ctx.db, row.id),
    userRepository.getRatingsByType(ctx.db, row.id),
    xpService.getForUser(ctx.db, row.id),
    friendshipService.getState(ctx, row.id),
    gamificationRepository.listEarned(ctx.db, row.id),
  ])

  /*
   * Rarest first, then most recent.
   *
   * The repository returns newest-first, which is the wrong order for a
   * trophy cabinet: the thing somebody wants at the top is the hardest one
   * they hold, not the one they happened to trip over this morning. Sorting
   * here rather than in SQL keeps `listEarned` general -- the progress screen
   * wants chronological.
   */
  const badges: EarnedBadge[] = earned
    .map((entry) => ({
      id: entry.badge.id,
      slug: entry.badge.slug,
      name: entry.badge.name,
      description: entry.badge.description,
      icon: entry.badge.icon,
      tier: entry.badge.tier,
      earnedAt: entry.earnedAt.toISOString(),
    }))
    .sort((a, b) => b.tier - a.tier || b.earnedAt.localeCompare(a.earnedAt))

  // Every media type appears, so the profile breakdown does not shift layout
  // depending on what the user happens to have rated.
  const ratingsByType = Object.fromEntries(
    MEDIA_TYPES.map((type) => [type, 0]),
  ) as Record<MediaType, number>
  for (const entry of byType) ratingsByType[entry.mediaType] = entry.total

  return {
    ...toUser(row),
    stats: { ...stats, ratingsByType },
    friendship,
    isSelf: ctx.viewerId === row.id,
    xp,
    badges,
    // The first is the rarest, by the sort above.
    title: badges[0] ?? null,
  }
}

function toUser(row: {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  language: string
  titleBadgeSlug: string | null
  createdAt: Date
}): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    titleSlug: row.titleBadgeSlug,
    bio: row.bio,
    language: row.language,
    createdAt: row.createdAt.toISOString(),
  }
}
