// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { displayPublishDate, isPublishDate } from './publishDate'

describe('displayPublishDate', () => {
  it('shows a year-only date as the year', () => {
    expect(displayPublishDate('1965-01-01', 'year')).toBe('1965')
  })
  it('shows a month as year and month', () => {
    expect(displayPublishDate('1965-08-01', 'month')).toBe('1965-08')
  })
  it('keeps a full date, and a date from a server that sends no precision', () => {
    expect(displayPublishDate('1965-08-15', 'day')).toBe('1965-08-15')
    expect(displayPublishDate('1965-01-01', undefined)).toBe('1965-01-01')
  })
  it('handles no date', () => {
    expect(displayPublishDate(null, 'year')).toBe('')
  })
})

describe('isPublishDate', () => {
  it('accepts a year, a month and a day', () => {
    for (const v of ['', '1965', '1965-08', '1965-08-15']) expect(isPublishDate(v)).toBe(true)
  })
  it('rejects anything else', () => {
    for (const v of ['65', '1965-13', '1965-8', '1965-08-32', 'August 1965']) expect(isPublishDate(v)).toBe(false)
  })
})
