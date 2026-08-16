// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Browse state for the Books surface: which filters are on, which page, and how
// that maps to and from the URL.
//
// Filters live in the URL rather than component state. Books uses numbered
// pages, and a link to page 7 of a filter nobody can name is meaningless, so
// the filter has to travel with it. It also makes a filtered shelf something
// you can send to someone with the same access.
//
// Page size is deliberately NOT in the URL. It is a preference, not a filter:
// two people opening the same link should each get their own, and the link
// should not change meaning when one of them switches to 200.

export type FacetKey = 'library' | 'read_status' | 'media_type' | 'genre' | 'tag' | 'rating'

export const FACET_ORDER: FacetKey[] = ['library', 'read_status', 'media_type', 'genre', 'tag', 'rating']

/** Query-string key for each facet. Short, because these end up in shared links. */
const PARAM: Record<FacetKey, string> = {
  library: 'lib',
  read_status: 'status',
  media_type: 'type',
  genre: 'genre',
  tag: 'tag',
  rating: 'rating',
}

export interface FacetValue {
  value: string
  label: string
  count: number
}

export type BookFacets = Record<FacetKey, FacetValue[]>

export type Selection = Record<FacetKey, string[]>

export interface BrowseState {
  selection: Selection
  query: string
  page: number
}

export const emptySelection = (): Selection => ({
  library: [], read_status: [], media_type: [], genre: [], tag: [], rating: [],
})

export const selectionCount = (s: Selection): number =>
  FACET_ORDER.reduce((n, k) => n + s[k].length, 0)

export function readState(params: URLSearchParams): BrowseState {
  const selection = emptySelection()
  for (const key of FACET_ORDER) {
    const raw = params.get(PARAM[key])
    if (raw) selection[key] = raw.split(',').filter(Boolean)
  }
  const page = Number(params.get('page') ?? '1')
  return {
    selection,
    query: params.get('q') ?? '',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

/** Serialise to a URLSearchParams, omitting anything at its default. */
export function writeState(state: BrowseState): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of FACET_ORDER) {
    const vals = state.selection[key]
    if (vals.length) params.set(PARAM[key], vals.join(','))
  }
  if (state.query) params.set('q', state.query)
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

/**
 * Build the API query string.
 *
 * The selection becomes the structured `filter` JSON the books endpoints
 * already understand, so the facet rail reuses the existing query language
 * rather than inventing a parallel one the server would have to learn.
 */
export function toApiQuery(state: BrowseState, perPage: number, forFacets = false): string {
  const params = new URLSearchParams()
  if (state.query) params.set('q', state.query)

  // The facets endpoint takes each dimension separately, using the same short
  // parameter names the URL already carries. It needs them apart so it can
  // count a dimension with its OWN selection excluded: applying every filter
  // uniformly collapses the facet you just used, leaving Fantasy as the only
  // genre on offer once Fantasy is ticked.
  if (forFacets) {
    for (const key of FACET_ORDER) {
      const vals = state.selection[key]
      if (vals.length) params.set(PARAM[key], vals.join(','))
    }
    return params.toString()
  }

  // Values within one facet are OR (Fiction or Manga); separate facets are AND
  // (Fiction AND unread). One group per facet gives exactly that, and the
  // groups format is what the books endpoints already parse.
  const groups = FACET_ORDER.flatMap(key => {
    const vals = state.selection[key]
    if (!vals.length) return []
    const field = key === 'media_type' ? 'type' : key
    return [{ mode: 'OR', conditions: vals.map(v => ({ field, op: 'equals', value: v })) }]
  })
  if (groups.length) params.set('filter', JSON.stringify({ groups }))

  if (!forFacets) {
    params.set('page', String(state.page))
    params.set('per_page', String(perPage))
  }
  return params.toString()
}

/** Toggle one value in one facet, resetting to page 1 because the set changed. */
export function toggle(state: BrowseState, key: FacetKey, value: string): BrowseState {
  const current = state.selection[key]
  const next = current.includes(value)
    ? current.filter(v => v !== value)
    : [...current, value]
  return { ...state, selection: { ...state.selection, [key]: next }, page: 1 }
}

export function clearAll(state: BrowseState): BrowseState {
  return { ...state, selection: emptySelection(), page: 1 }
}

export const PAGE_SIZES = [25, 50, 100, 200]
export const DEFAULT_PAGE_SIZE = 50
export const PAGE_SIZE_PREFERENCE_KEY = 'books_per_page'

/**
 * Page numbers to render: first, last, and a window around the current one,
 * with nulls marking gaps. Keeps the control a fixed width whether there are
 * three pages or three hundred.
 */
export function pageWindow(page: number, pages: number): Array<number | null> {
  if (pages <= 1) return [1]
  const want = new Set<number>([1, pages, page, page - 1, page + 1])
  if (page <= 3) [2, 3, 4].forEach(n => want.add(n))
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach(n => want.add(n))

  const list = [...want].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b)
  const out: Array<number | null> = []
  list.forEach((n, i) => {
    const gap = i > 0 ? n - list[i - 1] : 0
    // A gap of exactly one hides a single page behind an ellipsis, which is
    // both wider and less useful than the page itself. Show the page.
    if (gap === 2) out.push(n - 1)
    else if (gap > 2) out.push(null)
    out.push(n)
  })
  return out
}
