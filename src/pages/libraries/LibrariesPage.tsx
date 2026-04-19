import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import type { Library } from '../../types'
import PageHeader from '../../components/PageHeader'
import { usePageTitle } from '../../hooks/usePageTitle'

// ─── Create Library modal ─────────────────────────────────────────────────────

interface CreateLibraryModalProps {
  onClose: () => void
  onCreated: (lib: Library) => void
}

function CreateLibraryModal({ onClose, onCreated }: CreateLibraryModalProps) {
  const { callApi } = useAuth()
  const [form, setForm] = useState({ name: '', description: '', is_public: false })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const lib = await callApi<Library>('/api/v1/libraries', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      onCreated(lib)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create library')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create library</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="My Books"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Optional"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Public library</span>
          </label>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
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
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {!libraries && !error && (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-16">Loading…</div>
      )}

      {libraries && libraries.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-12 text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No libraries yet</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Create one to get started.</p>
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
            <button
              key={lib.id}
              onClick={() => navigate(`/libraries/${lib.id}`)}
              className="text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{lib.name}</p>
                {lib.is_public && (
                  <span className="flex-shrink-0 inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/50 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800">
                    Public
                  </span>
                )}
              </div>
              {lib.description && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{lib.description}</p>
              )}
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">/{lib.slug}</p>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateLibraryModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
    </>
  )
}
