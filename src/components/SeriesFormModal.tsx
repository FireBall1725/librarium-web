// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Create or edit a series.
//
// Lifted out of LibraryPage, where it was 375 lines of a 4,183-line file that
// only the per-library section could reach. A series is created from the Series
// page now, which is not inside a library, so the modal had to leave with it.
//
// It takes a library rather than assuming one: series.library_id is NOT NULL,
// so "create a series" on a cross-library page has to answer which library the
// row belongs to. The picker is that answer, and it is hidden when there is
// only one library to pick.

import { useEffect, useState } from 'react'
import { useAuth, ApiError } from '../auth/AuthContext'
import type { Genre, Library, Series, SeriesLookupResult, Tag } from '../types'
import { LANGUAGE_OPTIONS } from './AddEditionModal'
import { TAG_COLORS } from '../lib/tagColours'

interface SeriesFormModalProps {
  /** Where a new series is created. Ignored when editing: the row knows. */
  libraryId: string
  series?: Series | null
  /**
   * Offered as a picker when creating and there is more than one. Omitted by
   * the per-library caller, which already knows the answer.
   */
  libraries?: Library[]
  onClose: () => void
  onSaved: (created?: Series) => void
}

export default function SeriesFormModal({
  libraryId, series, libraries, onClose, onSaved,
}: SeriesFormModalProps) {
  const { callApi } = useAuth()

  // Editing acts on the row's own library; creating acts on the picked one.
  // Sending an edit through a different library would 404 rather than move it.
  const [targetLibrary, setTargetLibrary] = useState(series?.library_id ?? libraryId)
  const actingLibrary = series ? series.library_id : targetLibrary

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Only show search mode when creating a new series
  const [mode, setMode] = useState<'search' | 'manual'>(series ? 'manual' : 'search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SeriesLookupResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: series?.name ?? '',
    description: series?.description ?? '',
    total_count: series?.total_count != null ? String(series.total_count) : '',
    status: series?.status ?? 'ongoing',
    original_language: series?.original_language ?? '',
    publication_year: series?.publication_year != null ? String(series.publication_year) : '',
    demographic: series?.demographic ?? '',
    genres: series?.genres ?? [] as string[],
    url: series?.url ?? '',
    external_id: series?.external_id ?? '',
    external_source: series?.external_source ?? '',
  })
  // The shared genre vocabulary, the same list books pick from. Series used to
  // carry free text nobody checked, which is how one facet ended up counting
  // "Sci-Fi" beside "Science Fiction" beside "Science fiction".
  const [allGenres, setAllGenres] = useState<Genre[]>([])
  const [genreQuery, setGenreQuery] = useState('')
  const [libraryTags, setLibraryTags] = useState<Tag[]>([])
  const [selectedTags, setSelectedTags] = useState<Tag[]>(series?.tags ?? [])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6b7280')
  const [showNewTag, setShowNewTag] = useState(false)
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    callApi<Tag[]>(`/api/v1/libraries/${actingLibrary}/tags`).then(ts => setLibraryTags(ts ?? [])).catch(() => {})
  }, [callApi, actingLibrary])

  useEffect(() => {
    callApi<Genre[]>('/api/v1/genres').then(gs => setAllGenres(gs ?? [])).catch(() => {})
  }, [callApi])

  const createTag = async () => {
    if (!newTagName.trim()) return
    setIsCreatingTag(true)
    try {
      const tag = await callApi<Tag>(`/api/v1/libraries/${actingLibrary}/tags`, {
        method: 'POST',
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      })
      if (tag) { setLibraryTags(ts => [...ts, tag]); setSelectedTags(ts => [...ts, tag]) }
      setNewTagName(''); setShowNewTag(false)
    } catch { /* ignore */ }
    finally { setIsCreatingTag(false) }
  }

  const doSearch = async () => {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setSearchError(null)
    setSearchResults([])
    try {
      const results = await callApi<SeriesLookupResult[]>(
        `/api/v1/lookup/series?q=${encodeURIComponent(searchQuery.trim())}`
      )
      setSearchResults(results ?? [])
      if (!results || results.length === 0) setSearchError('No results found.')
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Search failed')
    } finally {
      setSearchLoading(false)
    }
  }

  const importResult = (r: SeriesLookupResult) => {
    setForm({
      name: r.name || '',
      description: r.description || '',
      total_count: r.total_count != null ? String(r.total_count) : '',
      status: r.status || (r.is_complete ? 'completed' : 'ongoing'),
      original_language: r.original_language || '',
      publication_year: r.publication_year != null ? String(r.publication_year) : '',
      demographic: r.demographic || '',
      genres: r.genres ?? [],
      url: r.url || '',
      external_id: r.external_id || '',
      external_source: r.external_source || '',
    })
    setMode('manual')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setIsLoading(true)
    try {
      const body = {
        name: form.name,
        description: form.description,
        total_count: form.total_count ? Number(form.total_count) : null,
        status: form.status,
        original_language: form.original_language,
        publication_year: form.publication_year ? Number(form.publication_year) : null,
        demographic: form.demographic,
        genres: form.genres,
        url: form.url,
        external_id: form.external_id,
        external_source: form.external_source,
        tag_ids: selectedTags.map(t => t.id),
      }
      const url = series
        ? `/api/v1/libraries/${actingLibrary}/series/${series.id}`
        : `/api/v1/libraries/${actingLibrary}/series`
      const saved = await callApi<Series>(url, {
        method: series ? 'PUT' : 'POST', body: JSON.stringify(body),
      })
      // Handed back so a caller that just created one can open it, rather than
      // reloading a list and asking the reader to find the row they just made.
      onSaved(saved ?? undefined)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save series')
    } finally { setIsLoading(false) }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

  // Only when it is a real choice. One library is not a decision, and editing
  // cannot move a series between libraries: the row's books, tags and shelves
  // all belong to the library it is in.
  const libraryPicker = !series && (libraries?.length ?? 0) > 1 && (
    <div>
      <label className="block text-sm font-medium text-content-secondary mb-1">Library</label>
      <select value={targetLibrary} onChange={e => setTargetLibrary(e.target.value)} className={inputCls}>
        {libraries!.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </div>
  )

 return (
 <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-16 px-4">
 <div className="w-full max-w-md rounded-xl bg-surface shadow-xl">
 {/* Header with tab switcher (new series only) */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
 <h3 className="text-base font-semibold text-gray-900 dark:text-white">
 {series ? 'Edit series' : 'New series'}
 </h3>
 <div className="flex items-center gap-2">
 {!series && (
 <div className="flex rounded-lg border border-line overflow-hidden text-sm">
 <button type="button" onClick={() => setMode('search')}
                  className={`px-3 py-1 transition-colors ${mode === 'search' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  Search
                </button>
                <button type="button" onClick={() => setMode('manual')}
                  className={`px-3 py-1 transition-colors ${mode === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
 Manual
 </button>
 </div>
 )}
 <button type="button" onClick={onClose}
 className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-surface-inset transition-colors"
 aria-label="Close">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>
 </div>

 <div className="px-6 py-5">
 {/* ── Search mode ── */}
 {mode === 'search' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                  placeholder="e.g. One Piece, Bleach, Naruto…"
                  className={inputCls}
                />
                <button type="button" onClick={doSearch} disabled={searchLoading || !searchQuery.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {searchLoading ? '…' : 'Search'}
                </button>
              </div>

              {searchError && <p className="text-sm text-red-600 dark:text-red-400">{searchError}</p>}
              {searchLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Searching providers…</p>}

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
 </p>
 {searchResults.map((r, i) => (
 <button key={i} type="button" onClick={() => importResult(r)}
 className="w-full text-left rounded-xl border border-line bg-surface-muted p-3 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-accent-surface transition-colors">
 <div className="flex gap-3 items-start">
 {r.cover_url && (
 <img src={r.cover_url} alt="" referrerPolicy="no-referrer" className="w-10 h-14 object-cover rounded flex-shrink-0 bg-gray-200 dark:bg-gray-700" />
 )}
 <div className="flex-1 min-w-0">
 <p className="font-medium text-sm text-content truncate">{r.name}</p>
 {r.description && (
 <p className="text-xs text-content-muted mt-0.5 line-clamp-2">{r.description}</p>
 )}
 <div className="flex items-center gap-2 mt-1 flex-wrap">
 {r.total_count != null && (
 <span className="text-xs text-gray-400 dark:text-gray-500">{r.total_count} vols</span>
 )}
 {r.status && (
 <span className={`text-xs rounded-full px-1.5 py-0.5 ${r.status === 'completed' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : r.status === 'hiatus' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : r.status === 'cancelled' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'}`}>
 {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
 </span>
 )}
 {r.demographic && (
 <span className="text-xs text-gray-400 dark:text-gray-500">{r.demographic}</span>
 )}
 {r.original_language && (
 <span className="text-xs text-gray-400 dark:text-gray-500">{r.original_language}</span>
 )}
 <span className="text-xs text-gray-400 dark:text-gray-500">via {r.provider_display}</span>
 </div>
 {r.genres && r.genres.length > 0 && (
 <div className="flex flex-wrap gap-1 mt-1">
 {r.genres.slice(0, 5).map(g => (
 <span key={g} className="text-xs rounded bg-surface-inset text-content-tertiary px-1.5 py-0.5">{g}</span>
 ))}
 </div>
 )}
 </div>
 </div>
 </button>
 ))}
 </div>
 )}

 <button type="button" onClick={() => setMode('manual')}
 className="text-sm text-accent hover:underline">
 Add manually instead →
 </button>
 </div>
 )}

 {/* ── Manual mode ── */}
 {mode === 'manual' && (
 <form onSubmit={handleSubmit} className="space-y-3">
              {libraryPicker}
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Name *</label>
 <input type="text" autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
 placeholder="e.g. Attack on Titan" className={inputCls} />
 </div>
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Description</label>
 <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
 rows={3} placeholder="Optional"
 className={`${inputCls} resize-none`} />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Total volumes</label>
 <input type="number" min="1" value={form.total_count}
 onChange={e => setForm(f => ({ ...f, total_count: e.target.value }))}
 placeholder="e.g. 34" className={inputCls} />
 </div>
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Status</label>
 <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
 className={inputCls}>
 <option value="ongoing">Ongoing</option>
 <option value="completed">Completed</option>
 <option value="hiatus">Hiatus</option>
 <option value="cancelled">Cancelled</option>
 </select>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Original language</label>
 <input type="text" list="series-language-list" value={form.original_language}
 onChange={e => setForm(f => ({ ...f, original_language: e.target.value.toLowerCase() }))}
 placeholder="e.g. ja" className={inputCls} />
 <datalist id="series-language-list">
 {LANGUAGE_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
 </datalist>
 </div>
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Publication year</label>
 <input type="number" min="1900" max="2100" value={form.publication_year}
 onChange={e => setForm(f => ({ ...f, publication_year: e.target.value }))}
 placeholder="e.g. 2019" className={inputCls} />
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Demographic</label>
 <select value={form.demographic} onChange={e => setForm(f => ({ ...f, demographic: e.target.value }))}
 className={inputCls}>
 <option value="">—</option>
 <option value="shounen">Shounen</option>
 <option value="shoujo">Shoujo</option>
 <option value="josei">Josei</option>
 <option value="seinen">Seinen</option>
 <option value="other">Other</option>
 </select>
 </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Genres</label>
                {form.genres.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {form.genres.map(g => (
                      <span key={g}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2.5 py-1 text-xs font-medium text-content-secondary">
                        {g}
                        <button type="button" aria-label={`Remove ${g}`}
                          onClick={() => setForm(f => ({ ...f, genres: f.genres.filter(x => x !== g) }))}
                          className="text-sm leading-none hover:opacity-70">×</button>
                      </span>
                    ))}
                  </div>
                )}
                {/* Picked from the vocabulary, never typed. A genre nobody else
                    uses is a genre no filter will ever find, and inventing them
                    freely is exactly what this replaced. */}
                <input value={genreQuery} onChange={e => setGenreQuery(e.target.value)}
                  placeholder="Search genres…" className={inputCls} />
                {genreQuery.trim() !== '' && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {allGenres
                      .filter(g => !form.genres.includes(g.name)
                        && g.name.toLowerCase().includes(genreQuery.trim().toLowerCase()))
                      .slice(0, 8)
                      .map(g => (
                        <button key={g.id} type="button"
                          onClick={() => {
                            setForm(f => ({ ...f, genres: [...f.genres, g.name] }))
                            setGenreQuery('')
                          }}
                          className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-content-tertiary hover:bg-surface-inset">
                          + {g.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
 <div>
 <div className="flex items-center justify-between mb-1.5">
 <label className="text-sm font-medium text-content-secondary dark:text-gray-300">Tags</label>
 <button type="button" onClick={() => setShowNewTag(v => !v)}
 className="text-xs text-blue-600 hover:underline">+ New tag</button>
 </div>
 <div className="flex flex-wrap gap-1.5 min-h-[28px]">
 {libraryTags.map(tag => {
 const selected = selectedTags.some(t => t.id === tag.id)
 return (
 <button key={tag.id} type="button"
 onClick={() => setSelectedTags(ts => selected ? ts.filter(t => t.id !== tag.id) : [...ts, tag])}
 className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-all ${
 selected ? 'ring-transparent text-white' : 'bg-white dark:bg-gray-800 ring-gray-300 dark:ring-gray-600 text-gray-600 dark:text-gray-300 hover:ring-gray-400'
                        }`}
                        style={selected ? { backgroundColor: tag.color || '#6b7280' } : tag.color ? { color: tag.color } : undefined}>
 {tag.name}
 </button>
 )
 })}
 {libraryTags.length === 0 && !showNewTag && (
 <p className="text-xs text-content-subtle dark:text-gray-500">No tags in this library yet.</p>
 )}
 </div>
 {showNewTag && (
 <div className="mt-2 flex items-center gap-2">
 <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)}
 placeholder="Tag name"
 className="flex-1 h-8 rounded border border-line-strong dark:bg-gray-800 dark:text-white px-2 text-xs focus:border-blue-500 focus:outline-none" />
 <select value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
 className="h-8 rounded border border-line-strong dark:bg-gray-800 dark:text-white px-2 text-xs focus:border-blue-500 focus:outline-none">
 {TAG_COLORS.filter(c => c.value).map(c => (
 <option key={c.value} value={c.value}>{c.label}</option>
 ))}
 </select>
 <button type="button" disabled={isCreatingTag || !newTagName.trim()}
 onClick={createTag}
 className="h-8 px-3 rounded bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">Add</button>
 <button type="button" onClick={() => setShowNewTag(false)}
 className="h-8 px-2 text-content-subtle hover:text-content-tertiary text-lg leading-none">×</button>
 </div>
 )}
 </div>
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Website URL</label>
 <input type="url" value={form.url}
 onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
 placeholder="e.g. https://www.viz.com/one-piece" className={inputCls} />
 </div>
 {error && <div className="rounded-lg bg-danger-surface border border-danger-line px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>}
 <div className="flex gap-3 pt-1">
 <button type="button" onClick={onClose}
 className="flex-1 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors">
 Cancel
 </button>
 <button type="submit" disabled={isLoading || !form.name.trim()}
 className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
 {isLoading ? 'Saving…' : series ? 'Save changes' : 'Create'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}