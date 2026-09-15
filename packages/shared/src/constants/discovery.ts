/**
 * Described-request discovery (SPEC 40).
 *
 * The feature is a short conversation rather than a single shot: a vague
 * request gets narrowed by a question or two before it is answered, which is
 * how a person behind a counter would handle "something about World War II".
 */

/**
 * How many clarifying questions may be asked before an answer is owed.
 *
 * Three, and the ceiling is the product decision. Two questions take "a World
 * War II film" to "a heavy one, not a documentary, under two hours", which is
 * enough to answer well. A fourth stops reading as help and starts reading as
 * an interrogation -- and every question is another paid model call and
 * another ten seconds of somebody's evening.
 *
 * The reader can always cut it short: every question carries a way to skip it
 * and a way to demand the answer now.
 */
export const DISCOVERY_MAX_QUESTIONS = 3

/** Most options offered alongside a question, before the skip is added. */
export const DISCOVERY_MAX_OPTIONS = 5
