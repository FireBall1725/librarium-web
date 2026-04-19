// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { Library, Tag } from '../../../types'
import PageHeader from '../../../components/PageHeader'
import { usePageTitle } from '../../../hooks/usePageTitle'

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
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
            : 'border-gray-200 dark:border-gray-600 hover:border-gray-400'
        }`}
        title="No colour"
      >
        <svg className="w-2.5 h-2.5 text-gray-400" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
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
              ? 'border-blue-500 scale-110 shadow-sm'
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
            className="w-5 h-5 rounded cursor-pointer border border-gray-300 dark:border-gray-600 p-0 bg-transparent flex-shrink-0"
            title="Custom colour"
          />
          <button
            type="button"
            onClick={() => { setShowCustom(false); if (hasCustom) onChange('') }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 leading-none"
            title="Close custom"
          >×</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className={`text-xs px-1.5 py-0.5 rounded border transition-colors flex-shrink-0 ${
            hasCustom
              ? 'border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30'
              : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-300 hover:text-gray-600 dark:hover:text-gray-400'
          }`}
        >
          {hasCustom ? '⬤ Custom' : 'Custom…'}
        </button>
      )}
    </div>
  )
}

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
        description="Library-specific tags for books, shelves, loans, and members. Deleting a tag removes it from all items in the library."
        breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Tags' }]}
      />
      <div className="max-w-3xl px-8 py-8 space-y-6">

      {/* Library selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
          Library
        </label>
        {libsLoading ? (
          <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        ) : (
          <select
            value={selectedLibId}
            onChange={e => setSelectedLibId(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {libraries.length === 0 && <option value="">No libraries</option>}
            {libraries.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
      </div>

      {tagsError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {tagsError}
        </div>
      )}

      {selectedLibId && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
          {/* Add form */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="New tag name…"
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleAdd}
                disabled={!newName.trim() || adding}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} />
          </div>
          {addError && (
            <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900">
              {addError}
            </p>
          )}

          {tagsLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          ) : tags.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-gray-400 dark:text-gray-500">
              No tags in this library yet.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {tags.map(t => (
                <div key={t.id}>
                  {editingId === t.id ? (
                    <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-950/20 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') cancelEdit() }}
                          className="flex-1 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button onClick={handleSave} disabled={!editName.trim() || saving}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={cancelEdit}
                          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                          Cancel
                        </button>
                        {saveError && <span className="text-xs text-red-500">{saveError}</span>}
                      </div>
                      <ColorPicker value={editColor} onChange={setEditColor} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-2.5 group hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: t.color || '#9ca3af' }}
                      />
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{t.name}</span>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => startEdit(t)}
                          className="p-1 rounded text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 hover:!text-blue-500 dark:hover:!text-blue-400 hover:!bg-blue-50 dark:hover:!bg-blue-900/20 transition-colors"
                          title="Edit tag">
                          <PencilIcon />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deleting.has(t.id)}
                          className="p-1 rounded text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 hover:!text-red-500 dark:hover:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-900/20 disabled:opacity-50 transition-colors"
                          title="Delete tag"
                        >
                          {deleting.has(t.id) ? <span className="text-xs px-1">…</span> : <TrashIcon />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  )
}
