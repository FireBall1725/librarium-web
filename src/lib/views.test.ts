// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { beforeEach, describe, expect, it } from 'vitest'
import {
  BUILT_IN_VIEWS,
  type ViewStore,
  DEFAULT_VIEW_ID,
  defaultViewHref,
  deleteView,
  findDefaultView,
  isDirty,
  loadViews,
  matchView,
  newViewId,
  normaliseParams,
  renameView,
  saveView,
  viewCount,
  visibleViews,
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

// Most of these tests are about ordinary views. The Default is always present
// and never deletable, so counting it would make every assertion off by one.
const ordinary = (s: ViewStore = store) => loadViews(s).filter(v => v.id !== DEFAULT_VIEW_ID)

describe('seeding', () => {
  it('ships the built-ins on a first run', () => {
    expect(loadViews(store)).toHaveLength(BUILT_IN_VIEWS.length)
  })

  it('does not resurrect built-ins the user deleted', () => {
    loadViews(store)
    BUILT_IN_VIEWS.forEach(v => deleteView(v.id, store))
    // The Default survives on purpose: Books has to open on something. Every
    // other built-in stays deleted.
    expect(loadViews(store).map(v => v.id)).toEqual([DEFAULT_VIEW_ID])
  })

  it('survives a corrupt entry rather than taking the page down', () => {
    store.setItem('librarium:views', '{not json')
    store.setItem('librarium:views_seeded', '1')
    expect(ordinary()).toEqual([])
  })

  it('drops entries that are not views', () => {
    store.setItem('librarium:views_seeded', '1')
    store.setItem('librarium:views', JSON.stringify([view(), { nope: true }, null]))
    expect(ordinary()).toHaveLength(1)
  })
})

describe('crud', () => {
  beforeEach(() => { store.setItem('librarium:views_seeded', '1') })

  it('adds, updates in place, and deletes', () => {
    saveView(view(), store)
    expect(ordinary()).toHaveLength(1)

    saveView(view({ name: 'Renamed' }), store)
    expect(ordinary()).toHaveLength(1)
    expect(ordinary()[0].name).toBe('Renamed')

    deleteView('v1', store)
    expect(ordinary()).toEqual([])
  })

  it('renames without disturbing the filter', () => {
    saveView(view(), store)
    renameView('v1', 'Something else', undefined, store)
    expect(ordinary()[0]).toMatchObject({ name: 'Something else', params: 'status=read' })
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

describe('the Default view', () => {
  it('ships hidden, permanent, and holding no filter', () => {
    const def = findDefaultView(loadViews(store))
    expect(def).toMatchObject({ id: DEFAULT_VIEW_ID, hidden: true, permanent: true, params: '' })
  })

  it('is not listed in the rail', () => {
    const views = loadViews(store)
    expect(views.some(v => v.id === DEFAULT_VIEW_ID)).toBe(true)
    expect(visibleViews(views).some(v => v.id === DEFAULT_VIEW_ID)).toBe(false)
  })

  it('appears for a reader who was already seeded before it existed', () => {
    // Seeding runs once. Without restoring it on read, every existing reader
    // would be left with no Default and no way to get one.
    store.setItem('librarium:views_seeded', '1')
    store.setItem('librarium:views', JSON.stringify([
      { id: 'reading', name: 'Reading now', params: 'status=reading', layout: 'grid' },
    ]))
    const views = loadViews(store)
    expect(findDefaultView(views)).toBeDefined()
    expect(views.some(v => v.id === 'reading')).toBe(true)
  })

  it('sends Books to the plain shelf until it holds a filter', () => {
    expect(defaultViewHref(loadViews(store))).toBe('/books')
  })

  it('sends Books wherever it was saved', () => {
    loadViews(store)
    saveView({ id: DEFAULT_VIEW_ID, name: 'Default', params: 'status=reading', layout: 'rows', hidden: true, permanent: true }, store)
    expect(defaultViewHref(loadViews(store))).toBe('/books?status=reading')
  })

  it('cannot be deleted, because Books has to open on something', () => {
    loadViews(store)
    deleteView(DEFAULT_VIEW_ID, store)
    expect(findDefaultView(loadViews(store))).toBeDefined()
  })

  it('does not stop an ordinary view being deleted', () => {
    loadViews(store)
    deleteView('reading', store)
    expect(loadViews(store).some(v => v.id === 'reading')).toBe(false)
  })
})

describe('viewCount', () => {
  const facets = {
    ownership: [{ value: 'shelf', label: 'shelf', count: 279 }],
    library: [{ value: 'lib-a', label: 'Fiction', count: 108 }],
    shelf: [{ value: 'sh-a', label: 'Favourites', count: 11 }],
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

describe('view icons', () => {
  beforeEach(() => { store.setItem('librarium:views_seeded', '1') })

  it('stores an icon chosen when the view was saved', () => {
    saveView(view({ icon: 'star' }), store)
    expect(loadViews(store).find(v => v.id === 'v1')?.icon).toBe('star')
  })

  it('changes the icon alongside the name', () => {
    saveView(view({ icon: 'star' }), store)
    renameView('v1', 'Renamed', 'check', store)
    expect(loadViews(store).find(v => v.id === 'v1')).toMatchObject({
      name: 'Renamed', icon: 'check',
    })
  })

  it('keeps the existing icon when a rename does not name one', () => {
    // The dialog always sends one, but a caller that only renames must not
    // silently strip the icon the reader picked earlier.
    saveView(view({ icon: 'star' }), store)
    renameView('v1', 'Renamed', undefined, store)
    expect(loadViews(store).find(v => v.id === 'v1')?.icon).toBe('star')
  })
})
