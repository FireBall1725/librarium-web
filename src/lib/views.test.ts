// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { beforeEach, describe, expect, it } from 'vitest'
import {
  BUILT_IN_VIEWS,
  type ViewStore,
  deleteView,
  isDirty,
  loadViews,
  matchView,
  newViewId,
  normaliseParams,
  renameView,
  saveView,
  viewCount,
  type SavedView,
} from './views'

const view = (over: Partial<SavedView> = {}): SavedView => ({
  id: 'v1', name: 'Test', params: 'status=read', layout: 'rows', ...over,
})

// An injected store rather than the ambient one: these tests are about the
// logic, and jsdom is not currently active in this project's vitest setup.
let store: ViewStore
const fresh = (): ViewStore => {
  const map = new Map<string, string>()
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

beforeEach(() => { store = fresh() })

describe('seeding', () => {
  it('ships the built-ins on a first run', () => {
    expect(loadViews(store)).toHaveLength(BUILT_IN_VIEWS.length)
  })

  it('does not resurrect built-ins the user deleted', () => {
    loadViews(store)
    BUILT_IN_VIEWS.forEach(v => deleteView(v.id, store))
    expect(loadViews(store)).toEqual([])
  })

  it('survives a corrupt entry rather than taking the page down', () => {
    store.setItem('librarium:views', '{not json')
    store.setItem('librarium:views_seeded', '1')
    expect(loadViews(store)).toEqual([])
  })

  it('drops entries that are not views', () => {
    store.setItem('librarium:views_seeded', '1')
    store.setItem('librarium:views', JSON.stringify([view(), { nope: true }, null]))
    expect(loadViews(store)).toHaveLength(1)
  })
})

describe('crud', () => {
  beforeEach(() => { store.setItem('librarium:views_seeded', '1') })

  it('adds, updates in place, and deletes', () => {
    saveView(view(), store)
    expect(loadViews(store)).toHaveLength(1)

    saveView(view({ name: 'Renamed' }), store)
    expect(loadViews(store)).toHaveLength(1)
    expect(loadViews(store)[0].name).toBe('Renamed')

    deleteView('v1', store)
    expect(loadViews(store)).toEqual([])
  })

  it('renames without disturbing the filter', () => {
    saveView(view(), store)
    renameView('v1', 'Something else', store)
    expect(loadViews(store)[0]).toMatchObject({ name: 'Something else', params: 'status=read' })
  })

  it('mints unique ids', () => {
    expect(new Set(Array.from({ length: 50 }, newViewId)).size).toBe(50)
  })
})

describe('dirty tracking', () => {
  it('ignores parameter order', () => {
    expect(normaliseParams('tag=signed&status=read')).toBe(normaliseParams('status=read&tag=signed'))
    expect(isDirty(view({ params: 'status=read&tag=signed' }), 'tag=signed&status=read', 'rows')).toBe(false)
  })

  it('ignores the page, because paging is reading not editing', () => {
    expect(isDirty(view(), 'status=read&page=4', 'rows')).toBe(false)
  })

  it('notices a changed filter', () => {
    expect(isDirty(view(), 'status=unread', 'rows')).toBe(true)
  })

  it('notices a changed layout, since layout belongs to the view', () => {
    expect(isDirty(view(), 'status=read', 'grid')).toBe(true)
  })
})

describe('viewCount', () => {
  const facets = {
    ownership: [{ value: 'shelf', label: 'shelf', count: 279 }],
    library: [{ value: 'lib-a', label: 'Fiction', count: 108 }],
    read_status: [
      { value: 'reading', label: 'reading', count: 28 },
      { value: 'unread', label: 'unread', count: 143 },
    ],
    media_type: [],
    genre: [],
    tag: [{ value: 'signed', label: 'signed', count: 12 }],
    rating: [{ value: '5', label: '5', count: 56 }],
  }

  it('reads a status view out of the facet block', () => {
    expect(viewCount(view({ params: 'status=reading' }), facets)).toBe(28)
  })

  it('reads a rating view, whose values are strings on the wire', () => {
    expect(viewCount(view({ params: 'rating=5' }), facets)).toBe(56)
  })

  it('reads a tag view', () => {
    expect(viewCount(view({ params: 'tag=signed' }), facets)).toBe(12)
  })

  it('ignores page, which is reading not filtering', () => {
    expect(viewCount(view({ params: 'status=reading&page=3' }), facets)).toBe(28)
  })

  it('declines a two-facet view rather than guessing', () => {
    // The block holds each dimension separately, so it cannot answer an
    // intersection. Taking one side would print a number bigger than the view.
    expect(viewCount(view({ params: 'status=reading&tag=signed' }), facets)).toBeUndefined()
  })

  it('declines a multi-value facet for the same reason', () => {
    expect(viewCount(view({ params: 'status=reading,unread' }), facets)).toBeUndefined()
  })

  it('returns undefined for an unknown value rather than zero', () => {
    // Zero would claim the shelf is empty; undefined renders no count at all.
    expect(viewCount(view({ params: 'tag=nonexistent' }), facets)).toBeUndefined()
  })

  it('returns undefined before the facets arrive', () => {
    expect(viewCount(view({ params: 'status=reading' }), null)).toBeUndefined()
  })
})

describe('matchView', () => {
  it('finds the view the current filter corresponds to', () => {
    const views = [view({ id: 'a', params: 'status=read' }), view({ id: 'b', params: 'tag=signed' })]
    expect(matchView(views, 'status=read')?.id).toBe('a')
  })

  it('matches on the filter alone, so a sidebar link with no layout still opens it', () => {
    expect(matchView([view({ layout: 'grid' })], 'status=read')?.id).toBe('v1')
  })

  it('does not match a view whose filter is a prefix of this one', () => {
    // "status=read" is a prefix of "status=reading". Comparing as strings lit
    // up Finished in the sidebar while the reader was looking at Reading now.
    expect(matchView([view({ params: 'status=read' })], 'status=reading')).toBeNull()
  })

  it('returns null for a filter no view describes', () => {
    expect(matchView([view()], 'genre=Fantasy')).toBeNull()
  })

  it('tolerates the leading question mark that location.search carries', () => {
    expect(matchView([view()], '?status=read')?.id).toBe('v1')
  })
})
