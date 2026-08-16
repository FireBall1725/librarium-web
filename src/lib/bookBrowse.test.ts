// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import {
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

const base = (over: Partial<BrowseState> = {}): BrowseState => ({
  selection: emptySelection(),
  query: '',
  page: 1,
  ...over,
})

describe('URL round trip', () => {
  it('survives a round trip with several facets', () => {
    const state = base({
      selection: { ...emptySelection(), library: ['a', 'b'], read_status: ['read'] },
      query: 'le guin',
      page: 4,
    })
    expect(readState(writeState(state))).toEqual(state)
  })

  it('omits defaults so a plain link stays clean', () => {
    expect(writeState(base()).toString()).toBe('')
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
  it('groups values within a facet as OR and separate facets as AND', () => {
    const s = base({
      selection: { ...emptySelection(), library: ['a', 'b'], read_status: ['read'] },
    })
    const filter = JSON.parse(new URLSearchParams(toApiQuery(s, 50)).get('filter')!)
    expect(filter.groups).toHaveLength(2)
    expect(filter.groups[0]).toEqual({
      mode: 'OR',
      conditions: [
        { field: 'library', op: 'equals', value: 'a' },
        { field: 'library', op: 'equals', value: 'b' },
      ],
    })
  })

  it('sends media_type as the type field the API already understands', () => {
    const s = base({ selection: { ...emptySelection(), media_type: ['manga'] } })
    const filter = JSON.parse(new URLSearchParams(toApiQuery(s, 50)).get('filter')!)
    expect(filter.groups[0].conditions[0].field).toBe('type')
  })

  it('omits paging for the facet request, which counts the whole set', () => {
    const params = new URLSearchParams(toApiQuery(base({ page: 3 }), 50, true))
    expect(params.get('page')).toBeNull()
    expect(params.get('per_page')).toBeNull()
  })

  it('sends each dimension separately for facets, not flattened filter JSON', () => {
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

  it('sends no filter when nothing is selected', () => {
    expect(new URLSearchParams(toApiQuery(base(), 50)).get('filter')).toBeNull()
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
