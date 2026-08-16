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
import { PromptDialog } from '../components/Dialog'
import AddBookModal from '../components/AddBookModal'
import FacetRail from '../components/FacetRail'
import BookCover, { BookCoverThumb } from '../components/BookCover'
import { usePageTitle } from '../hooks/usePageTitle'
import type { TFunction } from 'i18next'
import type { Book, Library, MediaType } from '../types'
import {
  DEFAULT_PAGE_SIZE,
  FACET_ORDER,
  PAGE_SIZES,
  OWNERSHIP_ANY,
  clearAll,
  isDefaultOwnership,
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
import {
  announceViewsChanged,
  deleteView,
  isDirty as viewIsDirty,
  loadViews,
  matchView,
  DEFAULT_VIEW_ID,
  findDefaultView,
  newViewId,
  saveView,
  type SavedView,
  type ViewLayout,
} from '../lib/views'

/**
 * Colour a whole series alike, so twenty volumes read as one run on the shelf.
 * Falls back to the title for a standalone book.
 */
const coverSeed = (book: Book) => book.series?.[0]?.series_name || book.title

/**
 * Read state as a chip, because it is a value the reader scans for rather than
 * prose they read. Reading shows the percentage instead of the word: at that
 * point "how far in" is the useful part, and the colour already says reading.
 */
function StatusChip({ book, t }: { book: Book; t: TFunction }) {
  // The API sends '' for a book the caller has never interacted with, while the
  // facet rail counts those same books as unread. Treating the two as one keeps
  // the chip agreeing with the count: 140 unread in the rail should not sit
  // beside a list where most rows are blank.
  const status = book.user_read_status || 'unread'

  const pct = Math.round(book.user_progress_pct ?? 0)
  // Tone modifiers come from the reference chip: good, on, warn, or the plain
  // outline for unread.
  const tone =
    status === 'read' ? 'good'
    : status === 'reading' ? 'on'
    : status === 'did_not_finish' ? 'warn'
    : ''

  const label = status === 'reading' && pct > 0
    ? `${pct}%`
    : t(`read_status.${status}`, { defaultValue: status })

  return <span className={`lb-chip flex-none ${tone}`}>{label}</span>
}

/**
 * Fixed-width so the titles beside it stay on one left edge down the list; a
 * rating that sized itself would make every row start somewhere different. The
 * width and the narrow-screen hiding both come from `.lb-rowitem .stars`.
 */
function Stars({ rating }: { rating: number }) {
  if (!rating) return <span className="stars" aria-hidden="true" />
  return (
    <span className="stars text-warning" aria-label={`${rating} out of 5`}>
      {'★'.repeat(rating)}
    </span>
  )
}

/**
 * What a filter chip says.
 *
 * Facet values arrive as raw data — a library id, a read-status enum, a bare
 * rating — so the label comes from the counts block where the server already
 * paired each value with its display name. Falling back to the value itself
 * means a chip is never blank, only occasionally ugly.
 */
function chipLabel(key: FacetKey, value: string, facets: BookFacets | null, t: TFunction): string {
  if (key === 'ownership') return t(`ownership.${value}`, { defaultValue: value })
  if (key === 'read_status') return t(`read_status.${value}`, { defaultValue: value })
  if (key === 'rating') return t('facets.stars', { count: Number(value), defaultValue: `${value} stars` })
  return facets?.[key]?.find(v => v.value === value)?.label ?? value
}

/** Book detail still lives under a library, so link via the first one holding it. */
const bookHref = (book: Book) =>
  book.library_id ? `/libraries/${book.library_id}/books/${book.id}` : `/books/${book.id}`

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

  // Views are a saved filter plus a layout. The layout lives here rather than in
  // the URL for the same reason page size does: it is how you like to read a
  // list, not part of what the link selects.
  //
  // The override is keyed on the filter it was made against. A view is reachable
  // from the sidebar, which only navigates, so the layout has to follow from the
  // filter rather than from having gone through openView; without the key, the
  // toggle you flipped on one view would follow you onto the next one.
  const [views, setViews] = useState<SavedView[]>(() => loadViews())
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [adding, setAdding] = useState(false)

  // Fetched only when the modal opens. Books is a read surface; making every
  // visit pay for the media types and libraries an add would need is a cost
  // most visits never use.
  const [addData, setAddData] = useState<{ libraries: Library[]; mediaTypes: MediaType[] } | null>(null)
  useEffect(() => {
    if (!adding || addData) return
    let cancelled = false
    Promise.all([
      callApi<Library[]>('/api/v1/libraries'),
      callApi<MediaType[]>('/api/v1/media-types'),
    ])
      .then(([libraries, mediaTypes]) => {
        if (!cancelled) setAddData({ libraries: libraries ?? [], mediaTypes: mediaTypes ?? [] })
      })
      .catch(() => { if (!cancelled) setAddData({ libraries: [], mediaTypes: [] }) })
    return () => { cancelled = true }
  }, [adding, addData, callApi])
  const [layoutOverride, setLayoutOverride] = useState<{ viewId: string | null; layout: ViewLayout } | null>(null)

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

  // Every book the caller could see under the non-ownership filters. The
  // ownership counts are computed with the ownership selection excluded, so
  // they already span the whole scope and summing them is the total.
  const scopeTotal = facets
    ? facets.ownership.reduce((n, v) => n + v.count, 0)
    : null

  // Chips for what is actually applied. Ownership at its default is not a
  // choice the reader made, so it gets no chip to remove.
  const activeChips = FACET_ORDER.flatMap(key =>
    (key === 'ownership' &&
      (isDefaultOwnership(state.selection[key]) || state.selection[key].includes(OWNERSHIP_ANY))
      ? []
      : state.selection[key]
    ).map(value => ({
      key,
      value,
      label: chipLabel(key, value, facets, t),
    }))
  )
  const activeFilters = selectionCount(state.selection)

  // A view is "open" either because it was clicked, or because the filter on
  // screen describes it. The second case is not a nicety: the sidebar links only
  // navigate, and a bookmarked URL or the back button arrive with no click at
  // all, so matching on the filter is the only thing that covers every route in.
  const paramsNow = params.toString()
  // Falls back to the Default view rather than to nothing. Books is always
  // showing *something*, and that something is the Default unless a real view
  // was opened or the filter happens to describe one. Without the fallback,
  // editing the Default drops the bar the moment the filter changes — which is
  // precisely when "Save changes" needs to be on screen, since saving is how
  // you set what Books opens on.
  const activeView =
    views.find(v => v.id === activeViewId) ??
    matchView(views, paramsNow) ??
    findDefaultView(views) ??
    null

  // Layout belongs to the view, so it follows from whichever view is open
  // rather than being a separate toggle the reader has to reset on every
  // switch. An override is remembered against the view it was made on, which
  // means flipping to rows inside one view survives editing that view's filter
  // but does not leak onto the next one.
  const layout: ViewLayout =
    layoutOverride && layoutOverride.viewId === (activeView?.id ?? null)
      ? layoutOverride.layout
      : activeView?.layout ?? 'rows'
  const dirty = activeView ? viewIsDirty(activeView, paramsNow, layout) : false
  const isDefaultView = activeView?.id === DEFAULT_VIEW_ID

  const chooseLayout = (next: ViewLayout) =>
    setLayoutOverride({ viewId: activeView?.id ?? null, layout: next })

  const openView = (v: SavedView) => {
    setActiveViewId(v.id)
    setLayoutOverride(null)
    setParams(new URLSearchParams(v.params), { replace: true })
  }

  const saveCurrentAs = (name: string) => {
    setNaming(false)
    const v: SavedView = { id: newViewId(), name, params: paramsNow, layout }
    setViews(saveView(v))
    setActiveViewId(v.id)
    announceViewsChanged()
  }

  const commitView = () => {
    if (!activeView) return
    setViews(saveView({ ...activeView, params: paramsNow, layout }))
    announceViewsChanged()
    // The layout is part of the view now, so the override has nothing left to
    // override; leaving it would keep the bar reading "modified" after a save.
    setLayoutOverride(null)
  }

  const removeView = (id: string) => {
    setViews(deleteView(id))
    announceViewsChanged()
    if (activeViewId === id) setActiveViewId(null)
    setLayoutOverride(null)
  }

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
            {/* View bar. Present only when a view is open, so an unfiltered
                browse is not cluttered by controls for a thing that does not
                exist yet. */}
            {activeView && (
              <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                dirty
                  ? 'border-warning-line bg-warning-surface'
                  : 'border-accent-line bg-accent-surface'
              }`}>
                <span className="font-medium text-content">{activeView.name}</span>
                <span className={dirty ? 'text-warning-strong' : 'text-content-muted'}>
                  {dirty
                    ? t('views.modified', { defaultValue: 'modified' })
                    : isDefaultView
                      ? t('views.default_hint', { defaultValue: 'what Books opens on' })
                      : t('views.saved', { defaultValue: 'saved view' })}
                </span>
                <span className="flex-1" />
                {dirty ? (
                  <>
                    <button type="button" onClick={commitView}
                      className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-110">
                      {t('views.save_changes', { defaultValue: 'Save changes' })}
                    </button>
                    <button type="button" onClick={() => openView(activeView)}
                      className="rounded-md border border-line-strong px-2.5 py-1 text-xs text-content-secondary hover:bg-surface-inset">
                      {t('views.revert', { defaultValue: 'Revert' })}
                    </button>
                    <button type="button"
                      onClick={() => setNaming(true)}
                      className="rounded-md border border-line-strong px-2.5 py-1 text-xs text-content-secondary hover:bg-surface-inset">
                      {t('views.save_as_new', { defaultValue: 'Save as new' })}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setActiveViewId(null); setLayoutOverride(null); setParams(new URLSearchParams(), { replace: true }) }}
                      className="rounded-md border border-line-strong px-2.5 py-1 text-xs text-content-secondary hover:bg-surface-inset">
                      {t('views.leave', { defaultValue: 'Leave view' })}
                    </button>
                    {!activeView.permanent && (
                      <button type="button" onClick={() => removeView(activeView.id)}
                        className="rounded-md border border-line-strong px-2.5 py-1 text-xs text-danger hover:bg-danger-surface">
                        {t('views.delete', { defaultValue: 'Delete view' })}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-content-muted">
              <span className="tabular-nums">
                {loading && !books.length
                  ? t('common.loading', { defaultValue: 'Loading…' })
                  : scopeTotal !== null && scopeTotal !== total
                    // "of N records" is what makes a filtered shelf legible:
                    // 41 books alone reads as a small library rather than as a
                    // slice of a larger one.
                    ? t('books.of_records', {
                        shown: total, total: scopeTotal,
                        defaultValue: `${total} of ${scopeTotal} records`,
                      })
                    : t('books.count', {
                        total,
                        defaultValue: `${total} books`,
                      })}
              </span>

              {/* Every applied filter as a chip that removes itself. The rail
                  can do this too, but it is a long way from the results and
                  the reader has to remember which of seven groups they used. */}
              {activeChips.map(chip => (
                <button
                  key={`${chip.key}:${chip.value}`}
                  type="button"
                  onClick={() => apply(toggle(state, chip.key, chip.value))}
                  className="lb-chip on"
                  title={t('facets.remove', { defaultValue: 'Remove filter' })}
                >
                  {chip.label} ×
                </button>
              ))}

              <span className="flex-1" />

              {/* Offered only when there is something worth naming. */}
              {!activeView && (activeFilters > 0 || state.query) && (
                <button type="button"
                  onClick={() => setNaming(true)}
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-110">
                  {t('views.save', { defaultValue: 'Save as a view' })}
                </button>
              )}

              <button type="button" onClick={() => setAdding(true)}
                className="lb-btn sm">
                {t('books.add', { defaultValue: 'Add book' })}
              </button>

              <div className="flex overflow-hidden rounded-md border border-line-strong">
                {(['rows', 'grid'] as ViewLayout[]).map(opt => (
                  <button key={opt} type="button" onClick={() => chooseLayout(opt)}
                    aria-pressed={layout === opt}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                      layout === opt ? 'bg-accent text-white' : 'text-content-secondary hover:bg-surface-inset'
                    }`}>
                    {t(`views.layout_${opt}`, { defaultValue: opt === 'rows' ? 'Rows' : 'Grid' })}
                  </button>
                ))}
              </div>
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

            {books.length > 0 && layout === 'rows' && (
              <ul>
                {books.map(book => (
                  <li key={book.id}>
                    {/* .lb-rowitem carries the row's gap, padding and separator
                        from the reference stylesheet, so this markup describes
                        what is in the row and nothing about how it looks. */}
                    <Link to={bookHref(book)} className="lb-rowitem">
                      <BookCoverThumb
                        title={book.title}
                        coverUrl={book.cover_url}
                        readStatus={book.user_read_status}
                        seed={coverSeed(book)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="lb-display block truncate text-[16.5px] leading-tight text-content">
                          {book.title}
                        </span>
                        <span className="block truncate text-[11px] text-content-tertiary">
                          {[
                            book.contributors?.[0]?.name,
                            book.publish_year || null,
                            book.media_type,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <StatusChip book={book} t={t} />
                      <Stars rating={book.user_rating ?? 0} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {books.length > 0 && layout === 'grid' && (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] items-start gap-[18px]">
                {books.map(book => (
                  <li key={book.id}>
                    <Link to={bookHref(book)} className="group block">
                      <BookCover
                        title={book.title}
                        coverUrl={book.cover_url}
                        readStatus={book.user_read_status}
                        seed={coverSeed(book)}
                        className="w-full"
                      />
                      <span className="mt-2 block truncate text-[12.5px] font-semibold text-content group-hover:text-accent">
                        {book.title}
                      </span>
                      <span className="block truncate text-[11px] text-content-muted">
                        {book.contributors?.[0]?.name ?? '—'}
                      </span>
                      {/* Progress only where it means something. A bar under
                          every cover reads as a loading state for the page. */}
                      {book.user_read_status === 'reading' && (book.user_progress_pct ?? 0) > 0 && (
                        <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-surface-strong">
                          <span className="block h-full bg-accent"
                            style={{ width: `${Math.min(100, book.user_progress_pct ?? 0)}%` }} />
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

      {adding && addData && (
        <AddBookModal
          libraries={addData.libraries}
          mediaTypes={addData.mediaTypes}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            // Re-run the current query rather than pushing the new book into
            // the list by hand: it may not match the filter on screen, and a
            // book that appears where it does not belong is worse than one
            // that needs a moment to show up.
            setLoadedKey(null)
            window.dispatchEvent(new Event('librarium:collection-changed'))
          }}
        />
      )}

      <PromptDialog
        open={naming}
        title={t('views.save_as_view', { defaultValue: 'Save as a view' })}
        description={t('views.new_description', {
          defaultValue: 'Saves the filter you have on Books right now. You can change it later.',
        })}
        label={t('views.name_label', { defaultValue: 'Name' })}
        placeholder={t('views.name_placeholder', { defaultValue: 'Signed first editions' })}
        onCancel={() => setNaming(false)}
        onSubmit={saveCurrentAs}
      />
    </>
  )
}
