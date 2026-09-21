// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The Books sort: up to four levels, each with its own direction, carried in
// the URL the way the API reads it (sort=author,series,title-desc).
//
// It lives in the URL rather than component state for the same reason the
// filters do. A saved view stores the URL, so a view keeps its sort without
// anything new being stored, the view reads as modified when the sort moves,
// and a shared link opens sorted the way it was sent.

import type { TFunction } from 'i18next'

export type SortField = 'title' | 'author' | 'series' | 'shelf' | 'added' | 'year'

export interface SortLevel {
  field: SortField
  desc: boolean
  /** Series only: standalone books sort by title among the series, not after them. */
  mixed?: boolean
}

/** In the order the field picker lists them. */
export const SORT_FIELDS: SortField[] = ['title', 'author', 'series', 'shelf', 'added', 'year']

/** Shelf, author, series, title: each bookcase in the order its books stand. */
export const MAX_SORT_LEVELS = 4

/** What the two directions are called depends on what is being sorted. */
export type DirectionKind = 'text' | 'series' | 'date'

export const DIRECTION_KIND: Record<SortField, DirectionKind> = {
  title: 'text',
  author: 'text',
  series: 'series',
  shelf: 'text',
  added: 'date',
  year: 'date',
}

export interface SortPreset {
  id: string
  levels: SortLevel[]
}

export const SORT_PRESETS: SortPreset[] = [
  { id: 'shelf', levels: [{ field: 'author', desc: false }, { field: 'series', desc: false }, { field: 'title', desc: false }] },
  { id: 'by_shelf', levels: [{ field: 'shelf', desc: false }, { field: 'author', desc: false }, { field: 'series', desc: false }, { field: 'title', desc: false }] },
  { id: 'title', levels: [{ field: 'title', desc: false }] },
  { id: 'author_title', levels: [{ field: 'author', desc: false }, { field: 'title', desc: false }] },
  { id: 'recent', levels: [{ field: 'added', desc: true }] },
  { id: 'oldest', levels: [{ field: 'year', desc: false }, { field: 'title', desc: false }] },
]

/**
 * What the list does with no sort in the URL: title A to Z, except inside one
 * series, where the server answers in reading order. Kept here so the button
 * can say which one is in effect without asking.
 */
export const DEFAULT_SORT: SortLevel[] = [{ field: 'title', desc: false }]
export const SERIES_SORT: SortLevel[] = [{ field: 'series', desc: false }, { field: 'title', desc: false }]

const FIELD_SET = new Set<string>(SORT_FIELDS)

/**
 * Read the URL form. Mirrors the server: anything it does not recognise is
 * dropped rather than rejected, so an old link still opens on a list.
 */
export function parseSort(raw: string | null | undefined): SortLevel[] {
  if (!raw) return []
  const out: SortLevel[] = []
  const seen = new Set<string>()
  for (const tok of raw.split(',')) {
    const [name, ...flags] = tok.trim().toLowerCase().split('-')
    if (!FIELD_SET.has(name) || seen.has(name)) continue
    const field = name as SortField
    const level: SortLevel = { field, desc: flags.includes('desc') }
    if (field === 'series' && flags.includes('mixed')) level.mixed = true
    seen.add(name)
    out.push(level)
    if (out.length === MAX_SORT_LEVELS) break
  }
  return out
}

/**
 * The URL form, or '' for whatever the list does unasked. That is title A to Z,
 * except inside one series, where it is reading order; so Title picked inside a
 * series is written out, or it would read back as series order.
 *
 * Writing the default as nothing is what keeps a view that was never sorted
 * from reading as modified against the same view with Title picked.
 */
export function formatSort(levels: SortLevel[], inOneSeries = false): string {
  if (!levels.length || sameSort(levels, inOneSeries ? SERIES_SORT : DEFAULT_SORT)) return ''
  return levels
    .map(l => l.field + (l.field === 'series' && l.mixed ? '-mixed' : '') + (l.desc ? '-desc' : ''))
    .join(',')
}

export function sameSort(a: SortLevel[], b: SortLevel[]): boolean {
  return a.length === b.length && a.every((l, i) =>
    l.field === b[i].field && l.desc === b[i].desc && !!l.mixed === !!b[i].mixed)
}

