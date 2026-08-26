// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Lists: hand-picked sets of books.
//
// A list is filled from the books themselves, on a book's own page or from a
// selection, because that is where you are when you decide a book belongs on
// one. This page exists for the parts that have no book in front of them:
// naming, recolouring, and throwing one away.
//
// It is also the only place an empty list is visible. The filter rail reads
// list membership, so a list with nothing on it has no row to render there.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import PageHeader from '../../components/PageHeader'
import { Icon } from '../../lib/icons'
import { LIST_ICONS } from '../../lib/listIcons'
import { TAG_COLORS } from '../../lib/tagColours'
import { announceListsChanged, fetchLists, listHref, listIcon, type SavedList } from '../../lib/lists'
import type { Library } from '../../types'

interface Draft {
  name: string
  description: string
  color: string
  icon: string
  /** A library id shares it with that library; empty keeps it to the owner. */
  sharedWith: string
}

const emptyDraft = (): Draft => ({ name: '', description: '', color: '', icon: 'tag', sharedWith: '' })

export default function ListsPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('settings_nav.lists', { defaultValue: 'Lists' }))

  const [lists, setLists] = useState<SavedList[] | null>(null)
  const [libraries, setLibraries] = useState<Library[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const all = await fetchLists(callApi)
      // Views are not managed here. They are a saved filter, made and edited
      // from the books page where the filter is.
      setLists(all.filter(l => l.kind === 'manual'))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      setLists([])
    }
  }, [callApi])

  // Guarded rather than calling load() straight from the effect body, which
  // sets state on the first pass and costs a second render before paint.
  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await load() })()
    return () => { cancelled = true }
  }, [load])

  useEffect(() => {
    let cancelled = false
    callApi<Library[]>('/api/v1/libraries')
      .then(l => { if (!cancelled) setLibraries((l ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))) })
      .catch(() => { /* Sharing is then not offered; the rest still works. */ })
    return () => { cancelled = true }
  }, [callApi])

  const reset = () => { setDraft(emptyDraft()); setEditingId(null) }

  const save = async () => {
    const name = draft.name.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      if (editingId) {
        // Sharing is not in the update body, so it is set once when the list is
        // made. Changing who can see an existing list needs an API change and
        // is deliberately not faked here.
        await callApi(`/api/v1/me/lists/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name, description: draft.description.trim(), color: draft.color, icon: draft.icon,
          }),
        })
      } else {
        await callApi('/api/v1/me/lists', {
          method: 'POST',
          body: JSON.stringify({
            name,
            description: draft.description.trim(),
            color: draft.color,
            icon: draft.icon,
            kind: 'manual',
            visibility: draft.sharedWith ? 'library' : 'private',
            shared_library_id: draft.sharedWith || null,
          }),
        })
      }
      reset()
      await load()
      announceListsChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const edit = (l: SavedList) => {
    setEditingId(l.id)
    setDraft({
      name: l.name, description: l.description, color: l.color,
      icon: l.icon || 'tag', sharedWith: l.shared_library_id ?? '',
    })
  }

  const remove = async (l: SavedList) => {
    // Asked because the books are not the thing at risk but the curation is:
    // rebuilding a hand-picked set means finding every book again.
    if (!confirm(t('lists_settings.delete_confirm', {
      name: l.name, count: l.book_count,
      defaultValue: `Delete ${l.name}? The ${l.book_count} books on it stay in your library.`,
    }))) return
    setBusy(true)
    try {
      await callApi(`/api/v1/me/lists/${l.id}`, { method: 'DELETE' })
      if (editingId === l.id) reset()
      await load()
      announceListsChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const libraryName = (id?: string | null) =>
    libraries.find(l => l.id === id)?.name ?? ''

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader
        title={t('settings_nav.lists', { defaultValue: 'Lists' })}
        description={t('lists_settings.description', {
          defaultValue: 'A list is a set of books you pick by hand. Fill one from a book\'s own page or from a selection; this page is for naming and tidying them.',
        })}
        breadcrumbs={[
          { label: t('nav.settings', { defaultValue: 'Settings' }), to: '/settings' },
          { label: t('settings_nav.lists', { defaultValue: 'Lists' }) },
        ]}
      />

      {error && (
        <p className="mb-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <section className="mb-8 rounded-xl border border-line bg-surface p-4">
        <h2 className="lb-eyebrow mb-3">
          {editingId
            ? t('lists_settings.editing', { name: draft.name, defaultValue: `Editing ${draft.name}` })
            : t('lists_settings.new', { defaultValue: 'New list' })}
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="lb-field flex-1"
            style={{ minWidth: '12rem' }}
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') void save() }}
            placeholder={t('lists_settings.name', { defaultValue: 'Name' })}
            aria-label={t('lists_settings.name', { defaultValue: 'Name' })}
          />
          <input
            className="lb-field flex-1"
            style={{ minWidth: '12rem' }}
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder={t('lists_settings.note', { defaultValue: 'What goes on it (optional)' })}
            aria-label={t('lists_settings.note', { defaultValue: 'What goes on it (optional)' })}
          />
          {/* Only when there is a choice to make. One library and the picker is
              a control with a single answer. */}
          {!editingId && libraries.length > 0 && (
            <select
              className="lb-field"
              style={{ width: 'auto' }}
              value={draft.sharedWith}
              onChange={e => setDraft(d => ({ ...d, sharedWith: e.target.value }))}
              aria-label={t('lists_settings.share', { defaultValue: 'Who can see it' })}
            >
              <option value="">{t('lists_settings.private', { defaultValue: 'Only me' })}</option>
              {libraries.map(l => (
                <option key={l.id} value={l.id}>
                  {t('lists_settings.shared_with', { name: l.name, defaultValue: `Shared with ${l.name}` })}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1">
          {LIST_ICONS.map(name => (
            <button key={name} type="button"
              onClick={() => setDraft(d => ({ ...d, icon: name }))}
              aria-label={name} aria-pressed={draft.icon === name}
              className={`rounded-md border p-1.5 transition-colors ${
                draft.icon === name
                  ? 'border-accent bg-accent-surface text-accent'
                  : 'border-line-strong text-content-tertiary hover:bg-surface-inset'
              }`}
              style={draft.icon === name && draft.color ? { color: draft.color } : undefined}>
              <Icon name={name} size={16} className="" />
            </button>
          ))}
          <span className="mx-2 h-5 w-px bg-line" />
          {TAG_COLORS.map(c => (
            <button key={c.value || 'none'} type="button"
              onClick={() => setDraft(d => ({ ...d, color: c.value }))}
              aria-label={c.label} aria-pressed={draft.color === c.value} title={c.label}
              className={`h-7 w-7 rounded-md border transition-colors ${
                draft.color === c.value ? 'border-accent' : 'border-line-strong hover:bg-surface-inset'
              }`}>
              <span className="mx-auto block h-3.5 w-3.5 rounded-full border border-line"
                style={c.value ? { backgroundColor: c.value, borderColor: c.value } : undefined} />
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="lb-btn sm" disabled={busy || !draft.name.trim()}
            onClick={() => void save()}>
            {editingId
              ? t('common.save', { defaultValue: 'Save' })
              : t('lists_settings.create', { defaultValue: 'Create list' })}
          </button>
          {editingId && (
            <button type="button" className="lb-btn ghost sm" onClick={reset}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
          )}
        </div>
      </section>

      {lists === null ? null : lists.length === 0 ? (
        <p className="text-sm text-content-tertiary">
          {t('lists_settings.empty', { defaultValue: 'No lists yet.' })}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {lists.map(l => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              <Icon name={listIcon(l)} size={16} style={l.color ? { color: l.color } : undefined} />
              <div className="min-w-0 flex-1">
                <Link to={listHref(l)} className="text-sm text-content hover:text-accent">{l.name}</Link>
                <div className="text-xs text-content-tertiary">
                  {l.visibility === 'library'
                    ? t('lists_settings.shared_with', {
                        name: libraryName(l.shared_library_id),
                        defaultValue: `Shared with ${libraryName(l.shared_library_id)}`,
                      })
                    : t('lists_settings.private', { defaultValue: 'Only me' })}
                  {l.description ? ` · ${l.description}` : ''}
                </div>
              </div>
              <span className="text-xs tabular-nums text-content-tertiary">
                {t('lists_settings.count', {
                  count: l.book_count,
                  defaultValue: '1 book',
                  defaultValue_other: `${l.book_count} books`,
                })}
              </span>
              <button type="button" className="lb-btn ghost sm" disabled={busy} onClick={() => edit(l)}>
                {t('common.edit', { defaultValue: 'Edit' })}
              </button>
              <button type="button" className="lb-btn ghost sm" disabled={busy}
                style={{ color: 'var(--color-danger)' }} onClick={() => void remove(l)}>
                {t('common.delete', { defaultValue: 'Delete' })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
