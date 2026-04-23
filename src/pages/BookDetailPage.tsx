// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth, ApiError } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import BookCover from '../components/BookCover'
import type { Book, BookEdition, Library, SuggestionView } from '../types'

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
  const [suggestions, setSuggestions] = useState<SuggestionView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)

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
      // Look up any suggestions the user has for this book. Used to surface
      // "Remove suggestion" and "Block" actions — the detail page is also
      // reachable directly (no suggestion context), so these actions only
      // show when a matching suggestion exists.
      const ss = await callApi<SuggestionView[]>(`/api/v1/me/suggestions?book_id=${bookId}`)
      setSuggestions(ss ?? [])
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

  const removeSuggestion = async () => {
    if (suggestions.length === 0) return
    setBusy(true)
    try {
      // Remove every matching suggestion row — typically one, but a user
      // who got both a buy and a read_next for the same book gets a clean
      // slate.
      for (const s of suggestions) {
        await callApi(`/api/v1/me/suggestions/${s.id}`, { method: 'DELETE' })
      }
      showToast('Suggestion removed', { variant: 'success' })
      navigate('/suggestions')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to remove suggestion', { variant: 'error' })
      setBusy(false)
    }
  }

  const refreshMetadata = async () => {
    if (!bookId) return
    setBusy(true)
    try {
      await callApi(`/api/v1/books/${bookId}/enrich`, { method: 'POST' })
      showToast('Metadata refresh queued', { variant: 'success' })
      // Give the worker a moment to start, then reload so new fields appear.
      setTimeout(load, 2000)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to queue refresh', { variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const blockSuggestion = async (scope: 'book' | 'author') => {
    if (suggestions.length === 0) return
    setBusy(true)
    setBlockOpen(false)
    try {
      // The block endpoint is keyed by suggestion id (it pulls title/author/
      // isbn out of the suggestion for the blocklist row). Blocking any one
      // of the user's matching suggestions blocks the work; the server-side
      // block also clears out related suggestions.
      await callApi(`/api/v1/me/suggestions/${suggestions[0].id}/block`, {
        method: 'POST',
        body: JSON.stringify({ scope }),
      })
      showToast(
        scope === 'book'
          ? 'Blocked this book'
          : `Blocked anything by ${suggestions[0].author ?? 'this author'}`,
        { variant: 'success' },
      )
      navigate('/suggestions')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to block', { variant: 'error' })
      setBusy(false)
    }
  }

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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
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
            {/* Icon row — matches BookPage's edition header style. Delete
                only surfaces when the user actually has a suggestion for
                this book; it deletes the suggestion row(s). */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={refreshMetadata}
                disabled={busy}
                title="Refresh metadata"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              {suggestions.length > 0 && (
                <button
                  type="button"
                  onClick={removeSuggestion}
                  disabled={busy}
                  title="Delete suggestion"
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
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
            {/* Block lives as a dropdown — rarer action, benefits from a
                labelled control over an icon. The trash icon above covers
                the more common "Remove suggestion" case. */}
            {suggestions.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBlockOpen(o => !o)}
                  disabled={busy}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  Block ▾
                </button>
                {blockOpen && (
                  <div className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
                    <button
                      type="button"
                      onClick={() => blockSuggestion('book')}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    >
                      Block this book
                    </button>
                    {suggestions[0].author && (
                      <button
                        type="button"
                        onClick={() => blockSuggestion('author')}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                      >
                        Block by {suggestions[0].author}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setBlockOpen(false)}
                      className="block w-full text-left px-3 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
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
