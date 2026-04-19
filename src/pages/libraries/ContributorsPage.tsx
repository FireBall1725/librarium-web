// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import type { LibraryOutletContext } from '../../components/LibraryOutlet'
import type { LibraryContributor, PagedContributors } from '../../types'

// ─── ContributorAvatar ────────────────────────────────────────────────────────

type AvatarSize = 'sm' | 'lg'

function ContributorAvatar({ photoUrl, name, size }: { photoUrl: string | null; name: string; size?: AvatarSize }) {
  const [error, setError] = useState(false)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const lg = size === 'lg'

  if (photoUrl && !error) {
    return (
      <img
        src={photoUrl}
        alt={name}
        onError={() => setError(true)}
        className={`rounded-full object-cover flex-shrink-0 ${lg ? 'w-16 h-16' : 'w-8 h-8'}`}
      />
    )
  }
  return (
    <div className={`rounded-full flex-shrink-0 flex items-center justify-center bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold ${lg ? 'w-16 h-16 text-xl' : 'w-8 h-8 text-xs'}`}>
      {initials || '?'}
    </div>
  )
}

export { ContributorAvatar }

// ─── Column config ────────────────────────────────────────────────────────────

type ColKey = 'nationality' | 'born'

const ALL_COLS: ColKey[] = ['nationality', 'born']
const COL_LABELS: Record<ColKey, string> = { nationality: 'Nationality', born: 'Born' }
const DEFAULT_COLS = new Set<ColKey>(['nationality'])

// ─── Add / Edit modal ─────────────────────────────────────────────────────────

