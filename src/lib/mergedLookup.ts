// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The merged lookup, as Add Book shows it: one value per field, pre-selected
// by the server, with the other answers one click away. The server decides
// the pre-selection and why; this only lists the options and turns the
// person's picks into one result the form can import.

import type { ISBNLookupResult, LookupProviderStatus, MergedBookResult, MergedFieldOption, MergedFieldResult } from '../types'

export type MergedFieldKey =
  | 'title' | 'subtitle' | 'authors' | 'publisher' | 'publish_date'
  | 'page_count' | 'language' | 'isbn_13' | 'isbn_10' | 'description'

// Display order, most identifying first.
export const MERGED_FIELDS: MergedFieldKey[] = [
  'title', 'subtitle', 'authors', 'publisher', 'publish_date',
  'page_count', 'language', 'isbn_13', 'isbn_10', 'description',
]

export interface FieldOption {
  value: string
  // Provider names that gave this value.
  sources: string[]
  // Display names for those providers, in the same order.
  sourceNames: string[]
}

// The pre-selected value first, then each alternative. An older server sends
// one source per option; a newer one sends every provider that agreed.
export function fieldOptions(f: MergedFieldResult | undefined, names: Record<string, string>): FieldOption[] {
  if (!f) return []
  const opt = (value: string, source: string, display: string, sources?: string[]): FieldOption => {
    const list = sources?.length ? sources : [source]
    return { value, sources: list, sourceNames: list.map(s => names[s] ?? (s === source ? display : s)) }
  }
  return [
    opt(f.value, f.source, f.source_display, f.sources),
    ...f.alternatives.map(a => opt(a.value, a.source, a.source_display, a.sources)),
  ]
}

// Picks are option indexes per field; a field that isn't in the map uses the
// server's pre-selection (index 0).
export type Picks = Partial<Record<MergedFieldKey | 'cover', number>>

/** The authors of whichever option is picked, as a list. */
export function pickedAuthors(merged: MergedBookResult, picks: Picks): string[] {
  const f = merged.authors
  if (!f) return []
  const i = picks.authors ?? 0
  return authorNames(i === 0 ? f : f.alternatives[i - 1] ?? f)
}

export function pickedValue(merged: MergedBookResult, field: MergedFieldKey, picks: Picks): string {
  const f = merged[field]
  if (!f) return ''
  const i = picks[field] ?? 0
  return i === 0 ? f.value : f.alternatives[i - 1]?.value ?? f.value
}

// Suffixes that follow a name after a comma without being a name:
// "Martin Luther King, Jr." is one author. The API keeps the same list.
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'phd', 'md', 'esq', 'dds', 'obe', 'mbe', 'cbe', 'kbe'])

/** Splits comma-joined author names, keeping a suffix with the name before it. */
export function splitAuthorNames(s: string): string[] {
  const names: string[] = []
  for (const raw of s.split(',')) {
    const part = raw.trim()
    if (!part) continue
    if (names.length > 0 && NAME_SUFFIXES.has(part.toLowerCase().replaceAll('.', ''))) {
      names[names.length - 1] += `, ${part}`
    } else {
      names.push(part)
    }
  }
  return names
}

/** The author list of one merged option: the server's list when it sent
 *  one, else its joined text split with suffixes kept together. */
export function authorNames(option: Pick<MergedFieldOption, 'value' | 'values'> | undefined): string[] {
  if (!option) return []
  return option.values?.length ? option.values : splitAuthorNames(option.value)
}

// Provider names to display names, from the lookup report and the answers.
export function providerNames(merged: MergedBookResult): Record<string, string> {
  const names: Record<string, string> = {}
  for (const p of merged.providers ?? []) names[p.name] = p.display_name
  for (const key of MERGED_FIELDS) {
    const f = merged[key]
    if (!f) continue
    names[f.source] ??= f.source_display
    for (const a of f.alternatives) names[a.source] ??= a.source_display
  }
  for (const c of merged.covers ?? []) names[c.source] ??= c.source_display
  return names
}

// The picks as one lookup result, so Add Book's existing import fills the
// form the same way it always has.
export function mergedToResult(merged: MergedBookResult, picks: Picks): ISBNLookupResult {
  const v = (k: MergedFieldKey) => pickedValue(merged, k, picks)
  const pages = parseInt(v('page_count'), 10)
  const cover = merged.covers?.[picks.cover ?? 0]
  return {
    provider: 'merged',
    provider_display: '',
    title: v('title'),
    subtitle: v('subtitle'),
    authors: pickedAuthors(merged, picks),
    publisher: v('publisher'),
    publish_date: v('publish_date'),
    isbn_10: v('isbn_10'),
    isbn_13: v('isbn_13'),
    description: v('description'),
    cover_url: cover?.cover_url ?? '',
    language: v('language'),
    page_count: Number.isFinite(pages) && pages > 0 ? pages : null,
    categories: merged.categories ?? [],
  }
}

export function hasAnyField(merged: MergedBookResult | null): boolean {
  return !!merged && (MERGED_FIELDS.some(k => merged[k]) || (merged.covers?.length ?? 0) > 0)
}

export interface LookupSummary {
  answered: LookupProviderStatus[]
  noRecord: LookupProviderStatus[]
  failed: LookupProviderStatus[]
  missed: LookupProviderStatus[]
  // How long the slowest provider that answered took.
  seconds: number
}

export function summariseProviders(providers: LookupProviderStatus[] | undefined): LookupSummary | null {
  if (!providers?.length) return null
  const answered = providers.filter(p => p.status === 'answered')
  const slowest = Math.max(0, ...providers.filter(p => p.status !== 'missed').map(p => p.millis))
  return {
    answered,
    noRecord: providers.filter(p => p.status === 'no_record'),
    failed: providers.filter(p => p.status === 'error'),
    missed: providers.filter(p => p.status === 'missed'),
    seconds: Math.round(slowest / 100) / 10,
  }
}
