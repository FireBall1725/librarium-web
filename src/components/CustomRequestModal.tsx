// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import type {
  ContributorResult,
  Genre,
  MeSeriesResult,
  MeTagResult,
  SuggestionSteeringInput,
  SuggestionSteeringView,
} from '../types'

interface CustomRequestModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (steering: SuggestionSteeringInput) => Promise<void> | void
  submitting: boolean
  // Pre-fills the modal when re-running or editing a steered ask.
  initial?: SuggestionSteeringView | null
}

// Palette per field type — mirrors mockup sections 2/3/4 so the banner and
// Recent Runs entries can visually echo what's in the modal.
type Palette = 'indigo' | 'purple' | 'emerald' | 'amber'

type Chip = { id: string; label: string }

const paletteClasses: Record<
  Palette,
  { chip: string; chipButton: string }
> = {
  indigo: {
    chip: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
    chipButton: 'text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-200',
  },
  purple: {
    chip: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
    chipButton: 'text-purple-500 hover:text-purple-700 dark:hover:text-purple-200',
  },
  emerald: {
    chip: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
    chipButton: 'text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-200',
  },
  amber: {
    chip: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
    chipButton: 'text-amber-500 hover:text-amber-700 dark:hover:text-amber-200',
  },
}

interface ChipComboProps {
  label: string
  palette: Palette
  placeholder: string
  chips: Chip[]
  query: string
  onQueryChange: (v: string) => void
  onRemove: (id: string) => void
  results: Chip[]
  onPick: (c: Chip) => void
  searching: boolean
  disabled: boolean
  footnote?: string
}

