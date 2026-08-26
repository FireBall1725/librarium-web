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
import { Link, useNavigationType, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import BookCover from '../components/BookCover'
import { PromptDialog } from '../components/Dialog'
import SeriesFormModal from '../components/SeriesFormModal'
import SuggestSeriesModal from '../components/SuggestSeriesModal'
import ViewChip from '../components/ViewChip'
import SeriesFacetRail, {
  SERIES_FACET_ORDER, SERIES_PARAM, seriesFacetLabel,
  type SeriesFacetKey, type SeriesFacets,
} from '../components/SeriesFacetRail'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  DEFAULT_LIST_KEY, LISTS_CHANGED, announceListsChanged, createSmartList,
  adoptedList, defaultListFor, deleteList, fetchLists, isDirty as viewIsDirty,
  listIcon, listQuery, matchList, updateList, type ListLayout, type SavedList,
} from '../lib/lists'
import { LIST_ICONS } from '../lib/listIcons'
import type { IconName } from '../lib/icons'
import type { Library, Series } from '../types'

const SORTS = ['name', 'volumes', 'missing', 'read', 'recent'] as const

/** Which parameters are filters, so a chip row and a count can tell them apart. */
const FILTER_PARAMS = SERIES_FACET_ORDER.map(k => SERIES_PARAM[k])

