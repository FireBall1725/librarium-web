// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Saved views: a named filter state.
//
// There is no separate "view" concept in the data model, and there does not
// need to be. Books already serialises its whole state to a query string, so a
// view is that string plus a name and a layout. Opening one fills the facet
// rail, which is what makes it inspectable: you can always see why a view
// contains what it contains, and change it in place.
//
// Stored in localStorage for now. The shape is deliberately what a server
// record would be, so moving to /api/v1/me/views later is a transport change
// rather than a redesign.

import { PARAM, type BookFacets, type FacetKey } from './bookBrowse'
import type { IconName } from './icons'

export type ViewLayout = 'rows' | 'grid'

export interface SavedView {
  id: string
  name: string
  /**
   * The icon the rail draws for this view.
   *
   * Optional because the built-ins predate it and are mapped by id, and because
   * a view saved before this shipped has none. Absent falls back to that map
   * and then to the generic one, so nothing has to be migrated.
   */
  icon?: IconName
  /** Query string, exactly as Books puts it in the URL. */
  params: string
  layout: ViewLayout
  /** Views we ship. Still deletable; the flag only drives first-run seeding. */
  builtIn?: boolean
  /** Never listed in the rail. Only the Default view is. */
  hidden?: boolean
  /** Cannot be deleted. Books has to have something to open on. */
  permanent?: boolean
}

/**
 * The view Books opens on.
 *
 * A real view rather than a pointer at one, so changing what Books opens on is
 * the same act as changing any other view: filter, then save. It ships empty,
 * which is the plain shelf, so a new reader sees no behaviour they did not ask
 * for.
 *
 * Hidden from the rail because it is not somewhere you navigate to — it is
 * where Books already goes. Permanent because Books has to open on something,
 * and a reader who deleted it would have no way to get it back.
 */
export const DEFAULT_VIEW_ID = 'default'

const STORAGE_KEY = 'librarium:views'
const SEEDED_KEY = 'librarium:views_seeded'
const BACKFILL_KEY = 'librarium:views_backfilled'

/**
 * Built-ins that shipped after the first release.
 *
 * Seeding runs exactly once, so anyone who had already opened the app never
 * receives a built-in added later — Favourites would have existed only for new
 * installs. These are offered once each to existing stores.
 *
 * Offered, not restored. The id is recorded whether or not it was actually
 * added, so deleting one afterwards sticks; restoring it on every read the way
 * the Default is would make a built-in impossible to get rid of, which is the
 * whole reason the seeded flag exists.
 */
const LATER_BUILT_IN_IDS = ['favourites']

/**
 * The slice of Storage this module needs.
 *
 * Injected rather than reaching for the global so the logic is testable, and
 * because `localStorage` is not always there to reach for: Safari in private
 * mode throws on access, and any server-side render has no window at all. The
 * fallback is an in-memory map, which loses views on reload but never takes the
 * page down with it.
 */
export interface ViewStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function memoryStore(): ViewStore {
  const map = new Map<string, string>()
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

const fallback = memoryStore()

function defaultStore(): ViewStore {
  try {
    if (typeof localStorage === 'undefined') return fallback
    localStorage.getItem(STORAGE_KEY)
    return localStorage
  } catch {
    return fallback
  }
}

/**
 * Views that ship on first run.
 *
 * Covers suit a shelf you are browsing; rows suit a list you are working
 * through. That is why layout belongs to the view rather than being a global
 * toggle you have to reset every time you switch.
 */
export const BUILT_IN_VIEWS: SavedView[] = [
  { id: DEFAULT_VIEW_ID, name: 'Default', params: '', layout: 'rows', builtIn: true, hidden: true, permanent: true },
  { id: 'reading', name: 'Reading now', params: 'status=reading', layout: 'grid', builtIn: true },
  { id: 'unread', name: 'Up next', params: 'status=unread', layout: 'grid', builtIn: true },
  { id: 'read', name: 'Finished', params: 'status=read', layout: 'rows', builtIn: true },
  // Favourites is a view, not a shelf. It is a rule over a per-book flag, and
  // the rule is what separates a view from a shelf's hand-picked membership.
  // A "Favourites" shelf used to be created with every library, which is a
  // filing decision made on the reader's behalf and gave the rail the same
  // name once per library.
  { id: 'favourites', name: 'Favourites', params: 'fav=true', layout: 'grid', builtIn: true, icon: 'star' },
  { id: 'five-stars', name: 'Five stars', params: 'rating=5', layout: 'grid', builtIn: true },
  { id: 'signed', name: 'Signed copies', params: 'tag=signed', layout: 'rows', builtIn: true },
]

function read(store: ViewStore): SavedView[] {
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is SavedView =>
        typeof v === 'object' && v !== null &&
        typeof (v as SavedView).id === 'string' &&
        typeof (v as SavedView).name === 'string' &&
        typeof (v as SavedView).params === 'string'
    )
  } catch {
    // A corrupt entry should cost the user their views, not the whole page.
    return []
  }
}

