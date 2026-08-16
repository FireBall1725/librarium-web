// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Books: one surface across every library the caller can read, with library as
// a filter rather than a folder you navigate into.
//
// Deliberately a new page rather than surgery on LibraryPage, which is 6,000+
// lines. The old per-library route keeps working until the redesign's later
// tranches replace it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import FacetRail from '../components/FacetRail'
import { usePageTitle } from '../hooks/usePageTitle'
import type { Book } from '../types'
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  clearAll,
  pageWindow,
  readState,
  selectionCount,
  toApiQuery,
  toggle,
  writeState,
  type BookFacets,
  type BrowseState,
  type FacetKey,
} from '../lib/bookBrowse'

interface PagedBooks {
  items: Book[]
  total: number
  page: number
  per_page: number
}

export default function BooksPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle('Books')

  const [params, setParams] = useSearchParams()
  const state = useMemo<BrowseState>(() => readState(params), [params])

  // Page size is a preference rather than part of the shared link, so it is
  // read from storage instead of the URL.
  const [perPage, setPerPage] = useState<number>(() => {
    const raw = Number(localStorage.getItem('librarium:books_per_page'))
    return PAGE_SIZES.includes(raw) ? raw : DEFAULT_PAGE_SIZE
  })

  const [books, setBooks] = useState<Book[]>([])
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<BookFacets | null>(null)
  const [error, setError] = useState<string | null>(null)

  // `loading` is derived, not a flag. It is true whenever what is on screen was
  // fetched for a different filter than the current one, so it cannot desync
  // from the data the way a separate boolean can, and nothing has to set state
  // synchronously inside the effect to raise it.
  const fetchKey = `${params.toString()}|${perPage}`
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loading = loadedKey !== fetchKey

  // Text input is local so typing stays responsive; the URL updates on a pause.
  //
  // When the URL query changes from outside (back button, a cleared filter) the
  // draft has to follow. Adjusting during render rather than in an effect is
  // React's documented pattern for this and avoids a second render pass.
  const [draftQuery, setDraftQuery] = useState(state.query)
  const [syncedQuery, setSyncedQuery] = useState(state.query)
  if (state.query !== syncedQuery) {
    setSyncedQuery(state.query)
    setDraftQuery(state.query)
  }

  const apply = useCallback((next: BrowseState) => {
    setParams(writeState(next), { replace: true })
  }, [setParams])

  useEffect(() => {
    const handle = setTimeout(() => {
      if (draftQuery !== state.query) apply({ ...state, query: draftQuery, page: 1 })
    }, 300)
    return () => clearTimeout(handle)
  }, [draftQuery, state, apply])

  // Results and counts are two requests but one logical fetch. A stale-response
  // guard keeps a slow earlier request from overwriting a newer one.
  const requestSeq = useRef(0)
  useEffect(() => {
    const seq = ++requestSeq.current

    Promise.all([
      callApi<PagedBooks>(`/api/v1/me/books?${toApiQuery(state, perPage)}`),
      callApi<{ data: BookFacets }>(`/api/v1/me/books/facets?${toApiQuery(state, perPage, true)}`),
    ])
      .then(([page, f]) => {
        if (seq !== requestSeq.current) return
        setBooks(page.items ?? [])
        setTotal(page.total ?? 0)
        setFacets(f.data)
        setError(null)
        setLoadedKey(fetchKey)
      })
      .catch((e: unknown) => {
        if (seq !== requestSeq.current) return
        setError(e instanceof Error ? e.message : String(e))
        // Mark it settled so the view stops claiming to load; the error is what
        // the reader sees instead of results.
        setLoadedKey(fetchKey)
      })
  }, [callApi, state, perPage, fetchKey])

  const pages = Math.max(1, Math.ceil(total / perPage))
  const activeFilters = selectionCount(state.selection)

  const changePageSize = (next: number) => {
    // Keep the reader next to what they were looking at instead of dumping them
    // on page 1: item 101 stays item 101, only its page number moves.
    const firstItem = (state.page - 1) * perPage
    localStorage.setItem('librarium:books_per_page', String(next))
    setPerPage(next)
    apply({ ...state, page: Math.floor(firstItem / next) + 1 })
  }

  const from = total === 0 ? 0 : (state.page - 1) * perPage + 1
  const to = Math.min(state.page * perPage, total)

  return (
    <>
      <PageHeader
        title={t('books.title', { defaultValue: 'Books' })}
        description={t('books.description', {
          defaultValue: 'Everything across the libraries you can read.',
        })}
      />

      <div className="px-8 py-6">
        <input
          type="search"
          value={draftQuery}
          onChange={e => setDraftQuery(e.target.value)}
          placeholder={t('books.search_placeholder', {
            defaultValue: 'Title, author, series, ISBN…',
          })}
          className="mb-6 w-full max-w-lg rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none"
        />

        <div className="grid gap-7 lg:grid-cols-[13rem_1fr]">
          <aside>
            <FacetRail
              facets={facets}
              selection={state.selection}
              loading={loading}
              onToggle={(key: FacetKey, value: string) => apply(toggle(state, key, value))}
              onClear={() => apply(clearAll(state))}
            />
          </aside>

          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-content-muted">
              <span className="tabular-nums">
                {loading && !books.length
                  ? t('common.loading', { defaultValue: 'Loading…' })
                  : t('books.count', {
                      total,
                      defaultValue: `${total} books`,
                    })}
              </span>
              {activeFilters > 0 && (
                <span className="rounded-full bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent">
                  {t('facets.active', { count: activeFilters, defaultValue: `${activeFilters} filters` })}
                </span>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger-strong">
                {error}
              </div>
            )}

            {!error && !loading && books.length === 0 && (
              <div className="py-16 text-center">
                <p className="font-display text-2xl text-content-secondary">
                  {t('books.empty_title', { defaultValue: 'Nothing matches' })}
                </p>
                <p className="font-read mt-1 text-content-muted">
                  {activeFilters > 0
                    ? t('books.empty_filtered', { defaultValue: 'Loosen a filter, or clear them all.' })
                    : t('books.empty_shelf', { defaultValue: 'No books in your libraries yet.' })}
                </p>
              </div>
            )}

            {books.length > 0 && (
              <ul className="divide-y divide-line-subtle">
                {books.map(book => (
                  <li key={book.id}>
                    <Link
                      to={book.library_id
                        ? `/libraries/${book.library_id}/books/${book.id}`
                        : `/books/${book.id}`}
                      className="flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-surface-inset"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-content">{book.title}</span>
                        <span className="block truncate text-xs text-content-muted">
                          {book.contributors?.[0]?.name ?? '—'}
                          {book.publish_year ? ` · ${book.publish_year}` : ''}
                          {book.media_type ? ` · ${book.media_type}` : ''}
                        </span>
                      </span>
                      {book.user_read_status && (
                        <span className="flex-none text-xs text-content-muted">
                          {t(`read_status.${book.user_read_status}`, {
                            defaultValue: book.user_read_status,
                          })}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {total > 0 && (
              <>
                <nav className="mt-7 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
                  <button
                    type="button"
                    disabled={state.page <= 1}
                    onClick={() => apply({ ...state, page: state.page - 1 })}
                    className="h-8 min-w-8 rounded-md border border-line-strong px-2 text-sm text-content-secondary disabled:opacity-30 enabled:hover:bg-surface-inset"
                  >
                    ‹
                  </button>
                  {pageWindow(state.page, pages).map((n, i) =>
                    n === null ? (
                      <span key={`gap-${i}`} className="px-1 text-content-muted">…</span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        aria-current={n === state.page ? 'page' : undefined}
                        onClick={() => apply({ ...state, page: n })}
                        className={`h-8 min-w-8 rounded-md border px-2 text-sm tabular-nums transition-colors ${
                          n === state.page
                            ? 'border-transparent bg-accent font-semibold text-white'
                            : 'border-line-strong text-content-secondary hover:bg-surface-inset'
                        }`}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    disabled={state.page >= pages}
                    onClick={() => apply({ ...state, page: state.page + 1 })}
                    className="h-8 min-w-8 rounded-md border border-line-strong px-2 text-sm text-content-secondary disabled:opacity-30 enabled:hover:bg-surface-inset"
                  >
                    ›
                  </button>
                </nav>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-content-muted">
                  <span className="tabular-nums">
                    {t('books.range', {
                      from, to, total,
                      defaultValue: `${from} to ${to} of ${total}`,
                    })}
                  </span>
                  <label className="flex items-center gap-1.5">
                    {t('books.per_page', { defaultValue: 'Show' })}
                    <select
                      value={perPage}
                      onChange={e => changePageSize(Number(e.target.value))}
                      className="rounded border border-line-strong bg-surface px-1.5 py-0.5 text-xs text-content"
                    >
                      {PAGE_SIZES.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
