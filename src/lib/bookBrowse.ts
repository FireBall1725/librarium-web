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

export type FacetKey = 'ownership' | 'library' | 'shelf' | 'location' | 'read_status' | 'media_type' | 'genre' | 'tag' | 'rating' | 'favourite'

// Ownership leads: whether you have a book at all comes before anything else
// about it, and it is the one facet that arrives with a default.
// Shelf follows library because a shelf belongs to one, so the two read as a
// pair: which library, then which shelf within it.
// Favourite sits by read status: both are the reader's own verdict on a book,
// as against what it is or where it lives.
// Location follows library for the same reason list does: a place belongs to
// one library, so the two read as a pair. Where the object physically is comes
// before what anyone thinks of it.
export const FACET_ORDER: FacetKey[] = ['ownership', 'library', 'shelf', 'location', 'read_status', 'favourite', 'media_type', 'genre', 'tag', 'rating']

/**
 * Query-string key for each facet. Short, because these end up in shared links.
 *
 * `shelf` is keyed to `list` here. The facet is a hand-picked set of books, and
 * "shelf" now means where a physical copy sits, so the URL says the word the
 * reader sees. The internal key stays `shelf` because that is what the server
 * calls the facet in its response, and API_PARAM keeps the wire honest.
 */
export const PARAM: Record<FacetKey, string> = {
  ownership: 'own',
  library: 'lib',
  shelf: 'list',
  // Not 'shelf', which the list facet still answers to for links saved before
  // it was renamed. Two facets reading one parameter is the ambiguity this
  // whole rename exists to remove, and it showed up as one filter producing
  // two identical chips.
  location: 'location',
  read_status: 'status',
  media_type: 'type',
  genre: 'genre',
  tag: 'tag',
  rating: 'rating',
  favourite: 'fav',
}

/**
 * What the server calls each facet on the wire.
 *
 * Identical to PARAM except where the reader-facing vocabulary has moved ahead
 * of the API's. Keeping the two separate is what lets the URL rename ship
 * without waiting on an API release, and without a client sending a parameter
 * the server would silently ignore.
 */
const API_PARAM: Record<FacetKey, string> = { ...PARAM, shelf: 'shelf' }

/**
 * The URL spellings a facet answers to, newest first.
 *
 * `shelf` is still read because it is inside saved filters and inside any link
 * already shared. Rewriting stored filters to chase a rename would turn a
 * presentation change into a migration.
 */
const PARAM_ALIASES: Partial<Record<FacetKey, string[]>> = { shelf: ['shelf'] }

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
  /**
   * Collapse each series into one entry.
   *
   * Not a facet: it changes what a row IS rather than which rows there are, so
   * it does not belong in the selection and does not count as an applied
   * filter.
   */
  grouped: boolean
  /**
   * Drilled into one series, which is how a collapsed group is opened. Holds a
   * series id; empty means no drill-in.
   */
  series: string
  /**
   * Contributor ids to narrow to.
   *
   * Not a facet, though it filters like one. A collection has hundreds of
   * contributors, so the rail would be a wall rather than a list, and the
   * counted-dimension machinery a facet carries would have to count all of
   * them on every request. Reached by typing a name instead.
   */
  contributors: string[]
}

export const emptySelection = (): Selection => ({
  ownership: [], library: [], shelf: [], location: [], read_status: [], media_type: [], genre: [], tag: [], rating: [], favourite: [],
})

export const isDefaultOwnership = (vals: string[]): boolean =>
  vals.length === DEFAULT_OWNERSHIP.length && DEFAULT_OWNERSHIP.every(v => vals.includes(v))

/**
 * How many filters the reader has actually applied.
 *
 * Ownership at its default is not one of them: it is the state Books opens in,
 * and counting it would make a untouched page claim one active filter.
 */
