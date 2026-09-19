// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Inventory's decisions, kept apart from React so they can be tested: which
// copy a scan moves, what a shelf check found, and the next shelf's place.
// See plans/inventory.md.

import type { Book, Copy, CopyLocation } from '../types'
import { barcodeIdentifier, classifyBarcode, type Barcode } from './barcode'
import { nextShelf } from './addBooks'

type CallApi = <T>(path: string, init?: RequestInit) => Promise<T>

/** A copy as the inventory endpoint lists it: with enough of its book to show. */
export interface InventoryCopy {
  id: string
  library_id: string
  book_id: string
  edition_id: string | null
  location_id: string | null
  location_name: string
  on_loan_to: string
  created_at: string
  book_title: string
  book_authors: string
  cover_url: string | null
}

export interface InventorySummary {
  copies: number
  shelved: number
  unshelved: number
  on_loan: number
}

export interface InventoryPage {
  items: InventoryCopy[]
  total: number
  summary: InventorySummary
}

/** One place's copies, the unshelved ones ('none'), or every copy. */
export function fetchInventory(
  callApi: CallApi, libraryId: string, location: string | 'none' | null, limit = 500, offset = 0,
): Promise<InventoryPage> {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (location) q.set('location', location)
  return callApi<InventoryPage>(`/api/v1/libraries/${libraryId}/inventory?${q}`)
}

/** What a scan does to a shelf. */
export type Placement =
  | { kind: 'here'; copy: Copy }
  | { kind: 'move'; copy: Copy; from: string | null }
  | { kind: 'ask'; copies: Copy[] }
  | { kind: 'none' }

/**
 * Which of this library's copies of a book goes onto the place. One already
 * there means nothing moves. Otherwise an unshelved copy moves first, then a
 * lone copy from somewhere else; with several elsewhere it's the person's
 * call which one is in their hand.
 */
export function placeCopy(copies: readonly Copy[], libraryId: string, placeId: string): Placement {
  const mine = copies.filter(c => c.library_id === libraryId)
  if (mine.length === 0) return { kind: 'none' }
  const here = mine.find(c => c.location_id === placeId)
  if (here) return { kind: 'here', copy: here }
  const unshelved = mine.find(c => !c.location_id)
  if (unshelved) return { kind: 'move', copy: unshelved, from: null }
  if (mine.length === 1) return { kind: 'move', copy: mine[0], from: mine[0].location_id }
  return { kind: 'ask', copies: mine }
}

/** A scanned code as far as this library knows it. */
export type Found =
  | { kind: 'invalid'; code: string }
  | { kind: 'book'; book: Book; barcode: Barcode }
  | { kind: 'unknown'; barcode: Barcode; code: string }

/**
 * Finds the book a barcode belongs to in this library, by ISBN, or by the
 * UPC or add-on saved on its edition. Unknown means this library doesn't
 * have it, which is where Add comes in.
 */
export async function findBookHere(callApi: CallApi, raw: string, libraryId: string): Promise<Found> {
  const barcode = classifyBarcode(raw)
  if (barcode.kind === 'invalid') return { kind: 'invalid', code: barcode.code }
  let book: Book | null = null
  if (barcode.kind === 'isbn') {
    book = await callApi<Book>(`/api/v1/libraries/${libraryId}/book-by-isbn/${encodeURIComponent(barcode.isbn13)}`).catch(() => null)
  }
  const id = barcodeIdentifier(barcode)
  if (!book && id) {
    book = await callApi<Book>(
      `/api/v1/libraries/${libraryId}/book-by-identifier?type=${id.scheme}&value=${encodeURIComponent(id.value)}`,
    ).catch(() => null)
  }
  const code = barcode.kind === 'isbn' ? barcode.isbn13 : barcode.code + (barcode.addon ?? '')
  return book ? { kind: 'book', book, barcode } : { kind: 'unknown', barcode, code }
}

/** A book scanned during a check that isn't one of the shelf's copies. */
export interface CheckExtra {
  code: string
  title: string
  /** Its copy in this library and where that is, or null when the library doesn't have it. */
  copy: Copy | null
  from: string | null
}

export interface CheckResult {
  /** On the shelf's record but not scanned, and not out on loan. */
  missing: InventoryCopy[]
  /** Not scanned, but lent out, so accounted for. */
  onLoan: InventoryCopy[]
  /** Scanned, recorded on another place or on none. */
  elsewhere: CheckExtra[]
  /** Scanned, not in this library at all. */
  notHere: CheckExtra[]
}

/** What a finished check found, given the shelf's copies and what was scanned. */
export function checkResult(shelf: readonly InventoryCopy[], seen: ReadonlySet<string>, extras: readonly CheckExtra[]): CheckResult {
  const unseen = shelf.filter(c => !seen.has(c.id))
  return {
    missing: unseen.filter(c => !c.on_loan_to),
    onLoan: unseen.filter(c => !!c.on_loan_to),
    elsewhere: extras.filter(e => e.copy),
    notHere: extras.filter(e => !e.copy),
  }
}

/**
 * The shelf's copy a scanned book matches, if one is still to be ticked off:
 * with two copies of a book on the shelf, each scan ticks the next.
 */
export function matchOnShelf(shelf: readonly InventoryCopy[], seen: ReadonlySet<string>, bookId: string): InventoryCopy | null {
  return shelf.find(c => c.book_id === bookId && !seen.has(c.id)) ?? null
}

/**
 * The place after this shelf in its bookcase, made when the bookcase says it
 * has that shelf but nobody created it yet. Null after the last shelf.
 */
export async function goToNextShelf(
  callApi: CallApi, libraryId: string, placeId: string | null, places: CopyLocation[], prefix: string,
): Promise<{ id: string; name: string; created: boolean } | null> {
  const next = nextShelf(placeId, places, prefix)
  if (!next) return null
  if (next.place) return { id: next.place.id, name: next.name, created: false }
  const made = await callApi<CopyLocation>(`/api/v1/libraries/${libraryId}/locations`, {
    method: 'POST',
    body: JSON.stringify({ name: next.name, parent_id: next.bookcase.id }),
  })
  return { id: made.id, name: next.name, created: true }
}

/** Moves a copy to a place, or off every place with null. */
export function moveCopy(callApi: CallApi, copyId: string, placeId: string | null): Promise<Copy> {
  return callApi<Copy>(`/api/v1/copies/${copyId}`, {
    method: 'PATCH',
    body: JSON.stringify({ location_id: placeId ?? '' }),
  })
}
