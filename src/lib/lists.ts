// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Lists: a named set of books, however that set is decided.
//
// Shelves and saved views were two features that looked alike to a reader and
// differed only in how membership is settled: a shelf is enumerated by hand, a
// view is computed from a filter. That is a `kind`, not a second concept, so
// they are one thing with two kinds.
//
// The server owns them. Views used to live in localStorage, which meant a view
// saved on a laptop did not exist on a phone, and the rail listed shelves from
// the API beside views from the browser as though they were the same kind of
// thing while only one of them was.

import { PARAM, type BookFacets, type FacetKey } from './bookBrowse'
import type { IconName } from './icons'
import { listIconName } from './listIcons'

export type ListKind = 'manual' | 'smart'
export type ListLayout = 'grid' | 'list' | 'compact'

export interface SavedList {
  id: string
  /** Who made it. A shared view is readable by a library but owned by one person. */
  owner_user_id: string
  name: string
  description: string
  icon: string
  color: string
  kind: ListKind
  /** Present on a smart list. Version 1 is `{ query: "<query string>" }`. */
  filter: { query?: string } | null
  filter_version?: number | null
  layout: ListLayout
  display_order: number
  visibility: 'private' | 'library' | 'public'
  shared_library_id?: string | null
  book_count: number
  /** Non-empty when this is a list the product ships. */
  builtin_key?: string
  /** Never listed in the rail. Only the default list is. */
  hidden?: boolean
  /** Cannot be deleted; the books page has to open on something. */
  permanent?: boolean
}

/** The list the books page opens on. */
export const DEFAULT_LIST_KEY = 'default'

/** The query string a smart list stands for, empty for a manual one. */
export const listQuery = (l: SavedList): string =>
  l.kind === 'smart' ? (l.filter?.query ?? '') : ''

/**
 * Where a row in the rail points.
 *
 * A smart list is its filter, so it navigates to the filter it stands for and
 * the rail fills in behind it: you can always see why a list contains what it
 * contains. A manual list has no filter to show, so it is addressed by id.
 */
export const listHref = (l: SavedList): string =>
  l.kind === 'smart' ? `/books?${listQuery(l)}` : `/books?shelf=${l.id}`

/** Rail rows, in display order. The default list is not somewhere you go. */
export const visibleLists = (lists: SavedList[]): SavedList[] =>
  lists.filter(l => !l.hidden).sort((a, b) =>
    a.display_order - b.display_order || a.name.localeCompare(b.name))

/**
 * The count to draw beside a list.
 *
 * A manual list knows its own size, so it is reported directly. A smart list
 * does not: its membership is whatever the filter currently matches, and only
 * the facet rail knows that. A filter naming more than one thing has no single
 * facet to read, so it gets no number rather than a wrong one.
 */
export function listCount(
  l: SavedList,
  facets: BookFacets | null,
  fetched?: Record<string, number>,
): number | undefined {
  if (l.kind === 'manual') return l.book_count
  // A count asked for directly wins: it answers the whole filter, where the
  // facet block can only answer one dimension of it.
  const direct = fetched?.[listQuery(l)]
  if (direct !== undefined) return direct
  if (!facets) return undefined

  const params = new URLSearchParams(listQuery(l))
  const entries = [...params.entries()].filter(([k]) => k !== 'page')
  if (entries.length !== 1) return undefined

  const [key, value] = entries[0]
  if (value.includes(',')) return undefined

  const dimension = (Object.keys(PARAM) as FacetKey[]).find(k => PARAM[k] === key)
  if (!dimension) return undefined

  const values = facets[dimension]
  if (!values) return undefined

  // Absent from a loaded dimension means none, not unknown. A facet block only
  // lists values something matched, so a list whose answer is zero had no row
  // and rendered no number at all, which reads as broken rather than as empty.
  return values.find(v => v.value === value)?.count ?? 0
}

/**
 * Counts for lists the facet block cannot answer.
 *
 * The rail draws every number from one unfiltered facet request, which can only
 * answer a filter that maps to exactly one facet: `status=read`, `tag=signed`.
 * A list built on a search, or on two filters at once, has no facet to read and
 * used to show no number at all, which reads as broken rather than as unknown.
 *
 * These ask the books endpoint instead, one small request each, for one page of
 * one item so only the total comes back. Keyed by query rather than by list, so
 * two lists standing for the same filter cost one request.
 */
