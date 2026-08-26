// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import type { BookSeriesRef, Series } from '../types'

/**
 * The series a book belongs to, and the controls to change that.
 *
 * Putting a book in a series meant leaving the book: the only surface that
 * could do it was the per-library page the redesign is retiring, which is what
 * librarium-web#85 means by the two living in different parts of the app. A
 * book's own page is where someone is standing when they notice it is volume
 * three of something.
 */
export default function BookSeries({
  bookId, libraryId, refs, onChanged,
}: {
  bookId: string
  libraryId: string
  /** The series this book is already in. */
  refs: BookSeriesRef[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const [all, setAll] = useState<Series[]>([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [position, setPosition] = useState('')
  const [picked, setPicked] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  const loadSeries = useCallback(() => {
    let cancelled = false
    void callApi<{ items: Series[] }>(`/api/v1/libraries/${libraryId}/series`)
      .then(r => { if (!cancelled) setAll(r?.items ?? []) })
      .catch(() => { if (!cancelled) setAll([]) })
    return () => { cancelled = true }
  }, [callApi, libraryId])

  useEffect(() => loadSeries(), [loadSeries])
  useEffect(() => { if (naming) nameInput.current?.focus() }, [naming])

  const inAlready = new Set(refs.map(r => r.series_id))
  const available = all.filter(s => !inAlready.has(s.id))

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      onChanged()
      loadSeries()
    } catch {
      setError(t('book_series.failed', { defaultValue: 'That did not save' }))
    } finally {
      setBusy(false)
    }
  }

  const reset = () => { setAdding(false); setNaming(false); setDraft(''); setPosition(''); setPicked('') }

  /** Position is optional. Left blank it goes to the end of what is there. */
  const nextPosition = () =>
    position.trim() !== ''
      ? Number(position)
      : Math.max(0, ...all.filter(s => s.id === picked).map(() => 0), ...refs.map(r => r.position)) + 1

  const addToExisting = () =>
    run(async () => {
      if (!picked) return
      await callApi(`/api/v1/libraries/${libraryId}/series/${picked}/books`, {
        method: 'POST',
        body: JSON.stringify({ book_id: bookId, position: nextPosition() }),
      })
      reset()
    })

  /**
   * Start a series from this book.
   *
   * One step, because a series with nothing in it is not a thing anybody wants
   * and the reader is already looking at its first volume.
   */
  const createAndAdd = () =>
    run(async () => {
      const name = draft.trim()
      if (!name) { reset(); return }
      const made = await callApi<Series>(`/api/v1/libraries/${libraryId}/series`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      if (!made?.id) throw new Error('no series came back')
      await callApi(`/api/v1/libraries/${libraryId}/series/${made.id}/books`, {
        method: 'POST',
        body: JSON.stringify({ book_id: bookId, position: position.trim() !== '' ? Number(position) : 1 }),
      })
      reset()
    })

  const remove = (seriesId: string) =>
    run(() => callApi(
      `/api/v1/libraries/${libraryId}/series/${seriesId}/books/${bookId}`,
      { method: 'DELETE' },
    ))

  return (
    <div className="space-y-2">
      {refs.map(ref => (
        <div key={ref.series_id}
          className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
          <Link
            to={`/books?series=${ref.series_id}`}
            className="group flex min-w-0 items-center gap-3"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-surface">
              <svg className="h-4 w-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-content group-hover:text-accent">
                {ref.series_name}
              </span>
              <span className="block text-xs text-content-muted">
                {t('book_series.volume', {
                  position: formatPosition(ref.position),
                  defaultValue: `Vol. ${formatPosition(ref.position)}`,
                })}
              </span>
            </span>
          </Link>
          <button type="button" disabled={busy} onClick={() => void remove(ref.series_id)}
            title={t('book_series.remove', { defaultValue: 'Take out of this series' })}
            aria-label={t('book_series.remove_named', {
              name: ref.series_name, defaultValue: `Take out of ${ref.series_name}`,
            })}
            className="flex-none rounded px-2 py-1 text-sm text-content-faint hover:bg-surface-inset hover:text-danger">
            ×
          </button>
        </div>
      ))}

      {naming ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={nameInput}
            value={draft}
            disabled={busy}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void createAndAdd() }
              if (e.key === 'Escape') reset()
            }}
            placeholder={t('book_series.name_placeholder', { defaultValue: 'Name the series…' })}
            aria-label={t('book_series.new', { defaultValue: 'New series' })}
            className="lb-field flex-1"
            style={{ minWidth: '12rem' }}
          />
          <PositionInput value={position} onChange={setPosition} disabled={busy} t={t} />
          <button type="button" className="lb-btn sm" disabled={busy || !draft.trim()}
            onClick={() => void createAndAdd()}>
            {t('common.save', { defaultValue: 'Save' })}
          </button>
          <button type="button" className="lb-btn ghost sm" onClick={reset}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
      ) : adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="lb-field flex-1"
            style={{ minWidth: '12rem' }}
            value={picked}
            disabled={busy}
            onChange={e => {
              if (e.target.value === '__new__') { setNaming(true); return }
              setPicked(e.target.value)
            }}
            aria-label={t('book_series.pick', { defaultValue: 'Series' })}
          >
            <option value="">{t('book_series.pick', { defaultValue: 'Series' })}</option>
            {available.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__new__">{t('book_series.new', { defaultValue: 'New series…' })}</option>
          </select>
          <PositionInput value={position} onChange={setPosition} disabled={busy} t={t} />
          <button type="button" className="lb-btn sm" disabled={busy || !picked}
            onClick={() => void addToExisting()}>
            {t('common.save', { defaultValue: 'Save' })}
          </button>
          <button type="button" className="lb-btn ghost sm" onClick={reset}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setAdding(true)}
          className="rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-sm text-content-tertiary hover:bg-surface-inset"
        >
          {t('book_series.add', { defaultValue: '+ Add to a series' })}
        </button>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

function PositionInput({ value, onChange, disabled, t }: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  return (
    <input
      type="number"
      step="0.5"
      min="0"
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      // Half positions are real: side stories and specials are numbered 4.5,
      // which is why the column is numeric rather than an integer.
      placeholder={t('book_series.position', { defaultValue: 'Vol.' })}
      aria-label={t('book_series.position', { defaultValue: 'Volume number' })}
      className="lb-field"
      style={{ width: '6rem' }}
    />
  )
}

/** 3 rather than 3.0, and 4.5 kept. The same rule the book page already uses. */
const formatPosition = (pos: number) => (pos % 1 === 0 ? pos.toFixed(0) : pos.toFixed(1))
