// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import type { ISBNLookupResult, MediaType } from '../types'
import {
  RESCAN_COOLDOWN_MS,
  addableItems,
  bookBodyFromResult,
  detectMediaTypeId,
  isBooklandCode,
  shouldAccept,
  splitVolumeSuffix,
  withItem,
  type ScannedItem,
} from './scanSession'

const mediaTypes: MediaType[] = [
  { id: 'novel-id', name: 'novel', display_name: 'Novel', book_count: 0 },
  { id: 'manga-id', name: 'manga', display_name: 'Manga', book_count: 0 },
  { id: 'comic-id', name: 'comic', display_name: 'Comic', book_count: 0 },
]

const result = (over: Partial<ISBNLookupResult> = {}): ISBNLookupResult => ({
  provider: 'google_books', provider_display: 'Google Books',
  title: 'A Title', subtitle: '', authors: [], publisher: '', publish_date: '',
  isbn_10: '', isbn_13: '', description: '', cover_url: '', language: '',
  page_count: null, ...over,
})

const item = (code: string, over: Partial<ScannedItem> = {}): ScannedItem =>
  ({ code, status: 'pending', ...over })

describe('isBooklandCode', () => {
  it('accepts the 978 and 979 book prefixes', () => {
    expect(isBooklandCode('9782277124047')).toBe(true)
    expect(isBooklandCode('9791036000263')).toBe(true)
  })

  it('rejects the price barcode printed beside the ISBN one', () => {
    // A UPC-A on a back cover is not the book; looking it up would only fail.
    expect(isBooklandCode('012345678905')).toBe(false)
  })

  it('rejects anything that is not thirteen digits', () => {
    expect(isBooklandCode('2277124044')).toBe(false)
    expect(isBooklandCode('')).toBe(false)
  })
})

describe('shouldAccept', () => {
  it('accepts a new book code', () => {
    expect(shouldAccept('9782277124047', [], null, 1_000)).toBe(true)
  })

  it('ignores a code already in the session', () => {
    const items = [item('9782277124047')]
    expect(shouldAccept('9782277124047', items, null, 99_000)).toBe(false)
  })

  it('ignores repeat fires of the code still held up to the camera', () => {
    // The detector reports on every frame, so without the cooldown one book
    // held steady would fill the list with itself.
    const last = { code: '9791036000263', at: 1_000 }
    expect(shouldAccept('9791036000263', [], last, 1_000 + RESCAN_COOLDOWN_MS - 1)).toBe(false)
  })

  it('accepts the same code again once its cooldown has passed', () => {
    const last = { code: '9791036000263', at: 1_000 }
    expect(shouldAccept('9791036000263', [], last, 1_000 + RESCAN_COOLDOWN_MS)).toBe(true)
  })

  it('does not throttle a different book presented straight after', () => {
    // A sweep moves along the spines quickly. Throttling every scan for the
    // cooldown would silently drop the second of two books shown in a row.
    const last = { code: '9791036000263', at: 1_000 }
    expect(shouldAccept('9782277124047', [], last, 1_050)).toBe(true)
  })
})

describe('detectMediaTypeId', () => {
  it('reads manga from the provider categories', () => {
    expect(detectMediaTypeId(result({ categories: ['Comics & Manga'] }), mediaTypes)).toBe('manga-id')
  })

  it('reads manga from the publisher when categories are silent', () => {
    expect(detectMediaTypeId(result({ publisher: 'VIZ Media LLC' }), mediaTypes)).toBe('manga-id')
  })

  it('reads comic from the categories', () => {
    expect(detectMediaTypeId(result({ categories: ['Graphic Novel'] }), mediaTypes)).toBe('comic-id')
  })

  it('falls back to novel', () => {
    expect(detectMediaTypeId(result(), mediaTypes)).toBe('novel-id')
  })

  it('returns undefined when the instance has no matching type', () => {
    // Media types are admin-configurable, so none of them are guaranteed.
    expect(detectMediaTypeId(result(), [])).toBeUndefined()
  })
})

describe('bookBodyFromResult media type fallback', () => {
  it('falls back to the first configured type on a custom instance', () => {
    // An admin may have replaced novel/manga/comic entirely. Sending an empty
    // id would fail every POST in the sweep rather than just guess less well.
    const custom: MediaType[] = [
      { id: 'roman-id', name: 'roman', display_name: 'Roman', book_count: 0 },
      { id: 'bd-id', name: 'bande-dessinee', display_name: 'BD', book_count: 0 },
    ]
    expect(bookBodyFromResult(result(), custom).media_type_id).toBe('roman-id')
  })

  it('is empty only when the instance has no media types at all', () => {
    expect(bookBodyFromResult(result(), []).media_type_id).toBe('')
  })
})

describe('splitVolumeSuffix', () => {
  it('moves a trailing volume marker into the subtitle', () => {
    expect(splitVolumeSuffix('Berserk, Vol. 12', '')).toEqual({ title: 'Berserk', subtitle: 'Vol. 12' })
  })

  it('leaves a real subtitle alone', () => {
    expect(splitVolumeSuffix('Berserk, Vol. 12', 'Deluxe'))
      .toEqual({ title: 'Berserk, Vol. 12', subtitle: 'Deluxe' })
  })

  it('leaves a title with no volume marker alone', () => {
    expect(splitVolumeSuffix('Fondation', '')).toEqual({ title: 'Fondation', subtitle: '' })
  })
})

describe('bookBodyFromResult', () => {
  it('carries the edition fields the API expects', () => {
    const body = bookBodyFromResult(result({
      title: 'Fondation', publisher: 'Denoël', isbn_13: '9782207301135', page_count: 249,
    }), mediaTypes)
    expect(body.title).toBe('Fondation')
    expect(body.media_type_id).toBe('novel-id')
    expect(body.edition).toMatchObject({
      publisher: 'Denoël', isbn_13: '9782207301135', page_count: 249, is_primary: true,
    })
  })

  it('sends no contributors, leaving them to server enrichment', () => {
    expect(bookBodyFromResult(result({ authors: ['Isaac Asimov'] }), mediaTypes).contributors).toEqual([])
  })
})

describe('addableItems', () => {
  it('keeps only the looked-up codes that are not already shelved', () => {
    const items = [
      item('9782277124047', { status: 'found', result: result() }),
      item('9791036000263', { status: 'duplicate' }),
      item('9782207301135', { status: 'not_found' }),
      item('9782266118057', { status: 'found' }),   // no result payload
    ]
    expect(addableItems(items).map(i => i.code)).toEqual(['9782277124047'])
  })
})

describe('withItem', () => {
  it('patches the matching code and leaves the others untouched', () => {
    const items = [item('a'), item('b')]
    const next = withItem(items, 'b', { status: 'added', bookId: 'xyz' })
    expect(next[0]).toBe(items[0])
    expect(next[1]).toEqual({ code: 'b', status: 'added', bookId: 'xyz' })
  })
})