// ChipCombo is the shared "chips in a bordered box + inline search input"
// widget used for Authors / Series / Genres / Tags. The mockup puts the
// search input inline with the chips; results surface in a floating panel
// beneath the box.
function ChipCombo({
  label,
  palette,
  placeholder,
  chips,
  query,
  onQueryChange,
  onRemove,
  results,
  onPick,
  searching,
  disabled,
  footnote,
}: ChipComboProps) {
  const pal = paletteClasses[palette]
  const showResults = results.length > 0
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <div className="min-h-[38px] rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 flex flex-wrap gap-1.5 items-center">
          {chips.map(c => (
            <span
              key={c.id}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${pal.chip}`}
            >
              {c.label}
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                disabled={disabled}
                className={`${pal.chipButton} disabled:opacity-50`}
                aria-label={`Remove ${c.label}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
        </div>
        {showResults && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-60 overflow-y-auto">
            {results.map(r => (
              <button
                type="button"
                key={r.id}
                onClick={() => onPick(r)}
                className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        {searching && !showResults && query.trim().length >= 2 && (
          <p className="absolute right-2 top-2 text-xs text-gray-400">Searching…</p>
        )}
      </div>
      {footnote && (
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{footnote}</p>
      )}
    </div>
  )
}

export default function CustomRequestModal({
  open,
  onClose,
  onSubmit,
  submitting,
  initial,
}: CustomRequestModalProps) {
  const { callApi } = useAuth()

  // Selected chips for each field.
  const [authors, setAuthors] = useState<Chip[]>([])
  const [series, setSeries] = useState<Chip[]>([])
  const [genresSel, setGenresSel] = useState<Chip[]>([])
  const [tags, setTags] = useState<Chip[]>([])
  const [notes, setNotes] = useState('')

  // Per-field search query + results.
  const [authorQuery, setAuthorQuery] = useState('')
  const [authorResults, setAuthorResults] = useState<Chip[]>([])
  const [authorSearching, setAuthorSearching] = useState(false)

  const [seriesQuery, setSeriesQuery] = useState('')
  const [seriesResults, setSeriesResults] = useState<Chip[]>([])
  const [seriesSearching, setSeriesSearching] = useState(false)

  const [genreQuery, setGenreQuery] = useState('')
  const [allGenres, setAllGenres] = useState<Genre[]>([])
  const [genresLoading, setGenresLoading] = useState(false)

  const [tagQuery, setTagQuery] = useState('')
  const [tagResults, setTagResults] = useState<Chip[]>([])
  const [tagSearching, setTagSearching] = useState(false)

  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Pre-fill on open from `initial`.
  useEffect(() => {
    if (!open) return
    setAuthors((initial?.authors ?? []).map(a => ({ id: a.id, label: a.name })))
    setSeries((initial?.series ?? []).map(s => ({ id: s.id, label: s.name })))
    setGenresSel((initial?.genres ?? []).map(g => ({ id: g.id, label: g.name })))
    setTags((initial?.tags ?? []).map(t => ({ id: t.id, label: t.name })))
    setNotes(initial?.notes ?? '')
    setAuthorQuery('')
    setAuthorResults([])
    setSeriesQuery('')
    setSeriesResults([])
    setGenreQuery('')
    setTagQuery('')
    setTagResults([])
  }, [open, initial])

  // Genres are global and small — load once, filter locally.
  useEffect(() => {
    if (!open || allGenres.length > 0 || genresLoading) return
    setGenresLoading(true)
    callApi<Genre[]>('/api/v1/genres')
      .then(gs => setAllGenres(gs ?? []))
      .catch(() => setAllGenres([]))
      .finally(() => setGenresLoading(false))
  }, [open, allGenres.length, genresLoading, callApi])

  // Authors search — debounced, min 2 chars.
  useEffect(() => {
    if (!open) return
    const q = authorQuery.trim()
    if (q.length < 2) {
      setAuthorResults([])
      return
    }
    let cancelled = false
    const id = setTimeout(() => {
      setAuthorSearching(true)
      callApi<ContributorResult[]>(`/api/v1/contributors?q=${encodeURIComponent(q)}`)
        .then(rs => {
          if (cancelled) return
          const selectedIds = new Set(authors.map(a => a.id))
          setAuthorResults(
            (rs ?? [])
              .filter(r => !selectedIds.has(r.id))
              .slice(0, 8)
              .map(r => ({ id: r.id, label: r.name })),
          )
        })
        .catch(() => !cancelled && setAuthorResults([]))
        .finally(() => !cancelled && setAuthorSearching(false))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [authorQuery, open, callApi, authors])

  // Series search — debounced, min 2 chars.
  useEffect(() => {
    if (!open) return
    const q = seriesQuery.trim()
    if (q.length < 2) {
      setSeriesResults([])
      return
    }
    let cancelled = false
    const id = setTimeout(() => {
      setSeriesSearching(true)
      callApi<MeSeriesResult[]>(`/api/v1/me/series?q=${encodeURIComponent(q)}`)
        .then(rs => {
          if (cancelled) return
          const selectedIds = new Set(series.map(s => s.id))
          setSeriesResults(
            (rs ?? [])
              .filter(r => !selectedIds.has(r.id))
              .slice(0, 8)
              .map(r => ({ id: r.id, label: r.name })),
          )
        })
        .catch(() => !cancelled && setSeriesResults([]))
        .finally(() => !cancelled && setSeriesSearching(false))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [seriesQuery, open, callApi, series])

  // Tags search — debounced, min 2 chars. Results append " · <library>"
  // when the same tag name exists in multiple libraries.
  useEffect(() => {
    if (!open) return
    const q = tagQuery.trim()
    if (q.length < 2) {
      setTagResults([])
      return
    }
    let cancelled = false
    const id = setTimeout(() => {
      setTagSearching(true)
      callApi<MeTagResult[]>(`/api/v1/me/tags?q=${encodeURIComponent(q)}`)
        .then(rs => {
          if (cancelled) return
          const selectedIds = new Set(tags.map(t => t.id))
          setTagResults(
            (rs ?? [])
              .filter(r => !selectedIds.has(r.id))
              .slice(0, 8)
              .map(r => ({
                id: r.id,
                label: r.ambiguous ? `${r.name} · ${r.library_name}` : r.name,
              })),
          )
        })
        .catch(() => !cancelled && setTagResults([]))
        .finally(() => !cancelled && setTagSearching(false))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [tagQuery, open, callApi, tags])

  // Close on Escape so the modal obeys platform conventions.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, submitting])

  // Genre search is client-side over the globally-loaded list. The results
  // pane only opens once the user starts typing — mirrors the other fields
  // so Genres doesn't auto-balloon open on mount and push everything below
  // off-screen.
  const genreResults = useMemo<Chip[]>(() => {
    const q = genreQuery.trim().toLowerCase()
    if (q.length === 0) return []
    const selectedIds = new Set(genresSel.map(g => g.id))
    return allGenres
      .filter(g => !selectedIds.has(g.id) && g.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map(g => ({ id: g.id, label: g.name }))
  }, [allGenres, genreQuery, genresSel])

  const canSubmit =
    authors.length > 0 ||
    series.length > 0 ||
    genresSel.length > 0 ||
    tags.length > 0 ||
    notes.trim().length > 0

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return
    const payload: SuggestionSteeringInput = {}
    if (authors.length > 0) payload.author_ids = authors.map(a => a.id)
    if (series.length > 0) payload.series_ids = series.map(s => s.id)
    if (genresSel.length > 0) payload.genre_ids = genresSel.map(g => g.id)
    if (tags.length > 0) payload.tag_ids = tags.map(t => t.id)
    const trimmed = notes.trim()
    if (trimmed.length > 0) payload.notes = trimmed
    await onSubmit(payload)
  }, [canSubmit, submitting, authors, series, genresSel, tags, notes, onSubmit])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4"
      onClick={() => {
        if (!submitting) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
      >
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Custom suggestion request
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Pick any combination. Leave fields blank if they don't apply.
              This uses one of your daily runs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 -m-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <ChipCombo
            label="Authors"
            palette="indigo"
            placeholder="Type to search authors…"
            chips={authors}
            query={authorQuery}
            onQueryChange={setAuthorQuery}
            onRemove={id => setAuthors(prev => prev.filter(a => a.id !== id))}
            results={authorResults}
            onPick={c => {
              setAuthors(prev => [...prev, c])
              setAuthorQuery('')
              setAuthorResults([])
            }}
            searching={authorSearching}
            disabled={submitting}
          />

          <ChipCombo
            label="Series"
            palette="purple"
            placeholder="Type to search series…"
            chips={series}
            query={seriesQuery}
            onQueryChange={setSeriesQuery}
            onRemove={id => setSeries(prev => prev.filter(s => s.id !== id))}
            results={seriesResults}
            onPick={c => {
              setSeries(prev => [...prev, c])
              setSeriesQuery('')
              setSeriesResults([])
            }}
            searching={seriesSearching}
            disabled={submitting}
          />

          <ChipCombo
            label="Genres"
            palette="emerald"
            placeholder={
              genresLoading ? 'Loading genres…' : 'Type to search genres…'
            }
            chips={genresSel}
            query={genreQuery}
            onQueryChange={setGenreQuery}
            onRemove={id => setGenresSel(prev => prev.filter(g => g.id !== id))}
            results={genreResults}
            onPick={c => {
              setGenresSel(prev => [...prev, c])
              setGenreQuery('')
            }}
            searching={false}
            disabled={submitting || genresLoading}
          />

          <ChipCombo
            label="Tags"
            palette="amber"
            placeholder="Type to search tags…"
            chips={tags}
            query={tagQuery}
            onQueryChange={setTagQuery}
            onRemove={id => setTags(prev => prev.filter(t => t.id !== id))}
            results={tagResults}
            onPick={c => {
              setTags(prev => [...prev, c])
              setTagQuery('')
              setTagResults([])
            }}
            searching={tagSearching}
            disabled={submitting}
            footnote="Tags are per-library; names suffixed with library when ambiguous."
          />

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder='e.g. "long series I can binge" or "similar tone to Piranesi"'
              disabled={submitting}
              rows={3}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-y"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Generating…' : 'Generate suggestions'}
          </button>
        </div>
      </div>
    </div>
  )
}
