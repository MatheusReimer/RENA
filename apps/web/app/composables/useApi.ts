import { SESSION_TOKEN_HEADER, type ContentLanguage } from '@revy/shared/constants'
import type {
  Activity,
  ApiErrorBody,
  ApiErrorCode,
  CommunityDetail,
  CommunityScope,
  CommunitySummary,
  MediaEntry,
  SeedTitle,
  UserTaste,
  ConversationDetail,
  ConversationSummary,
  DiscoverSection,
  DiscoveryAnswer,
  ExploreSummary,
  DiscussionComment,
  DiscussionCommentNode,
  DiscussionThread,
  DashboardSummary,
  FriendRequest,
  HomeSummary,
  LibraryCounts,
  ListSummary,
  Media,
  MediaCredit,
  MediaDetail,
  MediaList,
  MediaSearchResult,
  MediaStatus,
  MediaType,
  Message,
  MoodRow,
  Notification,
  Paginated,
  PersonDetail,
  Presence,
  Rating,
  Review,
  ReviewTranslation,
  UserProfile,
  UserSummary,
} from '@revy/shared/types'
import type {
  AddListItemInput,
  CreateCommentInput,
  CreateListInput,
  CreateReviewInput,
  CreateThreadInput,
  DiscoveryAskBody,
  FeedQueryInput,
  MessageQueryInput,
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

  /*
   * Translated here, not at the call site.
   *
   * `ApiError.message` is rendered raw by every screen that catches one, so it
   * has to arrive as a sentence rather than a key. `$i18n` off the Nuxt app
   * rather than `useI18n()`, because this runs inside a fetch callback and not
   * in a component's setup, where the composable has no instance to bind to.
   */
  const { t } = useNuxtApp().$i18n

  if (status === 0) return new ApiError('INTERNAL_ERROR', t('errors.offline'), 0)

  return new ApiError('INTERNAL_ERROR', t('errors.generic'), status)
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
    const config = useRuntimeConfig().public
    const url = config.apiBase ? `${config.apiBase}${path}` : path

    try {
      return (await fetcher(url, {
        ...options,
        ...(config.native ? await nativeRequestOptions() : { credentials: 'include' }),
      })) as T
    } catch (error) {
      throw toApiError(error)
    }
  }
}

/**
 * How the native apps authenticate, in place of the session cookie.
 *
 * The cookie cannot work there: to the app's WebView every API response comes
 * from another site, and iOS refuses those cookies outright. So the session
 * travels as a bearer token instead. The server hands one over on sign-in and
 * sign-up, this catches it, and every later request sends it back.
 *
 * `credentials: 'omit'` rather than `include`. The server allows the app
 * origins without allowing credentials, and a WebView refuses a credentialed
 * response that does not say it was allowed.
 *
 * `Accept-Language` stands in for the `rena_locale` cookie, which the server
 * reads for catalogue text and which does not cross origins either. It is
 * read per request so a language switch applies from the next fetch.
 */