function write(store: ViewStore, views: SavedView[]) {
  store.setItem(STORAGE_KEY, JSON.stringify(views))
}

/**
 * All views, seeding the built-ins exactly once.
 *
 * The seeded flag is separate from the list itself: without it, deleting every
 * built-in would look identical to a first run and they would all come back.
 */
export function loadViews(store: ViewStore = defaultStore()): SavedView[] {
  if (!store.getItem(SEEDED_KEY)) {
    store.setItem(SEEDED_KEY, '1')
    // Seeding delivers the later built-ins too, so record them as offered.
    // Without this the backfill would re-add one the reader deletes on a fresh
    // install, which is the resurrection the seeded flag exists to prevent.
    store.setItem(BACKFILL_KEY, JSON.stringify(LATER_BUILT_IN_IDS))
    const seeded = [...BUILT_IN_VIEWS]
    write(store, seeded)
    return seeded
  }

  let views = read(store)

  // The Default is an invariant of the store, not part of seeding: seeding
  // runs once, so anyone who already had views when this shipped would never
  // receive it and Books would have nothing to open on. Restored on read,
  // which also covers a store edited by hand.
  if (!views.some(v => v.id === DEFAULT_VIEW_ID)) {
    views = [BUILT_IN_VIEWS[0], ...views]
    write(store, views)
  }

  const added = backfillLaterBuiltIns(store, views)
  if (added) {
    views = added
    write(store, views)
  }
  return views
}

/**
 * Offer each later built-in once, returning the new list or null if unchanged.
 *
 * Appended rather than slotted into their seed position: an existing store is
 * the reader's own arrangement, and reordering it to match a fresh install
 * would move rows they put where they wanted them.
 */
function backfillLaterBuiltIns(store: ViewStore, views: SavedView[]): SavedView[] | null {
  const done = new Set(readBackfilled(store))
  const pending = LATER_BUILT_IN_IDS.filter(id => !done.has(id))
  if (pending.length === 0) return null

  const missing = pending
    .filter(id => !views.some(v => v.id === id))
    .map(id => BUILT_IN_VIEWS.find(v => v.id === id))
    .filter((v): v is SavedView => v !== undefined)

  // Recorded even when nothing was added, so a view the reader deletes now
  // stays deleted rather than returning on the next load.
  store.setItem(BACKFILL_KEY, JSON.stringify([...done, ...pending]))
  return missing.length > 0 ? [...views, ...missing] : null
}

