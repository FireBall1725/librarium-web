// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Bulk operations on a set of books.
//
// The per-library grid could assume one library for everything. Books cannot:
// a selection spans whatever the reader ticked, so each operation has to say
// which library it belongs to, and the ones that genuinely need a single
// library have to be able to say so rather than picking one silently.
//
// Three shapes here:
//   - per-book PUT or DELETE, using each book's own library
//   - a library-scoped bulk endpoint, fanned out one call per library
//   - operations that only make sense within one library, gated

import type { Book, BookLibraryRef } from '../types'

type CallApi = <T>(path: string, init?: RequestInit) => Promise<T>

/**
 * The library a book belongs to for the purpose of editing it.
 *
 * A book can sit in several; the first is the one every per-book route already
 * uses. Floating books have none, and nothing here can act on them.
 */
export const editableLibrary = (book: Book, preferred?: string | null): string | null => {
  // A chosen library wins, but only over books that are actually in it. A book
  // the reader never had in mind keeps its own library rather than being
  // dragged into one it does not belong to.
  if (preferred && (book.libraries ?? []).some(l => l.id === preferred)) return preferred
  return book.library_id
}

/** Books held by more than one library, so "act on this book" is ambiguous. */
export const ambiguousBooks = (books: Book[]): Book[] =>
  books.filter(b => (b.libraries ?? []).length > 1)

/**
 * Libraries that every one of these books is in.
 *
 * The intersection rather than the union, because the dialog offers one answer
 * for the whole batch: a library only half of them are in would resolve half
 * the selection and silently leave the rest wherever they sorted. An empty
 * result is a real answer, and the caller says so rather than guessing.
 */
export function commonLibraries(books: Book[]): BookLibraryRef[] {
  if (books.length === 0) return []
  const [first, ...rest] = books
  return (first.libraries ?? []).filter(candidate =>
    rest.every(b => (b.libraries ?? []).some(l => l.id === candidate.id))
  )
}

/**
 * Books grouped by the library the request will be made against.
 *
 * Floating books are dropped rather than guessed at: a suggestion or a
 * wishlist entry has no library to enrich it in.
 */
export function byLibrary(books: Book[], preferred?: string | null): Map<string, Book[]> {
  const groups = new Map<string, Book[]>()
  for (const book of books) {
    const id = editableLibrary(book, preferred)
    if (!id) continue
    const list = groups.get(id)
    if (list) list.push(book)
    else groups.set(id, [book])
  }
  return groups
}

/** The one library a selection is in, or null when it spans several or none. */
export function singleLibrary(books: Book[]): string | null {
  const groups = byLibrary(books)
  return groups.size === 1 ? [...groups.keys()][0] : null
}

/**
 * The body a book PUT needs.
 *
 * A PUT replaces the whole record, so every field has to be sent back or the
 * ones left out are cleared. That is why this reads the book and overrides one
 * field rather than sending the change alone.
 */
export function bookPatchBody(
  book: Book,
  overrides: { media_type_id?: string; tag_ids?: string[]; genre_ids?: string[] },
) {
  return {
    title: book.title,
    subtitle: book.subtitle,
    media_type_id: overrides.media_type_id ?? book.media_type_id,
    description: book.description,
    contributors: book.contributors.map(c => ({
      contributor_id: c.contributor_id,
      role: c.role,
      display_order: c.display_order,
    })),
    tag_ids: overrides.tag_ids ?? book.tags.map(t => t.id),
    genre_ids: overrides.genre_ids ?? (book.genres ?? []).map(g => g.id),
  }
}

export interface BulkResult {
  ok: number
  failed: number
}

/**
 * Apply a per-book edit across the selection.
 *
 * Sequential rather than parallel. These are writes against rows the reader is
 * looking at, and a hundred concurrent PUTs to the same table buys a moment of
 * wall-clock for a much worse failure mode.
 *
 * A failure on one book does not stop the rest: the reader asked for the whole
 * set, and stopping halfway leaves them guessing which half happened. The
 * count comes back so the caller can say.
 */
export async function applyToEach(
  callApi: CallApi,
  books: Book[],
  transform: (book: Book) => object,
  preferred?: string | null,
): Promise<BulkResult> {
  let ok = 0
  let failed = 0
  for (const book of books) {
    const library = editableLibrary(book, preferred)
    if (!library) { failed++; continue }
    try {
      await callApi(`/api/v1/libraries/${library}/books/${book.id}`, {
        method: 'PUT',
        body: JSON.stringify(transform(book)),
      })
      ok++
    } catch {
      failed++
    }
  }
  return { ok, failed }
}

export async function deleteEach(
  callApi: CallApi,
  books: Book[],
  preferred?: string | null,
): Promise<BulkResult> {
  let ok = 0
  let failed = 0
  for (const book of books) {
    const library = editableLibrary(book, preferred)
    if (!library) { failed++; continue }
    try {
      await callApi(`/api/v1/libraries/${library}/books/${book.id}`, { method: 'DELETE' })
      ok++
    } catch {
      failed++
    }
  }
  return { ok, failed }
}

/**
 * Call a library-scoped bulk endpoint once per library in the selection.
 *
 * The endpoints take a library in the path and a list of book ids in the body,
 * so a selection spanning three libraries is three calls. Sending every id to
 * one library's endpoint would be rejected, or worse, silently ignored.
 */
export async function fanOutByLibrary(
  callApi: CallApi,
  books: Book[],
  path: (library: string) => string,
  body: (bookIds: string[]) => object,
  preferred?: string | null,
): Promise<BulkResult> {
  let ok = 0
  let failed = 0
  for (const [library, group] of byLibrary(books, preferred)) {
    try {
      await callApi(path(library), {
        method: 'POST',
        body: JSON.stringify(body(group.map(b => b.id))),
      })
      ok += group.length
    } catch {
      failed += group.length
    }
  }
  return { ok, failed }
}

/**
 * Put a selection on a list, or take it off.
 *
 * Membership is its own row, added and removed one book at a time. Adding is
 * idempotent server-side, so re-adding a book already on the list costs a
 * request and changes nothing rather than failing the batch.
 *
 * Addressed through /me/lists rather than through the library's shelf route:
 * the shelf route only ever saw lists shared with a library, so a private list
 * could not be filled from here at all.
 */
export async function addToList(
  callApi: CallApi,
  books: Book[],
  listId: string,
): Promise<BulkResult> {
  return eachBook(books, book =>
    callApi(`/api/v1/me/lists/${listId}/books/${book.id}`, { method: 'POST' }))
}

export async function removeFromList(
  callApi: CallApi,
  books: Book[],
  listId: string,
): Promise<BulkResult> {
  return eachBook(books, book =>
    callApi(`/api/v1/me/lists/${listId}/books/${book.id}`, { method: 'DELETE' }))
}

/** One request per book, counting what worked rather than stopping at the first failure. */
async function eachBook(books: Book[], run: (b: Book) => Promise<unknown>): Promise<BulkResult> {
  let ok = 0
  let failed = 0
  for (const book of books) {
    try {
      await run(book)
      ok++
    } catch {
      failed++
    }
  }
  return { ok, failed }
}
