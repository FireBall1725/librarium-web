// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import type { Book } from '../types'
import {
  ambiguousBooks,
  applyToEach,
  bookPatchBody,
  byLibrary,
  commonLibraries,
  deleteEach,
  fanOutByLibrary,
  singleLibrary,
} from './bookBulk'

/**
 * A stand-in for callApi.
 *
 * callApi is generic over its response type, so a plain vi.fn returning {}
 * does not satisfy it. This keeps the recording behaviour and the signature.
 */
const fakeApi = (impl: (path: string, init?: RequestInit) => Promise<unknown>) =>
  (<T,>(path: string, init?: RequestInit) => impl(path, init) as Promise<T>)

const book = (over: Partial<Book> = {}): Book => ({
  id: 'b1',
  library_id: 'lib-a',
  title: 'A Book',
  subtitle: '',
  media_type_id: 'mt-1',
  media_type: 'Novel',
  description: '',
  created_at: '',
  updated_at: '',
  contributors: [],
  tags: [],
  genres: [],
  cover_url: null,
  series: [],
  shelves: [],
  publisher: '',
  publish_year: null,
  language: '',
  ...over,
} as Book)

describe('grouping', () => {
  it('groups by the library each book will be edited through', () => {
    const groups = byLibrary([
      book({ id: '1', library_id: 'lib-a' }),
      book({ id: '2', library_id: 'lib-b' }),
      book({ id: '3', library_id: 'lib-a' }),
    ])
    expect([...groups.keys()].sort()).toEqual(['lib-a', 'lib-b'])
    expect(groups.get('lib-a')).toHaveLength(2)
  })

  it('drops floating books, which have no library to act in', () => {
    // A suggestion or wishlist entry belongs to no library, so there is no
    // route to enrich or delete it through.
    const groups = byLibrary([book({ id: '1', library_id: null })])
    expect(groups.size).toBe(0)
  })

  it('reports a single library only when there really is one', () => {
    expect(singleLibrary([book({ library_id: 'lib-a' })])).toBe('lib-a')
    expect(singleLibrary([
      book({ id: '1', library_id: 'lib-a' }),
      book({ id: '2', library_id: 'lib-b' }),
    ])).toBeNull()
    expect(singleLibrary([])).toBeNull()
  })
})

describe('bookPatchBody', () => {
  it('sends every field back, because a PUT replaces the record', () => {
    // Sending only the change would clear the title, contributors and genres.
    const body = bookPatchBody(
      book({ title: 'Kept', tags: [{ id: 't1', name: 'signed' }] } as Partial<Book>),
      { media_type_id: 'mt-2' },
    )
    expect(body).toMatchObject({ title: 'Kept', media_type_id: 'mt-2', tag_ids: ['t1'] })
  })

  it('leaves untouched fields at their current value', () => {
    const body = bookPatchBody(book({ media_type_id: 'mt-1' }), { genre_ids: ['g1'] })
    expect(body.media_type_id).toBe('mt-1')
    expect(body.genre_ids).toEqual(['g1'])
  })
})

describe('applyToEach', () => {
  it('uses each book\'s own library, not one for the whole set', () => {
    const calls: string[] = []
    const callApi = fakeApi(async path => { calls.push(path); return {} })
    return applyToEach(callApi, [
      book({ id: '1', library_id: 'lib-a' }),
      book({ id: '2', library_id: 'lib-b' }),
    ], b => bookPatchBody(b, {})).then(() => {
      expect(calls).toEqual([
        '/api/v1/libraries/lib-a/books/1',
        '/api/v1/libraries/lib-b/books/2',
      ])
    })
  })

  it('keeps going after a failure and reports the split', async () => {
    // Stopping halfway leaves the reader guessing which half happened.
    const callApi = fakeApi(async path => {
      if (path.includes('/2')) throw new Error('nope')
      return {}
    })
    const result = await applyToEach(callApi, [
      book({ id: '1' }), book({ id: '2' }), book({ id: '3' }),
    ], b => bookPatchBody(b, {}))
    expect(result).toEqual({ ok: 2, failed: 1 })
  })

  it('counts a floating book as failed rather than skipping it silently', async () => {
    let called = 0
    const callApi = fakeApi(async () => { called++; return {} })
    const result = await applyToEach(callApi, [book({ library_id: null })], b => bookPatchBody(b, {}))
    expect(result).toEqual({ ok: 0, failed: 1 })
    expect(called).toBe(0)
  })
})