async function nativeRequestOptions(): Promise<Record<string, unknown>> {
  const token = await nativeSession.token()

  return {
    credentials: 'omit',
    headers: {
      'accept-language': useNuxtApp().$i18n.locale.value,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    async onResponse({ response }: { response: Response }) {
      const issued = response.headers.get(SESSION_TOKEN_HEADER)
      if (issued) await nativeSession.save(issued)
    },
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
        request<{
          user: UserProfile | null
          unreadNotifications: number
          unreadMessages: number
          /** False when the deployment has no message encryption key. */
          messaging: boolean
          /** False until the address is confirmed. Everything is walled until it is true. */
          emailVerified: boolean
          /** True when the confirmation mail could not be sent, so the wall can say so. */
          verificationMailFailed: boolean
          /** The viewer's own address, sent only while unconfirmed, for the wall to print. */
          email: string | null
        }>('/api/me'),

      register: (body: {
        email: string
        password: string
        username: string
        displayName: string
        language?: ContentLanguage
      }) => request<{ user: UserProfile }>('/api/auth/register', { method: 'POST', body }),

      signIn: (body: { email: string; password: string }) =>
        request<unknown>('/api/auth/sign-in/email', { method: 'POST', body }),

      /**
       * The empty body is load-bearing.
       *
       * Better Auth rejects a POST whose content type is not JSON with a 415,
       * and `ofetch` only sets `content-type: application/json` when there is
       * a body to serialise. Without `body: {}` this request never reached the
       * handler at all -- sign-out silently did nothing, the cookie stayed,
       * and the only symptom was still being signed in.
       */
      signOut: async () => {
        const result = await request<unknown>('/api/auth/sign-out', { method: 'POST', body: {} })
        // After the server has ended the session, never before -- the same
        // order the store keeps, for the same reason. A token forgotten
        // locally but alive on the server is a session nobody can end.
        if (useRuntimeConfig().public.native) await nativeSession.clear()
        return result
      },

      /**
       * Asks for a reset link.
       *
       * Resolves the same way whether or not the address has an account --
       * Better Auth answers identically by design, so this endpoint cannot be
       * used to find out who is registered (OWASP A07). The screen's copy has
       * to keep that promise too.
       */
      requestPasswordReset: (body: { email: string; redirectTo: string }) =>
        request<unknown>('/api/auth/request-password-reset', { method: 'POST', body }),

      /** Completes the reset with the token from the emailed link. */
      resetPassword: (body: { newPassword: string; token: string }) =>
        request<unknown>('/api/auth/reset-password', { method: 'POST', body }),

      /**
       * Sends the confirmation mail again, for an address that never got it.
       *
       * Takes no address: the server reads it from the session. Better Auth's
       * own `/send-verification-email` mails whoever the body names, and the
       * client would have to hold its own address to call it -- which means
       * putting one on the session payload the whole interface reads.
       */
      resendVerification: () =>
        request<{ sent: boolean }>('/api/auth/resend-verification', { method: 'POST' }),

      /**
       * The signed-in home screen. Authenticated and viewer-scoped, which is
       * why it lives apart from `home()` rather than taking a flag.
       */
      dashboard: (mediaType?: MediaType) =>
        request<DashboardSummary>('/api/me/dashboard', {
          query: mediaType ? { type: mediaType } : undefined,
        }),

      /** The sidebar's six counters, and nothing else. */
      library: () => request<LibraryCounts>('/api/me/library'),

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

      /** Who else here has been through a title. Public. */
      presence: (mediaId: string) => request<Presence>(`/api/media/${mediaId}/presence`),

      discussions: (id: string, cursor?: string | null) =>
        request<Paginated<DiscussionThread>>(`/api/media/${id}/discussions`, {
          query: cursor ? { cursor } : {},
        }),

      /** Cast and crew. Its own request: a strip below the fold. */
      credits: (id: string) => request<{ credits: MediaCredit[] }>(`/api/media/${id}/credits`),
    },

    /* -------------------------------------------------------------- *
     * People
     *
     * A facet of the catalogue rather than a community: the answer to "what
     * else has this person made", with the conversation left on the titles.
     * -------------------------------------------------------------- */
    people: {
      get: (id: string) => request<{ person: PersonDetail }>(`/api/people/${id}`),
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
    /** One person's entry on one title -- what a shared rating link opens. */
    entries: {
      get: (username: string, mediaId: string) =>
        request<{ entry: MediaEntry }>(
          `/api/users/${encodeURIComponent(username)}/entries/${mediaId}`,
        ),
    },

    /* ----------------------------------------------------------------
     * Onboarding taste (SPEC 21)
     * ---------------------------------------------------------------- */
    taste: {
      /** Null when the reader has never been asked. */
      get: () => request<{ taste: UserTaste | null }>('/api/taste'),

      save: (input: { mediaTypes: MediaType[]; moodKeys: string[]; skipped?: boolean }) =>
        request<{ taste: UserTaste }>('/api/taste', { method: 'POST', body: input }),

      /** Titles to offer for rating, for a selection not yet saved. */
      seeds: (mediaTypes: MediaType[], moodKeys: string[], limit = 24) =>
        request<{ titles: SeedTitle[] }>('/api/taste/seeds', {
          query: { mediaTypes: mediaTypes.join(','), moodKeys: moodKeys.join(','), limit },
        }),
    },

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

      /**
       * Translates one review into a language (SPEC 31).
       *
       * POST despite reading like a fetch: the first call for a given review
       * and language spends money and writes a cache row, and a GET that does
       * that is a GET something will make a thousand of.
       */
      translate: (id: string, language: ContentLanguage) =>
        request<{ translation: ReviewTranslation }>(`/api/reviews/${id}/translate`, {
          method: 'POST',
          body: { language },
        }),
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

      /** Artwork, counts and faces for the home opener. */
      home: () => request<HomeSummary>('/api/home'),

      /**
       * Describe what you're in the mood for (SPEC 40).
       *
       * Signed-in only and rate limited, unlike everything else on Discover:
       * this one spends money per call rather than reading rows.
       */
      ask: (input: DiscoveryAskBody) =>
        request<{ answer: DiscoveryAnswer }>('/api/discover/ask', {
          method: 'POST',
          body: input,
        }),
    },

    /**
     * Explore. Public, like Discover -- browsing is the one thing a visitor
     * should be able to do before signing up.
     */
    explore: {
      summary: (mediaType?: MediaType) =>
        request<ExploreSummary>('/api/explore', {
          query: mediaType ? { type: mediaType } : undefined,
        }),

      mood: (key: string) => request<MoodRow>('/api/explore/mood', { query: { key } }),

    },

    /* -------------------------------------------------------------- *
     * Communities (SPEC 14)
     * -------------------------------------------------------------- */
    communities: {
      list: (scope: CommunityScope = 'browse', page = 0, q?: string) =>
        request<{ communities: CommunitySummary[] }>('/api/communities', {
          query: { scope, page, ...(q ? { q } : {}) },
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
     * Direct messages (SPEC 12)
     *
     * Private, not end-to-end encrypted: bodies are sealed before they reach
     * the database and opened on the way out, so the server can read them and
     * a stolen dump cannot. The distinction matters in copy -- see
     * `messageCipher` -- and nothing in the UI should claim otherwise.
     * -------------------------------------------------------------- */
    conversations: {
      list: () => request<{ conversations: ConversationSummary[] }>('/api/conversations'),

      /** Opens the thread with someone, creating it the first time. */
      start: (userId: string) =>
        request<{ conversation: ConversationDetail }>('/api/conversations', {
          method: 'POST',
          body: { userId },
        }),

      get: (id: string) =>
        request<{ conversation: ConversationDetail }>(`/api/conversations/${id}`),

      /**
       * A page of a thread.
       *
       * `before` reads history backwards, `after` is the poll. Both are message
       * ids; passing both is rejected server-side rather than guessed at.
       */
      messages: (id: string, params: Partial<MessageQueryInput> = {}) =>
        request<{ messages: Message[]; hasMore: boolean }>(
          `/api/conversations/${id}/messages`,
          { query: params },
        ),

      send: (id: string, content: string) =>
        request<{ message: Message }>(`/api/conversations/${id}/messages`, {
          method: 'POST',
          body: { content },
        }),

      /**
       * Marks read up to the newest message actually on screen.
       *
       * Answers with the viewer's new unread total across every conversation,
       * which is what the shell's badge needs and what the client would
       * otherwise have to guess at.
       */
      markRead: (id: string, messageId: string) =>
        request<{ ok: true; unreadMessages: number }>(`/api/conversations/${id}/read`, {
          method: 'POST',
          body: { messageId },
        }),

      /** Hides one message from the caller's view. The other side keeps it. */
      hideMessage: (id: string, messageId: string) =>
        request<{ ok: true }>(`/api/conversations/${id}/messages/${messageId}`, {
          method: 'DELETE',
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
