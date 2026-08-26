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
import { usePageTitle } from '../hooks/usePageTitle'
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

const STATUSES = ['ongoing', 'completed', 'hiatus', 'cancelled'] as const
const ARCS = ['with', 'without'] as const
const READING = ['unread', 'reading', 'read_all'] as const
const SORTS = ['name', 'volumes', 'missing', 'read', 'recent'] as const

type Layout = 'list' | 'grid'
const LAYOUT_KEY = 'librarium:series:layout'

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
  const lib = get('lib')
  const status = get('status')
  const arcs = get('arcs')
  const reading = get('reading')
  const tag = get('tag')
  const sort = get('sort') || 'name'
  const dir = get('dir') || 'asc'

  const [series, setSeries] = useState<Series[] | null>(null)
  const [libraries, setLibraries] = useState<Library[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [editing, setEditing] = useState<Series | null>(null)
  const [busy, setBusy] = useState(false)

  const [layout, setLayout] = useState<Layout>(
    () => (localStorage.getItem(LAYOUT_KEY) as Layout) || 'list',
  )
  const chooseLayout = (next: Layout) => {
    setLayout(next)
    localStorage.setItem(LAYOUT_KEY, next)
  }

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

  function set(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (!v) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  /** Toggle a value off when it is already the one selected. */
  const pick = (k: string, value: string, current: string) =>
    set({ [k]: current === value ? null : value })

  const load = useCallback(() => {
    let cancelled = false
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries({ q: query, lib, status, arcs, reading, tag, sort, dir })) {
      if (v && !(k === 'sort' && v === 'name') && !(k === 'dir' && v === 'asc')) q.set(k, v)
    }
    callApi<{ items: Series[] }>(`/api/v1/me/series/index?${q}`)
      .then(res => { if (!cancelled) { setSeries(res?.items ?? []); setError(null) } })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setSeries([]) } })
    return () => { cancelled = true }
  }, [callApi, query, lib, status, arcs, reading, tag, sort, dir])

  useEffect(() => load(), [load])

  useEffect(() => {
    callApi<Library[]>('/api/v1/libraries')
      .then(l => setLibraries((l ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setLibraries([]))
  }, [callApi])

  // The tag vocabulary is per library, so the options are whatever the series
  // currently in view actually carry. Deriving them beats another request for a
  // control most people never open.
  useEffect(() => {
    if (!series) return
    setTags(prev => {
      const names = new Set(prev)
      for (const s of series) for (const g of s.tags ?? []) names.add(g.name)
      return [...names].sort((a, b) => a.localeCompare(b))
    })
  }, [series])

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

  const activeFilters = [lib, status, arcs, reading, tag].filter(Boolean).length

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
        {/* One row of controls, wrapping. The search box grows and everything
            else keeps its own width, so a narrow window stacks the controls
            rather than squeezing the field nobody can then type in. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={t('series.search', { defaultValue: 'Search series…' })}
            aria-label={t('series.search', { defaultValue: 'Search series' })}
            className="lb-field min-w-[14rem] flex-1"
          />

          {libraries.length > 1 && (
            <select className="lb-field" style={{ width: 'auto' }} value={lib}
              onChange={e => set({ lib: e.target.value })}
              aria-label={t('facets.library', { defaultValue: 'Library' })}>
              <option value="">{t('series.all_libraries', { defaultValue: 'Every library' })}</option>
              {libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}

          {tags.length > 0 && (
            <select className="lb-field" style={{ width: 'auto' }} value={tag}
              onChange={e => set({ tag: e.target.value })}
              aria-label={t('facets.tag', { defaultValue: 'Tag' })}>
              <option value="">{t('series.all_tags', { defaultValue: 'Any tag' })}</option>
              {tags.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          )}

          <select className="lb-field" style={{ width: 'auto' }} value={sort}
            onChange={e => set({ sort: e.target.value })}
            aria-label={t('series.sort', { defaultValue: 'Sort by' })}>
            {SORTS.map(s => (
              <option key={s} value={s}>
                {t(`series.sort_${s}`, { defaultValue: SORT_FALLBACK[s] })}
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
            {(['list', 'grid'] as Layout[]).map(opt => (
              <button key={opt} type="button" onClick={() => chooseLayout(opt)}
                aria-pressed={layout === opt}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  layout === opt ? 'bg-accent text-white' : 'text-content-secondary hover:bg-surface-inset'
                }`}>
                {t(`views.layout_${opt}`, { defaultValue: opt === 'list' ? 'Rows' : 'Grid' })}
              </button>
            ))}
          </div>

          {/* Finds runs hiding in loose titles. Worth surfacing beside New
              series rather than buried: a collection imported from a
              spreadsheet arrives as a thousand books and no series at all, and
              this is the only thing that fixes that in one pass.

              One library at a time, because the books it files belong to one.
              With several, it acts on the one being filtered, and asks for one
              when the filter is off. */}
          <button type="button" className="lb-btn ghost sm"
            onClick={() => setSuggesting(true)}
            disabled={libraries.length > 1 && !lib}
            title={libraries.length > 1 && !lib
              ? t('series.pick_library_first', {
                  defaultValue: 'Pick a library first: a series belongs to one',
                })
              : undefined}>
            {t('series.suggest', { defaultValue: 'Find series' })}
          </button>

          <button type="button" className="lb-btn sm" onClick={() => setCreating(true)}>
            {t('series.new', { defaultValue: 'New series' })}
          </button>
        </div>

        {/* Small closed vocabularies, so pills rather than another three
            dropdowns: the whole choice is readable at a glance and one click
            wide, which a select is not. */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <PillGroup label={t('series.status', { defaultValue: 'Status' })}
            options={STATUSES} active={status} fallback={STATUS_FALLBACK}
            prefix="series.status_" onPick={v => pick('status', v, status)} t={t} />
          <PillGroup label={t('series.arcs', { defaultValue: 'Arcs' })}
            options={ARCS} active={arcs} fallback={ARCS_FALLBACK}
            prefix="series.arcs_" onPick={v => pick('arcs', v, arcs)} t={t} />
          <PillGroup label={t('series.reading', { defaultValue: 'Reading' })}
            options={READING} active={reading} fallback={READING_FALLBACK}
            prefix="series.reading_" onPick={v => pick('reading', v, reading)} t={t} />

          {activeFilters > 0 && (
            <button type="button"
              onClick={() => set({ lib: null, status: null, arcs: null, reading: null, tag: null })}
              className="text-xs text-content-tertiary underline hover:text-content">
              {t('series.clear_filters', {
                count: activeFilters,
                defaultValue: 'Clear 1 filter',
                defaultValue_other: `Clear ${activeFilters} filters`,
              })}
            </button>
          )}
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

      {suggesting && (
        <SuggestSeriesModal
          libraryId={lib || libraries[0]?.id || ''}
          onClose={() => setSuggesting(false)}
          onCreated={() => { setSuggesting(false); load() }}
        />
      )}

      {(creating || editing) && (
        <SeriesFormModal
          libraryId={editing?.library_id ?? lib ?? libraries[0]?.id ?? ''}
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
const STATUS_FALLBACK: Record<string, string> = {
  ongoing: 'Ongoing', completed: 'Complete', hiatus: 'On hiatus', cancelled: 'Cancelled',
}
const ARCS_FALLBACK: Record<string, string> = { with: 'With arcs', without: 'No arcs' }
const READING_FALLBACK: Record<string, string> = {
  unread: 'Unread', reading: 'Reading', read_all: 'Read all',
}

type Translate = (k: string, o?: Record<string, unknown>) => string

/** A closed vocabulary as a labelled row of toggles. Clicking the active one clears it. */
function PillGroup({ label, options, active, fallback, prefix, onPick, t }: {
  label: string
  options: readonly string[]
  active: string
  fallback: Record<string, string>
  prefix: string
  onPick: (value: string) => void
  t: Translate
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="lb-eyebrow">{label}</span>
      {options.map(o => (
        <button key={o} type="button" onClick={() => onPick(o)} aria-pressed={active === o}
          className={`rounded-full border px-2.5 py-[3px] text-[11px] font-medium transition-colors ${
            active === o
              ? 'border-accent bg-accent text-white'
              : 'border-line-strong text-content-tertiary hover:bg-surface-inset'
          }`}>
          {t(prefix + o, { defaultValue: fallback[o] })}
        </button>
      ))}
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
