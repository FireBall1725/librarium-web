// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'

const toInternalName = (s: string) =>
  s.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { MediaType } from '../../../types'
import PageHeader from '../../../components/PageHeader'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { SettingsBody } from '../../../components/settings/SettingRow'
import { ConfirmDialog } from '../../../components/Dialog'

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
  const [confirmDelete, setConfirmDelete] = useState<MediaType | null>(null)

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
        description="The kinds of thing a book can be. Every book has exactly one."
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Media Types' }]}
      />

      <SettingsBody>
        {error && (
          <p className="mb-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <form
          className="mb-2 flex flex-wrap gap-2"
          onSubmit={e => { e.preventDefault(); handleAdd() }}
        >
          <input
            ref={displayNameRef}
            value={newDisplayName}
            onChange={e => setNewDisplayName(e.target.value)}
            placeholder="New media type"
            className="lb-field flex-1 min-w-[10rem]"
            aria-label="New media type"
          />
          <input
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className="lb-field flex-1 min-w-[10rem]"
            aria-label="Description"
          />
          <button type="submit" className="lb-btn flex-none" disabled={!newDisplayName.trim() || adding}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>
        {/* The internal name is derived, not typed, so it is shown rather than
            asked for: it is what the API and every filter key on. */}
        {newDisplayName.trim() && (
          <p className="mb-2 text-xs text-content-muted">
            Stored as <code className="lb-lictag">{toInternalName(newDisplayName)}</code>
          </p>
        )}
        {addError && <p className="mb-2 text-xs text-danger">{addError}</p>}

        {loading && <p className="py-8 text-center text-sm text-content-muted">Loading…</p>}

        {!loading && mediaTypes.length === 0 && (
          <p className="lb-display py-12 text-center text-xl text-content-secondary">No media types yet</p>
        )}

        {mediaTypes.map(mt => (
          <div key={mt.id} className="lb-set">
            {editingId === mt.id ? (
              <form
                className="col-span-full flex flex-wrap gap-2"
                onSubmit={e => { e.preventDefault(); handleSave() }}
              >
                <input
                  ref={editDisplayNameRef}
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                  className="lb-field flex-1 min-w-[10rem]"
                  aria-label="Display name"
                />
                <input
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                  className="lb-field flex-1 min-w-[10rem]"
                  aria-label="Description"
                  placeholder="Description (optional)"
                />
                <button type="submit" className="lb-btn flex-none" disabled={!editDisplayName.trim() || saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="lb-btn ghost flex-none" onClick={cancelEdit}>
                  Cancel
                </button>
                {saveError && <span className="self-center text-xs text-danger">{saveError}</span>}
              </form>
            ) : (
              <>
                <div>
                  <div className="lbl flex items-center gap-2">
                    {mt.display_name}
                    <code className="lb-lictag">{mt.name}</code>
                  </div>
                  {mt.description && <div className="sub">{mt.description}</div>}
                  {deleteErrors[mt.id] && (
                    <div className="mt-1 text-xs text-danger">{deleteErrors[mt.id]}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="lb-btn ghost sm" onClick={() => startEdit(mt)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="lb-btn ghost sm"
                    disabled={deleting.has(mt.id)}
                    onClick={() => setConfirmDelete(mt)}
                  >
                    {deleting.has(mt.id) ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </SettingsBody>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete ${confirmDelete?.display_name ?? ''}?`}
        description="A media type in use by any book cannot be deleted; the server will say so."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const mt = confirmDelete
          setConfirmDelete(null)
          if (mt) handleDelete(mt.id)
        }}
      />
    </>
  )
}
