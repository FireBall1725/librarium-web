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
  | { kind: 'upc'; code: string }
  | { kind: 'ean'; code: string }
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
  if (/^\d{18}$/.test(code)) code = code.slice(0, 13)
  else if (/^\d{17}$/.test(code)) code = code.slice(0, 12)

  if (code.length === 13 && validGtin(code)) {
    if (code.startsWith('978') || code.startsWith('979')) return { kind: 'isbn', isbn13: code }
    return { kind: 'ean', code }
  }
  if (code.length === 10 && validIsbn10(code)) return { kind: 'isbn', isbn13: isbn10to13(code) }
  if (code.length === 12 && validGtin(code)) return { kind: 'upc', code }
  return { kind: 'invalid', code: raw.trim() }
}
