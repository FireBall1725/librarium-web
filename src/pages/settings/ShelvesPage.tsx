// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Making and naming shelves.
//
// A shelf is a hand-picked set of books scoped to one library, which is a tag
// with an icon and a description; putting books ON a shelf is a filter and a
// bulk action, and neither belongs on a settings page. What is left is the
// vocabulary itself: create, rename, recolour, delete. That is the same job the
// Tags page does, so it sits beside it and works the same way.
//
// The per-library Shelves page this replaces browsed and edited in one screen.
// Browsing moved to the rail when a shelf became a filter, and that page lost
// its last link, so this is the only way to make one.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { ApiError, useAuth } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import { SettingRow, SettingsBody } from '../../components/settings/SettingRow'
import { ConfirmDialog } from '../../components/Dialog'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Icon } from '../../lib/icons'
import { SHELF_ICONS, shelfIcon } from '../../lib/shelfIcons'
import { TAG_COLORS } from '../../lib/tagColours'
import { NO_AUTOFILL } from '../../lib/formHints'
import type { Library, Shelf } from '../../types'

interface Draft {
  name: string
  description: string
  color: string
  icon: string
  /**
   * Carried through an edit rather than left out.
   *
   * The PUT replaces the record and display_order is an int, so omitting it
   * sends a zero and quietly moves the shelf to the top of the rail. tag_ids is
   * the opposite: the service only touches tags when the field is present, so
   * this page leaves it out and a shelf keeps its tags.
   */
  displayOrder: number
}

const emptyDraft = (): Draft => ({ name: '', description: '', color: '', icon: 'tag', displayOrder: 0 })

