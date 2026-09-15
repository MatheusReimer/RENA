import { type Executor, schema } from '@revy/db'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { CreditRole, PersonMetadata } from '@revy/shared/types'

/** A person as the import supplies them, before they have a local id. */
export interface PersonUpsert {
  provider: string
  externalId: string
  name: string
  imageUrl: string | null
  metadata: PersonMetadata
}

/** One credit, once both sides have local ids. */
export interface CreditUpsert {
  personId: string
  role: CreditRole
  character: string | null
  billing: number
}

export const peopleRepository = {
  /**
   * Upserts people and returns their local ids, keyed by `provider:externalId`.
   *
   * One statement for the whole batch rather than one per person: a film has
   * sixteen credits and the backfill walks thousands of films, so the
   * per-round-trip cost is the entire cost of the job.
   *
   * `onConflictDoUpdate` rather than `DoNothing`, because a person's photo and
   * known-for department change at the provider and a row that was written
   * once would keep whatever was true the first time we saw them. The name is
   * refreshed for the same reason -- people change them.
   */
  async upsertMany(db: Executor, entries: PersonUpsert[]): Promise<Map<string, string>> {
    if (entries.length === 0) return new Map()

    // Deduplicated because one payload can credit the same person twice --
    // a writer-director arrives as two credits and one human, and Postgres
    // rejects an INSERT that hits the same conflict target twice in a
    // statement ("cannot affect row a second time").
    const unique = new Map<string, PersonUpsert>()
    for (const entry of entries) {
      unique.set(`${entry.provider}:${entry.externalId}`, entry)
    }

    const rows = await db
      .insert(schema.people)
      .values([...unique.values()])
      .onConflictDoUpdate({
        target: [schema.people.provider, schema.people.externalId],
        set: {
          name: sql`excluded.name`,
          imageUrl: sql`excluded.image_url`,
          metadata: sql`excluded.metadata`,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: schema.people.id,
        provider: schema.people.provider,
        externalId: schema.people.externalId,
      })

    return new Map(rows.map((row) => [`${row.provider}:${row.externalId}`, row.id]))
  },

  /**
   * Replaces a title's credits wholesale.
   *
   * Delete-then-insert rather than a merge, because the provider's payload is
   * the whole truth about a title: a cast member removed upstream, or one
   * pushed past `CAST_LIMIT` by a re-ordering, has to disappear here too. A
   * merge would accumulate every person who was ever briefly credited.
   *
   * Both statements run in the caller's transaction, so a title is never
   * left with its old credits deleted and its new ones unwritten.
   */
  async replaceCredits(db: Executor, mediaId: string, credits: CreditUpsert[]): Promise<void> {
    await db.delete(schema.mediaCredits).where(eq(schema.mediaCredits.mediaId, mediaId))
    if (credits.length === 0) return

    await db
      .insert(schema.mediaCredits)
      .values(credits.map((credit) => ({ ...credit, mediaId })))
      .onConflictDoNothing()
  },

  async findById(db: Executor, personId: string) {
    const [row] = await db
      .select()
      .from(schema.people)
      .where(eq(schema.people.id, personId))
      .limit(1)

    return row ?? null
  },

  /**
   * Everything one person is credited on, with RENA's own score.
   *
   * Ordered by release date descending: a filmography reads newest first,
   * because "what have they done lately" is the question, and a person with
   * forty credits should not open on their student film.
   */
  async creditsForPerson(db: Executor, personId: string, limit: number) {
    return db
      .select({
        media: schema.media,
        role: schema.mediaCredits.role,
        character: schema.mediaCredits.character,
        // The stored aggregate is a sum and a count; the shared helper is the
        // one place that knows the half-step scores are doubled.
        ratingAverage: sql<number | null>`${schema.averageFromStats}`,
        ratingCount: sql<number>`coalesce(${schema.mediaRatingStats.ratingCount}, 0)::int`,
      })
      .from(schema.mediaCredits)
      .innerJoin(schema.media, eq(schema.media.id, schema.mediaCredits.mediaId))
      .leftJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
      .where(eq(schema.mediaCredits.personId, personId))
      .orderBy(desc(schema.media.releaseDate))
      .limit(limit)
  },

  /** The cast and crew strip on a media page, in role then billing order. */
  async creditsForMedia(db: Executor, mediaId: string, limit: number) {
    return db
      .select({
        person: schema.people,
        role: schema.mediaCredits.role,
        character: schema.mediaCredits.character,
      })
      .from(schema.mediaCredits)
      .innerJoin(schema.people, eq(schema.people.id, schema.mediaCredits.personId))
      .where(eq(schema.mediaCredits.mediaId, mediaId))
      .orderBy(asc(schema.mediaCredits.role), asc(schema.mediaCredits.billing))
      .limit(limit)
  },

  /** Which of these titles already have credits, so a backfill can skip them. */
  async mediaWithCredits(db: Executor, mediaIds: string[]): Promise<Set<string>> {
    if (mediaIds.length === 0) return new Set()

    const rows = await db
      .selectDistinct({ mediaId: schema.mediaCredits.mediaId })
      .from(schema.mediaCredits)
      .where(inArray(schema.mediaCredits.mediaId, mediaIds))

    return new Set(rows.map((row) => row.mediaId))
  },

  /** Name search, for the People tab and for linking a name to a page. */
  async searchByName(db: Executor, term: string, limit: number) {
    return db
      .select({
        person: schema.people,
        creditCount: sql<number>`count(${schema.mediaCredits.id})::int`,
      })
      .from(schema.people)
      .leftJoin(schema.mediaCredits, eq(schema.mediaCredits.personId, schema.people.id))
      .where(sql`${schema.people.name} ilike ${`%${term}%`}`)
      .groupBy(schema.people.id)
      // Most-credited first: searching "Nolan" should not open on a gaffer.
      .orderBy(desc(sql`count(${schema.mediaCredits.id})`))
      .limit(limit)
  },

  /**
   * How many *titles* a person is credited on.
   *
   * Distinct media, not rows: a writer-director has two credits on every film
   * he makes, and "46 titles" for a filmography of twenty-three is a number
   * that describes our schema rather than his career.
   */
  async creditCount(db: Executor, personId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(distinct ${schema.mediaCredits.mediaId})::int` })
      .from(schema.mediaCredits)
      .where(eq(schema.mediaCredits.personId, personId))

    return row?.total ?? 0
  },

  /** The distinct roles a person is credited in. */
  async rolesForPerson(db: Executor, personId: string): Promise<CreditRole[]> {
    const rows = await db
      .selectDistinct({ role: schema.mediaCredits.role })
      .from(schema.mediaCredits)
      .where(eq(schema.mediaCredits.personId, personId))

    return rows.map((row) => row.role)
  },

  /** Resolves a local person by provider identity, for the importer. */
  async findByExternal(db: Executor, provider: string, externalId: string) {
    const [row] = await db
      .select()
      .from(schema.people)
      .where(and(eq(schema.people.provider, provider), eq(schema.people.externalId, externalId)))
      .limit(1)

    return row ?? null
  },
}
