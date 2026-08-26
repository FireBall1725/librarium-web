// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The filter rail beside the Series results.
//
// Same contract as the Books rail, and for the same reason: counts describe the
// whole filtered set rather than a page, they come back with the results in one
// request, and each dimension is counted with its own selection excluded. That
// last rule is what a rail is for. Without it, ticking Ongoing leaves only
// Ongoing on offer and adding Complete becomes impossible without clearing
// first.
//
// A rail without counts would be the pill row moved left and made taller: it
// would look like Books and say less. The counts are the whole reason the
// layout is worth the width.

import { useTranslation } from 'react-i18next'
import type { FacetValue } from '../lib/bookBrowse'

export interface SeriesFacets {
  library: FacetValue[]
  status: FacetValue[]
  arcs: FacetValue[]
  reading: FacetValue[]
  tag: FacetValue[]
}

export type SeriesFacetKey = keyof SeriesFacets

/** URL parameter per dimension. Library is plural because it multi-selects. */
export const SERIES_PARAM: Record<SeriesFacetKey, string> = {
  library: 'lib', status: 'status', arcs: 'arcs', reading: 'reading', tag: 'tag',
}

/**
 * Top to bottom.
 *
 * Library first because it is the one that used to be a folder, and seeing it
 * as a row of checkboxes is what says it is not one any more. Then how far
 * through the run you are, which is what a series page is actually about.
 */
export const SERIES_FACET_ORDER: SeriesFacetKey[] = [
  'library', 'reading', 'status', 'arcs', 'tag',
]

const LABEL_KEY: Record<SeriesFacetKey, string> = {
  library: 'facets.library',
  reading: 'series.reading',
  status: 'series.status',
  arcs: 'series.arcs',
  tag: 'facets.tag',
}

type Translate = ReturnType<typeof useTranslation>['t']

/**
 * Status, arcs and reading arrive as raw values rather than labels, the same
 * way ownership and read status do on Books: the server has no business
 * deciding what a reader's language calls "on hiatus".
 */
function displayLabel(key: SeriesFacetKey, v: FacetValue, t: Translate): string {
  if (key === 'status') return t(`series.status_${v.value}`, { defaultValue: v.label })
  if (key === 'arcs') return t(`series.arcs_${v.value}`, { defaultValue: v.label })
  if (key === 'reading') return t(`series.reading_${v.value}`, { defaultValue: v.label })
  return v.label
}

function Group({ facetKey, values, selection, onToggle }: {
  facetKey: SeriesFacetKey
  values: FacetValue[]
  selection: string[]
  onToggle: (key: SeriesFacetKey, value: string) => void
}) {
  const { t } = useTranslation()
  if (!values.length) return null

  return (
    <div className="mb-5">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
        {t(LABEL_KEY[facetKey])}
      </h3>
      <ul>
        {values.map(v => {
          const checked = selection.includes(v.value)
          return (
            <li key={v.value}>
              <button
                type="button"
                onClick={() => onToggle(facetKey, v.value)}
                aria-pressed={checked}
                className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors ${
                  checked
                    ? 'font-medium text-accent'
                    : 'text-content-secondary hover:bg-surface-inset hover:text-content'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-3.5 w-3.5 flex-none place-items-center rounded-[4px] border text-[9px] text-white ${
                    checked ? 'border-accent bg-accent' : 'border-line-strong'
                  }`}
                >
                  {checked ? '✓' : ''}
                </span>
                <span className="min-w-0 truncate">{displayLabel(facetKey, v, t)}</span>
                <span className="ml-auto text-xs tabular-nums text-content-muted">{v.count}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function SeriesFacetRail({ facets, selection, onToggle, onClear }: {
  facets: SeriesFacets | null
  selection: Record<SeriesFacetKey, string[]>
  onToggle: (key: SeriesFacetKey, value: string) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const active = SERIES_FACET_ORDER.reduce((n, k) => n + (selection[k]?.length ?? 0), 0)

  if (!facets) {
    return (
      <div aria-busy="true" className="space-y-5">
        {[0, 1, 2].map(i => (
          <div key={i}>
            <div className="mb-2 h-3 w-24 animate-pulse rounded bg-surface-inset" />
            {[0, 1, 2].map(j => (
              <div key={j} className="mb-1.5 h-4 w-full animate-pulse rounded bg-surface-inset" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {SERIES_FACET_ORDER.map(key => (
        <Group key={key} facetKey={key} values={facets[key] ?? []}
          selection={selection[key] ?? []} onToggle={onToggle} />
      ))}

      {active > 0 && (
        <button type="button" onClick={onClear}
          className="w-full rounded-md border border-line-strong px-2 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-inset">
          {t('series.clear_filters', {
            count: active,
            defaultValue: 'Clear 1 filter',
            defaultValue_other: `Clear ${active} filters`,
          })}
        </button>
      )}
    </div>
  )
}
