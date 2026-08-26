// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Turning what someone typed into a filter.
//
// The facet rail could always express these; the keyboard could not. Typing was
// a single blunt `q=` that matched titles and contributor names together, so
// "Tite Kubo" also found a book called Tite, and the only way to filter by a
// tag was to spot it in the rail and click it.
//
// A suggestion resolves to the same toggle the checkbox calls. There is no
// parallel chip system: choosing "library: Book Collection" ticks that box, and
// the chip is the box's own rendering. Two systems would drift.

import { PARAM, type BookFacets, type FacetKey } from './bookBrowse'
import { ratingsMatching } from './rating'
import type { SavedList } from './lists'

/** What a suggestion does when chosen. */
export type Suggestion =
  | {
      kind: 'facet'
      /** Which dimension, so the caller can toggle it. */
      facet: FacetKey
      value: string
      label: string
      /** The word shown beside it: Tag, Library, Status. */
      group: string
      count?: number
    }
  | {
      kind: 'contributor'
      /** Filtered by id, so it means the person rather than the string. */
      value: string
      label: string
      group: string
    }
  | {
      kind: 'series'
      value: string
      label: string
      group: string
    }
  | {
      /**
       * A rating, expanded to every stored value that satisfies it.
       *
       * The scale is ten discrete points, so a comparison is a set rather than
       * a range and rides the filter the rail already sends. The server never
       * learns what "more than three stars" means.
       */
      kind: 'rating'
      /** The stored ratings this stands for, 1 to 10. */
      values: number[]
      value: string
      label: string
      group: string
    }
  | {
      /** No dimension claimed it, so it stays a plain search. */
      kind: 'text'
      value: string
      label: string
      group: string
    }

/**
 * Which facets are worth offering by name.
 *
 * Ownership and favourite are excluded: their values are `true`, `false` and
 * `on_shelf`, which nobody types looking for a filter, and the rail says them
 * better than a dropdown would.
 */
const SUGGESTABLE: Array<{ facet: FacetKey; group: string }> = [
  { facet: 'library', group: 'Library' },
  { facet: 'shelf', group: 'List' },
  { facet: 'tag', group: 'Tag' },
  { facet: 'genre', group: 'Genre' },
  { facet: 'media_type', group: 'Type' },
  { facet: 'read_status', group: 'Status' },
]

const fold = (s: string) => s.trim().toLowerCase()

/**
 * A rating, spoken the way people say it.
 *
 * "4 stars", "> 3.5", "at least 4", "5*". The comparison matters because the
 * useful question is rarely one exact value: nobody wants only the fours, they
 * want the fours and up.
 */
const RATING_RE = /^(?:rating|stars?)?\s*(>=|<=|>|<|=|at least|over|under|above|below)?\s*([0-5](?:\.5)?)\s*(\*|stars?|\+)?$/i

export function suggestRating(input: string): Suggestion | null {
  const m = RATING_RE.exec(input.trim())
  if (!m) return null
  const stars = Number(m[2])
  if (!Number.isFinite(stars) || stars <= 0) return null

  // A trailing plus is a comparison wearing a suffix: "4+" means four and up,
  // and it is how people write it far more often than ">= 4".
  const word = fold(m[1] ?? '') || (m[3] === '+' ? '+' : '')
  const op: '>' | '>=' | '<' | '<=' | '=' =
    word === '>' || word === 'over' || word === 'above' ? '>'
      : word === '>=' || word === 'at least' || word === '+' ? '>='
        : word === '<' || word === 'under' || word === 'below' ? '<'
          : word === '<=' ? '<='
            : '='

  const values = ratingsMatching(op, stars)
  if (values.length === 0) return null

  const said =
    op === '=' ? `${stars} stars`
      : op === '>' ? `more than ${stars} stars`
        : op === '>=' ? `${stars} stars and up`
          : op === '<' ? `under ${stars} stars`
            : `${stars} stars and below`

  return { kind: 'rating', values, value: values.join(','), label: said, group: 'Rating' }
}

/**
 * `tag:signed` and the like.
 *
 * Named so the prefix is the group word people already see beside a
 * suggestion, rather than a second vocabulary to learn.
 */
export function parsePrefix(input: string): { group: string; rest: string } | null {
  const at = input.indexOf(':')
  if (at <= 0) return null
  return { group: fold(input.slice(0, at)), rest: input.slice(at + 1).trim() }
}

/**
 * Suggestions for what has been typed, best first.
 *
 * `already` is the current selection, so a filter that is on does not offer
 * itself again: a dropdown that suggests what you just chose reads as a
 * no-op waiting to happen.
 */
export function suggestFacets(
  input: string,
  facets: BookFacets | null,
  lists: SavedList[],
  already: Record<FacetKey, string[]>,
): Suggestion[] {
  const raw = input.trim()
  if (!raw || !facets) return []

  const prefix = parsePrefix(raw)
  const needle = fold(prefix ? prefix.rest : raw)
  if (!needle) return []

  const out: Suggestion[] = []
  for (const { facet, group } of SUGGESTABLE) {
    // A prefix narrows to one dimension, so `tag:manga` cannot also offer the
    // genre of the same name.
    if (prefix && fold(group) !== prefix.group && PARAM[facet] !== prefix.group) continue

    for (const v of facets[facet] ?? []) {
      // A list is a facet by id, so the label is what to match on. Matching the
      // value would compare a UUID against what someone typed.
      const label = facet === 'shelf'
        ? (lists.find(l => l.id === v.value)?.name ?? v.label)
        : v.label
      if (!fold(label).includes(needle)) continue
      if (already[facet]?.includes(v.value)) continue
      out.push({ kind: 'facet', facet, value: v.value, label, group, count: v.count })
    }
  }

  // An exact label first, then a leading match, then the rest. Typing "read"
  // should reach Read before Reading now.
  out.sort((a, b) => rank(a.label, needle) - rank(b.label, needle) ||
    (b.kind === 'facet' ? b.count ?? 0 : 0) - (a.kind === 'facet' ? a.count ?? 0 : 0))
  return out
}

function rank(label: string, needle: string): number {
  const l = fold(label)
  if (l === needle) return 0
  if (l.startsWith(needle)) return 1
  return 2
}

/** The plain-search fallback, always offered last so Enter has a meaning. */
export const textSuggestion = (input: string): Suggestion => ({
  kind: 'text',
  value: input.trim(),
  label: input.trim(),
  group: 'Search',
})
