// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it, vi } from 'vitest'
import {
  ambiguousListNames,
  defaultListHref,
  importLegacyViews,
  isDirty,
  listCount,
  listHref,
  listNameKey,
  listQuery,
  matchList,
  normaliseParams,
  visibleLists,
  type LegacyStore,
  type SavedList,
} from './lists'
import type { BookFacets } from './bookBrowse'

/**
 * Seeding, permanence and the Default now live on the server, so the tests that
 * covered them moved with them (schema_tiers_live_test.go). What is still this
 * file's job is everything the client decides for itself: where a row points,
 * what number sits beside it, and whether the filter on screen has drifted from
 * the one the list stores.
 */

const list = (over: Partial<SavedList> = {}): SavedList => ({
  id: 'l1',
  name: 'Untitled',
  description: '',
  icon: '',
  color: '',
  kind: 'smart',
  filter: { query: '' },
  layout: 'list',
  display_order: 0,
  visibility: 'private',
  book_count: 0,
  ...over,
})

describe('where a row points', () => {
  it('sends a smart list to the filter it stands for', () => {
    expect(listHref(list({ filter: { query: 'status=reading' } })))
      .toBe('/books?status=reading')
  })

  it('addresses a manual list by id, since it has no filter to show', () => {
    expect(listHref(list({ id: 'abc', kind: 'manual', filter: null })))
      .toBe('/books?shelf=abc')
  })

  it('reports no query for a manual list rather than inventing one', () => {
    expect(listQuery(list({ kind: 'manual', filter: null }))).toBe('')
  })

  it('sends Books to the plain shelf until the default holds a filter', () => {
    expect(defaultListHref([list({ builtin_key: 'default', filter: { query: '' } })]))
      .toBe('/books')
  })

  it('sends Books wherever the default was saved', () => {
    expect(defaultListHref([list({ builtin_key: 'default', filter: { query: 'fav=true' } })]))
      .toBe('/books?fav=true')
  })
})

describe('dirty tracking', () => {
  it('ignores parameter order', () => {
    const l = list({ filter: { query: 'status=read&fav=true' } })
    expect(isDirty(l, 'fav=true&status=read')).toBe(false)
  })

  it('ignores the page, because paging is reading not editing', () => {
    const l = list({ filter: { query: 'status=read' } })
    expect(isDirty(l, 'status=read&page=3')).toBe(false)
  })

  it('notices a changed filter', () => {
    const l = list({ filter: { query: 'status=read' } })
    expect(isDirty(l, 'status=unread')).toBe(true)
  })

  it('notices a changed layout, since layout belongs to the list', () => {
    // Not decoration: layout is stored on the list, so flipping rows to grid is
    // an edit. Leaving it out of the comparison meant the bar never offered to
    // save it and the change could not be kept.
    const l = list({ filter: { query: 'status=read' }, layout: 'list' })
    expect(isDirty(l, 'status=read', 'grid')).toBe(true)
    expect(isDirty(l, 'status=read', 'list')).toBe(false)
  })

  it('ignores layout when the caller does not track one', () => {
    const l = list({ filter: { query: 'status=read' }, layout: 'list' })
    expect(isDirty(l, 'status=read')).toBe(false)
  })

  it('normalises to a stable spelling', () => {
    expect(normaliseParams('b=2&a=1&page=9')).toBe(normaliseParams('a=1&b=2'))
  })
})

describe('matching the filter on screen', () => {
  it('finds the smart list standing for it', () => {
    const reading = list({ id: 'r', filter: { query: 'status=reading' } })
    expect(matchList([reading], 'status=reading')?.id).toBe('r')
  })

  it('gives the tie to the list Books opens on', () => {
    // Nothing filtered, so every list holding an empty filter matches. Taking
    // the first the server returned sent Books to whichever sorted earliest.
    const mine = list({ id: 'manga', name: 'Manga', filter: { query: '' } })
    const dflt = list({ id: 'd', name: 'Default', builtin_key: 'default', filter: { query: '' } })
    expect(matchList([mine, dflt], '')?.id).toBe('d')
  })

  it('still matches an ordinary list when the filter is its own', () => {
    const mine = list({ id: 'manga', filter: { query: 'tag=manga' } })
    const dflt = list({ id: 'd', builtin_key: 'default', filter: { query: '' } })
    expect(matchList([mine, dflt], 'tag=manga')?.id).toBe('manga')
  })

  it('never matches a manual list, whose membership is not a filter', () => {
    const manual = list({ id: 'm', kind: 'manual', filter: null })
    expect(matchList([manual], '')).toBeNull()
  })
})

