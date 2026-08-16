// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { Library, Tag } from '../../../types'
import PageHeader from '../../../components/PageHeader'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { SettingRow, SettingsBody } from '../../../components/settings/SettingRow'
import { ConfirmDialog } from '../../../components/Dialog'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#6b7280', '#78716c',
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const isPreset = PRESET_COLORS.includes(value)
  const hasCustom = !!value && !isPreset
  const [showCustom, setShowCustom] = useState(() => hasCustom)

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* No color */}
      <button
        type="button"
        onClick={() => { onChange(''); setShowCustom(false) }}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          !value
            ? 'border-accent bg-accent-surface'
            : 'border-line-strong hover:border-content-faint'
        }`}
        title="No colour"
      >
        <svg className="w-2.5 h-2.5 text-content-muted" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>

      {/* Presets */}
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => { onChange(c); setShowCustom(false) }}
          style={{ background: c }}
          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all ${
            value === c
              ? 'border-accent scale-110 shadow-sm'
              : 'border-transparent hover:scale-110 hover:shadow-sm'
          }`}
          title={c}
        />
      ))}

      {/* Custom */}
      {showCustom ? (
        <div className="flex items-center gap-1">
          <input
            type="color"
            value={value && !isPreset ? value : '#6b7280'}
            onChange={e => onChange(e.target.value)}
            className="w-5 h-5 rounded cursor-pointer border border-line-strong p-0 bg-transparent flex-shrink-0"
            title="Custom colour"
          />
          <button
            type="button"
            onClick={() => { setShowCustom(false); if (hasCustom) onChange('') }}
            className="text-xs text-content-muted hover:text-content-tertiary leading-none"
            title="Close custom"
          >×</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className={`text-xs px-1.5 py-0.5 rounded border transition-colors flex-shrink-0 ${
            hasCustom
              ? 'border-accent-line text-accent bg-accent-surface'
              : 'border-line-strong text-content-muted hover:border-content-faint hover:text-content-secondary'
          }`}
        >
          {hasCustom ? '⬤ Custom' : 'Custom…'}
        </button>
      )}
    </div>
  )
}

export default function TagsPage() {
  const { callApi } = useAuth()
  usePageTitle('Tags')
  const [libraries, setLibraries] = useState<Library[]>([])
  const [libsLoading, setLibsLoading] = useState(true)
  const [selectedLibId, setSelectedLibId] = useState<string>('')

  const [tags, setTags] = useState<Tag[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const [tagsError, setTagsError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [confirmDelete, setConfirmDelete] = useState<Tag | null>(null)

  useEffect(() => {
    callApi<Library[]>('/api/v1/libraries')
      .then(libs => {
        const sorted = (libs ?? []).sort((a, b) => a.name.localeCompare(b.name))
        setLibraries(sorted)
        if (sorted.length > 0) setSelectedLibId(sorted[0].id)
      })
      .catch(() => {})
      .finally(() => setLibsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedLibId) { setTags([]); return }
    setTagsLoading(true)
    setTagsError(null)
    callApi<Tag[]>(`/api/v1/libraries/${selectedLibId}/tags`)
      .then(ts => setTags(ts ?? []))
      .catch(err => setTagsError(err instanceof ApiError ? err.message : 'Failed to load tags'))
      .finally(() => setTagsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLibId])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name || adding || !selectedLibId) return
    setAdding(true)
    setAddError(null)
    try {
      const t = await callApi<Tag>(`/api/v1/libraries/${selectedLibId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ name, color: newColor }),
      })
      if (t) {
        setTags(prev => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)))
        setNewName('')
        setNewColor('')
        nameInputRef.current?.focus()
      }
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Failed to add tag')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (t: Tag) => {
    setEditingId(t.id)
    setEditName(t.name)
    setEditColor(t.color || '')
    setSaveError(null)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setSaveError(null)
  }

  const handleSave = async () => {
    const name = editName.trim()
    if (!name || saving || !editingId || !selectedLibId) return
    setSaving(true)
    setSaveError(null)
    try {
      const t = await callApi<Tag>(`/api/v1/libraries/${selectedLibId}/tags/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, color: editColor }),
      })
      if (t) {
        setTags(prev => prev.map(x => x.id === editingId ? t : x).sort((a, b) => a.name.localeCompare(b.name)))
        setEditingId(null)
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save tag')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(prev => new Set(prev).add(id))
    try {
      await callApi(`/api/v1/libraries/${selectedLibId}/tags/${id}`, { method: 'DELETE' })
      setTags(prev => prev.filter(t => t.id !== id))
    } catch {
      // silently revert
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  return (
    <>
      <PageHeader
        title="Tags"
        description="Tags belong to a library, not to the instance, so each library keeps its own set."
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Tags' }]}
      />

      <SettingsBody>
        <SettingRow
          label="Library"
          description="Tags are per-library. Pick which set you are editing."
        >
          <select
            className="lb-field"
            value={selectedLibId}
            onChange={e => setSelectedLibId(e.target.value)}
            disabled={libsLoading || libraries.length === 0}
            aria-label="Library"
          >
            {libraries.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </SettingRow>

        {tagsError && (
          <p className="my-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
            {tagsError}
          </p>
        )}

        {selectedLibId && (
          <>
            <form
              className="mb-2 mt-6 flex flex-wrap items-center gap-2"
              onSubmit={e => { e.preventDefault(); handleAdd() }}
            >
              <input
                ref={nameInputRef}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="New tag"
                className="lb-field flex-1 min-w-[10rem]"
                aria-label="New tag"
              />
              <button type="submit" className="lb-btn flex-none" disabled={!newName.trim() || adding}>
                {adding ? 'Adding…' : 'Add'}
              </button>
            </form>
            <div className="mb-4">
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
            {addError && <p className="mb-2 text-xs text-danger">{addError}</p>}

            {tagsLoading && <p className="py-8 text-center text-sm text-content-muted">Loading…</p>}

            {!tagsLoading && tags.length === 0 && (
              <p className="lb-display py-12 text-center text-xl text-content-secondary">No tags yet</p>
            )}

            {tags.map(tag => (
              <div key={tag.id} className="lb-set">
                {editingId === tag.id ? (
                  <form
                    className="col-span-full"
                    onSubmit={e => { e.preventDefault(); handleSave() }}
                  >
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={editInputRef}
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                        className="lb-field flex-1 min-w-[10rem]"
                        aria-label="Tag name"
                      />
                      <button type="submit" className="lb-btn flex-none" disabled={!editName.trim() || saving}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="lb-btn ghost flex-none" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                    <div className="mt-2">
                      <ColorPicker value={editColor} onChange={setEditColor} />
                    </div>
                    {saveError && <p className="mt-1 text-xs text-danger">{saveError}</p>}
                  </form>
                ) : (
                  <>
                    <div className="lbl flex items-center gap-2">
                      <span
                        className="size-2.5 flex-none rounded-full"
                        style={{ background: tag.color || 'var(--color-line-strong)' }}
                        aria-hidden="true"
                      />
                      {tag.name}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="lb-btn ghost sm" onClick={() => startEdit(tag)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="lb-btn ghost sm"
                        disabled={deleting.has(tag.id)}
                        onClick={() => setConfirmDelete(tag)}
                      >
                        {deleting.has(tag.id) ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </SettingsBody>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        description="The tag is removed from every book in this library that carries it."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const tag = confirmDelete
          setConfirmDelete(null)
          if (tag) handleDelete(tag.id)
        }}
      />
    </>
  )
}
