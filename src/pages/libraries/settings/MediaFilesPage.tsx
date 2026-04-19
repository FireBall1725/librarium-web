// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { LibraryOutletContext } from '../../../components/LibraryOutlet'
import type { StorageLocation, ScanResult } from '../../../types'
import { usePageTitle } from '../../../hooks/usePageTitle'

const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

const MEDIA_FORMATS = [
  { value: 'epub',  label: 'EPUB (.epub)' },
  { value: 'pdf',   label: 'PDF (.pdf)' },
  { value: 'mp3',   label: 'MP3 (.mp3)' },
  { value: 'm4b',   label: 'M4B Audiobook (.m4b)' },
  { value: 'mixed', label: 'Mixed (any supported format)' },
]

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function MediaFilesPage() {
  usePageTitle('Media Files')
  const { libraryId } = useParams<{ libraryId: string }>()
  const { setExtraCrumbs } = useOutletContext<LibraryOutletContext>()
  const { callApi } = useAuth()

  useEffect(() => {
    setExtraCrumbs([{ label: 'Settings' }, { label: 'Media Files' }])
    return () => setExtraCrumbs([])
  }, [setExtraCrumbs])

  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [scanResults, setScanResults] = useState<Record<string, ScanResult>>({})
  const [scanning, setScanning] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emptyForm = { name: '', root_path: '', media_format: 'mixed', path_template: '{title}' }
  const [form, setForm] = useState(emptyForm)

  const load = () => {
    callApi<StorageLocation[]>(`/api/v1/libraries/${libraryId}/storage-locations`)
      .then(r => setLocations(r ?? []))
      .catch(() => {})
  }
  useEffect(load, [libraryId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setError(null)
    try {
      if (editingId) {
        await callApi(`/api/v1/libraries/${libraryId}/storage-locations/${editingId}`, {
          method: 'PUT', body: JSON.stringify(form),
        })
      } else {
        await callApi(`/api/v1/libraries/${libraryId}/storage-locations`, {
          method: 'POST', body: JSON.stringify(form),
        })
      }
      setShowAdd(false); setEditingId(null); setForm(emptyForm); load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this storage location? Editions linked to it will lose their file path.')) return
    await callApi(`/api/v1/libraries/${libraryId}/storage-locations/${id}`, { method: 'DELETE' })
    load()
  }

  const handleScan = async (id: string) => {
    setScanning(s => ({ ...s, [id]: true }))
    setScanResults(r => ({ ...r, [id]: undefined as unknown as ScanResult }))
    try {
      const result = await callApi<ScanResult>(`/api/v1/libraries/${libraryId}/storage-locations/${id}/scan`, { method: 'POST' })
      if (result) setScanResults(r => ({ ...r, [id]: result }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Scan failed')
    } finally {
      setScanning(s => ({ ...s, [id]: false }))
    }
  }

  const startEdit = (loc: StorageLocation) => {
    setForm({ name: loc.name, root_path: loc.root_path, media_format: loc.media_format, path_template: loc.path_template })
    setEditingId(loc.id)
    setShowAdd(true)
  }

  return (
    <div className="max-w-3xl px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Storage Locations</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Configure server-side directories containing ebook or audiobook files.
            Scan to automatically link files to editions by ISBN.
          </p>
        </div>
        {!showAdd && (
          <button
            onClick={() => { setForm(emptyForm); setEditingId(null); setShowAdd(true) }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add location
          </button>
        )}
      </div>

      {/* Add / edit form */}
      {showAdd && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{editingId ? 'Edit location' : 'Add location'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My eBook Library" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Media format</label>
              <select value={form.media_format} onChange={e => setForm(f => ({ ...f, media_format: e.target.value }))} className={inputCls}>
                {MEDIA_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Root path (server filesystem)</label>
            <input type="text" value={form.root_path} onChange={e => setForm(f => ({ ...f, root_path: e.target.value }))}
              placeholder="/srv/books" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Path template</label>
            <input type="text" value={form.path_template} onChange={e => setForm(f => ({ ...f, path_template: e.target.value }))}
              placeholder="{title}" className={inputCls} />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used for scan matching. Tokens: {'{title}'}, {'{author}'}, {'{year}'}, {'{isbn13}'}, {'{isbn10}'}, {'{edition}'}</p>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowAdd(false); setEditingId(null); setError(null) }}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              {editingId ? 'Save changes' : 'Add location'}
            </button>
          </div>
        </div>
      )}

      {/* Location list */}
      {locations.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No storage locations configured yet.</p>
      )}
      {locations.map(loc => {
        const result = scanResults[loc.id]
        const isScanning = scanning[loc.id]
        return (
          <div key={loc.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{loc.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono truncate">{loc.root_path}</p>
                <span className="mt-1 inline-block text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                  {loc.media_format}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => handleScan(loc.id)} disabled={isScanning}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {isScanning ? 'Scanning…' : 'Scan'}
                </button>
                <button onClick={() => startEdit(loc)}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button onClick={() => handleDelete(loc.id)}
                  className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scan results */}
            {result && (
              <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3 text-xs">
                <div className="flex gap-4 text-gray-500 dark:text-gray-400">
                  <span><span className="font-semibold text-green-600 dark:text-green-400">{result.linked?.length ?? 0}</span> linked</span>
                  <span><span className="font-semibold text-amber-600 dark:text-amber-400">{result.unlinked?.length ?? 0}</span> unmatched</span>
                  <span><span className="font-semibold text-red-600 dark:text-red-400">{result.missing_files?.length ?? 0}</span> editions without files</span>
                </div>
                {result.linked?.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Linked</p>
                    <ul className="space-y-0.5">
                      {result.linked.map((l, i) => (
                        <li key={i} className="text-gray-600 dark:text-gray-400 flex gap-2">
                          <span className="text-green-500">✓</span>
                          <span className="font-mono truncate">{l.file_path}</span>
                          <span className="text-gray-400 flex-shrink-0">{fmtBytes(l.file_size)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.unlinked?.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Unmatched files</p>
                    <ul className="space-y-0.5">
                      {result.unlinked.map((f, i) => (
                        <li key={i} className="font-mono text-gray-500 dark:text-gray-400 truncate">{f.file_path}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.missing_files?.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Editions without files</p>
                    <ul className="space-y-0.5">
                      {result.missing_files.map((m, i) => (
                        <li key={i} className="text-gray-500 dark:text-gray-400">
                          {m.book_title || m.edition_id} <span className="text-gray-400">({m.format})</span>
                          {m.isbn_13 && <span className="ml-1 font-mono">{m.isbn_13}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