export async function fetchMissingCounts(
  callApi: CallApi,
  lists: SavedList[],
  facets: BookFacets | null,
  /**
   * The scope the rows open in.
   *
   * Counted in the same scope the facet block is, or the rail promises more
   * than the page delivers: an unscoped count includes suggestions the reader
   * does not own and would never see on the page they just clicked.
   */
  scope = '',
): Promise<Record<string, number>> {
  const queries = new Set(
    lists
      .filter(l => l.kind === 'smart' && listCount(l, facets) === undefined)
      .map(l => listQuery(l))
      .filter(q => q.length > 0),
  )

  const out: Record<string, number> = {}
  await Promise.all([...queries].map(async query => {
    try {
      const res = await callApi<{ total: number }>(
        `/api/v1/me/books?${query}${scope ? `&${scope}` : ''}&page=1&per_page=1`)
      if (typeof res?.total === 'number') out[query] = res.total
    } catch {
      // A count is an enhancement, not the nav. A list that cannot be counted
      // shows no number, which is what it did before this existed.
    }
  }))
  return out
}

/**
 * Move one list to another position, returning the whole set renumbered.
 *
 * Pure, so the rail can show the result before the server has agreed and the
 * reader never watches a row snap back and forth.
 *
 * Every visible row is renumbered from zero rather than only the ones that
 * moved. Positions arrive from a seed that gave several lists the same number,
 * so nudging one and leaving the rest would order the ties by name and shuffle
 * rows nobody touched.
 */
export function reorderLists(lists: SavedList[], fromId: string, toId: string): SavedList[] {
  const shown = visibleLists(lists)
  const from = shown.findIndex(l => l.id === fromId)
  const to = shown.findIndex(l => l.id === toId)
  if (from < 0 || to < 0 || from === to) return lists

  const moved = [...shown]
  const [row] = moved.splice(from, 1)
  moved.splice(to, 0, row)

  const positions = new Map(moved.map((l, i) => [l.id, i]))
  return lists.map(l => {
    const next = positions.get(l.id)
    return next === undefined || next === l.display_order
      ? l
      : { ...l, display_order: next }
  })
}

/**
 * Persist an order, writing only the rows whose position actually changed.
 *
 * The hidden default is left where it is: it is not in the rail, so it has no
 * position a reader could have meant to change.
 */
export function saveListOrder(callApi: CallApi, after: SavedList[]): Promise<unknown> {
  return callApi('/api/v1/me/lists/order', {
    method: 'PUT',
    body: JSON.stringify({ ids: after.map(l => l.id) }),
  })
}

/**
 * Split the rail into the views someone owns and the views a library shares
 * with them.
 *
 * Two sections rather than one flat list with a marker, because the difference
 * is not decoration: deleting a shared view takes it away from everybody, and a
 * section boundary says that without a dialog having to ask.
 */
export function splitLists(lists: SavedList[]): { mine: SavedList[]; shared: SavedList[] } {
  const shown = visibleLists(lists)
  return {
    mine: shown.filter(l => l.visibility !== 'library'),
    // Including ones this person shared themselves. It is where the view now
    // lives, and its ordering and deletion behave the shared way regardless of
    // who made it.
    shared: shown.filter(l => l.visibility === 'library'),
  }
}

/** Icon for a list: its own, then the built-in's, then one for the kind. */
export const listIcon = (l: SavedList): IconName =>
  listIconName(l.icon, l.builtin_key, l.kind)

/** Query-string form, normalised so two spellings of one filter compare equal. */
export function normaliseParams(params: string): string {
  const p = new URLSearchParams(params)
  p.delete('page')
  const entries = [...p.entries()].sort(([a], [b]) => a.localeCompare(b))
  return new URLSearchParams(entries).toString()
}

/**
 * Whether what is on screen differs from what the list stores.
 *
 * Layout counts. It is part of the list rather than a separate toggle the
 * reader resets on every switch, so flipping rows to grid is an edit to the
 * list and the bar has to offer to save it. Comparing only the filter meant
 * that edit could not be saved at all.
 */
