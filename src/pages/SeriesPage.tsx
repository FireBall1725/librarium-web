// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Series: every run across the libraries the caller can read.
//
// This replaced a read-only index that could only list and a per-library
// section that could do everything but only inside one folder. Library is a
// facet here, the same decision Books took: the rows carry their library and
// the filter narrows to it, rather than the reader having to pick a folder
// before they are allowed to look.
//
// Rows by default, not tiles. A series is defined by how far through it you
// are, and a tile can only show a cover and a name. A row has space for the
// whole volume strip, which is the thing worth looking at: the gaps in it are
// the volumes you are missing. Tiles are offered because a wall of covers is
// the better way to recognise a shelf you already know.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import AlphabetBar from '../components/AlphabetBar'
import BookCover from '../components/BookCover'
import SeriesFormModal from '../components/SeriesFormModal'
import SuggestSeriesModal from '../components/SuggestSeriesModal'
import SeriesFacetRail, {
  SERIES_FACET_ORDER, SERIES_PARAM,
  type SeriesFacetKey, type SeriesFacets,
} from '../components/SeriesFacetRail'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  DEFAULT_LIST_KEY, LISTS_CHANGED, announceListsChanged, createSmartList,
  defaultListFor, fetchLists, isDirty as viewIsDirty, listQuery, matchList,
  updateList, type ListLayout, type SavedList,
} from '../lib/lists'
import type { Library, Series } from '../types'

/**
 * The letter a name files under, matching what the API does for authors:
 * accents fold to their base, anything else goes to '#'.
 *
 * Client-side here because a series has no sort_name column to file it by, so
 * there is nothing for the server to have decided.
 */
function indexLetter(name: string): string {
  // NFD splits an accented letter into base plus combining mark; dropping the
  // marks leaves the base, so Émile files under E rather than '#'.
  const first = name.trim().normalize('NFD').replace(/[̀-ͯ]/g, '')[0]
  if (!first) return '#'
  const upper = first.toUpperCase()
  return upper >= 'A' && upper <= 'Z' ? upper : '#'
}

const SORTS = ['name', 'volumes', 'missing', 'read', 'recent'] as const

/** Which parameters are filters, so a chip row and a count can tell them apart. */
const FILTER_PARAMS = SERIES_FACET_ORDER.map(k => SERIES_PARAM[k])

