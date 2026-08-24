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
export function listCount(l: SavedList, facets: BookFacets | null): number | undefined {
  if (l.kind === 'manual') return l.book_count
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

/** Whether the current filter differs from what the list stores. */
export const isDirty = (l: SavedList, params: string): boolean =>
  normaliseParams(listQuery(l)) !== normaliseParams(params)

/** The list matching a filter exactly, if there is one. */
export const matchList = (lists: SavedList[], params: string): SavedList | null =>
  lists.find(l => l.kind === 'smart' && !isDirty(l, params)) ?? null

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
): Promise<number> {
  if (typeof window === 'undefined') return 0
  if (window.localStorage.getItem(IMPORTED_KEY)) return 0

  let legacy: LegacyView[] = []
  try {
    legacy = JSON.parse(window.localStorage.getItem(LEGACY_KEY) ?? '[]') as LegacyView[]
  } catch {
    // Unreadable is the same as nothing to import, and marking it done stops
    // this parsing the same broken value on every load.
    window.localStorage.setItem(IMPORTED_KEY, '1')
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
  window.localStorage.setItem(IMPORTED_KEY, '1')
  return imported
}