export const isDirty = (l: SavedList, params: string, layout?: ListLayout): boolean => {
  const layoutMoved = layout !== undefined && layout !== l.layout
  // A manual view holds books, not a filter, so nothing about the filter on
  // screen can drift from it and nothing about it can be saved from here.
  // Comparing anyway made it permanently modified against its own URL, and the
  // save it offered would have been refused by the server.
  if (l.kind === 'manual') return layoutMoved
  return normaliseParams(listQuery(l)) !== normaliseParams(params) || layoutMoved
}

/**
 * The manual view a `shelf=<id>` parameter names.
 *
 * matchList cannot answer this: it compares filters, and a manual view has
 * none. Without it, opening a shared view fell through to the default, so the
 * bar offered to save someone else's view over the one Books opens on.
 */
export function manualListInParams(lists: SavedList[], params: string): SavedList | null {
  const id = new URLSearchParams(params).get('shelf')
  if (!id) return null
  return lists.find(l => l.id === id && l.kind === 'manual') ?? null
}

/**
 * The list standing for a filter, if one does.
 *
 * The default wins a tie. On Books with nothing filtered, every list holding an
 * empty filter matches, the one Books opens on among them, and taking the first
 * the server happened to return meant Books opened on whichever list sorted
 * earliest. A reader with a saved list and no filter got sent somewhere they
 * had not asked to go.
 */
export function matchList(lists: SavedList[], params: string): SavedList | null {
  const matching = lists.filter(l => l.kind === 'smart' && !isDirty(l, params))
  if (matching.length === 0) return null
  return matching.find(l => l.builtin_key === DEFAULT_LIST_KEY) ?? matching[0]
}

/**
 * Which list is open, given what the filter matches and what was open before.
 *
 * Matching alone is not enough. A list's filter can be edited into looking like
 * another list's: clear the search on a list whose filter is only a search, and
 * what is left is the default's empty filter. Matching then jumped to the
 * default, so the list could not be edited at all, which is the one thing a
 * list is for.
 *
 * The two cases are identical in the URL, so the caller passes what the URL
 * cannot say: whether this was a navigation or an edit in place. Editing keeps
 * whatever was open; navigating adopts whatever the new filter matches.
 */
export function adoptedList(
  matched: SavedList | null,
  open: string | null,
  editedInPlace: boolean,
): string | null {
  if (editedInPlace || !matched) return open
  return matched.id
}

/**
 * Whether a view is the one on screen.
 *
 * A smart view is its filter, so it is current when the filter on screen is the
 * one it stands for. A manual view is addressed by id and has no filter to
 * compare, so it is current when the page names it.
 */
export function viewIsCurrent(
  l: SavedList, pathname: string, search: string, shelfParam: string | null,
): boolean {
  if (pathname !== '/books') return false
  return l.kind === 'smart' ? matchList([l], search) !== null : shelfParam === l.id
}

/** Where the books nav row points: the default list's filter. */
export function defaultListHref(lists: SavedList[]): string {
  const d = lists.find(l => l.builtin_key === DEFAULT_LIST_KEY)
  const q = d ? listQuery(d) : ''
  return q ? `/books?${q}` : '/books'
}

/**
 * The names more than one list uses.
 *
 * Two libraries each with a "Favourites" produced two rows that read as the
 * same list listed twice. Only clashing names get their library shown beside
 * them; qualifying every list would be noise for the usual case where the name
 * is already unique.
 */
export function ambiguousListNames(lists: SavedList[]): Set<string> {
  const counts = new Map<string, number>()
  for (const l of lists) {
    const key = listNameKey(l.name)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name))
}

/** The folded form both the set and the lookup have to agree on. */
export const listNameKey = (name: string): string => name.trim().toLowerCase()

/**
 * Broadcast that the stored lists changed.
 *
 * The rail reads them on render, and nothing else makes it render when another
 * page is what changed them.
 */
export const LISTS_CHANGED = 'librarium:lists-changed'