export default function ShelvesPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('settings_nav.shelves', { defaultValue: 'Shelves' }))

  const [params, setParams] = useSearchParams()
  const [libraries, setLibraries] = useState<Library[]>([])
  const [shelves, setShelves] = useState<Shelf[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Shelf | null>(null)

  useEffect(() => {
    let cancelled = false
    callApi<Library[]>('/api/v1/libraries')
      .then(l => { if (!cancelled) setLibraries((l ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))) })
      .catch(() => { if (!cancelled) setLibraries([]) })
    return () => { cancelled = true }
  }, [callApi])

  // Derived, not written back by an effect, so arriving here does not push a
  // redirect into the history for a choice nobody made.
  const libraryId = params.get('lib') || libraries[0]?.id || ''

  const load = useCallback(async () => {
    if (!libraryId) return
    try {
      const list = await callApi<Shelf[]>(`/api/v1/libraries/${libraryId}/shelves`)
      setShelves(list ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      setShelves([])
    }
  }, [callApi, libraryId])

  useEffect(() => { void load() }, [load])

  const reset = () => { setDraft(emptyDraft()); setEditingId(null) }

  const save = async () => {
    const name = draft.name.trim()
    if (!name || !libraryId) return
    setBusy(true)
    setError(null)
    try {
      const body = JSON.stringify({
        name,
        description: draft.description.trim(),
        color: draft.color,
        icon: draft.icon,
        display_order: draft.displayOrder,
      })
      if (editingId) {
        await callApi(`/api/v1/libraries/${libraryId}/shelves/${editingId}`, { method: 'PUT', body })
      } else {
        await callApi(`/api/v1/libraries/${libraryId}/shelves`, { method: 'POST', body })
      }
      reset()
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (sh: Shelf) => {
    setError(null)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/shelves/${sh.id}`, { method: 'DELETE' })
      if (editingId === sh.id) reset()
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  const edit = (sh: Shelf) => {
    setEditingId(sh.id)
    setDraft({
      name: sh.name,
      description: sh.description ?? '',
      color: sh.color ?? '',
      icon: shelfIcon(sh.icon),
      displayOrder: sh.display_order,
    })
  }

  return (
    <>
      <PageHeader
        title={t('settings_nav.shelves', { defaultValue: 'Shelves' })}
        description={t('shelves_settings.description', {
          defaultValue: 'Shelves belong to a library, not to the instance, so each library keeps its own set.',
        })}
        breadcrumbs={[
          { label: t('nav.settings', { defaultValue: 'Settings' }), to: '/settings' },
          { label: t('settings_nav.shelves', { defaultValue: 'Shelves' }) },
        ]}
      />

      <SettingsBody>
        <SettingRow
          label={t('shelves_settings.library', { defaultValue: 'Library' })}
          description={t('shelves_settings.library_hint', {
            defaultValue: 'Shelves are per-library. Pick which set you are editing.',
          })}
        >
          <select
            className="lb-field"
            value={libraryId}
            onChange={e => {
              const next = new URLSearchParams(params)
              next.set('lib', e.target.value)
              setParams(next, { replace: true })
              reset()
            }}
            disabled={libraries.length === 0}
            aria-label={t('shelves_settings.library', { defaultValue: 'Library' })}
          >
            {libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </SettingRow>

        {error && (
          <p className="my-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {libraryId && (
          <>
            <div className="mt-6 rounded-xl border border-line p-4">
              <h2 className="mb-3 text-sm font-semibold text-content">
                {editingId
                  ? t('shelves_settings.editing', { name: draft.name, defaultValue: `Editing ${draft.name}` })
                  : t('shelves_settings.new', { defaultValue: 'New shelf' })}
              </h2>

              <div className="flex flex-wrap items-start gap-3">
                <input
                  className="lb-field"
                  style={{ width: '14rem' }}
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder={t('shelves_settings.name', { defaultValue: 'Name' })}
                  aria-label={t('shelves_settings.name', { defaultValue: 'Name' })}
                  {...NO_AUTOFILL}
                />
                <input
                  className="lb-field"
                  style={{ width: '20rem' }}
                  value={draft.description}
                  onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                  placeholder={t('shelves_settings.note', { defaultValue: 'What goes on it (optional)' })}
                  aria-label={t('shelves_settings.note', { defaultValue: 'What goes on it (optional)' })}
                  {...NO_AUTOFILL}
                />
                <select
                  className="lb-field"
                  style={{ width: 'auto' }}
                  value={draft.color}
                  onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                  aria-label={t('shelves_settings.colour', { defaultValue: 'Colour' })}
                >
                  {TAG_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              {/* The same icons the rail draws, so what you pick is what you
                  see. Tinted with the shelf's own colour while selected. */}
              <div className="mt-3 flex flex-wrap gap-1">
                {SHELF_ICONS.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, icon: name }))}
                    aria-label={name}
                    aria-pressed={draft.icon === name}
                    className={`rounded-md border p-1.5 transition-colors ${
                      draft.icon === name
                        ? 'border-accent bg-accent-surface text-accent'
                        : 'border-line-strong text-content-tertiary hover:bg-surface-inset'
                    }`}
                    style={draft.icon === name && draft.color ? { color: draft.color } : undefined}
                  >
                    <Icon name={name} size={16} className="" />
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button type="button" className="lb-btn sm"
                  disabled={busy || !draft.name.trim()} onClick={() => void save()}>
                  {editingId
                    ? t('common.save', { defaultValue: 'Save' })
                    : t('shelves_settings.create', { defaultValue: 'Create shelf' })}
                </button>
                {editingId && (
                  <button type="button" className="lb-btn ghost sm" onClick={reset}>
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </button>
                )}
              </div>
            </div>

            {shelves === null ? (
              <p className="mt-5 text-sm text-content-muted">
                {t('common.loading', { defaultValue: 'Loading…' })}
              </p>
            ) : shelves.length === 0 ? (
              <p className="mt-5 text-sm text-content-muted">
                {t('shelves_settings.empty', { defaultValue: 'No shelves in this library yet.' })}
              </p>
            ) : (
              <ul className="mt-5">
                {shelves.map(sh => (
                  <li key={sh.id} className="lb-rowitem flex-wrap">
                    {/* Sized explicitly. The default `ic` class takes its
                        dimensions from CSS scoped to .lb-navrow, so outside the
                        rail the svg falls back to filling its container. */}
                    <Icon name={shelfIcon(sh.icon)} size={18} className="flex-none"
                      style={sh.color ? { color: sh.color } : undefined} />
                    <span className="min-w-0 flex-1 basis-[60%] sm:basis-auto">
                      <span className="block truncate text-[14px] text-content">{sh.name}</span>
                      {sh.description && (
                        <span className="block truncate text-[11px] text-content-tertiary">
                          {sh.description}
                        </span>
                      )}
                    </span>
                    <span className="lb-chip flex-none">
                      {t('shelves_settings.count', {
                        count: sh.book_count,
                        defaultValue: `${sh.book_count} books`,
                      })}
                    </span>
                    <button type="button" className="lb-btn ghost sm flex-none" onClick={() => edit(sh)}>
                      {t('common.edit', { defaultValue: 'Edit' })}
                    </button>
                    <button type="button" className="lb-btn ghost sm flex-none"
                      style={{ color: 'var(--color-danger)' }}
                      onClick={() => setConfirmDelete(sh)}>
                      {t('common.delete', { defaultValue: 'Delete' })}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SettingsBody>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('shelves_settings.delete_title', {
          name: confirmDelete?.name ?? '',
          defaultValue: `Delete ${confirmDelete?.name}?`,
        })}
        description={t('shelves_settings.delete_note', {
          count: confirmDelete?.book_count ?? 0,
          defaultValue: 'The shelf goes; the books on it stay in the library.',
        })}
        confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const sh = confirmDelete
          setConfirmDelete(null)
          if (sh) void remove(sh)
        }}
      />
    </>
  )
}
