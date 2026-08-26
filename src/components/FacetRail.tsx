// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The filter rail beside the Books results.
//
// Counts describe the whole filtered set, not the page, and come back with the
// results in one request. That is what makes the rail worth having: you can see
// a filter would return nothing before spending a click on it.

import { useTranslation } from 'react-i18next'
import { formatStars, starsOf } from '../lib/rating'
import {
  FACET_ORDER,
  selectionCount,
  type BookFacets,
  type FacetKey,
  type FacetValue,
  type Selection,
} from '../lib/bookBrowse'

interface FacetRailProps {
  facets: BookFacets | null
  selection: Selection
  onToggle: (key: FacetKey, value: string) => void
  onClear: () => void
  loading?: boolean
}

const LABEL_KEY: Record<FacetKey, string> = {
  ownership: 'facets.ownership',
  library: 'facets.library',
  shelf: 'facets.shelf',
  location: 'facets.location',
  read_status: 'facets.read_status',
  media_type: 'facets.media_type',
  genre: 'facets.genre',
  tag: 'facets.tag',
  rating: 'facets.rating',
  my_rating: 'facets.my_rating',
  favourite: 'facets.favourite',
}

type Translate = ReturnType<typeof useTranslation>['t']

/** Read statuses, ownership and ratings arrive as raw values, not labels. */
function displayLabel(key: FacetKey, v: FacetValue, t: Translate): string {
  if (key === 'ownership') return t(`ownership.${v.value}`, { defaultValue: v.label })
  if (key === 'read_status') return t(`read_status.${v.value}`, { defaultValue: v.label })
  // Halves, because the column holds ten points and the reader counts five
  // stars. Printing the stored number said "8 stars" for four.
  if (key === 'rating' || key === 'my_rating') {
    return t('facets.stars', {
      count: starsOf(Number(v.value)), stars: formatStars(Number(v.value)),
      defaultValue: `${formatStars(Number(v.value))} stars`,
    })
  }
  if (key === 'favourite') return t('facets.favourited', { defaultValue: 'Favourited' })
  return v.label
}

/**
 * The rows worth offering for a dimension.
 *
 * Favourite is a boolean, and both sides are counted so a Favourites view can
 * still show a nought. Only the true side is a filter anyone wants: "not
 * favourited" is the rest of the collection, and offering it as a checkbox
 * alongside puts a row reading 1,674 next to one reading 8.
 */
function visibleValues(key: FacetKey, values: FacetValue[]): FacetValue[] {
  if (key !== 'favourite') return values
  return values.filter(v => v.value === 'true')
}

function FacetGroup({ facetKey, values, selection, onToggle }: {
  facetKey: FacetKey
  values: FacetValue[]
  selection: string[]
  onToggle: (key: FacetKey, value: string) => void
}) {
  const { t } = useTranslation()
  if (!values.length) return null

  return (
    <div className="mb-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-1.5">
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
                    ? 'text-accent font-medium'
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

export default function FacetRail({ facets, selection, onToggle, onClear, loading }: FacetRailProps) {
  const { t } = useTranslation()
  const active = selectionCount(selection)

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
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {FACET_ORDER.map(key => (
        <FacetGroup
          key={key}
          facetKey={key}
          values={visibleValues(key, facets[key] ?? [])}
          selection={selection[key]}
          onToggle={onToggle}
        />
      ))}

      {active > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="w-full rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-inset hover:text-content"
        >
          {t('facets.clear', {
            count: active,
            defaultValue: 'Clear 1 filter',
            defaultValue_other: `Clear ${active} filters`,
          })}
        </button>
      )}
    </div>
  )
}
