import { useEffect, useState } from 'react'
import { useAuth, ApiError } from '../auth/AuthContext'
import type { Book, Loan, PagedBooks } from '../types'

interface LoanFormModalProps {
  libraryId: string
  loan?: Loan | null
  // prefillBook pre-selects a book and hides the search input — used when
  // opening the modal from a book page where the book is already known.
  // The user can still clear it via the × to switch to another book.
  prefillBook?: { id: string; title: string }
  onClose: () => void
  onSaved: () => void
}

export default function LoanFormModal({ libraryId, loan, prefillBook, onClose, onSaved }: LoanFormModalProps) {
  const { callApi } = useAuth()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    loaned_to: loan?.loaned_to ?? '',
    loaned_at: loan?.loaned_at ?? today,
    due_date: loan?.due_date ?? '',
    notes: loan?.notes ?? '',
  })
  const [bookQuery, setBookQuery] = useState(loan?.book_title ?? '')
  const [bookResults, setBookResults] = useState<Book[]>([])
  const [selectedBook, setSelectedBook] = useState<{ id: string; title: string } | null>(
    loan ? { id: loan.book_id, title: loan.book_title } : (prefillBook ?? null)
  )
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Debounced typeahead — re-fetches as the user types, like the search
  // inputs on BooksTab / SeriesTab. Skips fetching when a book is already
  // selected so the dropdown doesn't reappear after pick.
  useEffect(() => {
    if (selectedBook) return
    if (!bookQuery.trim()) { setBookResults([]); return }
    setIsSearching(true)
    const t = setTimeout(() => {
      callApi<PagedBooks>(`/api/v1/libraries/${libraryId}/books?q=${encodeURIComponent(bookQuery)}&per_page=20`)
        .then(data => setBookResults(data?.items ?? []))
        .catch(() => {})
        .finally(() => setIsSearching(false))
    }, 200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookQuery, selectedBook])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBook && !loan) { setError('Select a book'); return }
    setError(null); setIsLoading(true)
    try {
      if (loan) {
        await callApi(`/api/v1/libraries/${libraryId}/loans/${loan.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            loaned_to: form.loaned_to,
            due_date: form.due_date || null,
            returned_at: loan.returned_at || null,
            notes: form.notes,
          }),
        })
      } else {
        await callApi(`/api/v1/libraries/${libraryId}/loans`, {
          method: 'POST',
          body: JSON.stringify({
            book_id: selectedBook!.id,
            loaned_to: form.loaned_to,
            loaned_at: form.loaned_at,
            due_date: form.due_date || null,
            notes: form.notes,
          }),
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save loan')
    } finally { setIsLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{loan ? 'Edit loan' : 'New loan'}</h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">

          {!loan && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Book *</label>
              {selectedBook ? (
                <div className="flex items-center gap-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
                  <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{selectedBook.title}</span>
                  <button type="button" onClick={() => { setSelectedBook(null); setBookQuery('') }}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none">×</button>
                </div>
              ) : (
                <div className="relative">
                  <input type="text" value={bookQuery} onChange={e => setBookQuery(e.target.value)}
                    placeholder="Search books…"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              )}
              {isSearching && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Searching…</p>}
              {!isSearching && bookQuery.trim() && bookResults.length === 0 && !selectedBook && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No matches.</p>
              )}
              {!isSearching && bookResults.length > 0 && !selectedBook && (
                <ul className="mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                  {bookResults.map(b => (
                    <li key={b.id}>
                      <button type="button"
                        onClick={() => { setSelectedBook({ id: b.id, title: b.title }); setBookResults([]) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                        {b.title}
                        {b.contributors.length > 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">— {b.contributors.map(c => c.name).join(', ')}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loaned to *</label>
            <input type="text" autoFocus={!!loan} value={form.loaned_to}
              onChange={e => setForm(f => ({ ...f, loaned_to: e.target.value }))}
              placeholder="Name or contact"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!loan && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loaned date</label>
                <input type="date" value={form.loaned_at}
                  onChange={e => setForm(f => ({ ...f, loaned_at: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}
            <div className={loan ? 'col-span-2' : ''}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due date</label>
              <input type="date" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <input type="text" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          {error && <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" disabled={isLoading || !form.loaned_to}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isLoading ? 'Saving…' : loan ? 'Save changes' : 'Create loan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
