// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Works out what kind of book barcode a scanned string is.
//
// A hardware scanner types whatever is printed, so this has to cope with a
// price add-on glued to the end, hyphens a person typed, and codes that are
// not book barcodes at all.

export type Barcode =
  | { kind: 'isbn'; isbn13: string }
  // addon is a 5-digit add-on printed after the code. For a book it's a
  // price; for a comic it tells apart issues that share the same 12 digits.
  | { kind: 'upc'; code: string; addon?: string }
  | { kind: 'ean'; code: string; addon?: string }
  | { kind: 'invalid'; code: string }

/** Check digit for EAN-13 and UPC-A: weights alternate 1 and 3 from the right, excluding the check digit. */
function gtinCheckDigit(body: string): number {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48
    sum += i % 2 === 0 ? d * 3 : d
  }
  return (10 - (sum % 10)) % 10
}

function validGtin(code: string): boolean {
  return /^\d+$/.test(code) && gtinCheckDigit(code.slice(0, -1)) === Number(code.slice(-1))
}

function validIsbn10(code: string): boolean {
  if (!/^\d{9}[\dX]$/.test(code)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const v = code[i] === 'X' ? 10 : Number(code[i])
    sum += v * (10 - i)
  }
  return sum % 11 === 0
}

/** ISBN-10 to ISBN-13. Assumes a valid ISBN-10. */
export function isbn10to13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`
  return body + gtinCheckDigit(body)
}

export function classifyBarcode(raw: string): Barcode {
  let code = raw.trim().toUpperCase().replace(/[\s-]/g, '')

  // A 5-digit price add-on (mass-market paperbacks, comics) arrives glued on:
  // 13+5 or 12+5 digits. The main code is what identifies the book.
  let addon: string | undefined
  if (/^\d{18}$/.test(code)) { addon = code.slice(13); code = code.slice(0, 13) }
  else if (/^\d{17}$/.test(code)) { addon = code.slice(12); code = code.slice(0, 12) }

  // An EAN-13 starting with 0 is a UPC-A with a leading zero, which is how
  // zxing reports a UPC. Treat it as the UPC it is.
  if (code.length === 13 && code.startsWith('0') && validGtin(code)) code = code.slice(1)

  if (code.length === 13 && validGtin(code)) {
    if (code.startsWith('978') || code.startsWith('979')) return { kind: 'isbn', isbn13: code }
    return addon ? { kind: 'ean', code, addon } : { kind: 'ean', code }
  }
  if (code.length === 10 && validIsbn10(code)) return { kind: 'isbn', isbn13: isbn10to13(code) }
  if (code.length === 12 && validGtin(code)) return addon ? { kind: 'upc', code, addon } : { kind: 'upc', code }
  return { kind: 'invalid', code: raw.trim() }
}

/** What to send the UPC lookup: the code with its add-on, which the server keeps. */
export function upcLookupCode(b: Extract<Barcode, { kind: 'upc' | 'ean' }>): string {
  return b.code + (b.addon ?? '')
}

/** How long the camera keeps looking for a UPC's add-on before settling. */
export const ADDON_WAIT_MS = 1500

/**
 * Picks the code to act on from one camera frame. An ISBN wins outright. A
 * UPC with its add-on is next. A UPC without one is held for ADDON_WAIT_MS
 * from the first frame it was seen, since the add-on often reads a few
 * frames later and a paperback's bare UPC names the wrong book.
 *
 * Returns the code to use, or null to keep scanning; waitingSince is when a
 * bare UPC was first seen, which the caller keeps between frames.
 */
export function pickCameraScan(values: string[], waitingSince: number | null, now: number): string | null {
  const read = values.map(v => ({ raw: v, b: classifyBarcode(v) }))
  const isbn = read.find(r => r.b.kind === 'isbn')
  if (isbn) return isbn.raw
  const withAddon = read.find(r => (r.b.kind === 'upc' || r.b.kind === 'ean') && r.b.addon)
  if (withAddon) return withAddon.raw
  const bare = read.find(r => r.b.kind === 'upc' || r.b.kind === 'ean')
  if (bare) return waitingSince !== null && now - waitingSince >= ADDON_WAIT_MS ? bare.raw : null
  return values[0] ?? null
}

/** A scanned code as an edition identifier: the scheme the server files it under, and its value. */
export interface ScannedIdentifier {
  scheme: 'upc' | 'ean'
  value: string
}

/**
 * The identifier a UPC or EAN is looked up as, add-on included, so the local
 * check compares the same string the add path saves.
 */
export function barcodeIdentifier(b: Barcode): ScannedIdentifier | null {
  if (b.kind !== 'upc' && b.kind !== 'ean') return null
  return { scheme: b.kind, value: upcLookupCode(b) }
}

/**
 * The identifier worth saving on a new edition, or null. Only a code with its
 * add-on qualifies: a paperback's bare UPC is shared by every book at that
 * price and a comic's names the whole series, and the server reuses whatever
 * edition already holds an identifier, so saving a bare one would file the
 * next different book under this one.
 */
export function savableIdentifier(b: Barcode): ScannedIdentifier | null {
  if ((b.kind !== 'upc' && b.kind !== 'ean') || !b.addon) return null
  return barcodeIdentifier(b)
}

/**
 * Which of a new book's editions a scanned identifier belongs on: the one with
 * the ISBN that was sent, else the only one. Null when it can't be told.
 */
export function editionForIdentifier<E extends { id: string; isbn_13: string }>(editions: E[], isbn13: string): E | null {
  if (isbn13) return editions.find(e => e.isbn_13 === isbn13) ?? null
  return editions.length === 1 ? editions[0] : null
}
