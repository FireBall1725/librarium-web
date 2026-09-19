// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Shelves: where a physical copy actually sits.
//
// A tree, because that is how a house is: a room holds a bookcase, a bookcase
// holds a shelf, and it nests as deep as anyone needs. Filing a copy on the
// shelf makes it findable under every place above it, which is what separates
// this from a list. A list is a set you pick; a shelf is a fact about the
// object.
//
// Any place can be marked a bookcase by giving it a shelf count. Its shelves
// are the places directly inside it, and the kiosk draws it from them.
//
// Per library, because a place belongs to the collection it holds.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import PageHeader from '../../components/PageHeader'
import type { CopyLocation, Library } from '../../types'
import {
  buildTree, caseInfo, flatten, looksLikeBookcase, missingShelves, pathOf, selfAndInside,
  type CaseInfo, type PlaceNode,
} from '../../lib/places'

const MIN_SHELVES = 1
const MAX_SHELVES = 50

/** What the editor is showing: a place, or a new one going inside a parent. */
type Selection = { id: string } | { newIn: string | null } | null

export default function ShelvesPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('settings_nav.shelves', { defaultValue: 'Shelves' }))

  const [params, setParams] = useSearchParams()
  const [libraries, setLibraries] = useState<Library[]>([])
  const [places, setPlaces] = useState<CopyLocation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    callApi<Library[]>('/api/v1/libraries')
      .then(l => { if (!cancelled) setLibraries((l ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))) })
      .catch(() => { if (!cancelled) setLibraries([]) })
    return () => { cancelled = true }
  }, [callApi])

  // Derived rather than written back by an effect, so arriving here does not
  // push a redirect into the history for a choice nobody made.
  const libraryId = params.get('lib') || libraries[0]?.id || ''

  const load = useCallback(async () => {
    if (!libraryId) return
    try {
      const r = await callApi<{ items: CopyLocation[] }>(`/api/v1/libraries/${libraryId}/locations`)
      setPlaces(r?.items ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      setPlaces([])
    }
  }, [callApi, libraryId])

  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await load() })()
    return () => { cancelled = true }
  }, [load])

  const tree = useMemo(() => buildTree(places ?? []), [places])
  const rows = useMemo(() => {
    // Hide whatever sits under a collapsed place.
    const out: PlaceNode[] = []
    const walk = (nodes: PlaceNode[]) => {
      for (const n of nodes) {
        out.push(n)
        if (!collapsed.has(n.place.id)) walk(n.children)
      }
    }
    walk(tree)
    return out
  }, [tree, collapsed])
  const nodeById = useMemo(() => new Map(flatten(tree).map(n => [n.place.id, n])), [tree])

  const selectedId = selection && 'id' in selection ? selection.id : null
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null
  // A place deleted elsewhere drops the editor back to empty.
  const editing = selectedId && !selectedNode ? null : selection

  const toggle = (id: string) => setCollapsed(c => {
    const next = new Set(c)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <>
      <PageHeader
        title={t('settings_nav.shelves', { defaultValue: 'Shelves' })}
        description={t('shelves_settings.description', {
          defaultValue: 'Where a copy physically sits. Places nest, so a room holds a bookcase and a bookcase holds a shelf, and a book filed on the shelf is findable under all three.',
        })}
        breadcrumbs={[
          { label: t('nav.settings', { defaultValue: 'Settings' }), to: '/settings' },
          { label: t('settings_nav.shelves', { defaultValue: 'Shelves' }) },
        ]}
      />
      {/* Not SettingsBody: its reading width suits a form, and this is a tree
          beside an editor, which needs the window. */}
      <div className="px-8 py-6">
        {error && (
          <p className="mb-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {libraries.length > 1 && (
            <select
              className="lb-field"
              style={{ width: 'auto' }}
              value={libraryId}
              onChange={e => { setSelection(null); setParams({ lib: e.target.value }, { replace: true }) }}
              aria-label={t('shelves_settings.library', { defaultValue: 'Library' })}
            >
              {libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <button type="button" className="lb-btn sm" disabled={!libraryId}
            onClick={() => setSelection({ newIn: null })}>
            {t('shelves_settings.new', { defaultValue: 'New place' })}
          </button>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {places === null ? <div /> : places.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-4 py-6 text-sm text-content-tertiary">
              {t('shelves_settings.empty', { defaultValue: 'Nowhere recorded yet.' })}
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={t('shelves_settings.places', { defaultValue: 'Places' })}>
              {rows.map(n => (
                <PlaceRow
                  key={n.place.id}
                  node={n}
                  all={places}
                  current={n.place.id === selectedId}
                  collapsed={collapsed.has(n.place.id)}
                  onToggle={() => toggle(n.place.id)}
                  onSelect={() => setSelection({ id: n.place.id })}
                />
              ))}
            </ul>
          )}

          <div className="lg:sticky lg:top-4">
            {editing && places ? (
              <PlaceEditor
                // A fresh draft for every place picked, so edits never leak
                // from one place into the next.
                key={'id' in editing ? editing.id : `new:${editing.newIn ?? ''}`}
                libraryId={libraryId}
                places={places}
                node={selectedNode}
                newIn={'newIn' in editing ? editing.newIn : null}
                onChanged={load}
                onError={setError}
                onSelect={setSelection}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-sm text-content-tertiary">
                {t('shelves_settings.pick', { defaultValue: 'Pick a place to edit it, or add a new one.' })}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function PlaceRow({ node, all, current, collapsed, onToggle, onSelect }: {
  node: PlaceNode
  all: CopyLocation[]
  current: boolean
  collapsed: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const p = node.place
  const shelves = node.children.map(c => c.place)
  const bookcase = p.shelf_count != null
  // A guess only for something shaped like a bookcase, so a room of
  // numbered bookcases doesn't read as a bookcase itself.
  const info = bookcase || looksLikeBookcase(node) ? caseInfo(p, shelves) : null

  return (
    <li className={`flex items-center gap-2 border-t border-line py-2 pr-3 first:border-t-0 ${current ? 'bg-accent-surface' : ''}`}
      style={{ paddingLeft: `${0.5 + node.depth * 1.25}rem` }}>
      {node.children.length > 0 ? (
        <button type="button" onClick={onToggle}
          className="grid size-6 flex-none place-items-center rounded text-content-tertiary hover:text-content"
          aria-expanded={!collapsed}
          aria-label={collapsed
            ? t('shelves_settings.expand', { name: p.name, defaultValue: 'Show what is inside {{name}}' })
            : t('shelves_settings.collapse', { name: p.name, defaultValue: 'Hide what is inside {{name}}' })}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      ) : <span className="size-6 flex-none" />}

      <button type="button" onClick={onSelect} aria-current={current || undefined}
        title={pathOf(p.id, all).join(' › ')}
        className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-sm ${node.depth === 0 ? 'font-semibold text-content' : 'text-content'}`}>{p.name}</span>
        {shelves.length > 0 && (
          <span className="block truncate text-xs text-content-tertiary">
            {t('shelves_settings.inside_count', {
              count: shelves.length,
              defaultValue: '1 place inside',
              defaultValue_other: '{{count}} places inside',
            })}
            {info && shelves.length > 1 && <> · {shelves[0].name} – {shelves[shelves.length - 1].name}</>}
          </span>
        )}
      </button>

      {bookcase ? (
        <Tag>{t('shelves_settings.tag_shelves', { count: p.shelf_count!, defaultValue: '1 shelf', defaultValue_other: '{{count}} shelves' })}</Tag>
      ) : info && shelves.length > 0 ? (
        <Tag muted>{t('shelves_settings.tag_guessing', { count: info.count, defaultValue: 'Guessing {{count}}' })}</Tag>
      ) : null}
      {bookcase && p.shelf_numbering === 'bottom_up' && (
        <Tag>{t('shelves_settings.tag_bottom_up', { defaultValue: '1 at bottom' })}</Tag>
      )}

      <Link to={`/books?location=${p.id}`}
        className="flex-none text-xs tabular-nums text-content-tertiary hover:text-accent"
        title={t('shelves_settings.browse', { defaultValue: 'Show these books' })}>
        {t('shelves_settings.count', {
          count: node.total,
          defaultValue: '1 copy',
          defaultValue_other: '{{count}} copies',
        })}
      </Link>
    </li>
  )
}

function Tag({ muted, children }: { muted?: boolean; children: ReactNode }) {
  return (
    <span className={`flex-none whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
      muted ? 'border border-line text-content-tertiary' : 'bg-accent-surface text-accent'}`}>
      {children}
    </span>
  )
}

function PlaceEditor({ libraryId, places, node, newIn, onChanged, onError, onSelect }: {
  libraryId: string
  places: CopyLocation[]
  /** The place being edited; null for a new one. */
  node: PlaceNode | null
  /** Where a new place goes. */
  newIn: string | null
  onChanged: () => Promise<void>
  onError: (msg: string | null) => void
  onSelect: (s: Selection) => void
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const place = node?.place ?? null
  const shelves = useMemo(() => node?.children.map(c => c.place) ?? [], [node])
  const prefix = t('shelves_settings.shelf_prefix', { defaultValue: 'Shelf ' })
  const saved = place ? caseInfo(place, shelves, prefix) : null

  const [name, setName] = useState(place?.name ?? '')
  const [parent, setParent] = useState(place ? place.parent_id ?? '' : newIn ?? '')
  const [isCase, setIsCase] = useState(place?.shelf_count != null)
  const [count, setCount] = useState(place?.shelf_count ?? saved?.count ?? 5)
  const [topDown, setTopDown] = useState(place?.shelf_numbering !== 'bottom_up')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const fail = (e: unknown) => onError(e instanceof ApiError ? e.message : String(e))

  // A place cannot go inside itself or anything inside it. The server refuses
  // the loop too; this keeps it off the menu.
  const parentOptions = useMemo(() => {
    const blocked = place ? selfAndInside(place.id, places) : new Set<string>()
    return flatten(buildTree(places))
      .filter(n => !blocked.has(n.place.id))
      .map(n => ({ id: n.place.id, label: pathOf(n.place.id, places).join(' › ') }))
  }, [place, places])

  // The draft bookcase, for the preview: the count on screen, never fewer
  // than the highest shelf number that already exists.
  const draft: CaseInfo | null = saved ? { ...saved, count: Math.max(count, saved.highest) } : null
  const drawn = draft?.count ?? count
  const unnumbered = shelves.length > 0 && !saved
  const missing = unnumbered ? [] : missingShelves(saved, count, prefix)

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    onError(null)
    setNotice(null)
    const body = JSON.stringify({
      name: trimmed,
      // Always sent, so moving to the top is expressible: null is "nowhere",
      // and leaving the key out would mean "where it is now".
      parent_id: parent || null,
      shelf_count: isCase ? count : null,
      shelf_numbering: isCase ? (topDown ? 'top_down' : 'bottom_up') : null,
    })
    try {
      if (place) {
        await callApi(`/api/v1/locations/${place.id}`, { method: 'PATCH', body })
        await onChanged()
        setNotice(t('shelves_settings.saved', { defaultValue: 'Saved.' }))
      } else {
        const created = await callApi<CopyLocation>(`/api/v1/libraries/${libraryId}/locations`, { method: 'POST', body })
        await onChanged()
        // Straight into editing it, so a new bookcase can get its shelves.
        if (created?.id) onSelect({ id: created.id })
      }
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const addMissing = async () => {
    if (!place) return
    setBusy(true)
    onError(null)
    setNotice(null)
    try {
      // One at a time, in order, so a failure part way leaves shelves 1 to n
      // rather than a scattering.
      for (const shelf of missing) {
        await callApi(`/api/v1/libraries/${libraryId}/locations`, {
          method: 'POST',
          body: JSON.stringify({ name: shelf, parent_id: place.id }),
        })
      }
      await onChanged()
      setNotice(t('shelves_settings.added', { count: missing.length, defaultValue: 'Added 1 shelf.', defaultValue_other: 'Added {{count}} shelves.' }))
    } catch (e) {
      await onChanged()
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!place) return
    setBusy(true)
    onError(null)
    try {
      await callApi(`/api/v1/locations/${place.id}`, { method: 'DELETE' })
      onSelect(null)
      await onChanged()
    } catch (e) {
      // The server refuses while copies are still filed there, which is the
      // right answer: a copy whose location silently became null is a book you
      // cannot find. Say why rather than looking broken.
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
      <h2 className="lb-eyebrow">
        {place
          ? t('shelves_settings.editing', { name: place.name, defaultValue: 'Editing {{name}}' })
          : t('shelves_settings.new', { defaultValue: 'New place' })}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-content-secondary">{t('shelves_settings.name_label', { defaultValue: 'Name' })}</span>
          <input
            className="lb-field"
            value={name}
            autoFocus={!place}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void save() }}
            placeholder={t('shelves_settings.name', { defaultValue: 'Office, Bookcase, Top shelf…' })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-content-secondary">{t('shelves_settings.inside', { defaultValue: 'Inside' })}</span>
          <select className="lb-field" value={parent} onChange={e => setParent(e.target.value)}>
            <option value="">{t('shelves_settings.top', { defaultValue: 'Not inside anything' })}</option>
            {parentOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-content">
        <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={isCase}
          onChange={e => setIsCase(e.target.checked)} />
        {t('shelves_settings.is_bookcase', { defaultValue: 'This is a bookcase' })}
      </label>

      {isCase ? (
        <div className="grid gap-4 rounded-lg bg-surface-muted p-3.5 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 text-[13px] font-semibold text-content-secondary">{t('shelves_settings.shelves', { defaultValue: 'Shelves' })}</div>
              <div className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-surface">
                <button type="button" className="h-9 w-9 text-lg text-content hover:bg-surface-muted disabled:opacity-40"
                  disabled={count <= MIN_SHELVES} onClick={() => setCount(c => Math.max(MIN_SHELVES, c - 1))}
                  aria-label={t('shelves_settings.fewer', { defaultValue: 'One fewer shelf' })}>−</button>
                <output className="min-w-[2.5rem] text-center font-bold tabular-nums text-content" aria-live="polite">{count}</output>
                <button type="button" className="h-9 w-9 text-lg text-content hover:bg-surface-muted disabled:opacity-40"
                  disabled={count >= MAX_SHELVES} onClick={() => setCount(c => Math.min(MAX_SHELVES, c + 1))}
                  aria-label={t('shelves_settings.more', { defaultValue: 'One more shelf' })}>+</button>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[13px] font-semibold text-content-secondary">{t('shelves_settings.shelf_one_at', { defaultValue: 'Shelf 1 is at the' })}</div>
              <div className="inline-flex overflow-hidden rounded-lg border border-line bg-surface" role="group">
                {[true, false].map(top => (
                  <button key={String(top)} type="button" aria-pressed={topDown === top} onClick={() => setTopDown(top)}
                    className={`px-3 py-2 text-[13px] font-semibold ${topDown === top ? 'bg-accent-surface text-accent' : 'text-content-secondary hover:text-content'}`}>
                    {top
                      ? t('shelves_settings.at_top', { defaultValue: 'Top' })
                      : t('shelves_settings.at_bottom', { defaultValue: 'Bottom' })}
                  </button>
                ))}
              </div>
            </div>

            {saved && saved.highest > count && (
              <p className="text-[13px] text-content-tertiary">
                {t('shelves_settings.hint_higher', { count: saved.highest, defaultValue: 'There is already a shelf {{count}}, so {{count}} shelves will show.' })}
              </p>
            )}
            {unnumbered ? (
              <p className="text-[13px] text-content-tertiary">
                {t('shelves_settings.hint_unnumbered', { defaultValue: 'Not every place inside ends in a number, so there is no shelf order to draw. Name them like A1 or Shelf 3 to get one.' })}
              </p>
            ) : missing.length > 0 ? (
              <>
                <p className="text-[13px] text-content-tertiary">
                  {t('shelves_settings.hint_missing', {
                    count: missing.length,
                    names: missing.slice(0, 4).join(', '),
                    defaultValue: '1 shelf has no place yet: {{names}}.',
                    defaultValue_other: '{{count}} shelves have no place yet: {{names}}.',
                  })}
                  {missing.length > 4 && <> {t('shelves_settings.hint_more', { count: missing.length - 4, defaultValue: 'And {{count}} more.' })}</>}
                </p>
                <div>
                  {place ? (
                    <button type="button" className="lb-btn ghost sm" disabled={busy} onClick={() => void addMissing()}>
                      {t('shelves_settings.add_missing', { defaultValue: 'Add missing shelves' })}
                    </button>
                  ) : (
                    <p className="text-[13px] text-content-tertiary">
                      {t('shelves_settings.hint_save_first', { defaultValue: 'Save it first, then add the shelves.' })}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-[13px] text-content-tertiary">{t('shelves_settings.hint_all', { defaultValue: 'Every shelf has a place.' })}</p>
            )}
          </div>
          <MiniCase count={drawn} have={draft?.have ?? new Map()} topDown={topDown} />
        </div>
      ) : saved && shelves.length > 0 ? (
        <p className="text-[13px] text-content-tertiary">
          {t('shelves_settings.hint_guessing', {
            count: saved.count,
            defaultValue: 'Left off, the bookcase is worked out from the shelf names. Right now that is {{count}} shelves, shelf 1 at the top.',
          })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="lb-btn sm" disabled={busy || !name.trim()} onClick={() => void save()}>
          {place ? t('common.save', { defaultValue: 'Save' }) : t('shelves_settings.create', { defaultValue: 'Add place' })}
        </button>
        <button type="button" className="lb-btn ghost sm" disabled={busy} onClick={() => onSelect(null)}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </button>
        {place && (
          <button type="button" className="lb-btn ghost sm" disabled={busy} onClick={() => onSelect({ newIn: place.id })}>
            {t('shelves_settings.add_inside', { defaultValue: 'Add a place inside' })}
          </button>
        )}
        {notice && <span className="text-[13px] font-semibold text-accent" role="status">{notice}</span>}
        {place && (
          <button type="button" className="lb-btn ghost sm ml-auto" disabled={busy}
            style={{ color: 'var(--color-danger)' }} onClick={() => void remove()}>
            {t('common.delete', { defaultValue: 'Delete' })}
          </button>
        )}
      </div>
      {place && shelves.length > 0 && (
        <p className="-mt-2 text-xs text-content-tertiary">
          {t('shelves_settings.delete_note', { defaultValue: 'Deleting this moves the places inside it to the top level. It never deletes them.' })}
        </p>
      )}
    </section>
  )
}

/** The bookcase drawn small: numbered rows, dashed where no place exists yet. */
function MiniCase({ count, have, topDown }: { count: number; have: Map<number, CopyLocation>; topDown: boolean }) {
  const { t } = useTranslation()
  const W = 120
  const rowH = Math.max(8, Math.min(18, 200 / count))
  const H = count * rowH + 8
  return (
    <svg className="block h-auto w-full text-content-tertiary" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={t('shelves_settings.preview', { count, defaultValue: 'Preview, {{count}} shelves' })}>
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {Array.from({ length: count }, (_, i) => {
        const num = topDown ? i + 1 : count - i
        const y = 4 + i * rowH
        const known = have.has(num)
        return (
          <g key={num}>
            <text x="6" y={y + rowH / 2 + 3.5} fontSize={Math.min(10, rowH - 1)} fontWeight="700" fill="currentColor">{num}</text>
            <rect x="24" y={y + 2} width={W - 30} height={rowH - 4} rx="2"
              fill={known ? 'var(--color-accent)' : 'none'} opacity={known ? 0.35 : 1}
              stroke={known ? 'none' : 'currentColor'} strokeDasharray="3 3" />
          </g>
        )
      })}
    </svg>
  )
}
