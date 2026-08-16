// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OWNERSHIP,
  OWNERSHIP_ANY,
  clearAll,
  emptySelection,
  pageWindow,
  readState,
  selectionCount,
  toApiQuery,
  toggle,
  writeState,
  type BrowseState,
} from './bookBrowse'

// Mirrors what readState produces for a bare URL: ownership carries its
// default, everything else is empty.
const base = (over: Partial<BrowseState> = {}): BrowseState => ({
  selection: { ...emptySelection(), ownership: [...DEFAULT_OWNERSHIP] },
  query: '',
  page: 1,
  ...over,
})

describe('URL round trip', () => {
  it('survives a round trip with several facets', () => {
    const state = base({
      selection: {
        ...emptySelection(),
        ownership: [...DEFAULT_OWNERSHIP],
        library: ['a', 'b'],
        read_status: ['read'],
      },
      query: 'le guin',
      page: 4,
    })
    expect(readState(writeState(state))).toEqual(state)
  })

  it('omits defaults so a plain link stays clean', () => {
    expect(writeState(base()).toString()).toBe('')
  })

  it('opens on the shelf when the URL says nothing about ownership', () => {
    expect(readState(new URLSearchParams('')).selection.ownership).toEqual(DEFAULT_OWNERSHIP)
  })

  it('keeps a cleared ownership filter cleared', () => {
    // Absent means the default, so clearing needs a value of its own. Written
    // as empty it would read back as absent and snap to the shelf again.
    const cleared = base({ selection: { ...emptySelection(), ownership: [] } })
    const url = writeState(cleared)
    expect(url.get('own')).toBe(OWNERSHIP_ANY)
    expect(readState(url).selection.ownership).toEqual([OWNERSHIP_ANY])
  })

  it('does not send the sentinel to the server, which has no such state', () => {
    const any = base({ selection: { ...emptySelection(), ownership: [OWNERSHIP_ANY] } })
    expect(new URLSearchParams(toApiQuery(any, 50, true)).get('own')).toBeNull()
  })

  it('sends a real ownership choice through', () => {
    const wish = base({ selection: { ...emptySelection(), ownership: ['wishlist'] } })
    expect(new URLSearchParams(toApiQuery(wish, 50, true)).get('own')).toBe('wishlist')
  })

  it('does not count the explicit any as an applied filter either', () => {
    // Taking a filter off is not applying one.
    expect(selectionCount(base({
      selection: { ...emptySelection(), ownership: [OWNERSHIP_ANY] },
    }).selection)).toBe(0)
  })

  it('does not count the default as an applied filter', () => {
    // An untouched Books page claiming "1 filter" would be a lie about state
    // the reader never set.
    expect(selectionCount(base().selection)).toBe(0)
    expect(selectionCount(base({
      selection: { ...emptySelection(), ownership: ['wishlist'] },
    }).selection)).toBe(1)
  })

  it('reads a malformed page as 1 rather than NaN', () => {
    expect(readState(new URLSearchParams('page=banana')).page).toBe(1)
    expect(readState(new URLSearchParams('page=-3')).page).toBe(1)
  })
})

describe('selection', () => {
  it('toggles a value on and off', () => {
    let s = base()
    s = toggle(s, 'genre', 'Fantasy')
    expect(s.selection.genre).toEqual(['Fantasy'])
    s = toggle(s, 'genre', 'Fantasy')
    expect(s.selection.genre).toEqual([])
  })

  it('resets to page 1, because the result set changed under the reader', () => {
    const s = toggle(base({ page: 7 }), 'tag', 'signed')
    expect(s.page).toBe(1)
  })

  it('counts across facets and clears everything', () => {
    let s = toggle(toggle(base(), 'genre', 'Fantasy'), 'tag', 'signed')
    expect(selectionCount(s.selection)).toBe(2)
    s = clearAll(s)
    expect(selectionCount(s.selection)).toBe(0)
  })
})

describe('API query', () => {
  it('sends values within a facet as one comma-separated parameter', () => {
    const s = base({
      selection: {
        ...emptySelection(),
        ownership: [...DEFAULT_OWNERSHIP],
        library: ['a', 'b'],
        read_status: ['read'],
      },
    })
    const params = new URLSearchParams(toApiQuery(s, 50))
    expect(params.get('lib')).toBe('a,b')
    expect(params.get('status')).toBe('read')
  })

  it('sends media_type under the short name the API reads', () => {
    const s = base({ selection: { ...emptySelection(), media_type: ['manga'] } })
    expect(new URLSearchParams(toApiQuery(s, 50)).get('type')).toBe('manga')
  })

  it('sends the list the same filters as the facets, not a different shape', () => {
    // The two diverging is what let status, rating and library filter the rail
    // while the list below it ignored them.
    const s = base({
      selection: { ...emptySelection(), read_status: ['reading'], rating: ['5'] },
      page: 2,
    })
    const list = new URLSearchParams(toApiQuery(s, 50))
    const facets = new URLSearchParams(toApiQuery(s, 50, true))
    for (const key of ['status', 'rating', 'lib', 'type', 'genre', 'tag']) {
      expect(list.get(key)).toBe(facets.get(key))
    }
    expect(list.get('filter')).toBeNull()
  })

  it('omits paging for the facet request, which counts the whole set', () => {
    const params = new URLSearchParams(toApiQuery(base({ page: 3 }), 50, true))
    expect(params.get('page')).toBeNull()
    expect(params.get('per_page')).toBeNull()
  })

  it('sends each dimension separately, not flattened filter JSON', () => {
    // The server counts a dimension with its own selection excluded, which it
    // can only do if the dimensions arrive apart.
    const s = base({
      selection: { ...emptySelection(), genre: ['Fantasy', 'Horror'], tag: ['signed'] },
    })
    const params = new URLSearchParams(toApiQuery(s, 50, true))
    expect(params.get('genre')).toBe('Fantasy,Horror')
    expect(params.get('tag')).toBe('signed')
    expect(params.get('filter')).toBeNull()
  })

  it('sends the ownership default even though the URL omits it', () => {
    // The default lives in the client, so the server has to be told. Without
    // this the rail would say "On the shelf" beside a list that also held
    // wishlist, suggested and missing books.
    const params = new URLSearchParams(toApiQuery(base(), 50))
    expect(params.get('own')).toBe('shelf')
    expect([...params.keys()].sort()).toEqual(['own', 'page', 'per_page'])
  })
})

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
  })

  it('keeps first and last with a gap in the middle', () => {
    expect(pageWindow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20])
  })

  it('does not open a gap for a single missing page', () => {
    // 1 … 3 would hide only page 2, so show it instead of an ellipsis.
    expect(pageWindow(4, 6)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('handles both ends without running past the bounds', () => {
    expect(pageWindow(1, 40)[0]).toBe(1)
    expect(pageWindow(40, 40).at(-1)).toBe(40)
    expect(pageWindow(1, 1)).toEqual([1])
  })
})
