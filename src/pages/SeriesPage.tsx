// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Series: every run across the libraries the caller can read.
//
// Rows, not tiles. A series is defined by how far through it you are, and a
// tile can only show a cover and a name. A row has space for the whole volume
// strip, which is the thing worth looking at: the gaps in it are the volumes
// you are missing.

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import AlphabetBar from '../components/AlphabetBar'
import BookCover from '../components/BookCover'
import { usePageTitle } from '../hooks/usePageTitle'
import type { Series } from '../types'

/**
 * The letter a name files under, matching what the API does for authors:
 * accents fold to their base, anything else goes to '#'.
 *
 * Client-side here because a series has no sort_name column to file it by, so
 * there is nothing for the server to have decided.
 */
function indexLetter(name: string): string {
  // NFD splits an accented letter into base plus combining mark; dropping the
  // marks leaves the base, so Émile files under E rather than '#'.
  const first = name.trim().normalize('NFD').replace(/[̀-ͯ]/g, '')[0]
  if (!first) return '#'
  const upper = first.toUpperCase()
  return upper >= 'A' && upper <= 'Z' ? upper : '#'
}

export default function SeriesPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('nav.series', { defaultValue: 'Series' }))

  const [params, setParams] = useSearchParams()
  const letter = params.get('letter')

  const [series, setSeries] = useState<Series[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    callApi<{ items: Series[] }>('/api/v1/me/series/index')
      .then(res => { if (!cancelled) setSeries(res.items ?? []) })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setSeries([]) } })
    return () => { cancelled = true }
  }, [callApi])

  const available = useMemo(
    () => new Set((series ?? []).map(s => indexLetter(s.name))),
    [series]
  )

  const shown = useMemo(
    () => (series ?? []).filter(s => !letter || indexLetter(s.name) === letter),
    [series, letter]
  )

  const setLetter = (value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete('letter')
    else next.set('letter', value)
    setParams(next, { replace: true })
  }

  return (
    <>
      <PageHeader
        title={t('nav.series', { defaultValue: 'Series' })}
        description={
          series === null
            ? undefined
            : t('series.count', {
                count: series.length,
                defaultValue: '{{count}} across every library',
              })
        }
      />

      <div className="px-8 py-6">
      <AlphabetBar available={available} active={letter} onSelect={setLetter} />

      {error && (
        <p className="mt-6 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {series === null && (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-inset" />
          ))}
        </div>
      )}

      {series !== null && shown.length === 0 && !error && (
        <p className="font-display mt-12 text-center text-xl text-content-secondary">
          {letter
            ? t('series.none_under', { letter, defaultValue: 'No series under {{letter}}' })
            : t('series.none', { defaultValue: 'No series yet' })}
        </p>
      )}

      {series !== null && shown.length > 0 && (
        <ul className="mt-4">
          {shown.map(s => {
            // total_count is what the series is meant to have; book_count is
            // what this library holds. The difference is the missing volumes,
            // which is the number a reader is actually looking for.
            const missing = s.total_count ? Math.max(0, s.total_count - s.book_count) : 0
            const hiddenVolumes = s.book_count - s.preview_books.length
            return (
              <li key={s.id} className="border-b border-line px-0.5 pb-3 pt-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link
                    to={`/libraries/${s.library_id}/series/${s.id}`}
                    className="font-display text-[22px] font-semibold leading-tight text-content hover:text-accent"
                  >
                    {s.name}
                  </Link>
                  {s.total_count ? (
                    missing > 0 ? (
                      <span className="rounded-full border border-warning-line px-2.5 py-[3px] text-[11px] text-warning">
                        {t('series.missing', { count: missing, defaultValue: '{{count}} missing' })}
                      </span>
                    ) : (
                      <span className="rounded-full border border-success-line px-2.5 py-[3px] text-[11px] text-success">
                        {t('series.complete', { defaultValue: 'complete' })}
                      </span>
                    )
                  ) : null}
                </div>

                <p className="mt-1 text-xs tabular-nums text-content-muted">
                  {[
                    s.total_count
                      ? t('series.own_of', {
                          have: s.book_count, total: s.total_count,
                          defaultValue: 'own {{have}} of {{total}}',
                        })
                      : t('series.own', { count: s.book_count, defaultValue: '{{count}} volumes' }),
                    t('series.read_count', { count: s.read_count, defaultValue: '{{count}} read' }),
                  ].join(' · ')}
                </p>

                {/* Sideways scroll rather than a wrap. A run reads as a run
                    when it stays on one line, and wrapping a fifty-volume
                    series turns one row into a wall. */}
                <div className="mt-3 flex items-end gap-1.5 overflow-x-auto pb-1">
                  {s.preview_books.map(v => (
                    <Link
                      key={v.book_id}
                      to={`/books/${v.book_id}`}
                      title={v.title}
                      className="w-[30px] flex-none"
                    >
                      <BookCover
                        title={v.title}
                        coverUrl={v.cover_url}
                        seed={s.name}
                        hideLabel
                        className="w-[30px]"
                        innerClassName="shadow-none"
                      />
                    </Link>
                  ))}
                  {hiddenVolumes > 0 && (
                    <span className="flex-none self-center pl-1 text-[11px] tabular-nums text-content-muted">
                      {t('series.more_volumes', {
                        count: hiddenVolumes,
                        defaultValue: '+{{count}} more',
                      })}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      </div>
    </>
  )
}
