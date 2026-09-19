// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import type { MergedBookResult } from '../types'
import {
  authorNames, fieldOptions, hasAnyField, mergedToResult, pickedValue, providerNames, splitAuthorNames, summariseProviders,
} from './mergedLookup'

const dune: MergedBookResult = {
  title: { value: 'Dune', source: 'open_library', source_display: 'Open Library', reason: 'agreed', sources: ['open_library', 'hardcover'], alternatives: [] },
  authors: { value: 'Frank Herbert', source: 'hardcover', source_display: 'Hardcover', reason: 'only', alternatives: [] },
  publisher: {
    value: 'Ace', source: 'open_library', source_display: 'Open Library', reason: 'first', sources: ['open_library'],
    alternatives: [{ value: 'Ace Books', source: 'hardcover', source_display: 'Hardcover', sources: ['hardcover'] }],
  },
  publish_date: { value: '1990', source: 'open_library', source_display: 'Open Library', alternatives: [] },
  page_count: { value: '535', source: 'open_library', source_display: 'Open Library', alternatives: [] },
  covers: [
    { source: 'hardcover', source_display: 'Hardcover', cover_url: 'https://x/big.jpg', width: 600, height: 900 },
    { source: 'open_library', source_display: 'Open Library', cover_url: 'https://x/small.jpg', width: 180, height: 270 },
  ],
  categories: ['Science fiction'],
  providers: [
    { name: 'open_library', display_name: 'Open Library', status: 'answered', millis: 840 },
    { name: 'hardcover', display_name: 'Hardcover', status: 'answered', millis: 1230 },
    { name: 'finna', display_name: 'Finna', status: 'no_record', millis: 300 },
    { name: 'isbndb', display_name: 'ISBNdb', status: 'missed', millis: 0 },
  ],
}

describe('fieldOptions', () => {
  it('lists the pre-selected value first, then the alternatives, with who gave each', () => {
    const opts = fieldOptions(dune.publisher, providerNames(dune))
    expect(opts.map(o => o.value)).toEqual(['Ace', 'Ace Books'])
    expect(opts[1].sourceNames).toEqual(['Hardcover'])
  })
  it('credits every provider that agreed', () => {
    expect(fieldOptions(dune.title, providerNames(dune))[0].sourceNames).toEqual(['Open Library', 'Hardcover'])
  })
  it('handles an older server that sends one source per option', () => {
    expect(fieldOptions(dune.page_count, {})[0].sourceNames).toEqual(['Open Library'])
  })
})

describe('mergedToResult', () => {
  it('uses the pre-selected values and the largest cover by default', () => {
    const r = mergedToResult(dune, {})
    expect(r.publisher).toBe('Ace')
    expect(r.cover_url).toBe('https://x/big.jpg')
    expect(r.authors).toEqual(['Frank Herbert'])
    expect(r.page_count).toBe(535)
    expect(r.categories).toEqual(['Science fiction'])
  })
  it('uses what the person picked', () => {
    const r = mergedToResult(dune, { publisher: 1, cover: 1 })
    expect(r.publisher).toBe('Ace Books')
    expect(r.cover_url).toBe('https://x/small.jpg')
    expect(pickedValue(dune, 'publisher', { publisher: 1 })).toBe('Ace Books')
  })
  it('keeps a year-only date as a year', () => {
    expect(mergedToResult(dune, {}).publish_date).toBe('1990')
  })
})

describe('summariseProviders', () => {
  it('groups providers by what they did and reports the slowest answer', () => {
    const s = summariseProviders(dune.providers)!
    expect(s.answered.map(p => p.name)).toEqual(['open_library', 'hardcover'])
    expect(s.noRecord.map(p => p.name)).toEqual(['finna'])
    expect(s.missed.map(p => p.name)).toEqual(['isbndb'])
    expect(s.seconds).toBe(1.2)
  })
  it('is null for an older server with no report', () => {
    expect(summariseProviders(undefined)).toBeNull()
  })
})

describe('hasAnyField', () => {
  it('is false for an empty lookup', () => {
    expect(hasAnyField({ categories: [], covers: [] })).toBe(false)
    expect(hasAnyField(dune)).toBe(true)
  })
})

describe('author names (librarium-web #84)', () => {
  it('keeps a suffix with the name before it', () => {
    expect(splitAuthorNames('Martin Luther King, Jr., Coretta Scott King'))
      .toEqual(['Martin Luther King, Jr.', 'Coretta Scott King'])
    expect(splitAuthorNames('Neil Gaiman, Terry Pratchett')).toEqual(['Neil Gaiman', 'Terry Pratchett'])
    expect(splitAuthorNames('Jane Smith, PhD, John Doe, M.D.')).toEqual(['Jane Smith, PhD', 'John Doe, M.D.'])
    expect(splitAuthorNames(' , ')).toEqual([])
  })

  it("uses the server's list when it sends one", () => {
    expect(authorNames({ value: 'King, Jr.', values: ['King, Jr.'] })).toEqual(['King, Jr.'])
    expect(authorNames({ value: 'Martin Luther King, Jr.' })).toEqual(['Martin Luther King, Jr.'])
  })

  it('imports the picked option as a list', () => {
    const merged = {
      authors: {
        value: 'Martin Luther King, Jr.', values: ['Martin Luther King, Jr.'], source: 'a', source_display: 'A',
        alternatives: [{ value: 'Neil Gaiman, Terry Pratchett', values: ['Neil Gaiman', 'Terry Pratchett'], source: 'b', source_display: 'B' }],
      },
      categories: [], covers: [],
    } as unknown as MergedBookResult
    expect(mergedToResult(merged, {}).authors).toEqual(['Martin Luther King, Jr.'])
    expect(mergedToResult(merged, { authors: 1 }).authors).toEqual(['Neil Gaiman', 'Terry Pratchett'])
  })
})
