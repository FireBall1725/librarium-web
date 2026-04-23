// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth, ApiError } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import BookCover from '../components/BookCover'
import type { Book, BookEdition, Library } from '../types'

// BookDetailPage renders a work-level book detail view keyed on book id alone
// (no library in the URL), suitable for suggestion-backed books that may not
// be in any of the user's libraries yet. Library-held books get the full
// library-scoped BookPage instead.
export default function BookDetailPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const { callApi } = useAuth()
  const { show: showToast } = useToast()

  const [book, setBook] = useState<Book | null>(null)
  const [editions, setEditions] = useState<BookEdition[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)

  const load = useCallback(async () => {
    if (!bookId) return
    setError(null)
    try {
      const b = await callApi<Book>(`/api/v1/books/${bookId}`)
      if (!b) {
        navigate('/suggestions', { replace: true })
        return
      }
      setBook(b)
      const eds = await callApi<BookEdition[]>(`/api/v1/books/${bookId}/editions`)
      setEditions(eds ?? [])
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        navigate('/suggestions', { replace: true })
        return
      }
      setError(err instanceof ApiError ? err.message : 'Failed to load book')
    }
  }, [callApi, bookId, navigate])

  useEffect(() => { load() }, [load])

  // If the book is now in at least one of the user's libraries, redirect to
  // the library-scoped BookPage — that surface has the full ownership UI
  // (shelves, loans, read-log, etc). This page stays for floating books
  // only.
  useEffect(() => {
    if (book && book.libraries && book.libraries.length > 0 && book.library_id) {
      navigate(`/libraries/${book.library_id}/books/${book.id}`, { replace: true })
    }
  }, [book, navigate])

  const primaryISBN = useMemo(() => {
    for (const e of editions) {
      if (e.isbn_13) return e.isbn_13
      if (e.isbn_10) return e.isbn_10
    }
    return ''
  }, [editions])

  const countryCode = useMemo(() => {
    const lang = (typeof navigator !== 'undefined' && navigator.language) || ''
    const region = lang.split('-')[1]?.toLowerCase()
    return region && region.length === 2 ? region : 'us'
  }, [])

  const currencyFor = (cc: string): string => {
    switch (cc) {
      case 'ca': return 'CAD'
      case 'us': return 'USD'
      case 'gb': return 'GBP'
      case 'au': return 'AUD'
      case 'nz': return 'NZD'
      default:   return ''
    }
  }

  const bookFinderURL = useMemo(() => {
    if (!primaryISBN) return null
    const params = new URLSearchParams({ isbn: primaryISBN, destination: countryCode })
    const ccy = currencyFor(countryCode)
    if (ccy) params.set('currency', ccy)
    return `https://www.bookfinder.com/search/?${params.toString()}`
  }, [primaryISBN, countryCode])

  // Re-enrich is deferred to follow-up work: the enrichment pipeline still
  // scopes batches to a library_id (non-null), which doesn't fit a floating
  // book's "no library yet" state. Users can re-enrich after adding the
  // book to a library.

  const addToLibrary = async (libraryID: string) => {
    if (!bookId) return
    setBusy(true)
    setLibraryPickerOpen(false)
    try {
      await callApi(`/api/v1/libraries/${libraryID}/books/${bookId}`, { method: 'POST' })
      showToast('Added to library', { variant: 'success' })
      navigate(`/libraries/${libraryID}/books/${bookId}`)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to add to library', { variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      </div>
    )
  }
  if (!book) {
    return <div className="p-8 text-sm text-gray-400 dark:text-gray-500">Loading…</div>
  }

  const metaItems = [
    book.publisher    ? { label: 'Publisher',  value: book.publisher } : null,
    book.publish_year ? { label: 'Published',  value: String(book.publish_year) } : null,
    book.language     ? { label: 'Language',   value: book.language.toUpperCase() } : null,
    primaryISBN       ? { label: 'ISBN',       value: primaryISBN } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex gap-8 items-start">
        {/* ── Left: cover ── */}
        <div className="w-48 flex-shrink-0 space-y-4">
          <BookCover title={book.title} coverUrl={book.cover_url} className="w-full" />
          <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
            Not in any library yet
          </div>
        </div>

        {/* ── Right: details + actions ── */}
        <div className="flex-1 min-w-0 space-y-5">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{book.title}</h1>
            {book.subtitle && (
              <p className="mt-1 text-base text-gray-600 dark:text-gray-400">{book.subtitle}</p>
            )}
            {book.contributors && book.contributors.length > 0 && (
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                {book.contributors.filter(c => c.role === 'author').map(c => c.name).join(', ')}
              </p>
            )}
          </div>

          {book.description && (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {book.description}
            </p>
          )}

          {metaItems.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {metaItems.map(m => (
                <div key={m.label} className="flex gap-2">
                  <dt className="text-gray-500 dark:text-gray-400">{m.label}:</dt>
                  <dd className="text-gray-800 dark:text-gray-200">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* ── Actions ── */}
          <div className="flex flex-wrap gap-2 pt-2">
            <AddToLibraryButton
              disabled={busy}
              open={libraryPickerOpen}
              onOpenChange={setLibraryPickerOpen}
              onPick={addToLibrary}
            />
            {bookFinderURL && (
              <a
                href={bookFinderURL}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                Find where to buy →
              </a>
            )}
          </div>

          <div className="pt-4 text-xs text-gray-500 dark:text-gray-400">
            <Link to="/suggestions" className="hover:text-gray-700 dark:hover:text-gray-200">
              ← Back to suggestions
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// AddToLibraryButton is a disclosure widget that shows a picker of the user's
// libraries. Keeps the fetch behind the click so we don't hit /me/libraries
// on every BookDetailPage render.
function AddToLibraryButton({ disabled, open, onOpenChange, onPick }: {
  disabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (libraryID: string) => void
}) {
  const { callApi } = useAuth()
  const [libs, setLibs] = useState<Library[] | null>(null)

  const toggle = async () => {
    if (!open && libs === null) {
      try {
        const list = await callApi<Library[]>(`/api/v1/libraries`)
        setLibs(list ?? [])
      } catch {
        setLibs([])
      }
    }
    onOpenChange(!open)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
      >
        Add to library ▾
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          {libs === null ? (
            <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>
          ) : libs.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No libraries yet</div>
          ) : (
            libs.map(lib => (
              <button
                key={lib.id}
                type="button"
                onClick={() => onPick(lib.id)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                {lib.name}
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="block w-full text-left px-3 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
