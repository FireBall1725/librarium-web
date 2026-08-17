// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Who can see a library, and what they can do in it.
//
// Moved out of the per-library folder, which is being retired. Membership was
// the one section there that genuinely belonged to a library rather than to
// browsing: the roles are named library_owner, library_editor and
// library_viewer, and "members" with no library in scope is just the instance
// user list, which already exists under People.
//
// So it keeps its per-library shape and takes a library picker, rather than
// becoming a cross-library list of grants that nobody thinks in terms of.
//
// Role editing is new here. The API has had PATCH
// /libraries/{id}/members/{user_id} since the beginning and nothing ever called
// it, so the only way to change someone's role was to remove them and add them
// back.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { ApiError, useAuth } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import { SettingsBody } from '../../components/settings/SettingRow'
import { ConfirmDialog } from '../../components/Dialog'
import { usePageTitle } from '../../hooks/usePageTitle'
import { libraryColour } from '../../lib/libraryColour'
import { NO_AUTOFILL } from '../../lib/formHints'
import type { Library, LibraryMember } from '../../types'

interface UserResult {
  id: string
  username: string
  display_name: string
  email: string
}

/**
 * The roles a member can hold.
 *
 * Hard-coded because the API names them in the path of every permission check
 * rather than serving them from a table; a fetched list would imply they are
 * configurable, and they are not.
 */
const ROLES = ['library_owner', 'library_editor', 'library_viewer'] as const

