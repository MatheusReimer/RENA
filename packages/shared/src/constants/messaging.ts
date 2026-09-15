/**
 * Direct messages (SPEC 12).
 *
 * Conversations are one-to-one and friends-only, which is what makes this
 * feature small: there is no stranger to filter, no request folder, and no
 * spam surface beyond what the friend graph already gates.
 *
 * SPEC 49.7 says not to build real-time chat, and this does not: messages are
 * fetched by polling, which works identically on a serverless host, a Node
 * server and inside the Capacitor WebView. The intervals below are the whole
 * of the "realtime" story, and they live here beside the other tuned numbers
 * so the client and any future native poller read the same values.
 */

/**
 * How often an open conversation asks for messages after its newest id.
 *
 * Four seconds reads as instant in a two-person conversation and costs one
 * indexed query per participant per tick. The request is a keyset lookup
 * (`created_at > cursor`), not a page fetch, so an idle thread returns an
 * empty array and touches no rows.
 */
export const MESSAGE_POLL_INTERVAL_MS = 4_000

/**
 * How often the conversation list refreshes unread counts.
 *
 * Much slower than the thread poll, because this one aggregates across every
 * conversation the viewer has and nobody is watching it closely -- it backs a
 * badge, not a conversation.
 */
export const CONVERSATION_POLL_INTERVAL_MS = 30_000

/** Messages per page when scrolling back through history. */
export const MESSAGE_PAGE_SIZE = 30

/**
 * Most messages one poll may return.
 *
 * A bound rather than a page size: the poll asks for everything since a
 * cursor, and without a ceiling a tab left open over a weekend would ask for
 * an unbounded result set on its first tick back.
 */
export const MESSAGE_POLL_MAX = 100
