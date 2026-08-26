// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Shelves: where a physical copy actually sits.
//
// A tree, because that is how a house is: a room holds a bookcase, a bookcase
// holds a shelf. Filing a copy on the shelf makes it findable under all three,
// which is what separates this from a list. A list is a set you pick; a shelf
// is a fact about the object.
//
// Per library, because a place belongs to the collection it holds.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import PageHeader from '../../components/PageHeader'
import type { CopyLocation, Library } from '../../types'

export default function ShelvesPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('settings_nav.shelves', { defaultValue: 'Shelves' }))

  const [params, setParams] = useSearchParams()
  const [libraries, setLibraries] = useState<Library[]>([])
  const [places, setPlaces] = useState<CopyLocation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

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

  const reset = () => { setName(''); setParent(''); setEditingId(null) }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || !libraryId) return
    setBusy(true)
    setError(null)
    try {
      if (editingId) {
        // parent_id is always sent, so moving to the top is expressible: an
        // absent key means leave it where it is, which cannot say "nowhere".
        await callApi(`/api/v1/locations/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: trimmed, parent_id: parent || null }),
        })
      } else {
        await callApi(`/api/v1/libraries/${libraryId}/locations`, {
          method: 'POST',
          body: JSON.stringify({ name: trimmed, parent_id: parent || null }),
        })
      }
      reset()
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (p: CopyLocation) => {
    setBusy(true)
    setError(null)
    try {
      await callApi(`/api/v1/locations/${p.id}`, { method: 'DELETE' })
      if (editingId === p.id) reset()
      await load()
    } catch (e) {
      // The server refuses while copies are still filed there, which is the
      // right answer: a copy whose location silently became null is a book you
      // cannot find. Say why rather than looking broken.
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** Depth of each place, for indenting. The list arrives parents-first. */
  const depthOf = (p: CopyLocation, all: CopyLocation[]): number => {
    let depth = 0
    let at = p.parent_id
    // Bounded for the same reason the query is: a loop in the data must not
    // hang the page that would let someone fix it.
    while (at && depth < 16) {
      depth++
      at = all.find(x => x.id === at)?.parent_id ?? null
    }
    return depth
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
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

      {error && (
        <p className="mb-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {libraries.length > 1 && (
        <select
          className="lb-field mb-4"
          style={{ width: 'auto' }}
          value={libraryId}
          onChange={e => setParams({ lib: e.target.value }, { replace: true })}
          aria-label={t('shelves_settings.library', { defaultValue: 'Library' })}
        >
          {libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}

      <section className="mb-8 rounded-xl border border-line bg-surface p-4">
        <h2 className="lb-eyebrow mb-3">
          {editingId
            ? t('shelves_settings.editing', { name, defaultValue: `Editing ${name}` })
            : t('shelves_settings.new', { defaultValue: 'New place' })}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="lb-field flex-1"
            style={{ minWidth: '12rem' }}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void save() }}
            placeholder={t('shelves_settings.name', { defaultValue: 'Office, Bookcase, Top shelf…' })}
            aria-label={t('shelves_settings.name', { defaultValue: 'Name' })}
          />
          <select
            className="lb-field"
            style={{ width: 'auto' }}
            value={parent}
            onChange={e => setParent(e.target.value)}
            aria-label={t('shelves_settings.inside', { defaultValue: 'Inside' })}
          >
            <option value="">{t('shelves_settings.top', { defaultValue: 'Not inside anything' })}</option>
            {(places ?? [])
              // A place cannot be moved inside itself. The server refuses the
              // rest of the cycle; this keeps the obvious case off the menu.
              .filter(p => p.id !== editingId)
              .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" className="lb-btn sm" disabled={busy || !name.trim()}
            onClick={() => void save()}>
            {editingId
              ? t('common.save', { defaultValue: 'Save' })
              : t('shelves_settings.create', { defaultValue: 'Add place' })}
          </button>
          {editingId && (
            <button type="button" className="lb-btn ghost sm" onClick={reset}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
          )}
        </div>
      </section>

      {places === null ? null : places.length === 0 ? (
        <p className="text-sm text-content-tertiary">
          {t('shelves_settings.empty', { defaultValue: 'Nowhere recorded yet.' })}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {places.map(p => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1" style={{ paddingLeft: `${depthOf(p, places) * 1.25}rem` }}>
                <Link to={`/books?location=${p.id}`} className="text-sm text-content hover:text-accent">
                  {p.name}
                </Link>
              </div>
              <span className="text-xs tabular-nums text-content-tertiary">
                {t('shelves_settings.count', {
                  count: p.copy_count,
                  defaultValue: '1 copy',
                  defaultValue_other: `${p.copy_count} copies`,
                })}
              </span>
              <button type="button" className="lb-btn ghost sm" disabled={busy}
                onClick={() => { setEditingId(p.id); setName(p.name); setParent(p.parent_id ?? '') }}>
                {t('common.edit', { defaultValue: 'Edit' })}
              </button>
              <button type="button" className="lb-btn ghost sm" disabled={busy}
                style={{ color: 'var(--color-danger)' }} onClick={() => void remove(p)}>
                {t('common.delete', { defaultValue: 'Delete' })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