export default function MembersPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('settings_nav.members', { defaultValue: 'Members' }))

  const [params, setParams] = useSearchParams()
  const [libraries, setLibraries] = useState<Library[]>([])
  const [members, setMembers] = useState<LibraryMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [removing, setRemoving] = useState<LibraryMember | null>(null)

  useEffect(() => {
    let cancelled = false
    callApi<Library[]>('/api/v1/libraries')
      .then(l => { if (!cancelled) setLibraries(l ?? []) })
      .catch(() => { if (!cancelled) setLibraries([]) })
    return () => { cancelled = true }
  }, [callApi])

  // Which library is being administered. From the URL when it says, so the
  // retired /libraries/{id}/members redirects straight to the right one, and
  // otherwise the first library.
  //
  // Derived rather than written back into the URL by an effect: rewriting the
  // address on arrival would put a redirect in the history for a choice the
  // reader never made.
  const libraryId = params.get('lib') || libraries[0]?.id || ''

  const load = useCallback(async () => {
    if (!libraryId) return
    try {
      const ms = await callApi<LibraryMember[]>(`/api/v1/libraries/${libraryId}/members`)
      setMembers(ms ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      setMembers([])
    }
  }, [callApi, libraryId])

  useEffect(() => { void load() }, [load])

  const changeRole = async (m: LibraryMember, role: string) => {
    setError(null)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/members/${m.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      setNotice(t('members.role_changed', {
        name: m.display_name || m.username,
        defaultValue: `${m.display_name || m.username}'s role changed`,
      }))
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  const remove = async (m: LibraryMember) => {
    setError(null)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/members/${m.user_id}`, { method: 'DELETE' })
      setNotice(t('members.removed', {
        name: m.display_name || m.username,
        defaultValue: `${m.display_name || m.username} removed`,
      }))
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  const roleLabel = (role: string) =>
    t(`members.role.${role}`, { defaultValue: role.replace('library_', '') })

  return (
    <>
      <PageHeader
        title={t('settings_nav.members', { defaultValue: 'Members' })}
        description={t('members.description', {
          defaultValue: 'Who can see each library, and what they can do in it.',
        })}
      />

      <SettingsBody>
        {libraries.length === 0 ? (
          <p className="text-sm text-content-muted">
            {t('members.no_libraries', { defaultValue: 'No libraries yet.' })}
          </p>
        ) : (
          <>
            {/* Only when there is a choice to make. One library and a picker is
                a control that asks a question with one answer. */}
            {libraries.length > 1 && (
              <div className="mb-5 flex flex-wrap gap-1.5">
                {libraries.map(l => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(params)
                      next.set('lib', l.id)
                      setParams(next, { replace: true })
                      setNotice(null)
                    }}
                    aria-pressed={l.id === libraryId}
                    className={`lb-chip ${l.id === libraryId ? 'on' : ''}`}
                  >
                    {/* Sized here rather than with .swatchdot, which the
                        reference stylesheet scopes to .lb-navrow and which
                        therefore renders at zero size anywhere else. */}
                    <span className="mr-1.5 inline-block h-[9px] w-[9px] rounded-[2px] align-middle"
                      style={{ background: libraryColour(l.id) }} />
                    {l.name}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger-strong">
                {error}
              </div>
            )}
            {notice && (
              <div className="mb-4 rounded-lg border border-line bg-surface-inset px-3 py-2 text-sm text-content-secondary">
                {notice}
              </div>
            )}

            <AddMember libraryId={libraryId} onAdded={m => { setNotice(m); void load() }} />

            {members === null ? (
              <p className="text-sm text-content-muted">
                {t('common.loading', { defaultValue: 'Loading…' })}
              </p>
            ) : (
              <ul className="mt-5">
                {members.map(m => (
                  <li key={m.user_id} className="lb-rowitem flex-wrap">
                    <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <span className="block truncate text-[14px] text-content">
                        {m.display_name || m.username}
                        <span className="ml-1.5 text-content-muted">@{m.username}</span>
                      </span>
                      <span className="block truncate text-[11px] text-content-tertiary">
                        {m.email}
                      </span>
                    </span>

                    {/* The owner's role is fixed. Demoting the only owner would
                        leave a library nobody can administer, and there is no
                        ownership transfer to offer instead. */}
                    {m.role === 'library_owner' ? (
                      <span className="lb-chip flex-none">{roleLabel(m.role)}</span>
                    ) : (
                      <>
                        <select
                          className="lb-field flex-none"
                          style={{ width: 'auto' }}
                          value={m.role}
                          onChange={e => void changeRole(m, e.target.value)}
                          aria-label={t('members.role_for', {
                            name: m.display_name || m.username,
                            defaultValue: `Role for ${m.display_name || m.username}`,
                          })}
                        >
                          {ROLES.map(r => (
                            <option key={r} value={r} disabled={r === 'library_owner'}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="lb-btn ghost sm flex-none"
                          style={{ color: 'var(--color-danger)' }}
                          onClick={() => setRemoving(m)}
                        >
                          {t('members.remove', { defaultValue: 'Remove' })}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SettingsBody>

      <ConfirmDialog
        open={removing !== null}
        title={t('members.remove_title', {
          name: removing?.display_name || removing?.username || '',
          defaultValue: `Remove ${removing?.display_name || removing?.username}?`,
        })}
        description={t('members.remove_note', {
          defaultValue: 'They lose access to this library. Their account is not affected.',
        })}
        confirmLabel={t('members.remove', { defaultValue: 'Remove' })}
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const m = removing
          setRemoving(null)
          if (m) void remove(m)
        }}
      />
    </>
  )
}

/**
 * Search the instance's users and grant one of them access.
 *
 * Search rather than a dropdown of everyone: the instance user list has no
 * upper bound, and the endpoint already requires two characters before it
 * answers.
 */
function AddMember({ libraryId, onAdded }: { libraryId: string; onAdded: (notice: string) => void }) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserResult[]>([])
  const [picked, setPicked] = useState<UserResult | null>(null)
  const [role, setRole] = useState<string>('library_viewer')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (picked || query.trim().length < 2) { setResults([]); return }
    const handle = setTimeout(() => {
      callApi<UserResult[]>(`/api/v1/users?q=${encodeURIComponent(query.trim())}`)
        .then(r => setResults(r ?? []))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(handle)
  }, [query, picked, callApi])

  const submit = async () => {
    if (!picked) return
    setBusy(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: picked.id, role }),
      })
      onAdded(t('members.added', {
        name: picked.display_name || picked.username,
        defaultValue: `${picked.display_name || picked.username} added`,
      }))
      setPicked(null)
      setQuery('')
    } catch {
      /* The list reloads either way; a failure shows as the member not being in it. */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={box} className="flex flex-wrap items-center gap-2">
      {picked ? (
        <span className="lb-chip on">
          {picked.display_name || picked.username}
          <button type="button" className="ml-1.5" onClick={() => { setPicked(null); setQuery('') }}
            aria-label={t('common.cancel', { defaultValue: 'Cancel' })}>×</button>
        </span>
      ) : (
        <span className="relative">
          <input
            className="lb-field"
            style={{ width: '15rem' }}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('members.search', { defaultValue: 'Find someone by name or email…' })}
            {...NO_AUTOFILL}
          />
          {results.length > 0 && (
            <ul className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
              {results.map(u => (
                <li key={u.id}>
                  <button type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-muted"
                    onClick={() => { setPicked(u); setResults([]) }}>
                    {u.display_name || u.username}
                    <span className="ml-1.5 text-content-muted">@{u.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
      )}

      <select className="lb-field" style={{ width: 'auto' }}
        value={role} onChange={e => setRole(e.target.value)}
        aria-label={t('members.role_label', { defaultValue: 'Role' })}>
        {ROLES.filter(r => r !== 'library_owner').map(r => (
          <option key={r} value={r}>
            {t(`members.role.${r}`, { defaultValue: r.replace('library_', '') })}
          </option>
        ))}
      </select>

      <button type="button" className="lb-btn sm" disabled={!picked || busy} onClick={() => void submit()}>
        {t('members.add', { defaultValue: 'Add member' })}
      </button>
    </div>
  )
}
