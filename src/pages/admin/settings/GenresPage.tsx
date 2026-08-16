// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { Genre } from '../../../types'
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

export default function GenresPage() {
  const { callApi } = useAuth()
  usePageTitle('Genres')
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    callApi<Genre[]>('/api/v1/genres')
      .then(gs => setGenres(gs ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load genres'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name || adding) return
    setAdding(true)
    setAddError(null)
    try {
      const g = await callApi<Genre>('/api/v1/genres', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      if (g) {
        setGenres(prev => [...prev, g].sort((a, b) => a.name.localeCompare(b.name)))
        setNewName('')
        inputRef.current?.focus()
      }
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Failed to add genre')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (g: Genre) => {
    setEditingId(g.id)
    setEditName(g.name)
    setSaveError(null)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setSaveError(null)
  }

  const handleSave = async () => {
    const name = editName.trim()
    if (!name || saving || !editingId) return
    setSaving(true)
    setSaveError(null)
    try {
      const g = await callApi<Genre>(`/api/v1/genres/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      })
      if (g) {
        setGenres(prev => prev.map(x => x.id === editingId ? g : x).sort((a, b) => a.name.localeCompare(b.name)))
        setEditingId(null)
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save genre')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(prev => new Set(prev).add(id))
    try {
      await callApi(`/api/v1/genres/${id}`, { method: 'DELETE' })
      setGenres(prev => prev.filter(g => g.id !== id))
    } catch {
      // silently revert
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  return (
    <>
      <PageHeader
        title="Genres"
        description="Instance-wide genre catalogue shared across all libraries."
        breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Genres' }]}
      />
      <div className="max-w-3xl px-8 py-8 space-y-6">

      {error && (
        <div className="rounded-lg bg-danger-surface border border-danger-line px-3 py-2 text-sm text-danger-strong ">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-line overflow-hidden bg-surface ">
        {/* Add row */}
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-muted border-b border-line ">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="New genre name…"
            className="flex-1 rounded-lg border border-line-strong bg-surface-raised px-3 py-1.5 text-sm text-content placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || adding}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {addError && (
          <p className="px-4 py-2 text-xs text-danger bg-danger-surface border-b border-red-100 dark:border-red-900">
            {addError}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : genres.length === 0 ? (
          <p className="px-4 py-6 text-sm text-center text-content-subtle ">
            No genres yet.
          </p>
        ) : (
          <div className="divide-y divide-line-subtle ">
            {genres.map(g => (
              <div key={g.id}>
                {editingId === g.id ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/20">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') cancelEdit() }}
                      className="flex-1 rounded-lg border border-accent-line bg-surface-raised px-3 py-1.5 text-sm text-content focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button onClick={handleSave} disabled={!editName.trim() || saving}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={cancelEdit}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-content-tertiary hover:bg-surface-inset transition-colors">
                      Cancel
                    </button>
                    {saveError && <span className="text-xs text-red-500">{saveError}</span>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2.5 group hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <span className="text-sm text-content-strong ">{g.name}</span>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => startEdit(g)}
                        className="p-1 rounded text-content-faint group-hover:text-content-subtle hover:!text-blue-500 dark:hover:!text-blue-400 hover:!bg-blue-50 dark:hover:!bg-blue-900/20 transition-colors"
                        title="Edit genre">
                        <PencilIcon />
                      </button>
                      <button
                        onClick={() => handleDelete(g.id)}
                        disabled={deleting.has(g.id)}
                        className="p-1 rounded text-content-faint group-hover:text-content-subtle hover:!text-red-500 dark:hover:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-900/20 disabled:opacity-50 transition-colors"
                        title="Delete genre"
                      >
                        {deleting.has(g.id) ? <span className="text-xs px-1">…</span> : <TrashIcon />}
                      </button>
                    </div>
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