function ContributorModal({
  initial,
  libraryId,
  onClose,
  onSaved,
}: {
  initial?: LibraryContributor
  libraryId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { callApi } = useAuth()
  const [name, setName] = useState(initial?.name ?? '')
  const [sortName, setSortName] = useState(initial?.sort_name ?? '')
  const [isCorporate, setIsCorporate] = useState(initial?.is_corporate ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      if (initial) {
        await callApi(`/api/v1/contributors/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed,
            sort_name: sortName,
            is_corporate: isCorporate,
          }),
        })
      } else {
        await callApi('/api/v1/contributors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        })
      }
      onSaved()
      onClose()
    } catch {
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-16 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {initial ? 'Edit contributor' : 'Add contributor'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {initial && (
            <div className="flex items-center gap-3">
              <ContributorAvatar photoUrl={initial.photo_url} name={initial.name} size="lg" />
              <div className="flex-1 text-xs text-gray-500 dark:text-gray-400">
                {libraryId ? (
                  <Link
                    to={`/libraries/${libraryId}/contributors/${initial.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                    onClick={onClose}
                  >
                    Open full profile to manage photo &amp; bio →
                  </Link>
                ) : (
                  <span>Open the full profile to manage photo and bio.</span>
                )}
              </div>
            </div>
          )}
          <div>
            <label className={labelCls}>Name</label>
            <input ref={inputRef} type="text" value={name} onChange={e => setName(e.target.value)}
              required className={inputCls} placeholder="Contributor name" />
          </div>
          {initial && (
            <>
              <div>
                <label className={labelCls}>
                  Sort name <span className="text-gray-400 font-normal">— e.g. "Gaiman, Neil" (leave blank to auto-derive)</span>
                </label>
                <input type="text" value={sortName} onChange={e => setSortName(e.target.value)}
                  placeholder={isCorporate ? name : 'auto-derived from name'}
                  className={inputCls} />
              </div>
              <div className="flex items-center gap-2">
                <input id="list-is-corporate" type="checkbox" checked={isCorporate}
                  onChange={e => setIsCorporate(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="list-is-corporate" className="text-sm text-gray-700 dark:text-gray-300">
                  Corporate entity (publisher, studio, etc.)
                </label>
              </div>
            </>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : initial ? 'Save' : 'Add'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, perPage, total, onPage }: { page: number; perPage: number; total: number; onPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / perPage)
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-gray-400">
      <span>{((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} of {total}</span>
      <div className="flex gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          ‹
        </button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`px-2.5 py-1 rounded border transition-colors ${p === page ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              {p}
            </button>
          )
        })}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          ›
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'table'

export default function ContributorsPage() {
  const { libraryId } = useParams<{ libraryId: string }>()
  const { setExtraCrumbs } = useOutletContext<LibraryOutletContext>()
  const { callApi } = useAuth()

  // Search / filter
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [activeLetter, setActiveLetter] = useState('')
  const [availableLetters, setAvailableLetters] = useState<string[]>([])

  // View
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('librarium:contributors:viewMode') as ViewMode) === 'grid' ? 'grid' : 'table'
  )

  // Columns (table mode)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const saved = localStorage.getItem('librarium:contributors:cols')
      if (saved) return new Set(JSON.parse(saved) as ColKey[])
    } catch { /* ignore */ }
    return new Set(DEFAULT_COLS)
  })
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)

  // Sort / page. Default to library convention: last name first.
  const [sort, setSort] = useState('sort_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Data
  const [data, setData] = useState<PagedContributors | null>(null)
  const [loading, setLoading] = useState(true)

  // Modals
  const [showAdd, setShowAdd] = useState(false)
  const [editContributor, setEditContributor] = useState<LibraryContributor | null>(null)

  // ── Breadcrumbs ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setExtraCrumbs([{ label: 'Contributors' }])
    return () => setExtraCrumbs([])
  }, [setExtraCrumbs])

  // ── Load letters ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!libraryId) return
    callApi<string[]>(`/api/v1/libraries/${libraryId}/contributors/letters`)
      .then(r => setAvailableLetters(r ?? []))
      .catch(() => { /* non-fatal */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId])

  // ── Load contributors ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!libraryId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
        sort,
        sort_dir: sortDir,
      })
      if (search) params.set('q', search)
      if (activeLetter) params.set('letter', activeLetter)
      const result = await callApi<PagedContributors>(
        `/api/v1/libraries/${libraryId}/contributors?${params}`
      )
      setData(result ?? { items: [], total: 0, page, per_page: perPage })
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId, page, perPage, search, activeLetter, sort, sortDir])

  useEffect(() => { load() }, [load])

  // ── Close col picker on outside click ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const setViewModeAndSave = (v: ViewMode) => {
    setViewMode(v)
    localStorage.setItem('librarium:contributors:viewMode', v)
  }

  const toggleCol = (col: ColKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col); else next.add(col)
      localStorage.setItem('librarium:contributors:cols', JSON.stringify([...next]))
      return next
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setActiveLetter('')
    setPage(1)
    setSearch(query)
  }

  const handleLetterClick = (l: string) => {
    const next = activeLetter === l ? '' : l
    setActiveLetter(next)
    setQuery('')
    setSearch('')
    setPage(1)
  }

  const handleSort = (col: string) => {
    if (sort === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(col)
      setSortDir('asc')
    }
    setPage(1)
  }

  const deleteContributor = async (c: LibraryContributor) => {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return
    try {
      await callApi(`/api/v1/contributors/${c.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        alert('Cannot delete: this contributor still has books.')
      }
    }
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageIds = items.map(c => c.id)
  const allOnPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id))
  const someOnPageSelected = pageIds.some(id => selectedIds.has(id)) && !allOnPageSelected

  const sortIcon = (col: string) =>
    sort === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null

  return (
    <div className="px-8 py-6 space-y-3">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search contributors…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
          >
            Search
          </button>
        </form>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0">
          <button
            onClick={() => setViewModeAndSave('table')}
            className={`px-2.5 py-2 transition-colors ${viewMode === 'table' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            title="Table view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 4v16M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
            </svg>
          </button>
          <button
            onClick={() => setViewModeAndSave('grid')}
            className={`px-2.5 py-2 transition-colors ${viewMode === 'grid' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            title="Grid view"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
        </div>

        {/* Column picker (table mode only) */}
        {viewMode === 'table' && (
          <div className="relative flex-shrink-0" ref={colPickerRef}>
            <button
              onClick={() => setColPickerOpen(o => !o)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title="Choose columns"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </button>
            {colPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
                {ALL_COLS.map(col => (
                  <label
                    key={col}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col)}
                      onChange={() => toggleCol(col)}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                    />
                    {COL_LABELS[col]}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          Add contributor
        </button>
      </div>

      {/* ── Alphabet bar ── */}
      {availableLetters.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {availableLetters.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => handleLetterClick(l)}
              className={`w-7 h-7 rounded text-xs font-medium transition-colors ${activeLetter === l ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ── Result count ── */}
      {!loading && data && (
        <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {total} contributor{total !== 1 ? 's' : ''}
          {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
        </p>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && items.length === 0 && (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          {search || activeLetter ? 'No contributors match your filter.' : 'No contributors yet — add some books to get started.'}
        </div>
      )}

      {/* ── Table view ── */}
      {!loading && items.length > 0 && viewMode === 'table' && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="w-8 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={el => { if (el) el.indeterminate = someOnPageSelected }}
                    onChange={e => {
                      if (e.target.checked) setSelectedIds(new Set(pageIds))
                      else setSelectedIds(new Set())
                    }}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <button type="button" onClick={() => handleSort('sort_name')} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                    Name {sortIcon('sort_name') ?? <span className="opacity-0">↑</span>}
                  </button>
                </th>
                {visibleCols.has('nationality') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nationality</th>
                )}
                {visibleCols.has('born') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Born</th>
                )}
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <button type="button" onClick={() => handleSort('book_count')} className="flex items-center gap-1 ml-auto hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                    Books {sortIcon('book_count') ?? <span className="opacity-0">↑</span>}
                  </button>
                </th>
                <th className="sticky right-0 px-4 py-3 bg-gray-50 dark:bg-gray-800 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map(c => (
                <tr key={c.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="w-8 px-3 py-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={e => setSelectedIds(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(c.id); else next.delete(c.id)
                        return next
                      })}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      to={`/libraries/${libraryId}/contributors/${c.id}`}
                      className="flex items-center gap-2.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <ContributorAvatar photoUrl={c.photo_url} name={c.name} />
                      <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                    </Link>
                  </td>
                  {visibleCols.has('nationality') && (
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                      {c.nationality || <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                  )}
                  {visibleCols.has('born') && (
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                      {c.born_date ? new Date(c.born_date).getFullYear() : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 tabular-nums">
                    {c.book_count}
                  </td>
                  <td className="sticky right-0 px-4 py-2 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 transition-colors">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setEditContributor(c)}
                        className="p-1.5 rounded text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        title="Rename"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteContributor(c)}
                        disabled={c.book_count > 0}
                        className="p-1.5 rounded text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500"
                        title={c.book_count > 0 ? 'Cannot delete: has books' : 'Delete'}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Grid view ── */}
      {!loading && items.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
          {items.map(c => (
            <div key={c.id} className="group relative flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-center">
              <div className="relative">
                <Link to={`/libraries/${libraryId}/contributors/${c.id}`}>
                  <ContributorAvatar photoUrl={c.photo_url} name={c.name} size="lg" />
                </Link>
                {/* Action overlay */}
                <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditContributor(c)}
                    className="p-1 rounded bg-white/90 dark:bg-gray-900/90 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 shadow-sm transition-colors"
                    title="Rename"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteContributor(c)}
                    disabled={c.book_count > 0}
                    className="p-1 rounded bg-white/90 dark:bg-gray-900/90 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 shadow-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={c.book_count > 0 ? 'Cannot delete: has books' : 'Delete'}
                  >
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="min-w-0 w-full">
                <Link
                  to={`/libraries/${libraryId}/contributors/${c.id}`}
                  className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {c.name}
                </Link>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {c.book_count} {c.book_count === 1 ? 'book' : 'books'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && total > perPage && (
        <Pagination page={page} perPage={perPage} total={total} onPage={p => { setPage(p); setSelectedIds(new Set()) }} />
      )}

      {/* ── Modals ── */}
      {showAdd && (
        <ContributorModal onClose={() => setShowAdd(false)} onSaved={() => { load(); setAvailableLetters([]); callApi<string[]>(`/api/v1/libraries/${libraryId}/contributors/letters`).then(r => setAvailableLetters(r ?? [])).catch(() => {}) }} />
      )}
      {editContributor && (
        <ContributorModal initial={editContributor} libraryId={libraryId} onClose={() => setEditContributor(null)} onSaved={load} />
      )}
    </div>
  )
}
