import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../../auth/AuthContext'
import { LIBRARY_SECTIONS } from '../../lib/librarySections'
import type { Library } from '../../types'
import PageHeader from '../../components/PageHeader'
import { usePageTitle } from '../../hooks/usePageTitle'

// ─── Library form modal (create + edit) ───────────────────────────────────────
//
// One form does both flows so we don't duplicate field validation. When
// `library` is set we PUT, otherwise POST. The slug is server-derived
// from the name on create and immutable on update, so it never appears
// in the form.

interface LibraryModalProps {
  library?: Library
  onClose: () => void
  onSaved: (lib: Library) => void
}

function LibraryModal({ library, onClose, onSaved }: LibraryModalProps) {
  const { callApi } = useAuth()
  const isEdit = !!library
  const [form, setForm] = useState({
    name: library?.name ?? '',
    description: library?.description ?? '',
    is_public: library?.is_public ?? false,
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const lib = await callApi<Library>(
        isEdit ? `/api/v1/libraries/${library.id}` : '/api/v1/libraries',
        { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(form) },
      )
      onSaved(lib)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${isEdit ? 'update' : 'create'} library`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-surface shadow-xl p-6">
        <h2 className="text-lg font-semibold text-content mb-4">
          {isEdit ? 'Edit library' : 'Create library'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-line-strong dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="My Books"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-line-strong dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Optional"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))}
              className="rounded border-line-strong text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-content-secondary">Public library</span>
          </label>

          {error && (
            <div className="rounded-lg bg-danger-surface border border-danger-line px-3 py-2 text-sm text-danger-strong">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirmation ──────────────────────────────────────────────────────
//
// Type-name-to-confirm gate. Deleting cascades through library_books,
// library_memberships, import_jobs, and enrichment_batches; books shared
// via M2M with another library survive (only the link drops), so the
// blast radius is real but bounded. The typed-name affordance is the
// standard guardrail against muscle-memory destruction.

interface DeleteLibraryModalProps {
  library: Library
  onClose: () => void
  onDeleted: (id: string) => void
}

function DeleteLibraryModal({ library, onClose, onDeleted }: DeleteLibraryModalProps) {
  const { callApi } = useAuth()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const matches = typed === library.name

  const handleDelete = async () => {
    if (!matches) return
    setError(null)
    setIsLoading(true)
    try {
      await callApi(`/api/v1/libraries/${library.id}`, { method: 'DELETE' })
      onDeleted(library.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete library')
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-surface shadow-xl p-6">
        <h2 className="text-lg font-semibold text-content mb-2">Delete library</h2>
        <p className="text-sm text-content-tertiary mb-1">
          This permanently deletes <span className="font-semibold">{library.name}</span> and removes every book link, membership, import job, and enrichment batch tied to it.
        </p>
        <p className="text-xs text-content-muted mb-4">
          Books shared with another library survive — only this library's link to them is dropped.
 </p>
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">
 Type <span className="font-mono text-content dark:text-white">{library.name}</span> to confirm
 </label>
 <input
 type="text"
 value={typed}
 onChange={e => setTyped(e.target.value)}
 autoFocus
 className="w-full rounded-lg border border-line-strong dark:bg-gray-800 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
 />
 </div>

 {error && (
 <div className="mt-3 rounded-lg bg-danger-surface border border-danger-line px-3 py-2 text-sm text-red-700 dark:text-red-400">
 {error}
 </div>
 )}

 <div className="flex gap-3 pt-4">
 <button
 type="button"
 onClick={onClose}
 className="flex-1 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={handleDelete}
 disabled={!matches || isLoading}
 className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
 >
 {isLoading ? 'Deleting…' : 'Delete library'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Library card kebab menu ──────────────────────────────────────────────────
//
// Floats top-right of each card. Stops propagation so opening the menu
// (or any of its actions) doesn't also navigate into the library.

interface CardMenuProps {
  libraryId: string
  onEdit: () => void
  onDelete: () => void
}

function CardMenu({ libraryId, onEdit, onDelete }: CardMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen(false)
    fn()
  }

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="rounded-lg p-1 text-gray-400 hover:bg-surface-inset hover:text-content-secondary transition-colors"
        aria-label="Library actions"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded-lg border border-line bg-surface shadow-lg z-10 overflow-hidden">
          {/* The way into a library's own pages.
              The sidebar used to be the only route to these, which meant they
              appeared while you were reading a book to stay reachable at all.
              They belong to managing a library, so they hang off the library. */}
          {LIBRARY_SECTIONS.map(item => (
            <Link
              key={item.section}
              to={`/libraries/${libraryId}/${item.section}`}
              onClick={e => { e.stopPropagation(); setOpen(false) }}
              className="block px-3 py-2 text-sm text-content-secondary hover:bg-surface-muted"
            >
              {t(item.labelKey)}
            </Link>
          ))}
          <div className="border-t border-line" />
          <button
            type="button"
            onClick={stop(onEdit)}
            className="w-full text-left px-3 py-2 text-sm text-content-secondary hover:bg-surface-muted"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={stop(onDelete)}
            className="w-full text-left px-3 py-2 text-sm text-danger hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LibrariesPage() {
  const { callApi } = useAuth()
  const navigate = useNavigate()
  const [libraries, setLibraries] = useState<Library[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Library | null>(null)
  const [deleting, setDeleting] = useState<Library | null>(null)
  usePageTitle('Libraries')

  const load = useCallback(async () => {
    setError(null)
    try {
      const libs = await callApi<Library[]>('/api/v1/libraries')
      setLibraries(libs ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load libraries')
    }
  }, [callApi])

  useEffect(() => { load() }, [load])

  const handleCreated = (lib: Library) => {
    setShowCreate(false)
    navigate(`/libraries/${lib.id}`)
  }

  const handleEdited = (updated: Library) => {
    setEditing(null)
    setLibraries(prev => prev?.map(l => l.id === updated.id ? updated : l) ?? null)
  }

  const handleDeleted = (id: string) => {
    setDeleting(null)
    setLibraries(prev => prev?.filter(l => l.id !== id) ?? null)
  }

  return (
    <>
      <PageHeader
        title="Libraries"
        description={libraries ? `${libraries.length} total` : undefined}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            New library
          </button>
        }
      />
      <div className="p-8">

      {error && (
        <div className="mb-4 rounded-lg bg-danger-surface border border-danger-line px-4 py-3 text-sm text-danger-strong">
          {error}
        </div>
      )}

      {!libraries && !error && (
        <div className="text-sm text-content-subtle text-center py-16">Loading…</div>
      )}

      {libraries && libraries.length === 0 && (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface p-12 text-center">
          <p className="text-sm font-medium text-content-muted">No libraries yet</p>
          <p className="mt-1 text-xs text-content-subtle">Create one to get started.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            New library
          </button>
        </div>
      )}

      {libraries && libraries.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {libraries.map(lib => (
            <div
              key={lib.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/libraries/${lib.id}`)}
              onKeyDown={e => { if (e.key === 'Enter') navigate(`/libraries/${lib.id}`) }}
              className="text-left rounded-xl border border-line bg-surface p-5 hover:border-accent-line hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-content truncate flex-1">{lib.name}</p>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {lib.is_public && (
                    <span className="inline-flex items-center rounded-full bg-success-surface px-2 py-0.5 text-xs font-medium text-success-strong ring-1 ring-success-line">
                      Public
                    </span>
                  )}
                  <CardMenu
                    libraryId={lib.id}
                    onEdit={() => setEditing(lib)}
                    onDelete={() => setDeleting(lib)}
                  />
                </div>
              </div>
              {lib.description && (
                <p className="mt-1 text-sm text-content-muted line-clamp-2">{lib.description}</p>
              )}
              <p className="mt-3 text-xs text-content-subtle">/{lib.slug}</p>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <LibraryModal
          onClose={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}

      {editing && (
        <LibraryModal
          library={editing}
          onClose={() => setEditing(null)}
          onSaved={handleEdited}
        />
      )}

      {deleting && (
        <DeleteLibraryModal
          library={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
    </>
  )
}