describe('the number beside a row', () => {
  const facets = {
    read_status: [{ value: 'read', label: 'read', count: 12 }],
    rating: [{ value: '5', label: '5', count: 3 }],
    tag: [{ value: 'signed', label: 'signed', count: 7 }],
  } as unknown as BookFacets

  it('reports a manual list from its own size, which it knows', () => {
    expect(listCount(list({ kind: 'manual', filter: null, book_count: 4 }), null)).toBe(4)
  })

  it('reads a status list out of the facet block', () => {
    expect(listCount(list({ filter: { query: 'status=read' } }), facets)).toBe(12)
  })

  it('reads a rating list, whose values are strings on the wire', () => {
    expect(listCount(list({ filter: { query: 'rating=5' } }), facets)).toBe(3)
  })

  it('ignores page, which is reading not filtering', () => {
    expect(listCount(list({ filter: { query: 'tag=signed&page=2' } }), facets)).toBe(7)
  })

  it('prefers a count asked for directly over the facet block', () => {
    // The direct count answers the whole filter; the facet block can only
    // answer one dimension of it.
    const l = list({ filter: { query: 'status=read' } })
    expect(listCount(l, facets, { 'status=read': 99 })).toBe(99)
  })

  it('answers a search list, which no facet covers', () => {
    const l = list({ filter: { query: 'q=bleach' } })
    expect(listCount(l, facets)).toBeUndefined()
    expect(listCount(l, facets, { 'q=bleach': 12 })).toBe(12)
  })

  it('declines a two-facet list rather than guessing', () => {
    expect(listCount(list({ filter: { query: 'status=read&rating=5' } }), facets)).toBeUndefined()
  })

  it('declines a multi-value facet for the same reason', () => {
    expect(listCount(list({ filter: { query: 'status=read,unread' } }), facets)).toBeUndefined()
  })

  it('counts a value absent from a loaded dimension as zero, not unknown', () => {
    // A facet block only lists values something matched, so a list whose answer
    // is zero has no row and would otherwise render no number at all.
    expect(listCount(list({ filter: { query: 'status=unread' } }), facets)).toBe(0)
  })
})

describe('the rail', () => {
  it('hides the list Books opens on, which is not somewhere you navigate', () => {
    const shown = visibleLists([
      list({ id: 'd', hidden: true }),
      list({ id: 'r' }),
    ])
    expect(shown.map(l => l.id)).toEqual(['r'])
  })

  it('orders by display order, then by name', () => {
    const shown = visibleLists([
      list({ id: 'b', name: 'Beta', display_order: 1 }),
      list({ id: 'a', name: 'Alpha', display_order: 1 }),
      list({ id: 'z', name: 'Zed', display_order: 0 }),
    ])
    expect(shown.map(l => l.id)).toEqual(['z', 'a', 'b'])
  })

  it('qualifies only the names more than one list uses', () => {
    const names = ambiguousListNames([
      list({ id: '1', name: 'Favourites' }),
      list({ id: '2', name: ' favourites ' }),
      list({ id: '3', name: 'Signed' }),
    ])
    // Folded and trimmed, so two spellings count as the clash they look like.
    expect(names.has(listNameKey('Favourites'))).toBe(true)
    expect(names.has(listNameKey('Signed'))).toBe(false)
  })
})

describe('importing views saved in this browser', () => {
  /** An in-memory stand-in, so the test needs no browser and no cleanup. */
  const store = (seed?: string): LegacyStore => {
    const held = new Map<string, string>()
    if (seed !== undefined) held.set('librarium:views', seed)
    return {
      getItem: k => held.get(k) ?? null,
      setItem: (k, v) => { held.set(k, v) },
    }
  }

  it('moves a reader\'s own views to the server exactly once', async () => {
    const s = store(JSON.stringify([{ id: 'v1', name: 'Bleach', params: 'q=bleach' }]))
    const post = vi.fn().mockResolvedValue({})

    expect(await importLegacyViews(post, s)).toBe(1)
    expect(post).toHaveBeenCalledTimes(1)

    // Second run imports nothing: repeating it would give the reader a second
    // copy of every view every time the app loaded.
    expect(await importLegacyViews(post, s)).toBe(0)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('skips the built-ins, which the server seeds itself', async () => {
    const s = store(JSON.stringify([
      { id: 'favourites', name: 'Favourites', params: 'fav=true', builtIn: true },
      { id: 'mine', name: 'Mine', params: 'q=x' },
    ]))
    const post = vi.fn().mockResolvedValue({})
    expect(await importLegacyViews(post, s)).toBe(1)
    expect(post.mock.calls[0][0]).toMatchObject({ name: 'Mine' })
  })

  it('survives a corrupt store rather than taking the page down', async () => {
    const post = vi.fn().mockResolvedValue({})
    expect(await importLegacyViews(post, store('not json'))).toBe(0)
    expect(post).not.toHaveBeenCalled()
  })

  it('keeps going when one view fails to import', async () => {
    const s = store(JSON.stringify([
      { id: 'a', name: 'A', params: 'q=a' },
      { id: 'b', name: 'B', params: 'q=b' },
    ]))
    const post = vi.fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce({})
    expect(await importLegacyViews(post, s)).toBe(1)
    expect(post).toHaveBeenCalledTimes(2)
  })
})
