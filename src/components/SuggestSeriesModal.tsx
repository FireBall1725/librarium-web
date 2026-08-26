// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Find series hiding in books nobody has filed.
//
// A collection imported from a spreadsheet arrives as a thousand loose titles,
// and the runs inside it are obvious to a reader and invisible to the product.
// This scans for books whose titles share a base name plus a volume number and
// offers to make each cluster a series.
//
// Lifted out of LibraryPage with the rest of the Series section. It still takes
// one library, because a series row belongs to one and the books it would file
// are that library's books; the caller picks which before opening it.

import { useEffect, useState } from 'react'
import { useAuth, ApiError } from '../auth/AuthContext'
import type { SeriesSuggestion } from '../types'

interface SuggestSeriesModalProps {
  libraryId: string
  onClose: () => void
  onCreated: (count: number) => void
}

type SuggestionRow = {
  proposedName: string
  normalized: string
  include: boolean
  books: Array<{
    book_id: string
    title: string
    subtitle: string
    cover_url: string | null
    selected: boolean
    positionStr: string
  }>
}

export default function SuggestSeriesModal({ libraryId, onClose, onCreated }: SuggestSeriesModalProps) {
  const { callApi } = useAuth()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const [rows, setRows] = useState<SuggestionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    callApi<SeriesSuggestion[]>(`/api/v1/libraries/${libraryId}/series/suggest`)
      .then(list => {
        if (cancelled) return
        setRows((list ?? []).map((s, idx) => ({
          proposedName: s.proposed_name,
          normalized: `${idx}-${s.proposed_name}`,
          include: true,
          books: s.books.map(b => ({
            book_id: b.book_id,
            title: b.title,
            subtitle: b.subtitle,
            cover_url: b.cover_url,
            selected: true,
            positionStr: String(b.position),
          })),
        })))
      })
      .catch(err => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load suggestions') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setName = (i: number, v: string) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, proposedName: v } : r))
  const toggleSeries = (i: number) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, include: !r.include } : r))
  const toggleBook = (i: number, j: number) =>
    setRows(rs => rs.map((r, idx) => idx === i
      ? { ...r, books: r.books.map((b, bi) => bi === j ? { ...b, selected: !b.selected } : b) }
      : r))
  const setBookPos = (i: number, j: number, v: string) =>
    setRows(rs => rs.map((r, idx) => idx === i
      ? { ...r, books: r.books.map((b, bi) => bi === j ? { ...b, positionStr: v } : b) }
      : r))

  const includedCount = rows.filter(r => r.include && r.proposedName.trim() !== '' && r.books.some(b => b.selected)).length
  const totalBookCount = rows.reduce((s, r) => r.include ? s + r.books.filter(b => b.selected).length : s, 0)

  const apply = async () => {
    const payload = {
      series: rows
        .filter(r => r.include && r.proposedName.trim() !== '')
        .map(r => ({
          name: r.proposedName.trim(),
          books: r.books
            .filter(b => b.selected)
            .map(b => ({ book_id: b.book_id, position: Number(b.positionStr) }))
            .filter(b => !Number.isNaN(b.position) && b.position > 0),
        }))
        .filter(s => s.books.length > 0),
    }
    if (payload.series.length === 0) return
    setIsSaving(true)
    try {
      const resp = await callApi<{ created: number }>(
        `/api/v1/libraries/${libraryId}/series/bulk-create`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      onCreated(resp?.created ?? 0)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create series')
 } finally {
 setIsSaving(false)
 }
 }

 return (
 <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-16 px-4">
 <div className="w-full max-w-3xl rounded-xl bg-surface shadow-xl">
 <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
 <div>
 <h3 className="text-base font-semibold text-gray-900 dark:text-white">Suggest series</h3>
 <p className="text-xs text-content-muted mt-0.5">
 Groups of un-grouped books whose titles share a base name plus a volume number. Defaults to manga-ish formats.
 </p>
 </div>
 <button type="button" onClick={onClose}
 className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-surface-inset transition-colors"
 aria-label="Close">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 <div className="px-6 py-4">
 {isLoading && <p className="text-sm text-content-muted text-center py-8">Scanning library…</p>}
 {!isLoading && error && <p className="text-sm text-danger mb-3">{error}</p>}
 {!isLoading && !error && rows.length === 0 && (
 <p className="text-sm text-content-muted text-center py-8">
 Nothing to suggest. Either every book is already in a series, or no groups of 2+ with volume numbers were found.
 </p>
 )}
 {!isLoading && rows.length > 0 && (
 <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
 {rows.map((r, i) => (
 <div key={r.normalized}
 className={`rounded-lg border ${r.include ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'} bg-surface-raised dark:bg-gray-900`}>
 <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
 <input type="checkbox" checked={r.include} onChange={() => toggleSeries(i)}
 className="h-4 w-4 rounded border-line-strong text-blue-600 focus:ring-blue-500" />
 <input type="text" value={r.proposedName} onChange={e => setName(i, e.target.value)}
 className="flex-1 rounded-md border border-line-strong px-2 py-1 text-sm font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
 <span className="text-xs text-content-muted whitespace-nowrap">
 {r.books.filter(b => b.selected).length}/{r.books.length} books
 </span>
 </div>
 {r.include && (
 <ul className="divide-y divide-gray-100 dark:divide-gray-800">
 {r.books.map((b, j) => (
 <li key={b.book_id} className="flex items-center gap-3 px-4 py-2">
 <input type="checkbox" checked={b.selected} onChange={() => toggleBook(i, j)}
 className="h-4 w-4 rounded border-line-strong text-blue-600 focus:ring-blue-500" />
 {b.cover_url ? (
 <img src={b.cover_url} alt=""
 className="h-10 w-7 flex-shrink-0 rounded object-cover bg-gray-100 dark:bg-gray-800" />
 ) : (
 <div className="h-10 w-7 flex-shrink-0 rounded bg-gray-100 dark:bg-gray-800" />
 )}
 <div className="flex-1 min-w-0">
 <p className="text-sm text-content truncate">{b.title}</p>
 {b.subtitle && <p className="text-xs text-content-subtle truncate">{b.subtitle}</p>}
 </div>
 <label className="flex items-center gap-1 text-xs text-content-muted dark:text-gray-400">
 #
 <input type="number" step="0.5" min="0" value={b.positionStr}
 onChange={e => setBookPos(i, j, e.target.value)}
 className="w-16 rounded-md border border-line-strong px-2 py-1 text-xs text-right focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
 </label>
 </li>
 ))}
 </ul>
 )}
 </div>
 ))}
 </div>
 )}
 </div>

 <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
 <p className="text-xs text-content-muted dark:text-gray-400">
 {includedCount > 0 ? `${includedCount} series, ${totalBookCount} books` : 'Nothing selected'}
 </p>
 <div className="flex gap-3">
 <button type="button" onClick={onClose}
 className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors">
 Cancel
 </button>
 <button type="button" onClick={apply} disabled={includedCount === 0 || isSaving}
 className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
 {isSaving ? 'Creating…' : `Create ${includedCount} series`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}