export default function SeriesPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('nav.series', { defaultValue: 'Series' }))

  const [params, setParams] = useSearchParams()
  const letter = params.get('letter')

  // The URL is the state. A filtered view is a link someone can send, and the
  // back button walks the filters rather than leaving the page, which is what
  // the rest of the redesign already does on Books and Authors.
  const get = useCallback((k: string) => params.get(k) ?? '', [params])
  const query = get('q')
  const sort = get('sort') || 'name'
  const dir = get('dir') || 'asc'

  /** Every filter dimension, each a list of ticked values. */
  const selection = useMemo(() => {
    const out = {} as Record<SeriesFacetKey, string[]>
    for (const key of SERIES_FACET_ORDER) {
      const raw = params.get(SERIES_PARAM[key]) ?? ''
      out[key] = raw ? raw.split(',').filter(Boolean) : []
    }
    return out
  }, [params])

  const [series, setSeries] = useState<Series[] | null>(null)
  const [facets, setFacets] = useState<SeriesFacets | null>(null)
  const [libraries, setLibraries] = useState<Library[]>([])
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [editing, setEditing] = useState<Series | null>(null)
  const [busy, setBusy] = useState(false)
  const [naming, setNaming] = useState(false)

  // ── Saved views ──────────────────────────────────────────────────────────
  //
  // The same machinery Books uses, because a view was never a books idea: the
  // stored filter is a URL query string and lists.surface says which page it
  // belongs to. What that buys here is the thing worth having, which is that
  // the page opens on the reader's own filters and layout rather than on
  // whatever the product shipped.
  const [views, setViews] = useState<SavedList[]>([])
  const reloadViews = useCallback(
    () => fetchLists(callApi).then(setViews).catch(() => {}),
    [callApi],
  )
  useEffect(() => { void reloadViews() }, [reloadViews])
  // Another tab, or the rail itself, can change them.
  useEffect(() => {
    const again = () => void reloadViews()
    window.addEventListener(LISTS_CHANGED, again)
    return () => window.removeEventListener(LISTS_CHANGED, again)
  }, [reloadViews])

  // Everything except the letter, which is a jump within a result set rather
  // than part of what the view stands for: saving "the Bs" as a view would
  // make a filter out of scrolling.
  const paramsNow = useMemo(() => {
    const p = new URLSearchParams(params)
    p.delete('letter')
    return p.toString()
  }, [params])

  const activeView = useMemo(
    () => matchList(views, paramsNow, 'series'), [views, paramsNow],
  )
  const defaultView = useMemo(() => defaultListFor(views, 'series'), [views])
  const isDefaultView = activeView?.builtin_key === DEFAULT_LIST_KEY

  // Layout belongs to the view, so flipping to grid inside one and saving it
  // sticks; an override holds the choice until it is saved or abandoned.
  const [layoutOverride, setLayoutOverride] = useState<{
    viewId: string | null; layout: ListLayout
  } | null>(null)
  const layout: ListLayout =
    layoutOverride && layoutOverride.viewId === (activeView?.id ?? null)
      ? layoutOverride.layout
      : activeView?.layout ?? 'list'
  const chooseLayout = (next: ListLayout) =>
    setLayoutOverride({ viewId: activeView?.id ?? null, layout: next })

  const dirty = activeView ? viewIsDirty(activeView, paramsNow, layout) : false

  const commitView = async () => {
    if (!activeView) return
    await updateList(callApi, activeView.id, { query: paramsNow, layout }).catch(() => {})
    setLayoutOverride(null)
    await reloadViews()
    announceListsChanged()
  }

  const saveCurrentAs = async (name: string) => {
    setNaming(false)
    await createSmartList(callApi, name, paramsNow, undefined, 'series').catch(() => null)
    await reloadViews()
    announceListsChanged()
  }

  // Land on the default view's filters when arriving with none of our own. The
  // page has to open on something, and the reader's own answer beats ours.
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    if (landed) return
    if (views.length === 0) return
    setLanded(true)
    if (paramsNow !== '') return
    const q = defaultView ? listQuery(defaultView) : ''
    if (q) setParams(new URLSearchParams(q), { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, landed])

  // Typing into the search box should not fire a request per keystroke, and it
  // should not push a history entry per keystroke either. Held locally, pushed
  // to the URL on a pause.
  const [draft, setDraft] = useState(query)
  useEffect(() => { setDraft(query) }, [query])
  useEffect(() => {
    if (draft === query) return
    const timer = setTimeout(() => set({ q: draft }), 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  /** Tick or untick one value of one dimension. */
  const toggleFacet = (key: SeriesFacetKey, value: string) => {
    const current = selection[key] ?? []
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    set({ [SERIES_PARAM[key]]: next.join(',') || null })
  }

  const clearFacets = () =>
    set(Object.fromEntries(FILTER_PARAMS.map(p => [p, null])))

  function set(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (!v) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  // The request is the URL, minus the letter, which is a jump within a result
  // set rather than something the server can narrow on.
  const wire = useMemo(() => {
    const p = new URLSearchParams(params)
    p.delete('letter')
    if (p.get('sort') === 'name') p.delete('sort')
    if (p.get('dir') === 'asc') p.delete('dir')
    return p.toString()
  }, [params])

  const load = useCallback(() => {
    let cancelled = false
    callApi<{ items: Series[]; facets: SeriesFacets | null }>(
      `/api/v1/me/series/index${wire ? `?${wire}` : ''}`)
      .then(res => {
        if (cancelled) return
        setSeries(res?.items ?? [])
        // ?? null, not ?? [], so a server older than the rail leaves it unset
        // and the rail renders its skeleton rather than five empty headings.
        setFacets(res?.facets ?? null)
        setError(null)
      })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setSeries([]) } })
    return () => { cancelled = true }
  }, [callApi, wire])

  useEffect(() => load(), [load])

  useEffect(() => {
    callApi<Library[]>('/api/v1/libraries')
      .then(l => setLibraries((l ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setLibraries([]))
  }, [callApi])

  const available = useMemo(
    () => new Set((series ?? []).map(s => indexLetter(s.name))),
    [series],
  )
  const shown = useMemo(
    () => (series ?? []).filter(s => !letter || indexLetter(s.name) === letter),
    [series, letter],
  )

  const libraryName = (id: string) => libraries.find(l => l.id === id)?.name ?? ''

  const remove = async (s: Series) => {
    if (!confirm(t('series.confirm_delete', {
      name: s.name, defaultValue: `Delete the series "${s.name}"?`,
    }))) return
    setBusy(true)
    try {
      await callApi(`/api/v1/libraries/${s.library_id}/series/${s.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const activeFilters = SERIES_FACET_ORDER.reduce(
    (n, k) => n + (selection[k]?.length ?? 0), 0)

  return (
    <>
      <PageHeader
        title={t('nav.series', { defaultValue: 'Series' })}
        description={
          series === null
            ? undefined
            : t('series.count', {
                count: series.length,
                defaultValue: '{{count}} across every library',
              })
        }
      />

      <div className="px-8 py-6">
        <div className="grid gap-7 lg:grid-cols-[13rem_1fr]">
          <aside>
            <SeriesFacetRail
              facets={facets}
              selection={selection}
              onToggle={toggleFacet}
              onClear={clearFacets}
            />
          </aside>

          <div>
            {/* One row: which view is open, then what is filtered, then the
                controls. The same order Books uses, because the reader is
                answering the same questions in the same sequence. */}
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-content-muted">
              {activeView && !isDefaultView && (
                <span className="lb-chip on">{activeView.name}</span>
              )}

              <span className="tabular-nums">
                {series === null
                  ? ''
                  : t('series.count', {
                      count: series.length,
                      defaultValue: '{{count}} across every library',
                    })}
              </span>

              <span className="flex-1" />

              {/* Unsaved changes to an open view. The only view state worth a
                  button in the reader's way, which is why it is the only one
                  that gets one. The Default counts: it is where "open Series
                  the way I like it" is kept. */}
              {activeView && dirty && (
                <>
                  <button type="button" onClick={() => void commitView()}
                    className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-110">
                    {isDefaultView
                      ? t('views.save_default', { defaultValue: 'Make this the default' })
                      : t('views.save_changes', { defaultValue: 'Save changes' })}
                  </button>
                  <button type="button"
                    onClick={() => {
                      setLayoutOverride(null)
                      setParams(new URLSearchParams(listQuery(activeView)), { replace: true })
                    }}
                    className="rounded-md border border-line-strong px-2.5 py-1 text-xs text-content-secondary hover:bg-surface-inset">
                    {t('views.revert', { defaultValue: 'Revert' })}
                  </button>
                </>
              )}

              {/* Offered only when there is something worth naming. */}
              {(!activeView || isDefaultView) && (activeFilters > 0 || query) && (
                <button type="button" onClick={() => setNaming(true)}
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-110">
                  {t('views.save', { defaultValue: 'Save as a view' })}
                </button>
              )}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={t('series.search', { defaultValue: 'Search series…' })}
                aria-label={t('series.search', { defaultValue: 'Search series' })}
                className="lb-field min-w-[12rem] flex-1"
              />

              <select className="lb-field" style={{ width: 'auto' }} value={sort}
                onChange={e => set({ sort: e.target.value })}
                aria-label={t('series.sort', { defaultValue: 'Sort by' })}>
                {SORTS.map(o => (
                  <option key={o} value={o}>
                    {t(`series.sort_${o}`, { defaultValue: SORT_FALLBACK[o] })}
                  </option>
                ))}
              </select>

              <button type="button"
                onClick={() => set({ dir: dir === 'asc' ? 'desc' : null })}
                title={t(dir === 'asc' ? 'series.ascending' : 'series.descending', {
                  defaultValue: dir === 'asc' ? 'Ascending' : 'Descending',
                })}
                aria-label={t('series.direction', { defaultValue: 'Sort direction' })}
                className="rounded-md border border-line-strong px-2.5 py-1 text-xs text-content-secondary hover:bg-surface-inset">
                {dir === 'asc' ? '↑' : '↓'}
              </button>

              <div className="flex overflow-hidden rounded-md border border-line-strong">
                {(['list', 'grid'] as ListLayout[]).map(opt => (
                  <button key={opt} type="button" onClick={() => chooseLayout(opt)}
                    aria-pressed={layout === opt}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                      layout === opt ? 'bg-accent text-white' : 'text-content-secondary hover:bg-surface-inset'
                    }`}>
                    {t(`views.layout_${opt}`, { defaultValue: opt === 'list' ? 'Rows' : 'Grid' })}
                  </button>
                ))}
              </div>

              {/* Finds runs hiding in loose titles. A collection imported from
                  a spreadsheet arrives as a thousand books and no series at
                  all, and this is the only thing that fixes that in one pass.

                  One library at a time, because the books it files belong to
                  one. With several it acts on the one being filtered, and asks
                  for one when nothing is. */}
              <button type="button" className="lb-btn ghost sm"
                onClick={() => setSuggesting(true)}
                disabled={libraries.length > 1 && selection.library.length !== 1}
                title={libraries.length > 1 && selection.library.length !== 1
                  ? t('series.pick_library_first', {
                      defaultValue: 'Pick one library first: a series belongs to one',
                    })
                  : undefined}>
                {t('series.suggest', { defaultValue: 'Find series' })}
              </button>

              <button type="button" className="lb-btn sm" onClick={() => setCreating(true)}>
                {t('series.new', { defaultValue: 'New series' })}
              </button>
            </div>

            <AlphabetBar available={available} active={letter}
              onSelect={v => set({ letter: v })} />

            {error && (
              <p className="mt-6 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            {series === null && (
              <div className="mt-6 space-y-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-inset" />
                ))}
              </div>
            )}

            {series !== null && shown.length === 0 && !error && (
              <p className="font-display mt-12 text-center text-xl text-content-secondary">
                {letter
                  ? t('series.none_under', { letter, defaultValue: 'No series under {{letter}}' })
                  : activeFilters > 0 || query
                    ? t('series.none_matching', { defaultValue: 'No series match that' })
                    : t('series.none', { defaultValue: 'No series yet' })}
              </p>
            )}

            {series !== null && shown.length > 0 && (
              layout === 'grid' ? (
                <ul className="mt-4 grid gap-5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
                  {shown.map(s => (
                    <SeriesTile key={s.id} series={s} libraryName={libraryName(s.library_id)}
                      showLibrary={libraries.length > 1} t={t} />
                  ))}
                </ul>
              ) : (
                <ul className="mt-4">
                  {shown.map(s => (
                    <SeriesRow key={s.id} series={s} libraryName={libraryName(s.library_id)}
                      showLibrary={libraries.length > 1} busy={busy} t={t}
                      onEdit={() => setEditing(s)} onDelete={() => void remove(s)} />
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      </div>

      {naming && (
        <NameViewDialog
          onCancel={() => setNaming(false)}
          onSave={name => void saveCurrentAs(name)}
          t={t}
        />
      )}

      {suggesting && (
        <SuggestSeriesModal
          libraryId={selection.library[0] || libraries[0]?.id || ''}
          onClose={() => setSuggesting(false)}
          onCreated={() => { setSuggesting(false); load() }}
        />
      )}

      {(creating || editing) && (
        <SeriesFormModal
          libraryId={editing?.library_id ?? selection.library[0] ?? libraries[0]?.id ?? ''}
          series={editing}
          libraries={libraries}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); load() }}
        />
      )}
    </>
  )
}

const SORT_FALLBACK: Record<string, string> = {
  name: 'Name', volumes: 'Volumes held', missing: 'Missing volumes',
  read: 'Volumes read', recent: 'Recently changed',
}

type Translate = (k: string, o?: Record<string, unknown>) => string

/**
 * Name a view.
 *
 * A prompt() would do the job and would also be the one piece of this page that
 * cannot be styled, cannot be dismissed with Escape the way everything else is,
 * and blocks the tab while it is open.
 */
function NameViewDialog({ onCancel, onSave, t }: {
  onCancel: () => void
  onSave: (name: string) => void
  t: Translate
}) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog" aria-modal="true"
      onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-content">
          {t('views.save', { defaultValue: 'Save as a view' })}
        </h2>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()) }}
          placeholder={t('views.name_placeholder', { defaultValue: 'Name it…' })}
          aria-label={t('views.name', { defaultValue: 'Name' })}
          className="lb-field w-full"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="lb-btn ghost sm" onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="button" className="lb-btn sm" disabled={!name.trim()}
            onClick={() => onSave(name.trim())}>
            {t('common.save', { defaultValue: 'Save' })}
          </button>
        </div>
      </div>
    </div>
  )
}