export const selectionCount = (s: Selection): number =>
  FACET_ORDER.reduce((n, k) => {
    if (k === 'ownership') {
      // Neither the default nor the explicit "any" is a filter the reader
      // applied: one is where Books opens, the other is them taking a filter
      // off. Counting either would report state nobody chose.
      if (isDefaultOwnership(s[k]) || s[k].includes(OWNERSHIP_ANY)) return n
      return n + s[k].length
    }
    return n + s[k].length
  }, 0)

/**
 * What ownership means when the URL says nothing.
 *
 * Books opens on what you actually have. The other three states are things you
 * do not own, and a shelf that opens by mixing them in is not your shelf.
 */
export const DEFAULT_OWNERSHIP = ['shelf']

/**
 * Explicit "no ownership filter".
 *
 * Absent has to mean the default, or every link would carry `own=shelf`; so
 * clearing the filter needs a value of its own rather than an empty one, which
 * would read as absent and snap straight back to the default.
 */
export const OWNERSHIP_ANY = 'any'

export function readState(params: URLSearchParams): BrowseState {
  const selection = emptySelection()
  for (const key of FACET_ORDER) {
    const raw = params.get(PARAM[key]) ??
      (PARAM_ALIASES[key] ?? []).map(a => params.get(a)).find(v => v !== null) ?? null
    if (raw) selection[key] = raw.split(',').filter(Boolean)
  }
  if (!params.has(PARAM.ownership)) selection.ownership = [...DEFAULT_OWNERSHIP]
  const page = Number(params.get('page') ?? '1')
  return {
    selection,
    query: params.get('q') ?? '',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    // Grouping is off inside a series: the reader already opened one group, and
    // collapsing it back into itself would show a single entry containing
    // everything on screen.
    grouped: params.get('group') === 'series' && !params.get('series'),
    series: params.get('series') ?? '',
    contributors: (params.get('contributor') ?? '').split(',').filter(Boolean),
  }
}

/** Serialise to a URLSearchParams, omitting anything at its default. */
export function writeState(state: BrowseState): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of FACET_ORDER) {
    const vals = state.selection[key]
    if (key === 'ownership') {
      // Omitted when it matches the default, so an ordinary link stays clean;
      // written as the sentinel when cleared, so 'show me everything' survives
      // being sent to someone else.
      if (isDefaultOwnership(vals)) continue
      params.set(PARAM[key], vals.length ? vals.join(',') : OWNERSHIP_ANY)
      continue
    }
    if (vals.length) params.set(PARAM[key], vals.join(','))
  }
  if (state.query) params.set('q', state.query)
  if (state.contributors.length) params.set('contributor', state.contributors.join(','))
  if (state.series) params.set('series', state.series)
  if (state.grouped && !state.series) params.set('group', 'series')
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

  // Both endpoints take each dimension separately, under the same short
  // parameter names the URL already carries. Values within one facet are OR
  // (Fiction or Manga); separate facets are AND (Fiction AND unread).
  //
  // Not the structured `filter` JSON, even for the list. The counts have to
  // arrive per dimension so the server can exclude a dimension's own selection
  // when counting it, and sending the list a different shape is how the rail
  // ends up reporting 29 unread beside a list that never filtered: the query
  // language has no field for read status, rating, or library, so those three
  // silently did nothing. One format for both keeps them honest.
  for (const key of FACET_ORDER) {
    const vals = state.selection[key]
    // The sentinel is a client-side idea; the server has no 'any' ownership,
    // it simply receives no ownership filter.
    if (key === 'ownership' && vals.includes(OWNERSHIP_ANY)) continue
    if (vals.length) params.set(API_PARAM[key], vals.join(','))
  }

  // The drill-in narrows the facet counts too, so the rail describes the
  // series you opened rather than the whole shelf.
  if (state.series) params.set('series', state.series)

  // Sent for the facet request as well, so choosing an author leaves the rail
  // describing that author's books rather than the whole shelf.
  if (state.contributors.length) params.set('contributor', state.contributors.join(','))

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
