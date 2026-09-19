// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The Many books queue: one row per scan, what happened to it, and keeping it
// in the browser so closing the tab mid-bookcase loses nothing. Kept apart
// from React so the rules can be tested. See plans/add-book-rework.md.

import type { Copy, ISBNLookupResult, MergedBookResult } from '../types'
import type { ScannedIdentifier } from './barcode'
import type { NeedsYou } from './addBooks'

export type RowState =
  | 'looking'    // the providers are being asked
  | 'adding'     // found, being added
  | 'added'
  | 'have'       // already in this library
  | 'needs_you'  // unsure; waits for a person
  | 'ready'      // found, and held for review instead of added
  | 'failed'     // the lookup or the add failed
  | 'undone'     // added, then taken back
  | 'skipped'

export interface QueueRow {
  /** Unique per row; the same code can be scanned twice on purpose. */
  id: string
  /** What was looked up: an ISBN-13, or a UPC with its add-on. */
  code: string
  scannedAt: number
  state: RowState
  why?: NeedsYou
  /** The merged answer, kept so a row can be reviewed or picked later. */
  merged?: MergedBookResult | null
  /** The book as it would be (or was) added. */
  result?: ISBNLookupResult
  identifier?: ScannedIdentifier | null
  /** Fields the providers disagreed on, picked for you. */
  picked?: number
  /** Where the copy was filed, for the row's label. */
  locationId?: string | null
  /** The list it joined, and whether the book is new here, for Undo. */
  listId?: string | null
  wasNew?: boolean
  bookId?: string
  /** A book already here, for Already have it. */
  haveTitle?: string
  error?: string
}

export type QueueFilter = 'all' | 'added' | 'needs_you' | 'have'

export function matchesFilter(row: QueueRow, filter: QueueFilter): boolean {
  switch (filter) {
    case 'all': return row.state !== 'skipped'
    case 'added': return row.state === 'added'
    case 'needs_you': return row.state === 'needs_you' || row.state === 'ready' || row.state === 'failed'
    case 'have': return row.state === 'have'
  }
}

export function countBy(rows: readonly QueueRow[]): Record<QueueFilter, number> {
  const out: Record<QueueFilter, number> = { all: 0, added: 0, needs_you: 0, have: 0 }
  for (const r of rows) {
    for (const f of ['all', 'added', 'needs_you', 'have'] as const) if (matchesFilter(r, f)) out[f]++
  }
  return out
}

/** A row changed in place, by id. */
export function patchRow(rows: readonly QueueRow[], id: string, patch: Partial<QueueRow>): QueueRow[] {
  return rows.map(r => (r.id === id ? { ...r, ...patch } : r))
}

// A scanner fires the same code again when a book is held under it, and a
// camera sees it on every frame. Inside this window a repeat is the same scan.
export const REPEAT_WINDOW_MS = 4000

/**
 * Whether a scan is a repeat of the last one rather than a new book. The same
 * code later on is a second copy, which is allowed.
 */
export function isRepeat(rows: readonly QueueRow[], code: string, now: number): boolean {
  const last = rows[0]
  return !!last && last.code === code && now - last.scannedAt < REPEAT_WINDOW_MS
}

/** The copy an Undo takes back: this library's newest copy of the book. */
export function newestCopy(copies: readonly Copy[], libraryId: string): Copy | null {
  let best: Copy | null = null
  for (const c of copies) {
    if (c.library_id !== libraryId) continue
    if (!best || c.created_at > best.created_at) best = c
  }
  return best
}

const KEY_PREFIX = 'librarium:add-books:queue:'
// A bookcase is a few hundred books; a queue past this is old rows nobody
// needs, and localStorage has about 5 MB for the whole site.
export const MAX_KEPT = 500

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'> | null

const storage = (): Storage => {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

/** The queue kept for a library, newest first. Rows mid-flight come back as failed. */
export function loadQueue(libraryId: string, store: Storage = storage()): QueueRow[] {
  try {
    const raw = store?.getItem(KEY_PREFIX + libraryId)
    if (!raw) return []
    const rows = JSON.parse(raw) as QueueRow[]
    if (!Array.isArray(rows)) return []
    // A lookup or add that was running when the tab closed never finished.
    return rows.map(r => (r.state === 'looking' || r.state === 'adding' ? { ...r, state: 'failed' } : r))
  } catch {
    return []
  }
}

export function saveQueue(libraryId: string, rows: readonly QueueRow[], store: Storage = storage()): void {
  try {
    if (rows.length === 0) store?.removeItem(KEY_PREFIX + libraryId)
    // The provider answers are the bulk of a row; a row that's settled no
    // longer needs them, only what its label shows.
    // Past the cap, old settled rows go; one still waiting on you never does.
    else store?.setItem(KEY_PREFIX + libraryId, JSON.stringify(rows.filter((r, i) => i < MAX_KEPT || unsettled(r)).map(slim)))
  } catch {
    // Full, or refused in a private window: the queue just won't survive the tab.
  }
}

/** Rows in a library's kept queue that are still being looked up or waiting on you. */
export function pendingRows(libraryId: string, store: Storage = storage()): number {
  return loadQueue(libraryId, store).filter(unsettled).length
}

const unsettled = (r: QueueRow) =>
  r.state === 'needs_you' || r.state === 'ready' || r.state === 'failed' || r.state === 'looking' || r.state === 'adding'

function slim(r: QueueRow): QueueRow {
  if (unsettled(r)) return r
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { merged, ...rest } = r
  return rest
}