/** What the series says about itself, shared by both layouts. */
function counts(s: Series) {
  // total_count is what the run is meant to have; book_count is what is held.
  // The difference is the number a reader is actually looking for.
  const missing = s.total_count ? Math.max(0, s.total_count - s.book_count) : 0
  return { missing, hidden: s.book_count - s.preview_books.length }
}

function CompleteBadge({ series: s, t }: { series: Series; t: Translate }) {
  if (!s.total_count) return null
  const { missing } = counts(s)
  return missing > 0 ? (
    <span className="rounded-full border border-warning-line px-2.5 py-[3px] text-[11px] text-warning">
      {t('series.missing', { count: missing, defaultValue: '{{count}} missing' })}
    </span>
  ) : (
    <span className="rounded-full border border-success-line px-2.5 py-[3px] text-[11px] text-success">
      {t('series.complete', { defaultValue: 'complete' })}
    </span>
  )
}

function summary(s: Series, t: Translate) {
  return [
    s.total_count
      ? t('series.own_of', {
          have: s.book_count, total: s.total_count,
          defaultValue: 'own {{have}} of {{total}}',
        })
      : t('series.own', { count: s.book_count, defaultValue: '{{count}} volumes' }),
    t('series.read_count', { count: s.read_count, defaultValue: '{{count}} read' }),
  ].join(' · ')
}