/** The sort actually in effect for a URL sort and a drilled-in series. */
export function effectiveSort(levels: SortLevel[], inOneSeries: boolean): SortLevel[] {
  if (levels.length) return levels
  return inOneSeries ? SERIES_SORT : DEFAULT_SORT
}

export function fieldLabel(field: SortField, t: TFunction): string {
  switch (field) {
    case 'title': return t('sort.field_title', { defaultValue: 'Title' })
    case 'author': return t('sort.field_author', { defaultValue: 'Author' })
    case 'series': return t('sort.field_series', { defaultValue: 'Series' })
    case 'shelf': return t('sort.field_shelf', { defaultValue: 'Shelf' })
    case 'added': return t('sort.field_added', { defaultValue: 'Date added' })
    case 'year': return t('sort.field_year', { defaultValue: 'Year published' })
  }
}

/**
 * The words beside a direction's icon. Per kind of field rather than one
 * "A–Z" for everything: a date runs oldest to newest, not A to Z, and the
 * letters come from the translation so a language with another alphabet can
 * use its own.
 */
export function directionLabel(field: SortField, desc: boolean, t: TFunction): string {
  switch (DIRECTION_KIND[field]) {
    case 'text':
      return desc ? t('sort.dir_text_desc', { defaultValue: 'Z–A' }) : t('sort.dir_text_asc', { defaultValue: 'A–Z' })
    case 'series':
      return desc ? t('sort.dir_series_desc', { defaultValue: 'Z–A, 9–1' }) : t('sort.dir_series_asc', { defaultValue: 'A–Z, 1–9' })
    case 'date':
      return desc ? t('sort.dir_date_desc', { defaultValue: 'Newest first' }) : t('sort.dir_date_asc', { defaultValue: 'Oldest first' })
  }
}

/** "Author › Series › Title (Z–A)", for the sort button. */
export function sortSummary(levels: SortLevel[], t: TFunction): string {
  return levels
    .map(l => l.desc ? `${fieldLabel(l.field, t)} (${directionLabel(l.field, true, t)})` : fieldLabel(l.field, t))
    .join(' › ')
}

/** The toggle's label follows the first level: "Author headings". */
export function headingsLabel(field: SortField, t: TFunction): string {
  switch (field) {
    case 'title': return t('sort.headings_title', { defaultValue: 'Letter headings' })
    case 'author': return t('sort.headings_author', { defaultValue: 'Author headings' })
    case 'series': return t('sort.headings_series', { defaultValue: 'Series headings' })
    case 'shelf': return t('sort.headings_shelf', { defaultValue: 'Shelf headings' })
    case 'added': return t('sort.headings_added', { defaultValue: 'Day headings' })
    case 'year': return t('sort.headings_year', { defaultValue: 'Year headings' })
  }
}

/**
 * Turn the server's sort_heading into what the reader sees.
 *
 * The server says which author, series, letter or year a book was sorted under;
 * the client only names the empty cases in the reader's language and turns a
 * date-added time into a day in the reader's own time zone, which the server
 * does not know.
 */
export function headingText(field: SortField, raw: string | undefined, t: TFunction, locale?: string): string {
  const v = raw ?? ''
  switch (field) {
    case 'author':
      return v || t('sort.no_author', { defaultValue: 'No author' })
    case 'series':
      return v || t('sort.no_series', { defaultValue: 'Not in a series' })
    case 'shelf':
      return v || t('sort.no_shelf', { defaultValue: 'Not on a shelf' })
    case 'year':
      return v || t('sort.no_date', { defaultValue: 'No date' })
    case 'added': {
      // A wishlisted or suggested book has no copy, so no date it arrived.
      if (!v) return t('sort.not_added', { defaultValue: 'Not in a library' })
      const d = new Date(v)
      return Number.isNaN(d.getTime())
        ? v
        : d.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    }
    case 'title':
      return v
  }
}

/** Headings for day-added group by the reader's local day, not the server's. */
export function headingKey(field: SortField, raw: string | undefined): string {
  if (field !== 'added' || !raw) return raw ?? ''
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? raw : d.toDateString()
}
