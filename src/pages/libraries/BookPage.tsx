import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link, useOutletContext } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import type { Crumb, LibraryOutletContext } from '../../components/LibraryOutlet'
import type { Book, BookEdition, EditionFile, Loan, UserBookInteraction, Shelf, BookSeriesRef, ContributorResult, MergedBookResult, MergedFieldResult, StorageLocation, BrowseEntry } from '../../types'
import { AddEditionModal } from '../../components/AddEditionModal'
import EditBookModal from '../../components/EditBookModal'
import LoanFormModal from '../../components/LoanFormModal'
import BookCover from '../../components/BookCover'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPosition = (pos: number) => pos % 1 === 0 ? pos.toFixed(0) : pos.toFixed(1)

const READ_STATUSES = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'read', label: 'Read' },
  { value: 'did_not_finish', label: 'Did not finish' },
]

// ─── Interaction form ─────────────────────────────────────────────────────────

function InteractionForm({ libraryId, bookId, editionId, onStatusChange }: {
  libraryId: string; bookId: string; editionId: string
  onStatusChange?: (status: string) => void
}) {
  const { callApi } = useAuth()
  const [interaction, setInteraction] = useState<UserBookInteraction | null>(null)
  const [form, setForm] = useState({
    read_status: 'unread', rating: '', notes: '', review: '',
    date_started: '', date_finished: '', is_favorite: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const baseUrl = `/api/v1/libraries/${libraryId}/books/${bookId}/editions/${editionId}/my-interaction`

  useEffect(() => {
    callApi<UserBookInteraction>(baseUrl)
      .then(i => {
        if (i) {
          setInteraction(i)
          setForm({
            read_status: i.read_status,
            rating: i.rating != null ? String(i.rating) : '',
            notes: i.notes ?? '',
            review: i.review ?? '',
            date_started: i.date_started ?? '',
            date_finished: i.date_finished ?? '',
            is_favorite: i.is_favorite,
          })
          onStatusChange?.(i.read_status)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionId])

  const save = async () => {
    setIsLoading(true); setIsSaved(false)
    try {
      const updated = await callApi<UserBookInteraction>(baseUrl, {
        method: 'PUT',
        body: JSON.stringify({
          read_status: form.read_status,
          rating: form.rating ? Number(form.rating) : null,
          notes: form.notes,
          review: form.review,
          date_started: form.date_started || null,
          date_finished: form.date_finished || null,
          is_favorite: form.is_favorite,
        }),
      })
      if (updated) {
        setInteraction(updated)
        onStatusChange?.(updated.read_status)
      }
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    } catch { /* ignore */ }
    finally { setIsLoading(false) }
  }

  const inputCls = 'w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none'

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Status</label>
          <select value={form.read_status} onChange={e => setForm(f => ({ ...f, read_status: e.target.value }))} className={inputCls}>
            {READ_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Rating (1–10)</label>
          <input type="number" min="1" max="10" value={form.rating}
            onChange={e => setForm(f => ({ ...f, rating: e.target.value }))}
            placeholder="—" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Date started</label>
          <input type="date" value={form.date_started} onChange={e => setForm(f => ({ ...f, date_started: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Date finished</label>
          <input type="date" value={form.date_finished} onChange={e => setForm(f => ({ ...f, date_finished: e.target.value }))} className={inputCls} />
        </div>
      </div>
      <div className="mt-2">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Notes <span className="text-gray-400 dark:text-gray-500">(private)</span></label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2} placeholder="Personal notes…" className={`${inputCls} resize-none`} />
      </div>
      <div className="mt-2">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Review <span className="text-gray-400 dark:text-gray-500">(visible to members)</span></label>
        <textarea value={form.review} onChange={e => setForm(f => ({ ...f, review: e.target.value }))}
          rows={2} placeholder="Share your thoughts…" className={`${inputCls} resize-none`} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={form.is_favorite} onChange={e => setForm(f => ({ ...f, is_favorite: e.target.checked }))}
            className="rounded border-gray-300 dark:border-gray-600" />
          Favourite
        </label>
        <div className="flex items-center gap-2">
          {isSaved && <span className="text-xs text-green-600 dark:text-green-400">Saved!</span>}
          {interaction && (
            <button onClick={async () => {
              if (!confirm('Remove your reading record for this edition?')) return
              await callApi(baseUrl, { method: 'DELETE' }).catch(() => {})
              setInteraction(null)
              setForm({ read_status: 'unread', rating: '', notes: '', review: '', date_started: '', date_finished: '', is_favorite: false })
              onStatusChange?.('unread')
            }} className="text-xs text-red-500 dark:text-red-400 hover:underline">Remove</button>
          )}
          <button onClick={save} disabled={isLoading}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {isLoading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── File browser modal ───────────────────────────────────────────────────────

type BrowseTarget =
  | { kind: 'upload'; format: 'ebook' | 'audiobook'; label: string; rootPath: string }
  | { kind: 'location'; location: StorageLocation }

interface FileBrowserModalProps {
  libraryId: string
  bookId: string
  editionId: string
  editionFormat: string
  onLink: (file: EditionFile) => void
  onClose: () => void
}

function FileBrowserModal({ libraryId, bookId, editionId, editionFormat, onLink, onClose }: FileBrowserModalProps) {
  const { callApi } = useAuth()
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [target, setTarget] = useState<BrowseTarget | null>(null)
  const [entries, setEntries] = useState<BrowseEntry[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Built-in upload path locations — always present
  const isAudiobook = editionFormat === 'audiobook'
  const uploadTargets: Extract<BrowseTarget, { kind: 'upload' }>[] = isAudiobook
    ? [{ kind: 'upload', format: 'audiobook', label: 'Audiobooks', rootPath: '' }]
    : [{ kind: 'upload', format: 'ebook', label: 'Ebooks', rootPath: '' }]

  useEffect(() => {
    callApi<StorageLocation[]>(`/api/v1/libraries/${libraryId}/storage-locations`)
      .then(locs => setLocations(locs ?? []))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId])

  const browseUpload = useCallback(async (format: 'ebook' | 'audiobook', path: string) => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ format })
      if (path) qs.set('path', path)
      const result = await callApi<{ root_path: string; entries: BrowseEntry[] }>(
        `/api/v1/libraries/${libraryId}/browse-uploads?${qs}`
      )
      setEntries(result?.entries ?? [])
      setCurrentPath(path)
      // Update root_path in target once known
      setTarget(prev =>
        prev?.kind === 'upload' && prev.format === format
          ? { ...prev, rootPath: result?.root_path ?? '' }
          : prev
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to browse directory')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId])

  const browseLocation = useCallback(async (location: StorageLocation, path: string) => {
    setLoading(true)
    setError(null)
    try {
      const qs = path ? `?path=${encodeURIComponent(path)}` : ''
      const result = await callApi<BrowseEntry[]>(
        `/api/v1/libraries/${libraryId}/storage-locations/${location.id}/browse${qs}`
      )
      setEntries(result ?? [])
      setCurrentPath(path)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to browse directory')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId])

  const selectTarget = (t: BrowseTarget) => {
    setTarget(t)
    setCurrentPath('')
    setEntries([])
    if (t.kind === 'upload') browseUpload(t.format, '')
    else browseLocation(t.location, '')
  }

  const navigateInto = (entry: BrowseEntry) => {
    if (!target || !entry.is_dir) return
    if (target.kind === 'upload') browseUpload(target.format, entry.path)
    else browseLocation(target.location, entry.path)
  }

  const navigateUp = () => {
    if (!target) return
    const parent = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : ''
    if (target.kind === 'upload') browseUpload(target.format, parent)
    else browseLocation(target.location, parent)
  }

  const navigateToSegment = (segPath: string) => {
    if (!target) return
    if (target.kind === 'upload') browseUpload(target.format, segPath)
    else browseLocation(target.location, segPath)
  }

  const navigateToRoot = () => {
    if (!target) return
    if (target.kind === 'upload') browseUpload(target.format, '')
    else browseLocation(target.location, '')
  }

  const handleLink = async (entry: BrowseEntry) => {
    if (!target || entry.is_dir || !entry.is_bookable) return
    setLinking(true)
    try {
      let ef: EditionFile | null = null
      if (target.kind === 'upload') {
        ef = await callApi<EditionFile>(
          `/api/v1/libraries/${libraryId}/books/${bookId}/editions/${editionId}/files/link-upload`,
          { method: 'POST', body: JSON.stringify({ file_path: entry.path }) }
        ) ?? null
      } else {
        ef = await callApi<EditionFile>(
          `/api/v1/libraries/${libraryId}/books/${bookId}/editions/${editionId}/files/link`,
          { method: 'POST', body: JSON.stringify({ storage_location_id: target.location.id, file_path: entry.path }) }
        ) ?? null
      }
      if (ef) onLink(ef)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to link file')
    } finally {
      setLinking(false)
    }
  }

  const targetLabel = target?.kind === 'upload' ? target.label : target?.location.name ?? ''
  const targetRootPath = target?.kind === 'upload' ? target.rootPath : target?.location.root_path ?? ''
  const dirs = entries.filter(e => e.is_dir)
  const files = entries.filter(e => !e.is_dir)

  const sidebarBtnCls = (active: boolean) =>
    `w-full text-left px-2 py-1.5 rounded text-xs font-medium transition-colors truncate ${
      active
        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Browse server files</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-48 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-3 space-y-3">
            {/* Built-in upload paths */}
            <div>
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Upload paths</p>
              <div className="space-y-0.5">
                {uploadTargets.map(t => (
                  <button key={t.kind === 'upload' ? t.format : ''} onClick={() => selectTarget(t)}
                    className={sidebarBtnCls(target?.kind === 'upload' && target.format === (t as { format: string }).format)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Configured storage locations */}
            {locations.length > 0 && (
              <div>
                <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Storage locations</p>
                <div className="space-y-0.5">
                  {locations.map(loc => (
                    <button key={loc.id} onClick={() => selectTarget({ kind: 'location', location: loc })}
                      className={sidebarBtnCls(target?.kind === 'location' && target.location.id === loc.id)}>
                      {loc.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* File browser pane */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Breadcrumb */}
            {target && (
              <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 min-w-0">
                <button onClick={navigateToRoot} className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors font-medium flex-shrink-0">
                  {targetLabel}
                </button>
                {targetRootPath && (
                  <span className="text-gray-300 dark:text-gray-600 font-mono truncate flex-shrink min-w-0 hidden sm:block">
                    &nbsp;({targetRootPath})
                  </span>
                )}
                {currentPath.split('/').filter(Boolean).map((seg, i, arr) => {
                  const segPath = arr.slice(0, i + 1).join('/')
                  return (
                    <span key={segPath} className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-gray-300 dark:text-gray-600">/</span>
                      <button onClick={() => navigateToSegment(segPath)} className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors max-w-[100px] truncate">
                        {seg}
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Directory contents */}
            <div className="flex-1 overflow-y-auto p-3">
              {!target && (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-4 text-center">Select a location to browse.</p>
              )}
              {loading && (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-4 text-center">Loading…</p>
              )}
              {error && (
                <p className="text-xs text-red-500 dark:text-red-400 px-2 py-2">{error}</p>
              )}
              {!loading && target && entries.length === 0 && !error && (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-4 text-center">This directory is empty.</p>
              )}
              {!loading && (
                <div className="space-y-0.5">
                  {currentPath && (
                    <button onClick={navigateUp}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      ..
                    </button>
                  )}
                  {dirs.map(entry => (
                    <button key={entry.path} onClick={() => navigateInto(entry)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <svg className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ))}
                  {files.map(entry => (
                    <button key={entry.path}
                      onClick={() => entry.is_bookable && handleLink(entry)}
                      disabled={linking || !entry.is_bookable}
                      title={entry.is_bookable ? `Link ${entry.name}` : 'Not a supported book format'}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors group ${
                        entry.is_bookable
                          ? 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-400 disabled:opacity-50 cursor-pointer'
                          : 'text-gray-400 dark:text-gray-600 cursor-default'
                      }`}>
                      <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${entry.is_bookable ? 'text-gray-400 dark:text-gray-500 group-hover:text-blue-500' : 'text-gray-300 dark:text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate flex-1">{entry.name}</span>
                      {entry.size != null && (
                        <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
                          {(entry.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      )}
                      {entry.is_bookable && (
                        <span className="text-blue-600 dark:text-blue-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">Link</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Edition card ─────────────────────────────────────────────────────────────

interface EditionCardProps {
  edition: BookEdition
  libraryId: string
  bookId: string
  onEdit: (edition: BookEdition) => void
  onDeleted: () => void
}

const READ_STATUS_PILL: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  read: {
    label: 'Read',
    cls: 'bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400 ring-green-200 dark:ring-green-800',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  reading: {
    label: 'In Progress',
    cls: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 ring-blue-200 dark:ring-blue-800',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  did_not_finish: {
    label: 'Did Not Finish',
    cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-amber-200 dark:ring-amber-800',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
}

const DIGITAL_FORMATS = new Set(['ebook', 'digital', 'audiobook'])

function EditionCard({ edition: initialEdition, libraryId, bookId, onEdit, onDeleted }: EditionCardProps) {
  const { callApi, getToken } = useAuth()
  const edition = initialEdition
  const [deleting, setDeleting] = useState(false)
  const [showReading, setShowReading] = useState(false)
  const [readStatus, setReadStatus] = useState<string>('unread')
  const [fileUploading, setFileUploading] = useState(false)
  const [fileRemoving, setFileRemoving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<EditionFile[]>(initialEdition.files ?? [])
  const isDigital = DIGITAL_FORMATS.has(edition.format)

  const uploadFile = async (file: File) => {
    setFileUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const ef = await callApi<EditionFile>(`/api/v1/libraries/${libraryId}/books/${bookId}/editions/${edition.id}/files`, { method: 'POST', body: form })
      if (ef) setFiles(prev => [...prev, ef])
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : 'Upload failed')
    } finally { setFileUploading(false) }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of selected) {
      await uploadFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    for (const file of dropped) {
      await uploadFile(file)
    }
  }

  const handleFileRemove = async (ef: EditionFile) => {
    if (!confirm(`Remove "${ef.file_name || ef.file_format.toUpperCase()}" from this edition?`)) return
    setFileRemoving(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/books/${bookId}/editions/${edition.id}/files/${ef.id}`, { method: 'DELETE' })
      setFiles(prev => prev.filter(f => f.id !== ef.id))
    } catch { /* silent */ }
    finally { setFileRemoving(false) }
  }

  // Fetch read status eagerly so the pill shows without expanding the section
  useEffect(() => {
    callApi<UserBookInteraction>(
      `/api/v1/libraries/${libraryId}/books/${bookId}/editions/${edition.id}/my-interaction`
    )
      .then(i => { if (i) setReadStatus(i.read_status) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edition.id])

  const formatBadgeCls = () => {
    if (edition.format === 'ebook' || edition.format === 'digital')
      return 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 ring-purple-200 dark:ring-purple-800'
    if (edition.format === 'audiobook')
      return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-amber-200 dark:ring-amber-800'
    return 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 ring-blue-200 dark:ring-blue-800'
  }

  const handleDelete = async () => {
    if (!confirm('Delete this edition? This also removes any reading records for it.')) return
    setDeleting(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/books/${bookId}/editions/${edition.id}`, { method: 'DELETE' })
      onDeleted()
    } catch {
      setDeleting(false)
    }
  }

  const metaItems: Array<{ label: string; value: React.ReactNode } | null> = [
    edition.publisher        ? { label: 'Publisher',  value: edition.publisher } : null,
    edition.language         ? { label: 'Language',   value: edition.language.toUpperCase() } : null,
    edition.publish_date     ? { label: 'Published',  value: edition.publish_date } : null,
    edition.isbn_13          ? { label: 'ISBN-13',    value: <span className="font-mono">{edition.isbn_13}</span> } : null,
    edition.isbn_10          ? { label: 'ISBN-10',    value: <span className="font-mono">{edition.isbn_10}</span> } : null,
    edition.page_count != null    ? { label: 'Pages',    value: `${edition.page_count}` } : null,
    edition.duration_seconds != null ? { label: 'Duration', value: `${Math.round(edition.duration_seconds / 3600 * 10) / 10} hrs` } : null,
    edition.narrator         ? { label: 'Narrator',   value: edition.narrator } : null,
    // Copies + Acquired moved to per-library display — follow-up work under M2M.
  ].filter(Boolean)

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${formatBadgeCls()}`}>
            {edition.format}
          </span>
          {edition.is_primary && (
            <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/50 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800">
              Primary
            </span>
          )}
          {READ_STATUS_PILL[readStatus] && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${READ_STATUS_PILL[readStatus].cls}`}>
              {READ_STATUS_PILL[readStatus].icon}
              {READ_STATUS_PILL[readStatus].label}
            </span>
          )}
          {edition.edition_name && <span className="text-sm font-medium text-gray-900 dark:text-white">{edition.edition_name}</span>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onEdit(edition)}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Edit edition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            title="Delete edition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Metadata grid */}
      {metaItems.length > 0 && (
        <dl className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
          {(metaItems as Array<{ label: string; value: React.ReactNode }>).map(item => (
            <div key={item.label}>
              <dt className="text-xs text-gray-400 dark:text-gray-500">{item.label}</dt>
              <dd className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* File attachments — digital editions only */}
      {isDigital && (
        <>
          <div
            className={`border-t transition-colors ${
              isDragging
                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-100 dark:border-gray-800'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Existing files list */}
            {files.map(ef => (
              <div key={ef.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {ef.file_name || ef.file_format.toUpperCase()}
                      {ef.file_size != null && <span className="ml-1 text-gray-400 dark:text-gray-500">({(ef.file_size / (1024 * 1024)).toFixed(1)} MB)</span>}
                    </span>
                    {ef.file_path && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                        {ef.root_path ? <><span className="text-gray-300 dark:text-gray-600">{ef.root_path}/</span>{ef.file_path}</> : ef.file_path}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={async () => {
                      const token = await getToken()
                      const res = await fetch(`/api/v1/libraries/${libraryId}/books/${bookId}/editions/${edition.id}/files/${ef.id}`, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                      })
                      if (!res.ok) return
                      const blob = await res.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = ef.file_name || `${ef.id}.${ef.file_format}`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="px-2 py-1 rounded text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleFileRemove(ef)}
                    disabled={fileRemoving}
                    className="px-2 py-1 rounded text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            {/* Add file row */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className={`text-xs truncate ${uploadError ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                {uploadError ?? (isDragging ? 'Drop to upload' : files.length === 0 ? 'No files attached' : 'Drop to add another file')}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={fileUploading}
                  className="px-2 py-1 rounded text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {fileUploading ? 'Uploading…' : 'Upload'}
                </button>
                <button
                  onClick={() => setShowBrowser(true)}
                  disabled={fileUploading}
                  className="px-2 py-1 rounded text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  title="Browse server files"
                >
                  Browse
                </button>
                <input ref={fileInputRef} type="file" className="hidden" multiple
                  accept=".epub,.pdf,.mobi,.azw3,.cbz,.cbr,.mp3,.m4a,.m4b,.aax,.ogg,.flac,.opus"
                  onChange={handleFileUpload} />
              </div>
            </div>
          </div>
          {showBrowser && (
            <FileBrowserModal
              libraryId={libraryId}
              bookId={bookId}
              editionId={edition.id}
              editionFormat={edition.format}
              onLink={ef => {
                setFiles(prev => [...prev, ef])
                setShowBrowser(false)
              }}
              onClose={() => setShowBrowser(false)}
            />
          )}
        </>
      )}

      {/* Collapsible reading section */}
      <div className="border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setShowReading(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <span>My reading</span>
          <svg className={`w-4 h-4 transition-transform ${showReading ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showReading && (
          <div className="px-4 pb-4">
            <InteractionForm libraryId={libraryId} bookId={bookId} editionId={edition.id} onStatusChange={setReadStatus} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Merged metadata modal ────────────────────────────────────────────────────

interface MergedMetadataModalProps {
  book: Book
  editions: BookEdition[]
  libraryId: string
  bookId: string
  onClose: () => void
  onApplied: () => void
}

function MergedMetadataModal({ book, editions, libraryId, bookId, onClose, onApplied }: MergedMetadataModalProps) {
  const { callApi } = useAuth()
  const primaryEdition = editions.find(e => e.is_primary) ?? editions[0] ?? null
  const [isbnInput, setIsbnInput] = useState(primaryEdition?.isbn_13 || primaryEdition?.isbn_10 || '')
  const [merged, setMerged] = useState<MergedBookResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // For each field key, the chosen alternative source (undefined = use primary)
  const [altChoice, setAltChoice] = useState<Record<string, string>>({})
  // Which field keys are selected to apply
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  // Selected cover index (-1 = don't apply)
  const [selectedCoverIdx, setSelectedCoverIdx] = useState(-1)

  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  useEffect(() => { if (isbnInput) doSearch(isbnInput) }, [])

  const getEffectiveValue = (key: string, field: MergedFieldResult | undefined): string => {
    if (!field) return ''
    const chosen = altChoice[key]
    if (chosen) return field.alternatives?.find(a => a.source === chosen)?.value ?? field.value
    return field.value
  }

  const fieldDefs = (m: MergedBookResult) => [
    { key: 'title',        label: 'Title',       currentValue: book.title,                                          field: m.title },
    { key: 'subtitle',     label: 'Subtitle',    currentValue: book.subtitle,                                       field: m.subtitle },
    { key: 'authors',      label: 'Authors',     currentValue: book.contributors.map(c => c.name).join(', '),       field: m.authors },
    { key: 'description',  label: 'Description', currentValue: book.description,                                    field: m.description, multiline: true },
    { key: 'publisher',    label: 'Publisher',   currentValue: primaryEdition?.publisher ?? '',                     field: m.publisher },
    { key: 'publish_date', label: 'Pub. date',   currentValue: primaryEdition?.publish_date ?? '',                  field: m.publish_date },
    { key: 'language',     label: 'Language',    currentValue: primaryEdition?.language ?? '',                      field: m.language },
    { key: 'isbn_10',      label: 'ISBN-10',     currentValue: primaryEdition?.isbn_10 ?? '',                       field: m.isbn_10, mono: true },
    { key: 'isbn_13',      label: 'ISBN-13',     currentValue: primaryEdition?.isbn_13 ?? '',                       field: m.isbn_13, mono: true },
    { key: 'page_count',   label: 'Page count',  currentValue: primaryEdition?.page_count != null ? String(primaryEdition.page_count) : '', field: m.page_count },
  ].filter(fd => !!fd.field)

  const doSearch = async (isbn: string) => {
    const q = isbn.trim()
    if (!q) return
    setLoading(true); setError(null); setMerged(null); setAltChoice({})
    try {
      const result = await callApi<MergedBookResult>(`/api/v1/lookup/isbn/${encodeURIComponent(q)}/merged`)
      if (!result) { setError('No results found.'); return }
      setMerged(result)
      const defs = fieldDefs(result)
      setEnabled(new Set(defs.filter(fd => fd.field!.value !== fd.currentValue).map(fd => fd.key)))
      setSelectedCoverIdx(!book.cover_url && (result.covers?.length ?? 0) > 0 ? 0 : -1)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  const resolveContributors = async (names: string[]) => {
    const out: Array<{ contributor_id: string; role: string; display_order: number }> = []
    for (const name of names) {
      try {
        const matches = await callApi<ContributorResult[]>(`/api/v1/contributors?q=${encodeURIComponent(name)}`)
        const exact = (matches ?? []).find(c => c.name.toLowerCase() === name.toLowerCase())
        if (exact) {
          out.push({ contributor_id: exact.id, role: 'author', display_order: out.length })
        } else {
          const c = await callApi<ContributorResult>('/api/v1/contributors', { method: 'POST', body: JSON.stringify({ name }) })
          if (c) out.push({ contributor_id: c.id, role: 'author', display_order: out.length })
        }
      } catch { /* skip */ }
    }
    return out.filter((c, i, arr) => arr.findIndex(x => x.contributor_id === c.contributor_id && x.role === c.role) === i)
  }

  const handleApply = async () => {
    if (!merged) return
    setApplying(true); setApplyError(null)
    try {
      const pick = (key: string, current: string) =>
        enabled.has(key) ? (getEffectiveValue(key, merged[key as keyof MergedBookResult] as MergedFieldResult | undefined) || current) : current

      let contribs = book.contributors.map((c, i) => ({ contributor_id: c.contributor_id, role: c.role, display_order: i }))
      if (enabled.has('authors') && merged.authors) {
        contribs = await resolveContributors(getEffectiveValue('authors', merged.authors).split(/\s*,\s*/).filter(Boolean))
      }

      await callApi(`/api/v1/libraries/${libraryId}/books/${bookId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: pick('title', book.title),
          subtitle: pick('subtitle', book.subtitle),
          description: pick('description', book.description),
          media_type_id: book.media_type_id,
          contributors: contribs,
          tag_ids: book.tags.map(t => t.id),
          genre_ids: (book.genres ?? []).map(g => g.id),
        }),
      })

      if (primaryEdition) {
        const edKeys = ['publisher', 'publish_date', 'language', 'isbn_10', 'isbn_13', 'page_count']
        if (edKeys.some(k => enabled.has(k))) {
          await callApi(`/api/v1/libraries/${libraryId}/books/${bookId}/editions/${primaryEdition.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              format: primaryEdition.format, edition_name: primaryEdition.edition_name,
              narrator: primaryEdition.narrator, is_primary: primaryEdition.is_primary,
              duration_seconds: primaryEdition.duration_seconds,
              description: primaryEdition.description,
              language: pick('language', primaryEdition.language ?? ''),
              publisher: pick('publisher', primaryEdition.publisher ?? ''),
              publish_date: pick('publish_date', primaryEdition.publish_date ?? ''),
              isbn_10: pick('isbn_10', primaryEdition.isbn_10 ?? ''),
              isbn_13: pick('isbn_13', primaryEdition.isbn_13 ?? ''),
              page_count: enabled.has('page_count') && merged.page_count
                ? (parseInt(getEffectiveValue('page_count', merged.page_count)) || primaryEdition.page_count)
                : primaryEdition.page_count,
            }),
          })
        }
      }

      if (selectedCoverIdx >= 0 && merged.covers?.[selectedCoverIdx]) {
        try {
          await callApi(`/api/v1/libraries/${libraryId}/books/${bookId}/cover/fetch`, {
            method: 'POST', body: JSON.stringify({ url: merged.covers[selectedCoverIdx].cover_url }),
          })
        } catch { /* non-fatal */ }
      }

      onApplied(); onClose()
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  const defs = merged ? fieldDefs(merged) : []
  const selectedCount = defs.filter(fd => enabled.has(fd.key)).length + (selectedCoverIdx >= 0 ? 1 : 0)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-16 px-4">
      <div className="w-full max-w-xl rounded-xl bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Refresh metadata</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ISBN search */}
          <div className="flex gap-2">
            <input type="text" value={isbnInput} onChange={e => setIsbnInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch(isbnInput)}
              placeholder="ISBN-10 or ISBN-13…"
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <button onClick={() => doSearch(isbnInput)} disabled={loading || !isbnInput.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loading ? '…' : 'Search'}
            </button>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {loading && <p className="text-sm text-gray-400 dark:text-gray-500">Searching providers…</p>}

          {merged && (
            <>
              {/* Field rows */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {defs.map(fd => {
                    const effectiveValue = getEffectiveValue(fd.key, fd.field)
                    const isSame = effectiveValue === fd.currentValue
                    const isOn = enabled.has(fd.key)
                    const hasAlts = (fd.field?.alternatives?.length ?? 0) > 0
                    const sourceDisplay = altChoice[fd.key]
                      ? fd.field!.alternatives.find(a => a.source === altChoice[fd.key])?.source_display ?? fd.field!.source_display
                      : fd.field!.source_display

                    return (
                      <div key={fd.key} className={`flex items-start gap-3 px-4 py-3 ${isSame ? 'opacity-50' : ''}`}>
                        <input type="checkbox" checked={isOn && !isSame} disabled={isSame}
                          onChange={() => { if (!isSame) setEnabled(prev => { const s = new Set(prev); if (isOn) s.delete(fd.key); else s.add(fd.key); return s }) }}
                          className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{fd.label}</p>
                          {isSame ? (
                            <p className={`mt-0.5 text-sm text-gray-500 dark:text-gray-400 ${fd.multiline ? 'line-clamp-2' : 'truncate'}`}>
                              {effectiveValue || '(empty)'}
                            </p>
                          ) : (
                            <>
                              <p className={`mt-0.5 text-sm text-gray-400 dark:text-gray-500 ${fd.multiline ? 'line-clamp-1' : 'truncate'} ${fd.currentValue ? 'line-through' : 'italic'}`}>
                                {fd.currentValue || '(empty)'}
                              </p>
                              <p className={`text-sm text-blue-600 dark:text-blue-400 mt-0.5 ${fd.multiline ? 'line-clamp-2' : 'truncate'} ${fd.mono ? 'font-mono text-xs' : ''}`}>
                                {effectiveValue}
                              </p>
                            </>
                          )}
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          {isSame ? (
                            <span className="text-xs text-gray-300 dark:text-gray-600">same</span>
                          ) : hasAlts ? (
                            <select
                              value={altChoice[fd.key] ?? ''}
                              onChange={e => setAltChoice(prev => ({ ...prev, [fd.key]: e.target.value }))}
                              className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 focus:outline-none focus:border-blue-400"
                            >
                              <option value="">{fd.field!.source_display}</option>
                              {fd.field!.alternatives.map(alt => (
                                <option key={alt.source} value={alt.source}>{alt.source_display}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">{sourceDisplay}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Covers */}
              {(merged.covers?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Cover</p>
                  <div className="flex gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSelectedCoverIdx(-1)}
                      className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors ${selectedCoverIdx === -1 ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}
                    >
                      Keep current
                    </button>
                    {merged.covers!.map((cover, idx) => (
                      <button key={cover.source} type="button" onClick={() => setSelectedCoverIdx(idx)}
                        className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-colors ${selectedCoverIdx === idx ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                        <img src={cover.cover_url} alt="" referrerPolicy="no-referrer" className="h-16 w-11 object-cover rounded" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">{cover.source_display}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {applyError && (
                <p className="text-sm text-red-600 dark:text-red-400">{applyError}</p>
              )}

              <div className="flex justify-end">
                <button onClick={handleApply} disabled={applying || selectedCount === 0}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {applying ? 'Applying…' : selectedCount > 0 ? `Apply ${selectedCount} change${selectedCount !== 1 ? 's' : ''}` : 'Nothing selected'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="pt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BookPage() {
  const { libraryId, bookId } = useParams<{ libraryId: string; bookId: string }>()
  const navigate = useNavigate()
  const { callApi } = useAuth()
  const { setExtraCrumbs } = useOutletContext<LibraryOutletContext>()

  const [book, setBook] = useState<Book | null>(null)
  const [editions, setEditions] = useState<BookEdition[]>([])
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [seriesRefs, setSeriesRefs] = useState<BookSeriesRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showMetaSearch, setShowMetaSearch] = useState(false)
  const [showEditBook, setShowEditBook] = useState(false)
  const [showLend, setShowLend] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<Loan[] | null>(null)
  const [editionModal, setEditionModal] = useState<'add' | BookEdition | null>(null)
  const [coverUploading, setCoverUploading] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!libraryId || !bookId) return
    setError(null)
    try {
      const b = await callApi<Book>(`/api/v1/libraries/${libraryId}/books/${bookId}`)
      if (!b) { navigate(`/libraries/${libraryId}/books`, { replace: true }); return }
      setBook(b)

      const [eds, shs, srs] = await Promise.all([
        callApi<BookEdition[]>(`/api/v1/libraries/${libraryId}/books/${bookId}/editions`),
        callApi<Shelf[]>(`/api/v1/libraries/${libraryId}/books/${bookId}/shelves`),
        callApi<BookSeriesRef[]>(`/api/v1/libraries/${libraryId}/books/${bookId}/series`),
      ])
      setEditions(eds ?? [])
      setShelves(shs ?? [])
      setSeriesRefs(srs ?? [])
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        navigate(`/libraries/${libraryId}`, { replace: true })
        return
      }
      setError(err instanceof ApiError ? err.message : 'Failed to load book')
    }
  }, [callApi, libraryId, bookId, navigate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (book) setExtraCrumbs([
      { label: 'Books', to: `/libraries/${libraryId}/books` } as Crumb,
      { label: book.title },
    ])
    return () => setExtraCrumbs([])
  }, [book, setExtraCrumbs])

  // Eager-load loan history alongside the book so we can hide the
  // section entirely on books that have never been lent. Cheap one-shot
  // GET; the trade-off vs lazy-loading on disclosure-open is that we
  // don't render an empty "Loan history" header on books with none.
  // Lives above the early `error` return so hook order stays stable.
  const loadHistory = useCallback(async () => {
    if (!libraryId || !bookId) return
    const list = await callApi<Loan[]>(
      `/api/v1/libraries/${libraryId}/loans?include_returned=true&book_id=${bookId}`,
    ).catch(() => null)
    setHistory(list ?? [])
  }, [callApi, libraryId, bookId])

  useEffect(() => { loadHistory() }, [loadHistory])

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      </div>
    )
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so re-selecting the same file still fires onChange
    e.target.value = ''
    setCoverUploading(true)
    try {
      const form = new FormData()
      form.append('cover', file)
      await callApi(`/api/v1/libraries/${libraryId}/books/${bookId}/cover`, {
        method: 'PUT',
        body: form,
      })
      load()
    } catch { /* ignore — cover upload errors are visible from missing image */ }
    finally { setCoverUploading(false) }
  }

  const handleMarkReturned = async (loan: Loan) => {
    const today = new Date().toISOString().slice(0, 10)
    await callApi(`/api/v1/libraries/${libraryId}/loans/${loan.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        loaned_to: loan.loaned_to,
        due_date: loan.due_date,
        returned_at: today,
        notes: loan.notes,
      }),
    }).catch(() => {})
    load()
    // Refresh history so the just-returned loan shows up there too.
    loadHistory()
  }

  const handleCoverDelete = async () => {
    if (!confirm('Remove cover image?')) return
    setCoverUploading(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/books/${bookId}/cover`, { method: 'DELETE' })
      load()
    } finally { setCoverUploading(false) }
  }

  if (!book) {
    return <div className="p-8 text-sm text-gray-400 dark:text-gray-500">Loading…</div>
  }

  return (
    <div className="p-8">
      <div className="flex gap-8 items-start">

        {/* ── Left sidebar ── */}
        <div className="w-48 flex-shrink-0 sticky top-8 space-y-5">

          {/* Cover with hover overlay */}
          <div className="relative group cursor-pointer"
            onClick={() => !coverUploading && coverInputRef.current?.click()}>
            <BookCover title={book.title} coverUrl={book.cover_url} className="w-full" />
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" disabled={coverUploading}
                onClick={e => { e.stopPropagation(); coverInputRef.current?.click() }}
                className="rounded-md bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-white disabled:opacity-50 transition-colors">
                {coverUploading ? 'Uploading…' : book.cover_url ? 'Change cover' : 'Add cover'}
              </button>
              {book.cover_url && !coverUploading && (
                <button type="button"
                  onClick={e => { e.stopPropagation(); handleCoverDelete() }}
                  className="rounded-md bg-white/90 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-white transition-colors">
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Media type + tags */}
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
              {book.media_type}
            </span>
            {book.tags.map(tag => (
              <span key={tag.id}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: tag.color || '#6b7280' }}>
                {tag.name}
              </span>
            ))}
          </div>
          {/* Genres */}
          {book.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {book.genres.map(genre => (
                <span key={genre.id}
                  className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-600 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                  {genre.name}
                </span>
              ))}
            </div>
          )}

          {/* Contributors */}
          {book.contributors.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                {book.contributors.length === 1 && book.contributors[0].role === 'author' ? 'Author' : 'Contributors'}
              </p>
              <div className="space-y-2">
                {book.contributors.map(c => (
                  <Link key={c.contributor_id} to={`/libraries/${libraryId}/contributors/${c.contributor_id}`} className="block group/contrib">
                    <p className="text-sm font-medium text-gray-900 dark:text-white group-hover/contrib:text-blue-600 dark:group-hover/contrib:text-blue-400 transition-colors">{c.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{c.role}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Primary edition quick-ref metadata */}
          {(() => {
            const primary = editions.find(e => e.is_primary) ?? editions[0]
            if (!primary) return null
            const rows = [
              primary.publisher    ? { label: 'Publisher', value: primary.publisher }                        : null,
              primary.publish_date ? { label: 'Published', value: primary.publish_date }                     : null,
              primary.language     ? { label: 'Language',  value: primary.language.toUpperCase() }           : null,
              primary.isbn_13      ? { label: 'ISBN-13',   value: primary.isbn_13,   mono: true }            : null,
              !primary.isbn_13 && primary.isbn_10
                                   ? { label: 'ISBN-10',   value: primary.isbn_10,   mono: true }            : null,
              primary.page_count != null
                                   ? { label: 'Pages',     value: String(primary.page_count) }               : null,
            ].filter(Boolean) as Array<{ label: string; value: string; mono?: boolean }>
            if (rows.length === 0) return null
            return (
              <dl className="space-y-2.5">
                {rows.map(row => (
                  <div key={row.label}>
                    <dt className="text-xs text-gray-400 dark:text-gray-500">{row.label}</dt>
                    <dd className={`text-sm text-gray-700 dark:text-gray-300 mt-0.5 ${row.mono ? 'font-mono text-xs' : ''}`}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )
          })()}
        </div>

        {/* ── Right main column ── */}
        <div className="flex-1 min-w-0">

          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{book.title}</h1>
              {book.subtitle && (
                <p className="mt-0.5 text-base text-gray-500 dark:text-gray-400">{book.subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => setShowLend(true)} title="Lend this book"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
              <button onClick={() => setShowEditBook(true)} title="Edit book"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={() => setShowMetaSearch(true)} title="Refresh metadata"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Active loans — surfaces loans where this book is currently
              lent out so the user doesn't have to navigate to /loans. The
              schema allows multi-active loans (when the user owns more than
              one copy), so we render every active row. */}
          {book.active_loans && book.active_loans.length > 0 && (
            <Section title={book.active_loans.length === 1 ? 'Currently lent' : `Currently lent (${book.active_loans.length})`}>
              <div className="space-y-2">
                {book.active_loans.map(loan => {
                  const today = new Date().toISOString().slice(0, 10)
                  const overdue = !!loan.due_date && loan.due_date < today
                  return (
                    <div key={loan.id}
                      className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                          <svg className="w-4 h-4 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            Lent to {loan.loaned_to}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            <span>Loaned {loan.loaned_at}</span>
                            {loan.due_date && (
                              <span className={overdue ? 'ml-2 text-red-600 dark:text-red-400 font-medium' : 'ml-2'}>
                                · Due {loan.due_date}{overdue && ' (overdue)'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => handleMarkReturned(loan)}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap flex-shrink-0">
                        Mark returned
                      </button>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Loan history — disclosure pattern, collapsed by default.
              The whole section hides on books with no recorded loans;
              we eager-fetch above so we know whether to render at all. */}
          {history && history.length > 0 && (
            <div className="pt-6">
              <button onClick={() => setHistoryOpen(o => !o)}
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                <svg className={`w-3.5 h-3.5 transition-transform ${historyOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Loan history
                <span className="text-xs font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">
                  ({history.length})
                </span>
              </button>
              {historyOpen && (
                <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        {['Loaned to', 'Loaned', 'Due', 'Returned'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {history.map(loan => (
                        <tr key={loan.id}>
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{loan.loaned_to}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{loan.loaned_at}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{loan.due_date ?? <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{loan.returned_at ?? <span className="text-amber-600 dark:text-amber-400">Active</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {book.description && (
            <Section title="Description">
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {book.description}
              </p>
            </Section>
          )}

          {/* Series */}
          {seriesRefs.length > 0 && (
            <Section title="Series">
              <div className="space-y-2">
                {seriesRefs.map(ref => (
                  <Link key={ref.series_id} to={`/libraries/${libraryId}/series`}
                    className="group flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{ref.series_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Vol. {formatPosition(ref.position)}</p>
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {/* Shelves */}
          {shelves.length > 0 && (
            <Section title="On shelves">
              <div className="flex flex-wrap gap-2">
                {shelves.map(shelf => (
                  <span key={shelf.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300">
                    {shelf.icon && <span>{shelf.icon}</span>}
                    {shelf.name}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Editions */}
          <Section
            title={`Editions${editions.length > 0 ? ` (${editions.length})` : ''}`}
            action={
              <button onClick={() => setEditionModal('add')}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add edition
              </button>
            }
          >
            {editions.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No editions recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {editions.map(e => (
                  <EditionCard key={e.id} edition={e} libraryId={libraryId!} bookId={bookId!}
                    onEdit={setEditionModal}
                    onDeleted={load}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {showEditBook && book && (
        <EditBookModal
          libraryId={libraryId!}
          book={book}
          onClose={() => setShowEditBook(false)}
          onSaved={updated => { setBook(updated); setShowEditBook(false) }}
        />
      )}

      {showLend && book && (
        <LoanFormModal
          libraryId={libraryId!}
          prefillBook={{ id: book.id, title: book.title }}
          onClose={() => setShowLend(false)}
          onSaved={() => setShowLend(false)}
        />
      )}

      {showMetaSearch && (
        <MergedMetadataModal
          book={book}
          editions={editions}
          libraryId={libraryId!}
          bookId={bookId!}
          onClose={() => setShowMetaSearch(false)}
          onApplied={load}
        />
      )}

      {editionModal !== null && (
        <AddEditionModal
          libraryId={libraryId!}
          bookId={bookId!}
          edition={editionModal === 'add' ? null : editionModal}
          contributors={book.contributors}
          onClose={() => setEditionModal(null)}
          onSaved={() => { setEditionModal(null); load() }}
        />
      )}
    </div>
  )
}