function SeriesRow({ series: s, libraryName, showLibrary, busy, t, onEdit, onDelete }: {
  series: Series
  libraryName: string
  showLibrary: boolean
  busy: boolean
  t: Translate
  onEdit: () => void
  onDelete: () => void
}) {
  const { hidden } = counts(s)
  return (
    <li className="group border-b border-line px-0.5 pb-3 pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Link
          to={`/libraries/${s.library_id}/series/${s.id}`}
          className="font-display text-[22px] font-semibold leading-tight text-content hover:text-accent"
        >
          {s.name}
        </Link>
        <CompleteBadge series={s} t={t} />
        {/* Which library's row this is. A series held by two libraries is two
            rows by design, so without this the list looks like a duplicate. */}
        {showLibrary && libraryName && (
          <span className="rounded-full border border-line px-2.5 py-[3px] text-[11px] text-content-tertiary">
            {libraryName}
          </span>
        )}
        {s.arc_count > 0 && (
          <span className="text-[11px] text-content-faint">
            {t('series.arc_count', { count: s.arc_count, defaultValue: '{{count}} arcs' })}
          </span>
        )}

        {/* Kept out of the way until the row is under the cursor. Editing a
            series is rare next to reading the list, and a delete button on
            every row invites the click nobody meant to make. */}
        <span className="ml-auto flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" className="lb-btn ghost sm" disabled={busy} onClick={onEdit}>
            {t('common.edit', { defaultValue: 'Edit' })}
          </button>
          <button type="button" className="lb-btn ghost sm" disabled={busy}
            style={{ color: 'var(--color-danger)' }} onClick={onDelete}>
            {t('common.delete', { defaultValue: 'Delete' })}
          </button>
        </span>
      </div>

      <p className="mt-1 text-xs tabular-nums text-content-muted">{summary(s, t)}</p>

      {/* Sideways scroll rather than a wrap. A run reads as a run when it stays
          on one line, and wrapping a fifty-volume series turns one row into a
          wall. */}
      <div className="mt-3 flex items-end gap-1.5 overflow-x-auto pb-1">
        {s.preview_books.map(v => (
          <Link key={v.book_id} to={`/books/${v.book_id}`} title={v.title}
            className="w-[30px] flex-none">
            <BookCover title={v.title} coverUrl={v.cover_url} seed={s.name}
              hideLabel className="w-[30px]" innerClassName="shadow-none" />
          </Link>
        ))}
        {hidden > 0 && (
          <span className="flex-none self-center pl-1 text-[11px] tabular-nums text-content-muted">
            {t('series.more_volumes', { count: hidden, defaultValue: '+{{count}} more' })}
          </span>
        )}
      </div>
    </li>
  )
}

