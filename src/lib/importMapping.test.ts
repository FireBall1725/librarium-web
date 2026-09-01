// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { autoDetect } from './importMapping'

describe('autoDetect', () => {
  it('maps a shelf column to the shelf field', () => {
    expect(autoDetect('shelf')).toBe('shelf')
    expect(autoDetect('Shelf')).toBe('shelf')
    expect(autoDetect('shelves')).toBe('shelf')
    expect(autoDetect('Shelves')).toBe('shelf')
  })

  // Goodreads exports a Bookshelves column, and it has always arrived as tags.
  // Moving it to the new shelf field would silently change what an existing
  // Goodreads import produces, so it stays where it was.
  it('leaves the Goodreads Bookshelves column on tags', () => {
    expect(autoDetect('Bookshelves')).toBe('tags')
    expect(autoDetect('bookshelves')).toBe('tags')
  })

  it('still maps the fields it did before', () => {
    expect(autoDetect('Title')).toBe('title')
    expect(autoDetect('Author')).toBe('author')
    expect(autoDetect('ISBN13')).toBe('isbn_13')
    expect(autoDetect('Number of Pages')).toBe('page_count')
    expect(autoDetect('Tags')).toBe('tags')
    expect(autoDetect('Media Type')).toBe('media_type')
  })

  it('returns an empty string for a column it does not recognise', () => {
    expect(autoDetect('something else entirely')).toBe('')
  })
})
