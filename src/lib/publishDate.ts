// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Publish dates can be a year, a month or a full day. The API stores a
// year-only date as 1 January and says how precise it is, so the form shows
// "1965" rather than a 1 January nobody entered.

export type DatePrecision = 'year' | 'month' | 'day'

// The shapes the API accepts from a form: YYYY, YYYY-MM or YYYY-MM-DD.
const PARTIAL_DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/

export function isPublishDate(value: string): boolean {
  return value === '' || PARTIAL_DATE.test(value.trim())
}

// A stored date trimmed to the precision it was saved with. Without a
// precision (an older server) it's shown as stored.
export function displayPublishDate(date: string | null | undefined, precision?: DatePrecision | null): string {
  if (!date) return ''
  if (precision === 'year') return date.slice(0, 4)
  if (precision === 'month') return date.slice(0, 7)
  return date
}
