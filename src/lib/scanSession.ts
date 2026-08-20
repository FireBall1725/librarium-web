// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Continuous barcode scanning: the pure parts.
//
// The single-shot scanner in AddBookModal stops the camera on the first hit,
// which is right when you are adding one book. Cataloguing a shelf is a
// different act — you hold the camera and sweep along the spines — so the
// session below keeps the camera running and accumulates what it sees.
//
// Everything here is deliberately free of React and of the DOM so it can be
// tested directly: the component owns the camera and the network, this file
// owns the decisions.

import type { ISBNLookupResult, MediaType } from '../types'

/** Publishers whose presence is a strong signal that a book is manga. */
const MANGA_PUBLISHERS = [
  'viz', 'yen press', 'kodansha', 'seven seas', 'tokyopop',
  'square enix manga', 'dark horse manga', 'vertical', 'j-novel', 'cross infinite',
]

/**
 * How long the same code is ignored after being accepted, in milliseconds.
 *
 * AVCaptureMetadataOutput's browser equivalent fires on every animation frame
 * while a barcode stays in view, so a book held steady for a second would
 * otherwise be queued sixty times. Two seconds is long enough to move to the
 * next spine and short enough that rescanning on purpose still works.
 */
export const RESCAN_COOLDOWN_MS = 2000

export type ScanStatus = 'pending' | 'found' | 'duplicate' | 'not_found' | 'error' | 'added'

export interface ScannedItem {
  /** The raw barcode value, which for a book EAN-13 is the ISBN-13 itself. */
  code: string
  status: ScanStatus
  /** Best provider result, once the lookup resolves. */
  result?: ISBNLookupResult
  /** Title of the existing book when the scan turned out to be a duplicate. */
  duplicateTitle?: string
  /** Id of the book created for this code, once added. */
  bookId?: string
}

/**
 * Is this barcode plausibly a book?
 *
 * The detector is configured for several symbologies because a book's back
 * cover often carries a price barcode next to the ISBN one. Bookland EAN-13
 * codes start with 978 or 979; anything else is a UPC for something that is
 * not the book, and queueing it would just produce a failed lookup.
 */
export function isBooklandCode(code: string): boolean {
  const digits = code.replace(/[^0-9]/g, '')
  return digits.length === 13 && (digits.startsWith('978') || digits.startsWith('979'))
}

/** The code accepted most recently, and when — the cooldown's subject. */
export interface LastAccepted {
  code: string
  at: number
}

/**
 * Should a freshly detected code be accepted into the session?
 *
 * Returns false for a non-book barcode, for a code already in the list, and
 * for the code that was just accepted while it is still in its cooldown.
 *
 * The cooldown deliberately applies to THAT code and no other. Throttling
 * every scan for two seconds would silently drop the second of two different
 * books held up in quick succession, which is exactly what a shelf sweep
 * does. The list check already settles real duplicates; the cooldown only
 * covers the window before the accepted code has landed in it.
 */
export function shouldAccept(
  code: string,
  items: readonly ScannedItem[],
  lastAccepted: LastAccepted | null,
  now: number,
): boolean {
  if (!isBooklandCode(code)) return false
  // A row that failed is not settled, so scanning it again is how you retry.
  // Lookups and creations fail transiently; without this the only way past a
  // blip was to throw the whole sweep away, since addableItems skips errors
  // and the code could never be queued a second time.
  const existing = items.find(i => i.code === code)
  if (existing && existing.status !== 'error') return false
  if (lastAccepted && lastAccepted.code === code
      && now - lastAccepted.at < RESCAN_COOLDOWN_MS) return false
  return true
}

/**
 * Add a scanned code, or reset the row that is already there.
 *
 * Rescanning a failed row has to reuse its place rather than append a second
 * one, otherwise the list would show the same book twice with two statuses.
 */
export function upsertItem(
  items: readonly ScannedItem[],
  item: ScannedItem,
): ScannedItem[] {
  return items.some(i => i.code === item.code)
    ? items.map(i => (i.code === item.code ? item : i))
    : [...items, item]
}

/**
 * Which media type does this provider result look like?
 *
 * Mirrors the detection the single-book import already does, so a book added
 * by sweeping a shelf lands on the same media type it would have had when
 * added one at a time. Returns undefined when the instance has no matching
 * type configured, in which case the caller leaves the field alone.
 */
export function detectMediaTypeId(
  result: ISBNLookupResult,
  mediaTypes: readonly MediaType[],
): string | undefined {
  const byName = (name: string) => mediaTypes.find(mt => mt.name === name)?.id
  const categories = (result.categories ?? []).map(c => c.toLowerCase())
  const publisher = (result.publisher ?? '').toLowerCase()

  const mangaId = byName('manga')
  const comicId = byName('comic')
  if (mangaId && (categories.some(c => /manga|manhwa|manhua/.test(c))
                  || MANGA_PUBLISHERS.some(p => publisher.includes(p)))) return mangaId
  if (comicId && categories.some(c => /comic|graphic novel/.test(c))) return comicId
  return byName('novel')
}

/**
 * Split a trailing volume marker out of a title.
 *
 * Providers return "Berserk, Vol. 12" as a single title; Librarium keeps the
 * volume in the subtitle so the series groups cleanly. Only applied when the
 * result has no subtitle of its own, which would be the better value.
 */
export function splitVolumeSuffix(title: string, subtitle: string): { title: string; subtitle: string } {
  if (subtitle || !title) return { title, subtitle }
  const match = title.match(/,?\s*(Vol(?:ume)?\.?\s*\d+(?:\.\d+)?)$/i)
  if (!match) return { title, subtitle }
  return {
    title: title.slice(0, title.length - match[0].length).trim(),
    subtitle: match[1].trim(),
  }
}

/**
 * The POST body for a book assembled from a provider result.
 *
 * Contributors are deliberately absent: resolving an author name to a
 * contributor id needs a round trip per name, and the enrichment job on the
 * server fills them in afterwards. A shelf sweep trades that detail for speed;
 * the single-book form still does the full resolution.
 *
 * The media type falls back to the first configured one, matching what the
 * single-book form does. Media types are admin-configurable, so an instance
 * may have none of novel/manga/comic; sending an empty id there would fail
 * every POST in the sweep rather than just guessing less well.
 */
export function bookBodyFromResult(
  result: ISBNLookupResult,
  mediaTypes: readonly MediaType[],
): Record<string, unknown> {
  const split = splitVolumeSuffix(result.title ?? '', result.subtitle ?? '')
  return {
    title: split.title,
    subtitle: split.subtitle,
    description: result.description ?? '',
    media_type_id: detectMediaTypeId(result, mediaTypes) ?? mediaTypes[0]?.id ?? '',
    contributors: [],
    tag_ids: [],
    genre_ids: [],
    edition: {
      format: 'paperback',
      edition_name: '',
      language: result.language ?? '',
      publisher: result.publisher ?? '',
      publish_date: result.publish_date ?? '',
      isbn_10: result.isbn_10 ?? '',
      isbn_13: result.isbn_13 ?? '',
      page_count: result.page_count ?? null,
      duration_seconds: null,
      narrator: null,
      is_primary: true,
    },
  }
}

/** Codes whose lookup succeeded and which are not already on a shelf. */
export function addableItems(items: readonly ScannedItem[]): ScannedItem[] {
  return items.filter(i => i.status === 'found' && i.result)
}

/** Replace one item in the list, matched on its code. */
export function withItem(
  items: readonly ScannedItem[],
  code: string,
  patch: Partial<ScannedItem>,
): ScannedItem[] {
  return items.map(i => (i.code === code ? { ...i, ...patch } : i))
}
