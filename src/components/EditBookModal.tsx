// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, ApiError } from '../auth/AuthContext'
import type { Book, Tag, Genre, MediaType, ContributorResult, Shelf, BookEdition } from '../types'
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

const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

const formatBadgeClass = (fmt: string) => {
  if (fmt === 'ebook') return 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 ring-purple-200 dark:ring-purple-800'
  if (fmt === 'audiobook') return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-amber-200 dark:ring-amber-800'
  return 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 ring-blue-200 dark:ring-blue-800'
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

  const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])
  const [allShelves, setAllShelves] = useState<Shelf[]>([])
  const [initialShelfIds, setInitialShelfIds] = useState<Set<string>>(new Set())
  const [selectedShelfIds, setSelectedShelfIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    callApi<MediaType[]>('/api/v1/media-types').then(mt => setMediaTypes(mt ?? [])).catch(() => {})
    callApi<Tag[]>(`/api/v1/libraries/${libraryId}/tags`).then(ts => setLibraryTags(ts ?? [])).catch(() => {})
    callApi<Genre[]>('/api/v1/genres').then(gs => setAllGenres(gs ?? [])).catch(() => {})
    callApi<Shelf[]>(`/api/v1/libraries/${libraryId}/shelves`).then(ss => setAllShelves(ss ?? [])).catch(() => {})
    callApi<Shelf[]>(`/api/v1/libraries/${libraryId}/books/${book.id}/shelves`).then(ss => {
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
          await callApi(`/api/v1/libraries/${libraryId}/shelves/${id}/books/${bookId}`, { method: 'DELETE' }).catch(() => {})
      }
      for (const id of selectedShelfIds) {
        if (!initialShelfIds.has(id))
          await callApi(`/api/v1/libraries/${libraryId}/shelves/${id}/books`, { method: 'POST', body: JSON.stringify({ book_id: bookId }) }).catch(() => {})
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
      <div className="w-full max-w-xl rounded-xl bg-white dark:bg-gray-900 shadow-xl flex flex-col">

        {/* Header with tabs */}
        <div className="px-6 pt-4 pb-0 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-sm font-medium">{book.title}</p>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
          </div>
          <div className="flex gap-0">
            {(['details', 'editions'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                  tab === t
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
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
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Add contributor</button>
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
                  <ul className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {filteredTags.slice(0, 8).map(t => (
                      <li key={t.id}>
                        <button type="button" onMouseDown={e => e.preventDefault()}
                          onClick={() => { setSelectedTags(ts => [...ts, t]); setTagQuery('') }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          {t.name}
                        </button>
                      </li>
                    ))}
                    {tagQuery.trim() && (
                      <li>
                        <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 dark:border-gray-700">
                          <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => createTag(tagQuery)}
                            disabled={isCreatingTag}
                            className="flex-1 text-left text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
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
                  <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
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
                  <ul className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {filteredGenres.slice(0, 8).map(g => (
                      <li key={g.id}>
                        <button type="button" onMouseDown={e => e.preventDefault()}
                          onClick={() => { setSelectedGenres(gs => [...gs, g]); setGenreQuery('') }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30">{g.name}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {genreDropdownOpen && filteredGenres.length === 0 && genreQuery && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg px-3 py-2">
                    <p className="text-xs text-gray-400 dark:text-gray-500">No matching genres</p>
                  </div>
                )}
              </div>
            </div>

            {/* Shelves */}
            {allShelves.length > 0 && (
              <div>
                <label className={labelCls}>Shelves</label>
                <div className="flex flex-wrap gap-2">
                  {allShelves.map(shelf => {
                    const checked = selectedShelfIds.has(shelf.id)
                    return (
                      <label key={shelf.id}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}>
                        <input type="checkbox" className="sr-only" checked={checked}
                          onChange={e => setSelectedShelfIds(ids => {
                            const next = new Set(ids)
                            if (e.target.checked) next.add(shelf.id)
                            else next.delete(shelf.id)
                            return next
                          })} />
                        {shelf.icon && <span>{shelf.icon}</span>}
                        {shelf.name}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}

        {/* Editions tab */}
        {tab === 'editions' && (
          <div className="flex flex-col max-h-[70vh]">
            <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">Paperback, hardcover, ebook, audiobook, etc.</p>
              <button onClick={() => setShowAddEdition(true)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
                Add edition
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {editionsLoading && <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Loading…</p>}
              {!editionsLoading && editions.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No editions yet</p>
                  <button onClick={() => setShowAddEdition(true)} className="text-sm text-blue-600 hover:underline">Add the first edition</button>
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
                  e.copy_count > 1   ? { label: 'Copies',     value: String(e.copy_count) } : null,
                  e.acquired_at      ? { label: 'Acquired',   value: e.acquired_at } : null,
                ].filter(Boolean) as Array<{ label: string; value: string }>

                return (
                  <div key={e.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${formatBadgeClass(e.format)}`}>
                          {e.format}
                        </span>
                        {e.is_primary && (
                          <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/50 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800">
                            Primary
                          </span>
                        )}
                        {e.edition_name && <span className="text-sm font-medium text-gray-900 dark:text-white">{e.edition_name}</span>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button onClick={() => setEditEdition(e)}
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Edit</button>
                        <button onClick={() => deleteEdition(e.id)}
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">Delete</button>
                      </div>
                    </div>
                    {/* Metadata grid */}
                    {meta.length > 0 && (
                      <dl className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
                        {meta.map(item => (
                          <div key={item.label}>
                            <dt className="text-xs text-gray-400 dark:text-gray-500">{item.label}</dt>
                            <dd className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-0.5 font-mono">{item.value}</dd>
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
