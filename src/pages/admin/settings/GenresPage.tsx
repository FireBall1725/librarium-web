// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { Genre } from '../../../types'
import PageHeader from '../../../components/PageHeader'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { SettingsBody } from '../../../components/settings/SettingRow'
import { ConfirmDialog } from '../../../components/Dialog'

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
  const [confirmDelete, setConfirmDelete] = useState<Genre | null>(null)

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
        description="The genre vocabulary, shared across every library on this instance."
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Genres' }]}
      />

      <SettingsBody>
        {error && (
          <p className="mb-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <form
          className="mb-2 flex gap-2"
          onSubmit={e => { e.preventDefault(); handleAdd() }}
        >
          <input
            ref={inputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New genre"
            className="lb-field"
            aria-label="New genre"
          />
          <button type="submit" className="lb-btn flex-none" disabled={!newName.trim() || adding}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>
        {addError && <p className="mb-2 text-xs text-danger">{addError}</p>}

        {loading && <p className="py-8 text-center text-sm text-content-muted">Loading…</p>}

        {!loading && genres.length === 0 && (
          <p className="lb-display py-12 text-center text-xl text-content-secondary">No genres yet</p>
        )}

        {genres.map(g => (
          <div key={g.id} className="lb-set">
            {editingId === g.id ? (
              // The edit form spans both columns: a name being typed needs the
              // width more than the buttons beside it do.
              <form
                className="col-span-full flex gap-2"
                onSubmit={e => { e.preventDefault(); handleSave() }}
              >
                <input
                  ref={editInputRef}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                  className="lb-field"
                  aria-label="Genre name"
                />
                <button type="submit" className="lb-btn flex-none" disabled={!editName.trim() || saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="lb-btn ghost flex-none" onClick={cancelEdit}>
                  Cancel
                </button>
                {saveError && <span className="self-center text-xs text-danger">{saveError}</span>}
              </form>
            ) : (
              <>
                <div className="lbl">{g.name}</div>
                <div className="flex gap-2">
                  <button type="button" className="lb-btn ghost sm" onClick={() => startEdit(g)}>
                    Rename
                  </button>
                  <button
                    type="button"
                    className="lb-btn ghost sm"
                    disabled={deleting.has(g.id)}
                    onClick={() => setConfirmDelete(g)}
                  >
                    {deleting.has(g.id) ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </SettingsBody>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        description="Books keep their other genres. This one is removed from every book that has it."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const g = confirmDelete
          setConfirmDelete(null)
          if (g) handleDelete(g.id)
        }}
      />
    </>
  )
}
