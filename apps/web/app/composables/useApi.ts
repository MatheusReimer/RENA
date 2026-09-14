import type {
  Activity,
  ApiErrorBody,
  ApiErrorCode,
  CommunityDetail,
  CommunitySummary,
  DiscoverSection,
  DiscussionComment,
  DiscussionCommentNode,
  DiscussionThread,
  FriendRequest,
  HomeWall,
  ListSummary,
  Media,
  MediaDetail,
  MediaList,
  MediaSearchResult,
  MediaStatus,
  Notification,
  Paginated,
  Rating,
  Review,
  UserProfile,
  UserSummary,
} from '@revy/shared/types'
import type {
  AddListItemInput,
  CreateCommentInput,
  CreateListInput,
  CreateReviewInput,
  CreateThreadInput,
  FeedQueryInput,
  NotificationQueryInput,
  UpdateListInput,
  UpdateProfileInput,
} from '@revy/shared/schemas'

/**
 * The API client (SPEC 33).
 *
 * SPEC 33 forbids scattering `$fetch` calls through components. Everything
 * goes through this one typed surface, which means a route change or an error
 * convention change is edited in one file, and every call site gets the
 * response type for free.
 */

/** A failed request, carrying the machine-readable code from SPEC 35. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** True when the failure is the user needing to sign in. */
  get isUnauthenticated(): boolean {
    return this.code === 'UNAUTHENTICATED' || this.code === 'SESSION_EXPIRED'
  }
}

/**
 * Normalises anything `$fetch` throws into an `ApiError`.
 *
 * Components should never have to reason about FetchError shapes, and a
 * network failure should present the same way as a server-side one.
 */
function toApiError(error: unknown): ApiError {
  const response = (error as { response?: { status?: number }; data?: ApiErrorBody })?.data
  const status = (error as { response?: { status?: number } })?.response?.status ?? 0

  if (response?.error?.code) {
    return new ApiError(response.error.code, response.error.message, status, response.error.fields)
  }

  if (status === 0) {
    return new ApiError(
      'INTERNAL_ERROR',
      'Could not reach the server. Check your connection.',
      0,
    )
  }

  return new ApiError('INTERNAL_ERROR', 'Something went wrong. Please try again.', status)
}

/**
 * Picks the fetch implementation for the current environment.
 *
 * During SSR the server calls its own API over HTTP, and plain `$fetch` sends
 * no cookies -- so the session would look signed out on the server and hydrate
 * into a signed-out UI even for a signed-in user. `useRequestFetch` forwards
 * the incoming request's headers, which is what makes SSR see the real session.
 *
 * It needs a Nuxt instance, so it is resolved once when `useApi()` is called
 * (in setup) rather than inside each request, and falls back to `$fetch` if
 * called from somewhere without context.
 */
/**
 * A deliberately untyped view of `$fetch`.
 *
 * `$fetch`'s own signature infers a response type by matching the URL against
 * a literal union of every registered Nitro route. That inference is recursive
 * and its cost grows with the route count -- past a few dozen routes it
 * exceeds TypeScript's recursion limit and fails with TS2321, in a wrapper
 * that passes a runtime string and therefore cannot benefit from it anyway.
 *
 * Narrowing the parameter to `string` stops the route matching. The response
 * type is not lost: every method below declares it explicitly, which is the
 * contract this module exists to provide.
 */
type UrlFetch = (url: string, options?: Record<string, unknown>) => Promise<unknown>

function resolveFetcher(): UrlFetch {
  if (import.meta.client) return $fetch as unknown as UrlFetch
  try {
    return useRequestFetch() as unknown as UrlFetch
  } catch {
    return $fetch as unknown as UrlFetch
  }
}

function createRequest(fetcher: UrlFetch) {
  return async function request<T>(
    path: string,
    options: Record<string, unknown> = {},
  ): Promise<T> {
    // On web `apiBase` is empty and the path stays relative. In the Capacitor
    // build it is the deployed origin, because the WebView's own origin
    // (capacitor://localhost) has no API behind it.
    const base = useRuntimeConfig().public.apiBase
    const url = base ? `${base}${path}` : path

    try {
      return (await fetcher(url, {
        ...options,
        // Sessions are cookie-based, and a cross-origin native request drops
        // cookies unless credentials are sent explicitly.
        credentials: 'include',
      })) as T
    } catch (error) {
      throw toApiError(error)
    }
  }
}

