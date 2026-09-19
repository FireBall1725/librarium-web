// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The requests behind the Add books dialog: look a scan up, add the book to
// the destination, take it back. Shared by One book and Many books so both
// add a book the same way.

import { ApiError } from '../auth/AuthContext'
import type { Book, BookEdition, Copy, ISBNLookupResult, MediaType, MergedBookResult } from '../types'
import {
  barcodeIdentifier, classifyBarcode, editionForIdentifier, savableIdentifier, upcLookupCode,
  type Barcode, type ScannedIdentifier,
} from './barcode'
import { hasAnyField } from './mergedLookup'
import { createBookBody, type Destination } from './addBooks'
import { newestCopy } from './addBooksQueue'

type CallApi = <T>(path: string, init?: RequestInit) => Promise<T>

export interface Lookup {
  /** What was asked: an ISBN-13, a UPC with its add-on, or the text typed. */
  code: string
  barcode: Barcode
  /** Null when no provider knew it. */
  merged: MergedBookResult | null
  /** The book already in this library, if it is. */
  duplicate: Book | null
  /** Looked up by a UPC the server couldn't turn into an ISBN. */
  byUPC: boolean
  /** The scanned code to save on the new edition, so the next scan finds it. */
  identifier: ScannedIdentifier | null
}

/**
 * Looks a scanned or typed code up across every provider, and checks whether
 * this library has the book already. Throws on a failed request; a code
 * nobody knew comes back with merged null.
 */
export async function lookUpCode(callApi: CallApi, raw: string, libraryId: string): Promise<Lookup> {
  const code = raw.trim()
  const barcode = classifyBarcode(code)
  const upc = barcode.kind === 'upc' || barcode.kind === 'ean' ? upcLookupCode(barcode) : null
  const scannedId = barcodeIdentifier(barcode)
  const isbn = barcode.kind === 'isbn' ? barcode.isbn13 : code
  const byIsbn = (i: string) =>
    callApi<Book>(`/api/v1/libraries/${libraryId}/book-by-isbn/${encodeURIComponent(i)}`).catch(() => null)

  const [merged, first] = await Promise.all([
    upc
      ? callApi<MergedBookResult>(`/api/v1/lookup/upc/${encodeURIComponent(upc)}/merged`)
      : callApi<MergedBookResult>(`/api/v1/lookup/isbn/${encodeURIComponent(isbn)}/merged`),
    // The duplicate check only knows ISBNs; a UPC is checked below.
    upc ? Promise.resolve(null) : byIsbn(isbn),
  ])
  let duplicate = first
  if (upc && merged?.from_isbn) {
    // The server found the ISBN in the add-on, so the check can run after all.
    duplicate = await byIsbn(merged.from_isbn)
  } else if (!duplicate && scannedId) {
    // The code itself may be on a book here, saved when it was added from
    // this same scan.
    duplicate = await callApi<Book>(
      `/api/v1/libraries/${libraryId}/book-by-identifier?type=${scannedId.scheme}&value=${encodeURIComponent(scannedId.value)}`,
    ).catch(() => null)
  }
  return {
    code: upc ?? isbn,
    barcode,
    merged: hasAnyField(merged) ? merged : null,
    duplicate: duplicate ?? null,
    byUPC: !!upc && !merged?.from_isbn,
    identifier: savableIdentifier(barcode),
  }
}

/**
 * Teaches the server a publisher's paperback UPC from a UPC scan it couldn't
 * resolve followed by that book's ISBN. The server checks the add-on matches,
 * so a pair that isn't the same book is refused. True when it learned.
 */
export async function learnFromPair(callApi: CallApi, upc: string, isbn13: string): Promise<boolean> {
  try {
    const r = await callApi<{ added: boolean }>('/api/v1/lookup/upc/learn', {
      method: 'POST',
      body: JSON.stringify({ upc, isbn: isbn13 }),
    })
    return !!r?.added
  } catch {
    return false
  }
}

/**
 * Adds a looked-up book at the destination: filed on its place, with its
 * cover, the scanned code, the read status and the list. Only the create
 * itself can fail the add; the rest is best-effort, since the book is there
 * either way.
 */
export async function addLookedUpBook(
  callApi: CallApi,
  result: ISBNLookupResult,
  destination: Destination,
  mediaTypes: readonly MediaType[],
  identifier: ScannedIdentifier | null,
): Promise<Book> {
  const lib = destination.libraryId
  const body = createBookBody(result, destination, mediaTypes, identifier)
  const post = () => callApi<Book>(`/api/v1/libraries/${lib}/books`, { method: 'POST', body: JSON.stringify(body) })
  let book: Book
  try {
    book = await post()
  } catch (err) {
    // The code is refused as a whole add: 409 when another edition holds it,
    // 400 on a server without that scheme. The book matters more.
    const edition = body.edition as Record<string, unknown> | undefined
    if (!(err instanceof ApiError && (err.status === 409 || err.status === 400) && edition?.identifiers)) throw err
    delete edition.identifiers
    book = await post()
  }

  const followUps: Promise<unknown>[] = []
  if (result.cover_url) {
    followUps.push(callApi(`/api/v1/libraries/${lib}/books/${book.id}/cover/fetch`, {
      method: 'POST',
      body: JSON.stringify({ url: result.cover_url }),
    }))
  }
  if (identifier) followUps.push(attachIdentifier(callApi, lib, book.id, identifier, result.isbn_13 ?? ''))
  if (destination.readStatus !== 'unread') {
    followUps.push(callApi(`/api/v1/books/${book.id}/me`, {
      method: 'PUT',
      body: JSON.stringify({ read_status: destination.readStatus }),
    }))
  }
  if (destination.listId) {
    followUps.push(callApi(`/api/v1/me/lists/${destination.listId}/books/${book.id}`, { method: 'POST' }))
  }
  await Promise.allSettled(followUps)
  return book
}

/**
 * When the ISBN matched an edition the server already had, it reuses that
 * edition and drops the code sent with the new one, so this saves it there.
 */
async function attachIdentifier(callApi: CallApi, libraryId: string, bookId: string, id: ScannedIdentifier, isbn13: string) {
  const editions = await callApi<BookEdition[]>(`/api/v1/libraries/${libraryId}/books/${bookId}/editions`)
  const target = editionForIdentifier(editions ?? [], isbn13)
  if (!target) return
  await callApi(`/api/v1/editions/${target.id}/identifiers`, { method: 'POST', body: JSON.stringify(id) })
    .catch(() => { /* 409: already saved */ })
}

/**
 * Takes back an add: this library's newest copy of the book, never the book
 * itself, which another library may hold. The list is left alone when the
 * book was already on it. True when a copy was removed.
 */
export async function undoAdd(
  callApi: CallApi,
  book: Pick<Book, 'id'>,
  destination: Destination,
  { wasNew }: { wasNew: boolean },
): Promise<boolean> {
  const r = await callApi<{ items: Copy[] }>(`/api/v1/books/${book.id}/copies`)
  const copy = newestCopy(r?.items ?? [], destination.libraryId)
  if (!copy) return false
  await callApi(`/api/v1/copies/${copy.id}`, { method: 'DELETE' })
  if (wasNew && destination.listId) {
    await callApi(`/api/v1/me/lists/${destination.listId}/books/${book.id}`, { method: 'DELETE' }).catch(() => {})
  }
  return true
}
