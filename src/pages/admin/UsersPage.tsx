import { useCallback, useEffect, useState } from 'react'
import { useAuth, ApiError } from '../../auth/AuthContext'
import type { AdminUser, PagedUsers } from '../../types'
import PageHeader from '../../components/PageHeader'
import { usePageTitle } from '../../hooks/usePageTitle'

// ─── Icons ────────────────────────────────────────────────────────────────────

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

const NoSymbolIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <circle cx="10" cy="10" r="7" />
    <line x1="5" y1="5" x2="15" y2="15" />
  </svg>
)

const CheckCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
)

// ─── Add User modal ───────────────────────────────────────────────────────────

interface AddUserModalProps {
  onClose: () => void
  onCreated: () => void
}

function AddUserModal({ onClose, onCreated }: AddUserModalProps) {
  const { callApi } = useAuth()
  const [form, setForm] = useState({ username: '', email: '', display_name: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      await callApi('/api/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user')
    } finally {
      setIsLoading(false)
    }
  }

  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        required={key !== 'display_name'}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add user</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {field('username', 'Username')}
          {field('email', 'Email', 'email')}
          {field('display_name', 'Display name')}
          {field('password', 'Password', 'password')}
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
              {isLoading ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit User modal ──────────────────────────────────────────────────────────

interface EditUserModalProps {
  user: AdminUser
  onClose: () => void
  onSaved: () => void
}

function EditUserModal({ user, onClose, onSaved }: EditUserModalProps) {
  const { callApi } = useAuth()
  const [form, setForm] = useState({
    display_name: user.display_name,
    email: user.email,
    is_instance_admin: user.is_instance_admin,
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      await callApi(`/api/v1/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update user')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Edit user</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{user.username}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.is_instance_admin}
              onChange={e => setForm(f => ({ ...f, is_instance_admin: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Instance admin
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
              {isLoading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { callApi } = useAuth()
  const [data, setData] = useState<PagedUsers | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  usePageTitle('Users')

  const perPage = 20

  const load = useCallback(async () => {
    setError(null)
    try {
      const result = await callApi<PagedUsers>(
        `/api/v1/admin/users?page=${page}&per_page=${perPage}`
      )
      setData(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users')
    }
  }, [callApi, page])

  useEffect(() => { load() }, [load])

  const toggleActive = async (user: AdminUser) => {
    setActionError(null)
    try {
      await callApi(`/api/v1/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !user.is_active }),
      })
      await load()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed')
    }
  }

  const deleteUser = async (user: AdminUser) => {
    if (!confirm(`Delete ${user.username}? This cannot be undone.`)) return
    setActionError(null)
    try {
      await callApi(`/api/v1/admin/users/${user.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Delete failed')
    }
  }

  const totalPages = data ? Math.ceil(data.total / perPage) : 1

  return (
    <>
      <PageHeader
        title="Users"
        description={data ? `${data.total} total` : undefined}
        breadcrumbs={[{ label: 'Admin' }, { label: 'Users' }]}
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Add user
          </button>
        }
      />
      <div className="p-8">

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {actionError}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {['Username', 'Display name', 'Email', 'Role', 'Status', 'Last login', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {!data && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {data?.items.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{u.username}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.display_name}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.email}</td>
                <td className="px-4 py-3">
                  {u.is_instance_admin ? (
                    <span className="inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-800">
                      Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                      User
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.is_active ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/50 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                      Disabled
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {u.last_login_at
                    ? new Date(u.last_login_at).toLocaleDateString()
                    : <span className="text-gray-300 dark:text-gray-600">Never</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-0.5 justify-end">
                    <button
                      onClick={() => setEditingUser(u)}
                      className="p-1.5 rounded text-gray-400 dark:text-gray-500 hover:!text-blue-500 dark:hover:!text-blue-400 hover:!bg-blue-50 dark:hover:!bg-blue-900/20 transition-colors"
                      title="Edit user"
                      aria-label="Edit user"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => toggleActive(u)}
                      className={`p-1.5 rounded text-gray-400 dark:text-gray-500 transition-colors ${
                        u.is_active
                          ? 'hover:!text-amber-500 dark:hover:!text-amber-400 hover:!bg-amber-50 dark:hover:!bg-amber-900/20'
                          : 'hover:!text-green-600 dark:hover:!text-green-400 hover:!bg-green-50 dark:hover:!bg-green-900/20'
                      }`}
                      title={u.is_active ? 'Disable user' : 'Enable user'}
                      aria-label={u.is_active ? 'Disable user' : 'Enable user'}
                    >
                      {u.is_active ? <NoSymbolIcon /> : <CheckCircleIcon />}
                    </button>
                    <button
                      onClick={() => deleteUser(u)}
                      className="p-1.5 rounded text-gray-400 dark:text-gray-500 hover:!text-red-500 dark:hover:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-900/20 transition-colors"
                      title="Delete user"
                      aria-label="Delete user"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); load() }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); load() }}
        />
      )}
    </div>
    </>
  )
}
