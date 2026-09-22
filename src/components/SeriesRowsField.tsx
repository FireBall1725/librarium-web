// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Series rows for a book form: which series it's in and at what number.
// Shared by the edit form and the add form, so a book can go into its series
// while it's being added rather than after.

import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { SeriesRowDraft } from '../lib/seriesRows'
import type { Series } from '../types'
import SeriesPositionInput from './SeriesPositionInput'

export default function SeriesRowsField({ libraryId, rows, onChange, inputCls, labelCls }: {
  libraryId: string
  rows: SeriesRowDraft[]
  onChange: (rows: SeriesRowDraft[]) => void
  inputCls: string
  labelCls: string
}) {
  const { callApi } = useAuth()
  const [allSeries, setAllSeries] = useState<Series[]>([])

  useEffect(() => {
    if (!libraryId) return
    let live = true
    // A bare array, not an items envelope. The series routes and the newer /me
    // routes disagree on that, and reading the wrong one fails silently.
    callApi<Series[]>(`/api/v1/libraries/${libraryId}/series`)
      .then(r => { if (live) setAllSeries(Array.isArray(r) ? r : []) }).catch(() => {})
    return () => { live = false }
  }, [callApi, libraryId])

  const set = (i: number, patch: Partial<SeriesRowDraft>) =>
    onChange(rows.map((r, n) => n === i ? { ...r, ...patch } : r))

  return (
    <div>
      <label className={labelCls}>Series</label>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              className={inputCls}
              value={row.seriesId}
              onChange={e => set(i, { seriesId: e.target.value })}
              aria-label="Series"
            >
              <option value="">Pick a series…</option>
              {allSeries
                // Already on another row, so it cannot be picked twice
                // and made to hold two positions at once.
                .filter(x => x.id === row.seriesId
                  || !rows.some(r => r.seriesId === x.id))
                .map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <SeriesPositionInput
              // Novellas and specials are numbered 0.1 or 4.5, which is
              // why the column is numeric.
              className={inputCls}
              style={{ width: '6rem' }}
              value={row.position}
              onChange={e => set(i, { position: e.target.value })}
              placeholder="Vol."
              aria-label="Volume number"
            />
            <button type="button"
              onClick={() => onChange(rows.filter((_, n) => n !== i))}
              aria-label="Take out of this series"
              className="rounded px-2 py-1 text-sm text-content-faint hover:bg-surface-inset hover:text-danger">
              ×
            </button>
          </div>
        ))}
        <button type="button"
          onClick={() => onChange([...rows, { seriesId: '', position: '' }])}
          className="rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-xs text-content-tertiary hover:bg-surface-inset">
          + Add to a series
        </button>
      </div>
    </div>
  )
}