describe('deleteEach', () => {
  it('deletes through each book\'s own library', async () => {
    const calls: Array<[string, string | undefined]> = []
    const callApi = fakeApi(async (path, init) => { calls.push([path, init?.method]); return {} })
    await deleteEach(callApi, [book({ id: '9', library_id: 'lib-z' })])
    expect(calls).toEqual([['/api/v1/libraries/lib-z/books/9', 'DELETE']])
  })
})

describe('fanOutByLibrary', () => {
  it('calls the endpoint once per library, with that library\'s ids', async () => {
    const seen: Array<{ path: string; ids: string[] }> = []
    const callApi = fakeApi(async (path, init) => {
      seen.push({ path, ids: JSON.parse(String(init?.body)).book_ids })
      return {}
    })
    await fanOutByLibrary(
      callApi,
      [
        book({ id: '1', library_id: 'lib-a' }),
        book({ id: '2', library_id: 'lib-b' }),
        book({ id: '3', library_id: 'lib-a' }),
      ],
      lib => `/api/v1/libraries/${lib}/books/bulk/cover`,
      ids => ({ book_ids: ids }),
    )
    expect(seen).toHaveLength(2)
    expect(seen.find(s => s.path.includes('lib-a'))?.ids).toEqual(['1', '3'])
    expect(seen.find(s => s.path.includes('lib-b'))?.ids).toEqual(['2'])
  })

  it('attributes a failed library to all of its books', async () => {
    const callApi = fakeApi(async path => {
      if (path.includes('lib-b')) throw new Error('nope')
      return {}
    })
    const result = await fanOutByLibrary(
      callApi,
      [
        book({ id: '1', library_id: 'lib-a' }),
        book({ id: '2', library_id: 'lib-b' }),
        book({ id: '3', library_id: 'lib-b' }),
      ],
      lib => `/x/${lib}`,
      ids => ({ book_ids: ids }),
    )
    expect(result).toEqual({ ok: 1, failed: 2 })
  })
})

describe('books in more than one library', () => {
  const multi = (id: string, libs: string[]) =>
    book({ id, library_id: libs[0], libraries: libs.map(l => ({ id: l, name: l })) })

  it('spots the ones that are ambiguous', () => {
    const books = [multi('1', ['lib-a']), multi('2', ['lib-a', 'lib-b'])]
    expect(ambiguousBooks(books).map(b => b.id)).toEqual(['2'])
  })

  it('offers only libraries every selected book is in', () => {
    // lib-a resolves both; lib-b resolves only the first, so offering it would
    // leave the second book wherever it happened to sort.
    const common = commonLibraries([
      multi('1', ['lib-a', 'lib-b']),
      multi('2', ['lib-a', 'lib-c']),
    ])
    expect(common.map(l => l.id)).toEqual(['lib-a'])
  })

  it('offers nothing when the selection shares no library', () => {
    const common = commonLibraries([multi('1', ['lib-a']), multi('2', ['lib-b'])])
    expect(common).toEqual([])
  })

  it('acts in the chosen library', async () => {
    const calls: string[] = []
    const callApi = fakeApi(async path => { calls.push(path); return {} })
    await applyToEach(callApi, [multi('1', ['lib-a', 'lib-b'])], b => bookPatchBody(b, {}), 'lib-b')
    expect(calls).toEqual(['/api/v1/libraries/lib-b/books/1'])
  })

  it('does not drag a book into a library it is not in', async () => {
    // The choice applies to the books it is about. An unambiguous book in
    // lib-a stays in lib-a even when the reader picked lib-b for the others.
    const calls: string[] = []
    const callApi = fakeApi(async path => { calls.push(path); return {} })
    await applyToEach(callApi, [
      multi('1', ['lib-a']),
      multi('2', ['lib-a', 'lib-b']),
    ], b => bookPatchBody(b, {}), 'lib-b')
    expect(calls).toEqual([
      '/api/v1/libraries/lib-a/books/1',
      '/api/v1/libraries/lib-b/books/2',
    ])
  })

  it('groups a fan-out by the chosen library too', () => {
    const groups = byLibrary([
      multi('1', ['lib-a', 'lib-b']),
      multi('2', ['lib-a', 'lib-b']),
    ], 'lib-b')
    expect([...groups.keys()]).toEqual(['lib-b'])
    expect(groups.get('lib-b')).toHaveLength(2)
  })
})
