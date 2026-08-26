// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it, vi } from 'vitest'
import {
  adoptedList,
  ambiguousListNames,
  defaultListHref,
  reorderLists,
  importLegacyViews,
  isDirty,
  listCount,
  listHref,
  listNameKey,
  listQuery,
  manualListInParams,
  matchList,
  splitLists,
  normaliseParams,
  viewIsCurrent,
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
  owner_user_id: 'u1',
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

describe('whether a row is the one on screen', () => {
  const smart = list({ id: 's', filter: { query: 'tag=manga' } })
  const manual = list({ id: 'm', kind: 'manual', filter: null })

  it('matches a smart view against the filter, not the path', () => {
    expect(viewIsCurrent(smart, '/books', '?tag=manga', null)).toBe(true)
    expect(viewIsCurrent(smart, '/books', '?tag=comedy', null)).toBe(false)
  })

  it('matches a manual view by the id the page names', () => {
    // It has no filter, so the filter can never say it is open.
    expect(viewIsCurrent(manual, '/books', '', 'm')).toBe(true)
    expect(viewIsCurrent(manual, '/books', '', 'other')).toBe(false)
  })

  it('is never current away from the books page', () => {
    expect(viewIsCurrent(smart, '/authors', '?tag=manga', null)).toBe(false)
  })
})

describe('splitting the rail', () => {
  it('sends a view shared with a library to its own section', () => {
    const { mine, shared } = splitLists([
      list({ id: 'a', visibility: 'private' }),
      list({ id: 'b', visibility: 'library', shared_library_id: 'lib' }),
    ])
    expect(mine.map(l => l.id)).toEqual(['a'])
    expect(shared.map(l => l.id)).toEqual(['b'])
  })

  it('puts a view you shared yourself in the shared section', () => {
    // Where it lives, not who made it: its ordering and its deletion behave the
    // shared way whoever owns it.
    const { mine, shared } = splitLists([
      list({ id: 'b', owner_user_id: 'me', visibility: 'library', shared_library_id: 'lib' }),
    ])
    expect(mine).toEqual([])
    expect(shared.map(l => l.id)).toEqual(['b'])
  })

  it('leaves the hidden default out of both', () => {
    const { mine, shared } = splitLists([list({ id: 'd', hidden: true })])
    expect(mine).toEqual([])
    expect(shared).toEqual([])
  })
})

describe('a manual view, which the URL names outright', () => {
  const fiction = list({ id: 'f1', name: 'Fiction', kind: 'manual', filter: null, layout: 'grid' })

  it('is found by the shelf parameter, which matchList cannot do', () => {
    // matchList compares filters and a manual view has none, so opening a
    // shared one fell through to the default: the bar then offered to save
    // that view's id over the filter Books opens on, and its menu offered to
    // delete the default.
    expect(manualListInParams([fiction], 'shelf=f1')?.id).toBe('f1')
  })

  it('is not found when the filter names something else', () => {
    expect(manualListInParams([fiction], 'tag=manga')).toBeNull()
    expect(manualListInParams([fiction], '')).toBeNull()
  })

  it('does not claim a smart view that happens to be filtered to it', () => {
    const smart = list({ id: 'f1', kind: 'smart', filter: { query: 'shelf=f1' } })
    expect(manualListInParams([smart], 'shelf=f1')).toBeNull()
  })

  it('is never modified by the filter on screen', () => {
    // Its membership is not a filter, so nothing on screen can drift from it,
    // and the server refuses a filter written onto one anyway.
    expect(isDirty(fiction, 'shelf=f1')).toBe(false)
    expect(isDirty(fiction, 'shelf=f1&tag=manga')).toBe(false)
  })

  it('is modified by its layout, which is the one thing it can save', () => {
    expect(isDirty(fiction, 'shelf=f1', 'list')).toBe(true)
    expect(isDirty(fiction, 'shelf=f1', 'grid')).toBe(false)
  })
})

describe('which list stays open', () => {
  const bleach = list({ id: 'bleach', filter: { query: 'q=bleach' } })
  const dflt = list({ id: 'd', builtin_key: 'default', filter: { query: '' } })

  it('keeps the open list when an edit makes the filter match another', () => {
    // Clearing the search on Bleach leaves the default's empty filter. Adopting
    // the match here is how Bleach became uneditable: the first change to it
    // switched the page to the default and Save changes pointed elsewhere.
    expect(adoptedList(dflt, 'bleach', true)).toBe('bleach')
  })

  it('adopts the match when the reader navigated to it', () => {
    expect(adoptedList(dflt, 'bleach', false)).toBe('d')
  })

  it('keeps the open list when an edit matches nothing', () => {
    expect(adoptedList(null, 'bleach', true)).toBe('bleach')
  })

  it('keeps it when a navigation matches nothing either', () => {
    // Drilling into a series is a navigation to a filter no list stands for.
    // Forgetting the list there would leave the edit with nowhere to save to.
    expect(adoptedList(null, 'bleach', false)).toBe('bleach')
  })

  it('adopts on a first arrival, when nothing was open', () => {
    expect(adoptedList(bleach, null, false)).toBe('bleach')
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

describe('reordering', () => {
  const rail = () => [
    list({ id: 'a', name: 'A', display_order: 0 }),
    list({ id: 'b', name: 'B', display_order: 1 }),
    list({ id: 'c', name: 'C', display_order: 2 }),
  ]

  const order = (ls: ReturnType<typeof rail>) =>
    visibleLists(ls).map(l => l.id).join('')

  it('moves a row down', () => {
    expect(order(reorderLists(rail(), 'a', 'c'))).toBe('bca')
  })

  it('moves a row up', () => {
    expect(order(reorderLists(rail(), 'c', 'a'))).toBe('cab')
  })

  it('renumbers from zero rather than nudging one row', () => {
    // Positions arrive from a seed that gave several lists the same number, so
    // moving one and leaving the rest would order the ties by name and shuffle
    // rows nobody touched.
    const tied = [
      list({ id: 'a', name: 'A', display_order: 0 }),
      list({ id: 'b', name: 'B', display_order: 0 }),
      list({ id: 'c', name: 'C', display_order: 0 }),
    ]
    const after = reorderLists(tied, 'c', 'a')
    expect(after.map(l => l.display_order).sort()).toEqual([0, 1, 2])
    expect(order(after)).toBe('cab')
  })

  it('leaves everything alone when the row lands where it started', () => {
    const before = rail()
    expect(reorderLists(before, 'b', 'b')).toBe(before)
  })

  it('ignores a row that is not in the rail', () => {
    const before = rail()
    expect(reorderLists(before, 'ghost', 'a')).toBe(before)
  })

  it('does not move the hidden default, which has no position in the rail', () => {
    const withDefault = [
      list({ id: 'd', name: 'Default', builtin_key: 'default', hidden: true, display_order: 0 }),
      list({ id: 'a', name: 'A', display_order: 1 }),
      list({ id: 'b', name: 'B', display_order: 2 }),
    ]
    const after = reorderLists(withDefault, 'b', 'a')
    expect(after.find(l => l.id === 'd')?.display_order).toBe(0)
    expect(order(after)).toBe('ba')
  })
})