export function announceListsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LISTS_CHANGED))
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/**
 * The shape a caller needs to reach the API.
 *
 * Passed in rather than imported so this file stays testable without a React
 * tree, and so it cannot accidentally reach a different server than the one the
 * caller is signed in to.
 */
export type CallApi = <T>(path: string, init?: RequestInit) => Promise<T>

/** Every list the caller can see. */
export const fetchLists = (callApi: CallApi): Promise<SavedList[]> =>
  callApi<{ items: SavedList[] }>('/api/v1/me/lists').then(r => r.items ?? [])

/** Saves the filter on screen as a new smart list. */
export function createSmartList(
  callApi: CallApi, name: string, query: string, icon?: string,
): Promise<SavedList> {
  return callApi<SavedList>('/api/v1/me/lists', {
    method: 'POST',
    body: JSON.stringify({
      name, icon: icon ?? '', kind: 'smart',
      filter: { query }, visibility: 'private',
    }),
  })
}

/**
 * Changes a list in place.
 *
 * Only the keys given are sent, because the endpoint is a partial update and
 * sending the whole row back would overwrite whatever another device changed in
 * the meantime.
 */
export function updateList(
  callApi: CallApi, id: string,
  changes: { name?: string; icon?: string; query?: string; layout?: ListLayout },
): Promise<SavedList> {
  const body: Record<string, unknown> = {}
  if (changes.name !== undefined) body.name = changes.name
  if (changes.icon !== undefined) body.icon = changes.icon
  if (changes.layout !== undefined) body.layout = changes.layout
  if (changes.query !== undefined) body.filter = { query: changes.query }
  return callApi<SavedList>(`/api/v1/me/lists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export const deleteList = (callApi: CallApi, id: string): Promise<unknown> =>
  callApi(`/api/v1/me/lists/${id}`, { method: 'DELETE' })

// ─── One-time import of views saved in this browser ───────────────────────────

const LEGACY_KEY = 'librarium:views'
const IMPORTED_KEY = 'librarium:views_imported'

interface LegacyView {
  id: string
  name: string
  icon?: string
  params: string
  builtIn?: boolean
}

/**
 * The bit of storage this needs, and nothing more.
 *
 * Injected rather than reaching for `window.localStorage`, so the import can be
 * tested without a browser and cannot be pointed at the wrong store by accident.
 */
export interface LegacyStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const browserStore = (): LegacyStore | null =>
  typeof window === 'undefined' ? null : window.localStorage

/**
 * Move views saved in this browser onto the server, once.
 *
 * Views were per-browser, so this is the only copy of them and it cannot be
 * left behind. Built-ins are skipped: the server seeds its own, and importing
 * this browser's copies would give every reader two of each.
 *
 * The flag is written whether or not anything was imported, and the legacy key
 * is left in place rather than deleted, so a failed import can be inspected
 * instead of being silently gone.
 */
export async function importLegacyViews(
  post: (list: Partial<SavedList> & { filter?: unknown }) => Promise<unknown>,
  store: LegacyStore | null = browserStore(),
): Promise<number> {
  if (!store) return 0
  if (store.getItem(IMPORTED_KEY)) return 0

  // Declared without a value: the try assigns it and the catch returns, so an
  // initialiser here is dead.
  let legacy: LegacyView[]
  try {
    legacy = JSON.parse(store.getItem(LEGACY_KEY) ?? '[]') as LegacyView[]
  } catch {
    // Unreadable is the same as nothing to import, and marking it done stops
    // this parsing the same broken value on every load.
    store.setItem(IMPORTED_KEY, '1')
    return 0
  }
  if (!Array.isArray(legacy)) {
    store.setItem(IMPORTED_KEY, '1')
    return 0
  }

  const mine = legacy.filter(v => v && !v.builtIn && typeof v.params === 'string')
  let imported = 0
  for (const v of mine) {
    try {
      await post({
        name: v.name || 'Untitled list',
        kind: 'smart',
        icon: v.icon ?? '',
        filter: { query: v.params },
        visibility: 'private',
      })
      imported++
    } catch {
      // One bad view does not stop the rest. The flag below still gets set:
      // retrying every load would repost the ones that already landed.
    }
  }
  store.setItem(IMPORTED_KEY, '1')
  return imported
}
