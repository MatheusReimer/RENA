import { createTmdbProvider, localiseMedia } from '@revy/core'
import { describe, expect, it, vi } from 'vitest'

/**
 * Catalogue localisation.
 *
 * Two things worth pinning down, both of which fail silently if wrong.
 *
 * The TMDB locale mapping, because our locales and TMDB's are not the same
 * shape -- theirs carry a country and ours mostly do not, and picking the
 * wrong region gives a real title for the wrong country rather than an error.
 *
 * And the payload walk, because its failure mode is "some screens translate
 * and some do not": too narrow a shape test leaves English on one card type,
 * too broad a one rewrites a field that happens to be called `title` on
 * something that is not a media item at all.
 */

function stub(payload: unknown) {
  return (async () =>
    ({ ok: true, status: 200, json: async () => payload }) as Response) as unknown as typeof fetch
}

const TRANSLATIONS = {
  translations: [
    { iso_639_1: 'en', iso_3166_1: 'US', data: { title: 'The Dark Knight', overview: 'Batman…' } },
    { iso_639_1: 'pt', iso_3166_1: 'BR', data: { title: 'Batman: O Cavaleiro das Trevas', overview: 'Após dois anos…' } },
    { iso_639_1: 'es', iso_3166_1: 'ES', data: { title: 'El caballero oscuro', overview: 'Batman regresa…' } },
    { iso_639_1: 'es', iso_3166_1: 'MX', data: { title: 'Batman: El caballero de la noche', overview: 'Cuando…' } },
  ],
}

describe('tmdb translations', () => {
  it('maps pt-BR straight across', async () => {
    const provider = createTmdbProvider({ apiKey: 'a'.repeat(32), fetchImpl: stub(TRANSLATIONS) })
    const out = await provider.getTranslations!('155', 'movie')

    expect(out).toContainEqual({
      language: 'pt-BR',
      title: 'Batman: O Cavaleiro das Trevas',
      description: 'Após dois anos…',
    })
  })

  /*
   * The decision this test exists to hold. TMDB has two Spanishes and they are
   * different films by name; `es` unqualified conventionally means the
   * peninsular one, and silently serving the Mexican title to everyone who
   * picked "Español" would be wrong in a way nobody would report as a bug.
   */
  it('prefers peninsular Spanish over Latin American for a bare `es`', async () => {
    const provider = createTmdbProvider({ apiKey: 'a'.repeat(32), fetchImpl: stub(TRANSLATIONS) })
    const out = await provider.getTranslations!('155', 'movie')

    const spanish = out.filter((entry) => entry.language === 'es')
    expect(spanish).toHaveLength(1)
    expect(spanish[0]?.title).toBe('El caballero oscuro')
  })

  it('falls back to another region when the preferred one is absent', async () => {
    const provider = createTmdbProvider({
      apiKey: 'a'.repeat(32),
      fetchImpl: stub({
        translations: [
          { iso_639_1: 'es', iso_3166_1: 'MX', data: { title: 'Solo el mexicano', overview: 'x' } },
        ],
      }),
    })

    expect((await provider.getTranslations!('1', 'movie'))[0]).toMatchObject({
      language: 'es',
      title: 'Solo el mexicano',
    })
  })

  it('reads a series title from `name`', async () => {
    const provider = createTmdbProvider({
      apiKey: 'a'.repeat(32),
      fetchImpl: stub({
        translations: [{ iso_639_1: 'pt', iso_3166_1: 'BR', data: { name: 'Ruptura', overview: 'x' } }],
      }),
    })

    expect((await provider.getTranslations!('1', 'series'))[0]?.title).toBe('Ruptura')
  })

  /* TMDB lists every locale it knows, most of them empty. An entry with no
     text is not a translation and must not create a row that overrides a good
     English title with nothing. */
  it('drops a locale TMDB lists but has not filled in', async () => {
    const provider = createTmdbProvider({
      apiKey: 'a'.repeat(32),
      fetchImpl: stub({
        translations: [{ iso_639_1: 'pt', iso_3166_1: 'BR', data: { title: '', overview: '' } }],
      }),
    })

    expect(await provider.getTranslations!('1', 'movie')).toEqual([])
  })

  it('returns nothing for a type TMDB does not serve', async () => {
    const provider = createTmdbProvider({ apiKey: 'a'.repeat(32), fetchImpl: stub(TRANSLATIONS) })
    expect(await provider.getTranslations!('OL1W', 'book')).toEqual([])
  })
})

describe('localiseMedia', () => {
  function withRows(rows: Array<{ mediaId: string; title: string | null; description: string | null }>) {
    // The repository is one indexed select; stubbing the executor is enough.
    return {
      select: () => ({
        from: () => ({ where: async () => rows }),
      }),
    } as never
  }

  it('does nothing at all for English', async () => {
    const payload = { media: { id: 'a', mediaType: 'movie', title: 'The Dark Knight' } }
    const select = vi.fn()

    const out = await localiseMedia({ select } as never, 'en', payload)

    expect(select).not.toHaveBeenCalled()
    expect(out.media.title).toBe('The Dark Knight')
  })

  it('replaces the title and description on a nested media object', async () => {
    const payload = {
      sections: [
        { items: [{ media: { id: 'a', mediaType: 'movie', title: 'The Dark Knight', description: 'Batman…' } }] },
      ],
    }

    await localiseMedia(
      withRows([{ mediaId: 'a', title: 'Batman: O Cavaleiro das Trevas', description: 'Após…' }]),
      'pt-BR',
      payload,
    )

    expect(payload.sections[0]!.items[0]!.media).toMatchObject({
      title: 'Batman: O Cavaleiro das Trevas',
      description: 'Após…',
    })
  })

  /* Feed and review cards flatten the media onto themselves. Missing this
     shape is how half the screens stay English. */
  it('handles the flattened `mediaTitle` shape', async () => {
    const payload = { reviews: [{ mediaId: 'a', mediaType: 'series', mediaTitle: 'Severance' }] }

    await localiseMedia(withRows([{ mediaId: 'a', title: 'Ruptura', description: null }]), 'pt-BR', payload)

    expect(payload.reviews[0]!.mediaTitle).toBe('Ruptura')
  })

  it('keeps the stored title when the translation has none', async () => {
    const payload = { media: { id: 'a', mediaType: 'movie', title: 'Dune', description: 'Paul…' } }

    await localiseMedia(withRows([{ mediaId: 'a', title: null, description: 'Paulo…' }]), 'pt-BR', payload)

    // Films that keep their original name abroad are stored as an absent
    // title, not as a copy -- falling through is correct, not a gap.
    expect(payload.media.title).toBe('Dune')
    expect(payload.media.description).toBe('Paulo…')
  })

  it('leaves objects that merely have a title alone', async () => {
    const payload = {
      list: { id: 'a', title: 'My watchlist' },
      thread: { id: 'b', title: 'About the ending' },
    }

    await localiseMedia(withRows([{ mediaId: 'a', title: 'NOPE', description: null }]), 'pt-BR', payload)

    expect(payload.list.title).toBe('My watchlist')
    expect(payload.thread.title).toBe('About the ending')
  })

  it('survives a cycle rather than hanging', async () => {
    const node: Record<string, unknown> = { id: 'a', mediaType: 'movie', title: 'Dune' }
    node.self = node

    await expect(
      localiseMedia(withRows([{ mediaId: 'a', title: 'Duna', description: null }]), 'pt-BR', node),
    ).resolves.toBeDefined()

    expect(node.title).toBe('Duna')
  })
})