function readBackfilled(store: ViewStore): string[] {
  try {
    const raw = store.getItem(BACKFILL_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function saveView(view: SavedView, store: ViewStore = defaultStore()): SavedView[] {
  const views = read(store)
  const i = views.findIndex(v => v.id === view.id)
  if (i === -1) views.push(view)
  else views[i] = view
  write(store, views)
  return views
}

export function deleteView(id: string, store: ViewStore = defaultStore()): SavedView[] {
  const views = read(store)
  // Refused rather than hidden behind an absent button: a caller that gets the
  // id from somewhere else should not be able to leave Books with nothing to
  // open on.
  const next = views.filter(v => v.id !== id || v.permanent)
  write(store, next)
  return next
}

/**
 * Rename a view, and optionally change its icon.
 *
 * The icon rides along here rather than getting its own function because the
 * dialog that asks for one asks for the name at the same time: they are one
 * edit from the reader's side.
 */
export function renameView(
  id: string,
  name: string,
  icon?: IconName,
  store: ViewStore = defaultStore(),
): SavedView[] {
  const views = read(store).map(v =>
    v.id === id ? { ...v, name, ...(icon ? { icon } : {}) } : v
  )
  write(store, views)
  return views
}

/**
 * How many books a view holds, read out of the facet block rather than by
 * querying per view.
 *
 * The facets endpoint already returns a count for every value of every
 * dimension, so an unfiltered call answers "how many are reading", "how many
 * are five stars" and "how many are tagged signed" in one request. Eight views
 * would otherwise be eight round trips on every page, for numbers that sit in
 * the sidebar and are read at a glance.
 *
 * Only single-dimension views resolve this way. A view combining two facets is
 * an intersection the block cannot answer, and guessing from one dimension
 * would print a number larger than the view actually contains, so those return
 * undefined and render no count at all.
 */
export function viewCount(view: SavedView, facets: BookFacets | null): number | undefined {
  if (!facets) return undefined
  const params = new URLSearchParams(view.params)
  const entries = [...params.entries()].filter(([k]) => k !== 'page')
  if (entries.length !== 1) return undefined

  const [key, value] = entries[0]
  if (value.includes(',')) return undefined

  const dimension = (Object.keys(PARAM) as FacetKey[]).find(k => PARAM[k] === key)
  if (!dimension) return undefined

  const values = facets[dimension]
  if (!values) return undefined

  // Absent from a loaded dimension means none, not unknown. A facet block only
  // lists values something matched, so a view whose answer is zero had no row
  // and rendered no number at all — every saved view sat blank until it had at
  // least one book, which reads as broken rather than as empty.
  return values.find(v => v.value === value)?.count ?? 0
}

/**
 * Broadcast that the stored views changed.
 *
 * The rail reads them on render, and nothing else makes it render when another
 * page is what changed them. Same shape as librarium:collection-changed.
 */
export const VIEWS_CHANGED = 'librarium:views-changed'

export function announceViewsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(VIEWS_CHANGED))
}

/** The views the rail lists: everything except the hidden Default. */
export const visibleViews = (views: SavedView[]): SavedView[] =>
  views.filter(v => !v.hidden)

export const findDefaultView = (views: SavedView[]): SavedView | undefined =>
  views.find(v => v.id === DEFAULT_VIEW_ID)

/**
 * Where the Books link points: the Default view's filter, or the plain shelf
 * when it holds none.
 */
export function defaultViewHref(views: SavedView[]): string {
  const params = findDefaultView(views)?.params
  return params ? `/books?${params}` : '/books'
}

/** Ids are only unique within one browser, so time plus a suffix is enough. */
export function newViewId(): string {
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Compare a view against the state on screen.
 *
 * Params are normalised by sorting, so `status=read&tag=signed` and
 * `tag=signed&status=read` are the same view rather than a spurious edit. Page
 * is excluded: paging through a view is reading it, not changing it.
 */
export function normaliseParams(params: string): string {
  const p = new URLSearchParams(params)
  p.delete('page')
  const entries = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.map(([k, v]) => `${k}=${v}`).join('&')
}

export function isDirty(view: SavedView, params: string, layout: ViewLayout): boolean {
  return normaliseParams(view.params) !== normaliseParams(params) || view.layout !== layout
}

/**
 * Which view, if any, the filter on screen corresponds to.
 *
 * Params only, not layout. Layout follows from the matched view rather than
 * being part of the match: the sidebar links only navigate, so a view opened
 * from there arrives with no layout attached, and requiring the two to agree
 * would mean it never matched at all.
 */
export function matchView(views: SavedView[], params: string): SavedView | null {
  const target = normaliseParams(params)
  return views.find(v => normaliseParams(v.params) === target) ?? null
}
