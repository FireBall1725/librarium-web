// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, ApiError } from '../auth/AuthContext'
import type { Book, Tag, Genre, MediaType, ContributorResult, BookEdition, Series } from '../types'
import { fetchLists, type SavedList } from '../lib/lists'
import ContributorRow from './ContributorRow'
import MediaTypeSelect from './MediaTypeSelect'
import { AddEditionModal } from './AddEditionModal'

interface BookFormContributor {
  contributor: ContributorResult | null
  role: string
}

interface Props {
  libraryId: string
  book: Book
  onClose: () => void
  onSaved: (book: Book) => void
  initialTab?: 'details' | 'editions'
}

const inputCls = 'w-full rounded-lg border border-line-strong dark:bg-surface-raised dark:text-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'
const labelCls = 'block text-sm font-medium text-content-secondary mb-1'

const formatBadgeClass = (fmt: string) => {
  if (fmt === 'ebook') return 'bg-accent-surface text-accent-strong ring-accent-line'
  if (fmt === 'audiobook') return 'bg-warning-surface text-warning-strong ring-warning-line'
  return 'bg-accent-surface text-accent-strong ring-accent-line'
}

export default function EditBookModal({ libraryId, book, onClose, onSaved, initialTab = 'details' }: Props) {
  const { callApi } = useAuth()
  const [tab, setTab] = useState<'details' | 'editions'>(initialTab)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Details tab state ──────────────────────────────────────────────────────

  const [form, setForm] = useState({
    title: book.title,
    subtitle: book.subtitle ?? '',
    media_type_id: book.media_type_id,
    description: book.description ?? '',
  })

  const [contributors, setContributors] = useState<BookFormContributor[]>(
    book.contributors.map(c => ({ contributor: { id: c.contributor_id, name: c.name }, role: c.role }))
  )

  const [selectedTags, setSelectedTags] = useState<Tag[]>(book.tags ?? [])
  const [libraryTags, setLibraryTags] = useState<Tag[]>([])
  const [tagQuery, setTagQuery] = useState('')
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [newTagColor, setNewTagColor] = useState('#3b82f6')
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const [selectedGenres, setSelectedGenres] = useState<Genre[]>(book.genres ?? [])
  const [allGenres, setAllGenres] = useState<Genre[]>([])
  const [genreQuery, setGenreQuery] = useState('')
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false)
  const genreInputRef = useRef<HTMLInputElement>(null)

  // Series membership, edited as a diff like everything else in this form.
  // It was the one thing you could not do while editing a book: the modal had
  // no reference to series at all, so putting volume three in its run meant
  // leaving the book you were already looking at. That is what librarium-web#85
  // means by the two living in different parts of the app.
  const [allSeries, setAllSeries] = useState<Series[]>([])
  const [seriesRows, setSeriesRows] = useState<{ seriesId: string; position: string }[]>(
    (book.series ?? []).map(r => ({ seriesId: r.series_id, position: String(r.position) })),
  )
  const initialSeries = useRef(new Map((book.series ?? []).map(r => [r.series_id, r.position])))

  const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])
  const [allShelves, setAllShelves] = useState<SavedList[]>([])
  const [initialShelfIds, setInitialShelfIds] = useState<Set<string>>(new Set())
  const [selectedShelfIds, setSelectedShelfIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    callApi<MediaType[]>('/api/v1/media-types').then(mt => setMediaTypes(mt ?? [])).catch(() => {})
    callApi<Tag[]>(`/api/v1/libraries/${libraryId}/tags`).then(ts => setLibraryTags(ts ?? [])).catch(() => {})
    callApi<Genre[]>('/api/v1/genres').then(gs => setAllGenres(gs ?? [])).catch(() => {})
    // A bare array, not an items envelope. The series routes and the newer /me
    // routes disagree on that, and reading the wrong one fails silently.
    callApi<Series[]>(`/api/v1/libraries/${libraryId}/series`)
      .then(r => setAllSeries(Array.isArray(r) ? r : [])).catch(() => {})
    // Every list this person can see, not the ones one library shares. The
    // shelf route only ever returned lists shared with a library, so a private
    // one was missing from a control that claimed to show them all.
    void fetchLists(callApi)
      .then(all => setAllShelves(all.filter(l => l.kind === 'manual')))
      .catch(() => {})
    callApi<{ items: SavedList[] }>(`/api/v1/books/${book.id}/lists`).then(r => {
      const ss = r?.items ?? []
      const ids = new Set((ss ?? []).map(s => s.id))
      setInitialShelfIds(ids)
      setSelectedShelfIds(new Set(ids))
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId])

  const createTag = async (name: string) => {
    if (!name.trim() || isCreatingTag) return
    setIsCreatingTag(true)
    try {
      const tag = await callApi<Tag>(`/api/v1/libraries/${libraryId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), color: newTagColor }),
      })
      if (tag) {
        setLibraryTags(ts => [...ts, tag])
        setSelectedTags(ts => [...ts, tag])
      }
      setTagQuery('')
      setTagDropdownOpen(false)
    } catch { /* ignore */ }
    finally { setIsCreatingTag(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setError(null)
    setSaving(true)
    try {
      const body = {
        ...form,
        contributors: contributors
          .filter(c => c.contributor !== null)
          .map((c, i) => ({ contributor_id: c.contributor!.id, role: c.role, display_order: i }))
          .filter((c, idx, arr) => arr.findIndex(x => x.contributor_id === c.contributor_id && x.role === c.role) === idx),
        tag_ids: selectedTags.map(t => t.id),
        genre_ids: selectedGenres.map(g => g.id),
      }
      const updated = await callApi<Book>(`/api/v1/libraries/${libraryId}/books/${book.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      const bookId = updated!.id
      for (const id of initialShelfIds) {
        if (!selectedShelfIds.has(id))
          await callApi(`/api/v1/me/lists/${id}/books/${bookId}`, { method: 'DELETE' }).catch(() => {})
      }
      for (const id of selectedShelfIds) {
        if (!initialShelfIds.has(id))
          await callApi(`/api/v1/me/lists/${id}/books/${bookId}`, { method: 'POST' }).catch(() => {})
      }

      // Series, same diff. A row whose position did not move is still posted
      // because the endpoint upserts, and skipping it would mean tracking
      // which change came from where for no gain.
      const kept = new Set(seriesRows.map(r => r.seriesId))
      for (const [seriesId] of initialSeries.current) {
        if (!kept.has(seriesId))
          await callApi(`/api/v1/libraries/${libraryId}/series/${seriesId}/books/${bookId}`,
            { method: 'DELETE' }).catch(() => {})
      }
      for (const row of seriesRows) {
        if (!row.seriesId) continue
        await callApi(`/api/v1/libraries/${libraryId}/series/${row.seriesId}/books`, {
          method: 'POST',
          body: JSON.stringify({
            book_id: bookId,
            position: row.position.trim() !== '' ? Number(row.position) : 1,
          }),
        }).catch(() => {})
      }

      onSaved(updated!)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const filteredTags = libraryTags.filter(
    t => !selectedTags.find(s => s.id === t.id) && t.name.toLowerCase().includes(tagQuery.toLowerCase())
  )
  const filteredGenres = allGenres.filter(
    g => !selectedGenres.find(s => s.id === g.id) && g.name.toLowerCase().includes(genreQuery.toLowerCase())
  )

  // ── Editions tab state ─────────────────────────────────────────────────────

  const [editions, setEditions] = useState<BookEdition[]>([])
  const [editionsLoading, setEditionsLoading] = useState(false)
  const [editionsLoaded, setEditionsLoaded] = useState(false)
  const [showAddEdition, setShowAddEdition] = useState(false)
  const [editEdition, setEditEdition] = useState<BookEdition | null>(null)
  const editionsUrl = `/api/v1/libraries/${libraryId}/books/${book.id}/editions`

  const loadEditions = useCallback(async () => {
    setEditionsLoading(true)
    try {
      const list = await callApi<BookEdition[]>(editionsUrl)
      setEditions(list ?? [])
    } catch { /* ignore */ }
    finally { setEditionsLoading(false); setEditionsLoaded(true) }
  }, [callApi, editionsUrl])

  // Lazy-load editions only when that tab is first opened
  useEffect(() => {
    if (tab === 'editions' && !editionsLoaded) loadEditions()
  }, [tab, editionsLoaded, loadEditions])

  const deleteEdition = async (id: string) => {
    if (!confirm('Delete this edition? Reading records for it will also be deleted.')) return
    await callApi(`${editionsUrl}/${id}`, { method: 'DELETE' }).catch(() => {})
    loadEditions()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-10 px-4">
      <div className="w-full max-w-xl rounded-xl bg-surface shadow-xl flex flex-col">

        {/* Header with tabs */}
        <div className="px-6 pt-4 pb-0 border-b border-line">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-content-muted truncate max-w-sm font-medium">{book.title}</p>
            <button onClick={onClose} className="text-content-subtle hover:text-content-tertiary text-xl leading-none">×</button>
          </div>
          <div className="flex gap-0">
            {(['details', 'editions'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                  tab === t
                    ? 'border-accent text-accent dark:border-accent-line'
                    : 'border-transparent text-content-muted hover:text-content-secondary'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Details tab */}
        {tab === 'details' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Book title" required />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Subtitle</label>
                <input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} className={inputCls} placeholder="Optional subtitle" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Type</label>
              <MediaTypeSelect
                value={form.media_type_id}
                mediaTypes={mediaTypes}
                onChange={id => setForm(f => ({ ...f, media_type_id: id }))}
              />
            </div>

            <div>
              <label className={labelCls}>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={4} className={inputCls + ' resize-none'} placeholder="Optional description" />
            </div>

            <div>
              <label className={labelCls}>Contributors</label>
              <div className="space-y-2">
                {contributors.map((c, i) => (
                  <ContributorRow key={i}
                    contributor={c.contributor} role={c.role}
                    onContributorChange={nc => setContributors(cs => cs.map((x, j) => j === i ? { ...x, contributor: nc } : x))}
                    onRoleChange={r => setContributors(cs => cs.map((x, j) => j === i ? { ...x, role: r } : x))}
                    onRemove={() => setContributors(cs => cs.filter((_, j) => j !== i))}
                  />
                ))}
                <button type="button" onClick={() => setContributors(cs => [...cs, { contributor: null, role: 'author' }])}
                  className="text-sm text-accent hover:underline">+ Add contributor</button>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className={labelCls}>Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {selectedTags.map(t => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: t.color + '22', color: t.color }}>
                    {t.name}
                    <button type="button" onClick={() => setSelectedTags(ts => ts.filter(x => x.id !== t.id))} className="hover:opacity-70 text-sm leading-none">×</button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <input ref={tagInputRef} value={tagQuery} onChange={e => setTagQuery(e.target.value)}
                  onFocus={() => setTagDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setTagDropdownOpen(false), 150)}
                  className={inputCls} placeholder="Search or create tag…" />
                {tagDropdownOpen && (filteredTags.length > 0 || tagQuery.trim()) && (
                  <ul className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface-raised shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {filteredTags.slice(0, 8).map(t => (
                      <li key={t.id}>
                        <button type="button" onMouseDown={e => e.preventDefault()}
                          onClick={() => { setSelectedTags(ts => [...ts, t]); setTagQuery('') }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent-surface flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          {t.name}
                        </button>
                      </li>
                    ))}
                    {tagQuery.trim() && (
                      <li>
                        <div className="flex items-center gap-2 px-3 py-2 border-t border-line-subtle">
                          <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => createTag(tagQuery)}
                            disabled={isCreatingTag}
                            className="flex-1 text-left text-sm text-accent hover:underline disabled:opacity-50">
                            + Create "{tagQuery.trim()}"
                          </button>
                        </div>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            {/* Genres */}
            <div>
              <label className={labelCls}>Genres</label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {selectedGenres.map(g => (
                  <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-xs font-medium text-content-secondary">
                    {g.name}
                    <button type="button" onClick={() => setSelectedGenres(gs => gs.filter(x => x.id !== g.id))} className="hover:opacity-70 text-sm leading-none">×</button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <input ref={genreInputRef} value={genreQuery} onChange={e => setGenreQuery(e.target.value)}
                  onFocus={() => setGenreDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setGenreDropdownOpen(false), 150)}
                  className={inputCls} placeholder="Search genres…" />
                {genreDropdownOpen && filteredGenres.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface-raised shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {filteredGenres.slice(0, 8).map(g => (
                      <li key={g.id}>
                        <button type="button" onMouseDown={e => e.preventDefault()}
                          onClick={() => { setSelectedGenres(gs => [...gs, g]); setGenreQuery('') }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent-surface">{g.name}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {genreDropdownOpen && filteredGenres.length === 0 && genreQuery && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface-raised shadow-lg px-3 py-2">
                    <p className="text-xs text-content-subtle">No matching genres</p>
                  </div>
                )}
              </div>
            </div>

            {/* Series */}
            <div>
              <label className={labelCls}>Series</label>
              <div className="space-y-2">
                {seriesRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className={inputCls}
                      value={row.seriesId}
                      onChange={e => setSeriesRows(rs =>
                        rs.map((r, n) => n === i ? { ...r, seriesId: e.target.value } : r))}
                      aria-label="Series"
                    >
                      <option value="">Pick a series…</option>
                      {allSeries
                        // Already on another row, so it cannot be picked twice
                        // and made to hold two positions at once.
                        .filter(x => x.id === row.seriesId
                          || !seriesRows.some(r => r.seriesId === x.id))
                        .map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      // Half positions are real: side stories and specials are
                      // numbered 4.5, which is why the column is numeric.
                      className={inputCls}
                      style={{ width: '6rem' }}
                      value={row.position}
                      onChange={e => setSeriesRows(rs =>
                        rs.map((r, n) => n === i ? { ...r, position: e.target.value } : r))}
                      placeholder="Vol."
                      aria-label="Volume number"
                    />
                    <button type="button"
                      onClick={() => setSeriesRows(rs => rs.filter((_, n) => n !== i))}
                      aria-label="Take out of this series"
                      className="rounded px-2 py-1 text-sm text-content-faint hover:bg-surface-inset hover:text-danger">
                      ×
                    </button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setSeriesRows(rs => [...rs, { seriesId: '', position: '' }])}
                  className="rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-xs text-content-tertiary hover:bg-surface-inset">
                  + Add to a series
                </button>
              </div>
            </div>

            {/* Lists */}
            {allShelves.length > 0 && (
              <div>
                <label className={labelCls}>Lists</label>
                <div className="flex flex-wrap gap-2">
                  {allShelves.map(shelf => {
                    const checked = selectedShelfIds.has(shelf.id)
                    return (
                      <label key={shelf.id}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'border-accent-line bg-accent-surface text-accent-strong dark:text-accent'
                            : 'border-line text-content-tertiary hover:border-line-strong'
                        }`}>
                        <input type="checkbox" className="sr-only" checked={checked}
                          onChange={e => setSelectedShelfIds(ids => {
                            const next = new Set(ids)
                            if (e.target.checked) next.add(shelf.id)
                            else next.delete(shelf.id)
                            return next
                          })} />
                        {shelf.name}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}

        {/* Editions tab */}
        {tab === 'editions' && (
          <div className="flex flex-col max-h-[70vh]">
            <div className="px-6 py-3 border-b border-line flex items-center justify-between flex-shrink-0">
              <p className="text-xs text-content-muted">Paperback, hardcover, ebook, audiobook, etc.</p>
              <button onClick={() => setShowAddEdition(true)}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 transition-colors">
                Add edition
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {editionsLoading && <p className="text-sm text-content-subtle text-center py-8">Loading…</p>}
              {!editionsLoading && editions.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-sm text-content-muted mb-2">No editions yet</p>
                  <button onClick={() => setShowAddEdition(true)} className="text-sm text-accent hover:underline">Add the first edition</button>
                </div>
              )}
              {editions.map(e => {
                const meta: Array<{ label: string; value: string }> = [
                  e.publisher        ? { label: 'Publisher',  value: e.publisher } : null,
                  e.publish_date     ? { label: 'Published',  value: e.publish_date } : null,
                  e.language         ? { label: 'Language',   value: e.language.toUpperCase() } : null,
                  e.page_count != null        ? { label: 'Pages',     value: String(e.page_count) } : null,
                  e.duration_seconds != null  ? { label: 'Duration',  value: `${Math.round(e.duration_seconds / 3600 * 10) / 10} hrs` } : null,
                  e.narrator         ? { label: 'Narrator',   value: e.narrator } : null,
                  e.isbn_13          ? { label: 'ISBN-13',    value: e.isbn_13 } : null,
                  e.isbn_10          ? { label: 'ISBN-10',    value: e.isbn_10 } : null,
                  // Copies and Acquired moved to per-library display — follow-up work.
                ].filter(Boolean) as Array<{ label: string; value: string }>

                return (
                  <div key={e.id} className="rounded-xl border border-line bg-surface-muted overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-surface border-b border-line-subtle">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${formatBadgeClass(e.format)}`}>
                          {e.format}
                        </span>
                        {e.is_primary && (
                          <span className="inline-flex items-center rounded-full bg-success-surface px-2 py-0.5 text-xs font-medium text-success-strong ring-1 ring-success-line">
                            Primary
                          </span>
                        )}
                        {e.edition_name && <span className="text-sm font-medium text-content">{e.edition_name}</span>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button onClick={() => setEditEdition(e)}
                          className="text-xs text-content-muted hover:text-accent transition-colors">Edit</button>
                        <button onClick={() => deleteEdition(e.id)}
                          className="text-xs text-content-muted hover:text-danger transition-colors">Delete</button>
                      </div>
                    </div>
                    {/* Metadata grid */}
                    {meta.length > 0 && (
                      <dl className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
                        {meta.map(item => (
                          <div key={item.label}>
                            <dt className="text-xs text-content-subtle">{item.label}</dt>
                            <dd className="text-xs font-medium text-content-secondary mt-0.5 font-mono">{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {(showAddEdition || editEdition) && (
        <AddEditionModal
          libraryId={libraryId}
          bookId={book.id}
          edition={editEdition}
          contributors={book.contributors}
          onClose={() => { setShowAddEdition(false); setEditEdition(null) }}
          onSaved={() => { setShowAddEdition(false); setEditEdition(null); loadEditions() }}
        />
      )}
    </div>
  )
}