function SeriesTile({ series: s, libraryName, showLibrary, t }: {
  series: Series
  libraryName: string
  showLibrary: boolean
  t: Translate
}) {
  // Four covers in a square. The same shape the per-library page used, because
  // it is what makes a shelf recognisable without reading a word of it.
  const tiles = s.preview_books.slice(0, 4)
  return (
    <li className="rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <Link to={`/libraries/${s.library_id}/series/${s.id}`} className="group block">
        <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-lg">
          {Array.from({ length: 4 }, (_, i) => {
            const v = tiles[i]
            return v ? (
              <BookCover key={v.book_id} title={v.title} coverUrl={v.cover_url}
                seed={s.name} hideLabel className="w-full" innerClassName="shadow-none" />
            ) : (
              <span key={i} className="block aspect-[2/3] rounded bg-surface-inset" />
            )
          })}
        </div>
        <p className="font-display mt-2 truncate text-[15px] font-semibold text-content group-hover:text-accent">
          {s.name}
        </p>
      </Link>
      <p className="mt-0.5 text-[11px] tabular-nums text-content-muted">{summary(s, t)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <CompleteBadge series={s} t={t} />
        {showLibrary && libraryName && (
          <span className="rounded-full border border-line px-2 py-[2px] text-[10px] text-content-tertiary">
            {libraryName}
          </span>
        )}
      </div>
    </li>
  )
}