export default function SeriesPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('nav.series', { defaultValue: 'Series' }))

  const [params, setParams] = useSearchParams()

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

  const paramsNow = useMemo(() => params.toString(), [params])

  /**
   * Which view is open, and it has to survive the filter being edited.
   *
   * Matching alone is not enough. Arriving from the rail sets no id, so the
   * page works out which view it is on by matching the URL; the first click on
   * a facet then breaks the match, nothing is open, and there is nothing to
   * save the change to. Sorting did exactly that: pick Missing and the Default
   * stopped matching, so "this is how I want Series to open" had no button.
   *
   * An exact match adopts the view; from then on it stays open while the URL
   * drifts, which is what makes the edit saveable. Opening a different one
   * matches again and takes over.
   */
  const matchedNow = useMemo(
    () => matchList(views, paramsNow, 'series'), [views, paramsNow],
  )
  const [adopted, setAdopted] = useState<string | null>(null)
  // Only a real navigation changes which view is open. Editing one can drift it
  // into looking like another: clear the filters on any view and what is left
  // is the Default's empty query. The two cases are identical in the URL, so
  // the history action is what tells them apart. Rail links push; set()
  // replaces.
  const editedInPlace = useNavigationType() === 'REPLACE'
  const adoptedNow = adoptedList(matchedNow, adopted, editedInPlace)
  // Adjusted during render rather than in an effect: React re-runs this
  // component before touching the DOM, so the view is already adopted by the
  // time anything is drawn and there is no frame showing the wrong one.
  if (adoptedNow !== adopted) setAdopted(adoptedNow)

  const defaultView = useMemo(() => defaultListFor(views, 'series'), [views])
  const activeView =
    views.find(v => v.id === adoptedNow) ?? matchedNow ?? defaultView ?? null
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

  /** Close the view and go back to an unfiltered Series. */
  const leaveView = () => {
    setAdopted(null)
    setLayoutOverride(null)
    setParams(new URLSearchParams())
  }

  /**
   * Rename the view on screen and change its icon.
   *
   * The same dialog does both, because from the reader's side it is one edit.
   */
  const [renaming, setRenaming] = useState(false)
  const applyRename = async (name: string, icon?: IconName) => {
    setRenaming(false)
    if (!activeView) return
    await updateList(callApi, activeView.id, { name, icon }).catch(() => {})
    await reloadViews()
    announceListsChanged()
  }

  const removeView = async (id: string) => {
    await deleteList(callApi, id).catch(() => {})
    setAdopted(null)
    await reloadViews()
    announceListsChanged()
    setParams(new URLSearchParams())
  }

  const saveCurrentAs = async (name: string, icon?: IconName) => {
    setNaming(false)
    await createSmartList(callApi, name, paramsNow, icon, 'series', layout).catch(() => null)
    await reloadViews()
    announceListsChanged()
  }

  // Land on the default view's own filters when arriving with none.
  //
  // Push, not replace, so the adoption above reads it as a navigation rather
  // than an edit: replacing would mark the page dirty against a view it had
  // just opened, and offer to save what it had only just loaded.
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    if (landed || views.length === 0) return
    setLanded(true)
    if (paramsNow !== '') return
    const q = defaultView ? listQuery(defaultView) : ''
    if (q) setParams(new URLSearchParams(q))
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

  // The request is the URL, minus the defaults, which say nothing.
  const wire = useMemo(() => {
    const p = new URLSearchParams(params)
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

  const shown = series ?? []

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

  /**
   * A chip per ticked value, labelled the way the rail labels it.
   *
   * Read off the facets rather than the URL, because a library is a uuid and a
   * status is a bare word: a chip reading the raw value is a chip nobody can
   * act on. A value the facets do not know about still gets a chip, so a filter
   * can always be removed even when nothing matches it.
   */
  const activeChips = useMemo(() => {
    const out: { key: SeriesFacetKey; value: string; label: string }[] = []
    for (const key of SERIES_FACET_ORDER) {
      for (const value of selection[key] ?? []) {
        // Translated, not the server's label. Status, arcs and reading come
        // back as raw values by design, so taking the label straight put
        // "ONGOING" and "READING" in the chip row beside a rail that said
        // "Ongoing" and "Reading" for the same filter.
        const known = facets?.[key]?.find(v => v.value === value)
        out.push({
          key, value,
          label: seriesFacetLabel(key, value, t, known?.label ?? value),
        })
      }
    }
    return out
  }, [selection, facets, t])

  return (
    <>
      <PageHeader
        title={t('nav.series', { defaultValue: 'Series' })}
        description={t('series.description', {
          defaultValue: 'Every run across the libraries you can read.',
        })}
      />

      <div className="px-8 py-6">
        {/* Above the grid and on its own, the way Books has it: a search box is
            the widest control on the page and the first thing anyone reaches
            for, so it does not belong in a row competing with five buttons. */}
        <div className="relative mb-6 w-full max-w-lg">
          <input
            type="search"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={t('series.search', { defaultValue: 'Search series…' })}
            aria-label={t('series.search', { defaultValue: 'Search series' })}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="grid gap-7 lg:grid-cols-[13rem_1fr]">
          <aside>
            <SeriesFacetRail
              facets={facets}
              selection={selection}
              onToggle={toggleFacet}
              onClear={clearFacets}
            />
          </aside>

          {/* min-w-0, or the 1fr track is minmax(auto, 1fr) and sizes itself to
              the widest thing inside it rather than to what is left. That is
              what pushed the toolbar past the right edge of the window. */}
          <div className="min-w-0">
            {/* One row, wrapping: what is open and what is filtered on the
                left, what you can do about it on the right. The same order
                Books uses, because the reader is answering the same questions
                in the same sequence. */}
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-content-muted">
              {activeView && (
                <ViewChip
                  view={activeView}
                  dirty={dirty}
                  isDefault={isDefaultView}
                  defaultHint={t('views.default_hint_series', {
                    defaultValue: 'what Series opens on',
                  })}
                  onLeave={leaveView}
                  onRename={() => setRenaming(true)}
                  onSaveAsNew={() => setNaming(true)}
                  onDelete={() => void removeView(activeView.id)}
                />
              )}

              <span className="tabular-nums">
                {series === null
                  ? ''
                  : t('series.count', {
                      count: shown.length,
                      defaultValue: '{{count}} across every library',
                    })}
              </span>

              {/* What is filtered, removable. The rail says it too, but the
                  rail is a column you have to look down; a chip row says it
                  where the reader already is. */}
              {activeChips.map(chip => (
                <button key={`${chip.key}:${chip.value}`} type="button"
                  onClick={() => toggleFacet(chip.key, chip.value)}
                  className="lb-chip on"
                  title={t('facets.remove', { defaultValue: 'Remove filter' })}>
                  {chip.label} ×
                </button>
              ))}

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

              {/* Offered once there is something worth naming, which includes a
                  sort and a layout: those are part of what a view stands for,
                  and leaving them out meant sorting the page gave no way to
                  keep the result. */}
              {isDefaultView && dirty && (
                <button type="button" onClick={() => setNaming(true)}
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-110">
                  {t('views.save', { defaultValue: 'Save as a view' })}
                </button>
              )}

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

              {/* A segmented group, not a dropdown. Five sort orders is a
                  comparison, and a comparison you have to open a menu to see
                  is one nobody makes. Clicking the one already active flips
                  the direction, the way a table header does, which is also
                  what retired the separate arrow button beside it. */}
              <div className="flex overflow-hidden rounded-md border border-line-strong">
                {SORTS.map(o => {
                  const on = sort === o
                  return (
                    <button key={o} type="button" aria-pressed={on}
                      title={t(`series.sort_${o}`, { defaultValue: SORT_FALLBACK[o] })}
                      onClick={() => set(on
                        // Already sorting by this, so the click means the other
                        // direction. Name defaults to ascending and everything
                        // else to descending: nobody looks for the run with the
                        // fewest volumes missing.
                        ? { dir: dir === 'asc' ? 'desc' : 'asc' }
                        : { sort: o === 'name' ? null : o, dir: o === 'name' ? null : 'desc' })}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                        on ? 'bg-accent text-white' : 'text-content-secondary hover:bg-surface-inset'
                      }`}>
                      {t(`series.sort_short_${o}`, { defaultValue: SORT_SHORT[o] })}
                      {on && <span aria-hidden="true" className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  )
                })}
              </div>

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
            </div>

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
                {activeFilters > 0 || query
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

      <PromptDialog
        open={naming}
        title={t('views.save_as_view', { defaultValue: 'Save as a view' })}
        description={t('views.new_description_series', {
          defaultValue: 'Saves the filters you have on Series right now. You can change it later.',
        })}
        label={t('views.name_label', { defaultValue: 'Name' })}
        placeholder={t('views.name_placeholder_series', { defaultValue: 'Runs I am behind on' })}
        icons={LIST_ICONS}
        initialIcon="newview"
        iconLabel={t('common.icon', { defaultValue: 'Icon' })}
        onCancel={() => setNaming(false)}
        onSubmit={saveCurrentAs}
      />

      <PromptDialog
        open={renaming}
        title={t('views.rename', { defaultValue: 'Rename' })}
        label={t('views.name_label', { defaultValue: 'Name' })}
        initialValue={activeView?.name ?? ''}
        icons={LIST_ICONS}
        initialIcon={activeView ? listIcon(activeView) : undefined}
        iconLabel={t('common.icon', { defaultValue: 'Icon' })}
        onCancel={() => setRenaming(false)}
        onSubmit={applyRename}
      />

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

/** What each order means, for the tooltip. */
const SORT_FALLBACK: Record<string, string> = {
  name: 'Name', volumes: 'Volumes held', missing: 'Missing volumes',
  read: 'Volumes read', recent: 'Recently changed',
}

/** What fits on a button. The tooltip carries the rest. */
const SORT_SHORT: Record<string, string> = {
  name: 'Name', volumes: 'Volumes', missing: 'Missing',
  read: 'Read', recent: 'Recent',
}

type Translate = (k: string, o?: Record<string, unknown>) => string

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