export function useApi() {
  const request = createRequest(resolveFetcher())

  return {
    /* -------------------------------------------------------------- *
     * Session (SPEC 26)
     * -------------------------------------------------------------- */
    auth: {
      me: () =>
        request<{ user: UserProfile | null; unreadNotifications: number }>('/api/me'),

      register: (body: {
        email: string
        password: string
        username: string
        displayName: string
      }) => request<{ user: UserProfile }>('/api/auth/register', { method: 'POST', body }),

      signIn: (body: { email: string; password: string }) =>
        request<unknown>('/api/auth/sign-in/email', { method: 'POST', body }),

      signOut: () => request<unknown>('/api/auth/sign-out', { method: 'POST' }),

      currently: () =>
        request<{
          currently: Array<{ status: MediaStatus; media: Media; updatedAt: string }>
        }>('/api/me/currently'),

      checkUsername: (username: string) =>
        request<{ available: boolean }>('/api/users/check-username', {
          query: { username },
        }),
    },

    /* -------------------------------------------------------------- *
     * Media (SPEC 19, 20)
     * -------------------------------------------------------------- */
    media: {
      search: (q: string, type?: string) =>
        request<{ media: MediaSearchResult[]; people: UserSummary[] }>('/api/media/search', {
          query: { q, ...(type ? { type } : {}) },
        }),

      getById: (id: string) => request<{ media: MediaDetail }>(`/api/media/${id}`),

      /** Turns a provider-only search result into a local media row. */
      resolve: (externalId: string, mediaType: string) =>
        request<{ media: Media }>('/api/media/resolve', {
          method: 'POST',
          body: { externalId, mediaType },
        }),

      reviews: (id: string, cursor?: string | null) =>
        request<Paginated<Review>>(`/api/media/${id}/reviews`, {
          query: cursor ? { cursor } : {},
        }),

      discussions: (id: string, cursor?: string | null) =>
        request<Paginated<DiscussionThread>>(`/api/media/${id}/discussions`, {
          query: cursor ? { cursor } : {},
        }),
    },

    /* -------------------------------------------------------------- *
     * Discussions (SPEC 14)
     * -------------------------------------------------------------- */
    discussions: {
      create: (body: CreateThreadInput) =>
        request<{ thread: DiscussionThread }>('/api/discussions', { method: 'POST', body }),

      get: (id: string) =>
        request<{
          thread: DiscussionThread
          media: Media
          comments: DiscussionCommentNode[]
        }>(`/api/discussions/${id}`),

      remove: (id: string) =>
        request<{ ok: true }>(`/api/discussions/${id}`, { method: 'DELETE' }),

      comment: (threadId: string, body: CreateCommentInput) =>
        request<{ comment: DiscussionComment }>(`/api/discussions/${threadId}/comments`, {
          method: 'POST',
          body,
        }),

      removeComment: (commentId: string) =>
        request<{ ok: true }>(`/api/comments/${commentId}`, { method: 'DELETE' }),
    },

    /* -------------------------------------------------------------- *
     * Ratings and status (SPEC 9, 10)
     * -------------------------------------------------------------- */
    ratings: {
      upsert: (mediaId: string, score: number) =>
        request<{ rating: Rating }>('/api/ratings', {
          method: 'POST',
          body: { mediaId, score },
        }),

      remove: (mediaId: string) =>
        request<{ ok: true }>('/api/ratings', { method: 'DELETE', query: { mediaId } }),

      setStatus: (mediaId: string, status: MediaStatus | null, progress?: number | null) =>
        request<{ ok: true }>('/api/status', {
          method: 'POST',
          body: { mediaId, status, ...(progress !== undefined ? { progress } : {}) },
        }),
    },

    /* -------------------------------------------------------------- *
     * Reviews (SPEC 11)
     * -------------------------------------------------------------- */
    reviews: {
      create: (body: CreateReviewInput) =>
        request<{ review: Review }>('/api/reviews', { method: 'POST', body }),

      update: (id: string, body: Record<string, unknown>) =>
        request<{ review: Review }>(`/api/reviews/${id}`, { method: 'PATCH', body }),

      remove: (id: string) =>
        request<{ ok: true }>(`/api/reviews/${id}`, { method: 'DELETE' }),

      setLiked: (id: string, liked: boolean) =>
        request<{ ok: true }>(`/api/reviews/${id}/like`, { method: 'POST', body: { liked } }),
    },

    /* -------------------------------------------------------------- *
     * Feed (SPEC 13)
     * -------------------------------------------------------------- */
    feed: {
      get: (params: Partial<FeedQueryInput> = {}) =>
        request<Paginated<Activity>>('/api/feed', { query: params }),
    },

    /* -------------------------------------------------------------- *
     * Users and friends (SPEC 12, 22)
     * -------------------------------------------------------------- */
    users: {
      profile: (username: string) =>
        request<{
          profile: UserProfile
          activity: Paginated<Activity>
          currently: Array<{ status: MediaStatus; media: Media; updatedAt: string }>
        }>(`/api/users/${encodeURIComponent(username)}`),

      updateProfile: (body: UpdateProfileInput) =>
        request<{ user: UserProfile }>('/api/users/me', { method: 'PATCH', body }),
    },

    friends: {
      list: () =>
        request<{
          friends: UserSummary[]
          incoming: FriendRequest[]
          outgoing: FriendRequest[]
        }>('/api/friends'),

      sendRequest: (userId: string) =>
        request<unknown>('/api/friends/requests', { method: 'POST', body: { userId } }),

      respond: (friendshipId: string, action: 'accept' | 'reject') =>
        request<unknown>(`/api/friends/requests/${friendshipId}`, {
          method: 'POST',
          body: { action },
        }),

      remove: (userId: string) =>
        request<{ ok: true }>(`/api/friends/${userId}`, { method: 'DELETE' }),
    },

    /* -------------------------------------------------------------- *
     * Discover (SPEC 21)
     * -------------------------------------------------------------- */
    discover: {
      sections: (type?: string) =>
        request<{ sections: DiscoverSection[] }>('/api/discover', {
          query: type ? { type } : {},
        }),

      /** Artwork and counts for the home wall. */
      wall: () => request<HomeWall>('/api/wall'),
    },

    /* -------------------------------------------------------------- *
     * Communities (SPEC 14)
     * -------------------------------------------------------------- */
    communities: {
      list: (scope: 'active' | 'joined' = 'active') =>
        request<{ communities: CommunitySummary[] }>('/api/communities', {
          query: { scope },
        }),

      get: (mediaId: string) =>
        request<{ community: CommunityDetail }>(`/api/communities/${mediaId}`),

      setMembership: (mediaId: string, joined: boolean) =>
        request<{ joined: boolean; memberCount: number }>(
          `/api/communities/${mediaId}/membership`,
          { method: 'POST', body: { joined } },
        ),
    },

    /* -------------------------------------------------------------- *
     * Lists (SPEC 15)
     * -------------------------------------------------------------- */
    lists: {
      mine: () => request<{ lists: ListSummary[] }>('/api/lists'),

      forUser: (username: string) =>
        request<{ lists: ListSummary[] }>(
          `/api/users/${encodeURIComponent(username)}/lists`,
        ),

      get: (id: string) => request<{ list: MediaList }>(`/api/lists/${id}`),

      create: (body: CreateListInput) =>
        request<{ list: ListSummary }>('/api/lists', { method: 'POST', body }),

      update: (id: string, body: UpdateListInput) =>
        request<{ list: ListSummary }>(`/api/lists/${id}`, { method: 'PATCH', body }),

      remove: (id: string) => request<{ ok: true }>(`/api/lists/${id}`, { method: 'DELETE' }),

      addItem: (id: string, body: AddListItemInput) =>
        request<{ added: boolean; itemCount: number }>(`/api/lists/${id}/items`, {
          method: 'POST',
          body,
        }),

      removeItem: (id: string, mediaId: string) =>
        request<{ removed: boolean; itemCount: number }>(
          `/api/lists/${id}/items/${mediaId}`,
          { method: 'DELETE' },
        ),

      reorder: (id: string, itemIds: string[]) =>
        request<{ ok: true }>(`/api/lists/${id}/reorder`, {
          method: 'POST',
          body: { itemIds },
        }),
    },

    /* -------------------------------------------------------------- *
     * Notifications (SPEC 23)
     * -------------------------------------------------------------- */
    notifications: {
      list: (params: Partial<NotificationQueryInput> = {}) =>
        request<Paginated<Notification>>('/api/notifications', { query: params }),

      markRead: (ids?: string[]) =>
        request<{ ok: true }>('/api/notifications', {
          method: 'POST',
          body: ids ? { ids } : {},
        }),
    },
  }
}
