// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'

const toInternalName = (s: string) =>
  s.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { MediaType } from '../../../types'
import PageHeader from '../../../components/PageHeader'
import { usePageTitle } from '../../../hooks/usePageTitle'

const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
  </svg>
)

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
)

export default function MediaTypesPage() {
  const { callApi } = useAuth()
  usePageTitle('Media Types')
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newDisplayName, setNewDisplayName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const displayNameRef = useRef<HTMLInputElement>(null)

  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const editDisplayNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    callApi<MediaType[]>('/api/v1/media-types')
      .then(mts => setMediaTypes(mts ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load media types'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = async () => {
    const displayName = newDisplayName.trim()
    const name = toInternalName(displayName)
    if (!displayName || !name || adding) return
    setAdding(true)
    setAddError(null)
    try {
      const mt = await callApi<MediaType>('/api/v1/media-types', {
        method: 'POST',
        body: JSON.stringify({ name, display_name: displayName, description: newDescription.trim() }),
      })
      if (mt) {
        setMediaTypes(prev => [...prev, mt].sort((a, b) => a.display_name.localeCompare(b.display_name)))
        setNewDisplayName('')
        setNewDescription('')
        displayNameRef.current?.focus()
      }
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Failed to add media type')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (mt: MediaType) => {
    setEditingId(mt.id)
    setEditDisplayName(mt.display_name)
    setEditDescription(mt.description ?? '')
    setSaveError(null)
    setTimeout(() => editDisplayNameRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setSaveError(null)
  }

  const handleSave = async () => {
    const displayName = editDisplayName.trim()
    if (!displayName || saving || !editingId) return
    setSaving(true)
    setSaveError(null)
    try {
      await callApi<MediaType>(`/api/v1/media-types/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ display_name: displayName, description: editDescription.trim() }),
      })
      // Preserve book_count — patch locally since UPDATE doesn't return an accurate count
      setMediaTypes(prev =>
        prev.map(x => x.id === editingId
          ? { ...x, display_name: displayName, description: editDescription.trim() }
          : x
        ).sort((a, b) => a.display_name.localeCompare(b.display_name))
      )
      setEditingId(null)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save media type')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(prev => new Set(prev).add(id))
    setDeleteErrors(prev => { const s = { ...prev }; delete s[id]; return s })
    try {
      await callApi(`/api/v1/media-types/${id}`, { method: 'DELETE' })
      setMediaTypes(prev => prev.filter(mt => mt.id !== id))
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete media type'
      setDeleteErrors(prev => ({ ...prev, [id]: msg }))
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  return (
    <>
      <PageHeader
        title="Media Types"
        description="Instance-wide media type catalogue. Delete is only allowed when no books are assigned."
        breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Media Types' }]}
      />
      <div className="max-w-3xl px-8 py-8 space-y-6">

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
          {/* Add form */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  ref={displayNameRef}
                  type="text"
                  value={newDisplayName}
                  onChange={e => setNewDisplayName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="Display name…"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {newDisplayName.trim() && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-300 dark:text-gray-600 pointer-events-none select-none">
                    {toInternalName(newDisplayName)}
                  </span>
                )}
              </div>
              <button
                onClick={handleAdd}
                disabled={!newDisplayName.trim() || adding}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
            <input
              type="text"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Description (optional)…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {addError && (
            <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900">
              {addError}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          ) : mediaTypes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-gray-400 dark:text-gray-500">
              No media types yet.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {mediaTypes.map(mt => (
                <div key={mt.id}>
                  {editingId === mt.id ? (
                    <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/20 space-y-2">
                      <div className="flex items-center gap-2">
                        {/* Internal name is read-only in edit mode */}
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 px-2 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 whitespace-nowrap select-none">
                          {mt.name}
                        </span>
                        <input
                          ref={editDisplayNameRef}
                          type="text"
                          value={editDisplayName}
                          onChange={e => setEditDisplayName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                          placeholder="Display name…"
                          className="flex-1 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button onClick={handleSave} disabled={!editDisplayName.trim() || saving}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={cancelEdit}
                          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                          Cancel
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                        placeholder="Description (optional)…"
                        className="w-full rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                    </div>
                  ) : (
                    <div className="group">
                      <div className="flex items-start justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{mt.display_name}</span>
                            {mt.book_count > 0 && (
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {mt.book_count} {mt.book_count === 1 ? 'book' : 'books'}
                              </span>
                            )}
                          </div>
                          {mt.description && (
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{mt.description}</p>
                          )}
                        </div>
                        <div className="ml-4 flex-shrink-0 flex items-center gap-0.5">
                          <button onClick={() => startEdit(mt)}
                            className="p-1 rounded text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 hover:!text-blue-500 dark:hover:!text-blue-400 hover:!bg-blue-50 dark:hover:!bg-blue-900/20 transition-colors"
                            title="Edit media type">
                            <PencilIcon />
                          </button>
                          {mt.book_count > 0 ? (
                            <span
                              title={`Cannot delete — ${mt.book_count} ${mt.book_count === 1 ? 'book is' : 'books are'} assigned to this type`}
                              className="p-1 text-gray-200 dark:text-gray-700 cursor-not-allowed"
                            >
                              <TrashIcon />
                            </span>
                          ) : (
                            <button
                              onClick={() => handleDelete(mt.id)}
                              disabled={deleting.has(mt.id)}
                              className="p-1 rounded text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 hover:!text-red-500 dark:hover:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-900/20 disabled:opacity-50 transition-colors"
                              title="Delete media type"
                            >
                              {deleting.has(mt.id) ? <span className="text-xs px-1">…</span> : <TrashIcon />}
                            </button>
                          )}
                        </div>
                      </div>
                      {deleteErrors[mt.id] && (
                        <p className="px-4 pb-2 text-xs text-red-600 dark:text-red-400">
                          {deleteErrors[mt.id]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
