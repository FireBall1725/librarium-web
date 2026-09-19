// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import type { CopyLocation, ISBNLookupResult, MediaType, MergedBookResult } from '../types'
import {
  createBookBody, destinationForLibrary, destinationFromPrefs, disagreements, judgeLookup,
  nextShelf, personFromName, prefsWithDestination, type AddBooksPrefs,
} from './addBooks'

const prefs: AddBooksPrefs = {
  last_library_id: 'lib-b',
  by_library: { 'lib-b': { location_id: 'shelf-3', read_status: 'read', list_id: 'list-1' } },
}

describe('the remembered destination', () => {
  it('opens on the last library used, with what was picked there', () => {
    expect(destinationFromPrefs(prefs, ['lib-a', 'lib-b'])).toEqual({ libraryId: 'lib-b', locationId: 'shelf-3', readStatus: 'read', listId: 'list-1' })
  })

  it('prefers the library it was opened from', () => {
    expect(destinationFromPrefs(prefs, ['lib-a', 'lib-b'], 'lib-a').libraryId).toBe('lib-a')
  })

  it('falls back to the first library when the last one is gone', () => {
    expect(destinationFromPrefs(prefs, ['lib-a']).libraryId).toBe('lib-a')
    expect(destinationFromPrefs(undefined, ['lib-a']).readStatus).toBe('unread')
  })

  it('ignores a read status it does not know', () => {
    expect(destinationForLibrary({ by_library: { x: { read_status: 'someday' } } }, 'x').readStatus).toBe('unread')
  })

  it('remembers per library without losing the others', () => {
    const saved = prefsWithDestination(prefs, { libraryId: 'lib-a', locationId: null, readStatus: 'unread', listId: null })
    expect(saved.last_library_id).toBe('lib-a')
    expect(saved.by_library?.['lib-b']?.location_id).toBe('shelf-3')
    expect(saved.by_library?.['lib-a']).toEqual({ location_id: null, read_status: 'unread', list_id: null })
  })
})

describe('adding a looked-up book', () => {
  const novel = { id: 'mt-novel', name: 'novel', display_name: 'Novel' } as MediaType
  const hybrids = {
    provider: 'merged', provider_display: '', title: 'Hybrids', subtitle: '', authors: ['Robert J. Sawyer', 'Jane Doe (Illustrator)'],
    publisher: 'Tor', publish_date: '2003-09-01', isbn_10: '076534906X', isbn_13: '9780765349064', description: '',
    cover_url: '', language: 'en', page_count: 400,
  } as ISBNLookupResult

  it('sends authors by name, with a role in brackets split out', () => {
    const body = createBookBody(hybrids, { libraryId: 'l', locationId: null, readStatus: 'unread', listId: null }, [novel])
    expect(body.contributors).toEqual([
      { name: 'Robert J. Sawyer', role: 'author', display_order: 0 },
      { name: 'Jane Doe', role: 'illustrator', display_order: 1 },
    ])
    expect(body.location_id).toBeUndefined()
  })

  it('files it on the place and keeps the scanned code', () => {
    const body = createBookBody(hybrids, { libraryId: 'l', locationId: 'shelf-3', readStatus: 'unread', listId: null }, [novel],
      { scheme: 'upc', value: '03714500799134906' })
    expect(body.location_id).toBe('shelf-3')
    expect((body.edition as Record<string, unknown>).identifiers).toEqual([{ scheme: 'upc', value: '03714500799134906' }])
  })

  it('leaves a name with brackets that are not a role alone', () => {
    expect(personFromName('Prince (Musician)')).toEqual({ name: 'Prince (Musician)', role: 'author' })
  })
})

describe('what a lookup means for a scan', () => {
  const merged = (extra: Partial<MergedBookResult> = {}): MergedBookResult => ({
    title: { value: 'Hybrids', source: 'hardcover', source_display: 'Hardcover', alternatives: [] },
    categories: [], covers: [], ...extra,
  })

  it('adds a clean match', () => {
    expect(judgeLookup(merged(), { byUPC: false, alreadyHere: false })).toEqual({ kind: 'found' })
  })

  it('flags a book already here', () => {
    expect(judgeLookup(merged(), { byUPC: false, alreadyHere: true })).toEqual({ kind: 'have' })
  })

  it('holds a bare paperback UPC, which may be another book', () => {
    expect(judgeLookup(merged(), { byUPC: true, alreadyHere: false })).toEqual({ kind: 'needs_you', why: 'bare_upc' })
    expect(judgeLookup(merged({ from_isbn: '9780765349064' }), { byUPC: true, alreadyHere: false })).toEqual({ kind: 'found' })
  })

  it('holds an add-on that could be more than one book', () => {
    expect(judgeLookup(merged({ from_isbn: 'x', other_isbns: [{ isbn: 'y', title: 'Other' }] }), { byUPC: true, alreadyHere: false }))
      .toEqual({ kind: 'needs_you', why: 'several' })
  })

  it('holds a scan nobody knew', () => {
    expect(judgeLookup({ categories: [], covers: [] }, { byUPC: false, alreadyHere: false })).toEqual({ kind: 'needs_you', why: 'not_found' })
    expect(judgeLookup(null, { byUPC: false, alreadyHere: false })).toEqual({ kind: 'needs_you', why: 'not_found' })
  })

  it('counts the fields with more than one answer', () => {
    expect(disagreements(merged({
      publish_date: { value: '2003', source: 'a', source_display: 'A', alternatives: [{ value: '2003-09-01', source: 'b', source_display: 'B' }] },
    }))).toBe(1)
  })
})

describe('next shelf', () => {
  const place = (id: string, name: string, parent: string | null = null, extra: Partial<CopyLocation> = {}): CopyLocation => ({
    id, name, parent_id: parent, library_id: 'l', copy_count: 0, created_at: '', ...extra,
  })
  const places = [
    place('case', 'Bookcase 1', null, { shelf_count: 4 }),
    place('s1', 'Shelf 1', 'case'),
    place('s2', 'Shelf 2', 'case'),
    place('office', 'Office'),
  ]

  it('moves to the next shelf that exists', () => {
    expect(nextShelf('s1', places)).toMatchObject({ number: 2, place: { id: 's2' } })
  })

  it('names the next one when it has no place yet', () => {
    expect(nextShelf('s2', places)).toMatchObject({ number: 3, name: 'Shelf 3', place: null, bookcase: { id: 'case' } })
  })

  it('starts at shelf 1 from the bookcase itself', () => {
    expect(nextShelf('case', places)).toMatchObject({ number: 1, place: { id: 's1' } })
  })

  it('has nothing after the last shelf, or for a place that is not a shelf', () => {
    const full = [...places, place('s3', 'Shelf 3', 'case'), place('s4', 'Shelf 4', 'case')]
    expect(nextShelf('s4', full)).toBeNull()
    expect(nextShelf('office', places)).toBeNull()
    expect(nextShelf(null, places)).toBeNull()
  })
})
