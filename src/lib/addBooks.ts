// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The Add books dialog's decisions, kept apart from React so they can be
// tested: where books go and how that's remembered, the request that adds a
// looked-up book, what a lookup's answer means for the queue, and which shelf
// comes next. See plans/add-book-rework.md.

import type { CopyLocation, ISBNLookupResult, MediaType, MergedBookResult } from '../types'
import { bookBodyFromResult } from './scanSession'
import { MERGED_FIELDS } from './mergedLookup'
import { shelfChoices, shelfSpot } from './places'
import type { ScannedIdentifier } from './barcode'

/** Where new books go. */
export interface Destination {
  libraryId: string
  /** A place in that library, or null for none. */
  locationId: string | null
  /** Set on each book added; 'unread' sets nothing. */
  readStatus: 'unread' | 'reading' | 'read'
  /** A list each book joins, or null. */
  listId: string | null
}

/** The user preference the destination is remembered in, per library. */
export const PREFS_KEY = 'add_books'

export interface AddBooksPrefs {
  last_library_id?: string
  by_library?: Record<string, { location_id?: string | null; read_status?: string; list_id?: string | null }>
}

const READ_STATUSES = ['unread', 'reading', 'read'] as const

/**
 * The destination to open with: the last library used, if it's still one
 * this person can add to, with what they last picked there; otherwise the
 * library the dialog was opened from, or the first one.
 */
export function destinationFromPrefs(
  prefs: AddBooksPrefs | undefined,
  libraryIds: string[],
  openedFrom?: string,
): Destination {
  const pick = openedFrom && libraryIds.includes(openedFrom)
    ? openedFrom
    : prefs?.last_library_id && libraryIds.includes(prefs.last_library_id) ? prefs.last_library_id : libraryIds[0] ?? ''
  return destinationForLibrary(prefs, pick)
}

/** What was last picked in one library, or a plain destination there. */
export function destinationForLibrary(prefs: AddBooksPrefs | undefined, libraryId: string): Destination {
  const saved = prefs?.by_library?.[libraryId]
  const status = READ_STATUSES.find(s => s === saved?.read_status) ?? 'unread'
  return { libraryId, locationId: saved?.location_id ?? null, readStatus: status, listId: saved?.list_id ?? null }
}

/** The preference value to save after the destination changes. */
export function prefsWithDestination(prefs: AddBooksPrefs | undefined, d: Destination): AddBooksPrefs {
  return {
    ...prefs,
    last_library_id: d.libraryId,
    by_library: {
      ...prefs?.by_library,
      [d.libraryId]: { location_id: d.locationId, read_status: d.readStatus, list_id: d.listId },
    },
  }
}

// A role in brackets after a name, the way some providers send illustrators
// and translators: "Giancarlo Carracuzzo (Illustrator)".
const ROLES = ['author', 'artist', 'illustrator', 'writer', 'penciller', 'inker', 'colorist', 'letterer', 'translator', 'editor', 'narrator']

/** A provider's name string as a person and role. */
export function personFromName(raw: string): { name: string; role: string } {
  const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (m && ROLES.includes(m[2].toLowerCase())) return { name: m[1].trim(), role: m[2].toLowerCase() }
  return { name: raw.trim(), role: 'author' }
}

/**
 * The request that adds a looked-up book. Authors go by name and the server
 * finds or creates them; the copy is filed on the destination's place; a
 * scanned code with its add-on is saved on the edition so the next scan of it
 * is found locally.
 */
export function createBookBody(
  result: ISBNLookupResult,
  destination: Destination,
  mediaTypes: readonly MediaType[],
  identifier: ScannedIdentifier | null = null,
): Record<string, unknown> {
  const body = bookBodyFromResult(result, mediaTypes)
  body.contributors = (result.authors ?? [])
    .filter(a => a.trim())
    .map((a, i) => ({ ...personFromName(a), display_order: i }))
  if (destination.locationId) body.location_id = destination.locationId
  if (identifier) (body.edition as Record<string, unknown>).identifiers = [identifier]
  return body
}

/** How many fields the providers gave more than one answer for. */
export function disagreements(merged: MergedBookResult | null | undefined): number {
  if (!merged) return 0
  return MERGED_FIELDS.filter(k => (merged[k]?.alternatives?.length ?? 0) > 0).length
}

/** Why a scanned book is waiting for a person rather than being added. */
export type NeedsYou = 'not_found' | 'bare_upc' | 'several'

/** What a finished lookup means for a scan. */
export type LookupVerdict =
  | { kind: 'found' }
  | { kind: 'have' }
  | { kind: 'needs_you'; why: NeedsYou }

/**
 * Decides a scan's fate. Nothing found, or a bare paperback UPC the server
 * couldn't turn into an ISBN (so the answer may be a different book), or an
 * add-on that could be more than one book: those wait for a person. A book
 * already in the library is flagged, not added again.
 */
export function judgeLookup(
  merged: MergedBookResult | null | undefined,
  { byUPC, alreadyHere }: { byUPC: boolean; alreadyHere: boolean },
): LookupVerdict {
  const found = !!merged && (MERGED_FIELDS.some(k => merged[k]) || (merged.covers?.length ?? 0) > 0)
  if (!found) return { kind: 'needs_you', why: 'not_found' }
  if (alreadyHere) return { kind: 'have' }
  if (byUPC && !merged!.from_isbn) return { kind: 'needs_you', why: 'bare_upc' }
  if ((merged!.other_isbns?.length ?? 0) > 0) return { kind: 'needs_you', why: 'several' }
  return { kind: 'found' }
}

/**
 * The shelf after this one in its bookcase, when the destination is a
 * numbered shelf of a marked bookcase: the place for it if one exists, or the
 * name to create it under. Null when the place isn't a shelf or it's the last.
 */
export function nextShelf(
  locationId: string | null,
  places: CopyLocation[],
  fallbackPrefix = 'Shelf ',
): { number: number; name: string; place: CopyLocation | null; bookcase: CopyLocation } | null {
  if (!locationId) return null
  const spot = shelfSpot(locationId, places)
  if (!spot) return null
  const choices = shelfChoices(spot.bookcase, places, fallbackPrefix)
  // On the bookcase itself, "next" is its first shelf.
  const current = spot.shelf ?? 0
  const next = choices.find(c => c.number === current + 1)
  return next ? { ...next, bookcase: spot.bookcase } : null
}
