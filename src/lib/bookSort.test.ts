// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import {
  DEFAULT_SORT, SERIES_SORT, effectiveSort, formatSort, headingKey, headingText, parseSort, sameSort, sortSummary,
} from './bookSort'

// Returns the default text, which is what the page shows with no translation.
const t = ((_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key) as unknown as TFunction

describe('parseSort', () => {
  it('reads the server format', () => {
    expect(parseSort('author,series-mixed,title-desc')).toEqual([
      { field: 'author', desc: false },
      { field: 'series', desc: false, mixed: true },
      { field: 'title', desc: true },
    ])
  })

  it('drops what it does not know, repeats, and a fourth level', () => {
    expect(parseSort('colour,title,title-desc')).toEqual([{ field: 'title', desc: false }])
    expect(parseSort('title,author,series,year')).toHaveLength(3)
    expect(parseSort('')).toEqual([])
    expect(parseSort(null)).toEqual([])
  })

  it('only lets series be mixed', () => {
    expect(parseSort('title-mixed')).toEqual([{ field: 'title', desc: false }])
  })
})

describe('formatSort', () => {
  it('writes the default as nothing', () => {
    expect(formatSort(DEFAULT_SORT)).toBe('')
    expect(formatSort([])).toBe('')
  })

  it('writes Title out inside one series, where nothing means series order', () => {
    expect(formatSort(DEFAULT_SORT, true)).toBe('title')
    expect(formatSort(SERIES_SORT, true)).toBe('')
    expect(formatSort(SERIES_SORT, false)).toBe('series,title')
  })

  it('round-trips', () => {
    const raw = 'author,series-mixed-desc,year'
    expect(formatSort(parseSort(raw))).toBe(raw)
  })
})

describe('effectiveSort', () => {
  it('is series order inside one series when nothing was picked', () => {
    expect(effectiveSort([], true)).toBe(SERIES_SORT)
    expect(effectiveSort([], false)).toBe(DEFAULT_SORT)
  })

  it('lets a picked sort win over series order', () => {
    const picked = [{ field: 'title' as const, desc: true }]
    expect(sameSort(effectiveSort(picked, true), picked)).toBe(true)
  })
})

describe('labels', () => {
  it('summarises with directions only where reversed', () => {
    expect(sortSummary(parseSort('author,series,title-desc'), t)).toBe('Author › Series › Title (Z–A)')
    expect(sortSummary(parseSort('added-desc'), t)).toBe('Date added (Newest first)')
  })

  it('names the empty headings', () => {
    expect(headingText('author', '', t)).toBe('No author')
    expect(headingText('series', undefined, t)).toBe('Not in a series')
    expect(headingText('year', '', t)).toBe('No date')
    expect(headingText('author', 'Douglas Adams', t)).toBe('Douglas Adams')
  })

  it('groups date-added headings by local day, not by the exact time', () => {
    const a = '2026-09-21T13:00:00Z'
    const b = '2026-09-21T13:05:00Z'
    expect(headingKey('added', a)).toBe(headingKey('added', b))
    expect(headingKey('author', 'Douglas Adams')).toBe('Douglas Adams')
  })
})
