// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Contributors the catalogue believes are several people.
//
// An import spells a name three ways and the Authors page draws three cards,
// each looking like a minor contributor: R. A. Montgomery with eight books,
// R.A. Montgomery with four, R A Montgomery with two, where there is one author
// of fourteen.
//
// A review queue rather than a switch, because detection is an inference. The
// only signal that would settle it without a person is a shared external id,
// and contributors almost never carry one. So every group here is a guess from
// a name and needs somebody to agree with it.
//
// Instance admin, like the vocabulary pages beside it: contributors have no
// library_id, so folding two names together changes what every household on the
// server sees.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../../auth/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import PageHeader from '../../components/PageHeader'

interface Member {
  id: string
  name: string
  books: number
}

interface Candidate {
  key: string
  members: Member[]
}

export default function DuplicateAuthorsPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('settings_nav.duplicate_authors', { defaultValue: 'Duplicate authors' }))

  const [groups, setGroups] = useState<Candidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Which name survives each group. Nothing is preselected on purpose: the
  // obvious default would be whoever has most books, and on a real collection
  // that picks "R.A. Montgomery" over the properly spaced "R. A. Montgomery".
  // Book count says which spelling got used most, not which one is right.
  const [survivor, setSurvivor] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const r = await callApi<{ items: Candidate[] }>('/api/v1/admin/contributor-duplicates')
      setGroups(r?.items ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      setGroups([])
    }
  }, [callApi])

  useEffect(() => { void load() }, [load])

  const merge = async (g: Candidate) => {
    const keep = survivor[g.key]
    if (!keep) return
    setBusy(g.key)
    setError(null)
    try {
      const res = await callApi<{ credits: number; collapsed: number }>(
        '/api/v1/admin/contributor-duplicates/merge', {
          method: 'POST',
          body: JSON.stringify({
            survivor_id: keep,
            loser_ids: g.members.filter(m => m.id !== keep).map(m => m.id),
          }),
        })
      // What moved, said out loud. "Merged" alone leaves a reviewer checking
      // the arithmetic on the Authors page to find out whether it worked.
      setNotice(t('duplicate_authors.merged', {
        count: res?.credits ?? 0,
        name: g.members.find(m => m.id === keep)?.name ?? '',
        defaultValue: `Moved ${res?.credits ?? 0} credits`,
      }))
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const dismiss = async (g: Candidate) => {
    setBusy(g.key)
    setError(null)
    try {
      await callApi('/api/v1/admin/contributor-duplicates/dismiss', {
        method: 'POST',
        body: JSON.stringify({ ids: g.members.map(m => m.id) }),
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader
        title={t('settings_nav.duplicate_authors', { defaultValue: 'Duplicate authors' })}
        description={t('duplicate_authors.description', {
          defaultValue: 'Names that differ only by punctuation, or by the spacing between initials. Merging is reversible: the folded name is kept as a record of where it went rather than deleted.',
        })}
        breadcrumbs={[
          { label: t('nav.settings', { defaultValue: 'Settings' }), to: '/settings' },
          { label: t('settings_nav.duplicate_authors', { defaultValue: 'Duplicate authors' }) },
        ]}
      />

      {error && (
        <p className="mb-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg border border-success-line bg-success-surface px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}

      {groups === null ? null : groups.length === 0 ? (
        <p className="text-sm text-content-tertiary">
          {t('duplicate_authors.none', { defaultValue: 'Nothing looks duplicated.' })}
        </p>
      ) : (
        <ul className="space-y-4">
          {groups.map(g => {
            const keep = survivor[g.key]
            return (
              <li key={g.key} className="rounded-xl border border-line bg-surface p-4">
                <ul className="mb-3 space-y-1">
                  {g.members.map(m => (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-surface-inset">
                        <input
                          type="radio"
                          name={g.key}
                          checked={keep === m.id}
                          onChange={() => setSurvivor(s => ({ ...s, [g.key]: m.id }))}
                          className="accent-[var(--color-accent)]"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-content">{m.name}</span>
                        <span className="text-xs tabular-nums text-content-tertiary">
                          {t('duplicate_authors.books', {
                            count: m.books,
                            defaultValue: '1 book',
                            defaultValue_other: `${m.books} books`,
                          })}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="lb-btn sm"
                    disabled={!keep || busy === g.key}
                    title={keep ? undefined : t('duplicate_authors.pick_one', {
                      defaultValue: 'Choose which spelling to keep',
                    })}
                    onClick={() => void merge(g)}>
                    {t('duplicate_authors.merge', {
                      count: g.members.length - 1,
                      defaultValue: 'Merge 1 in',
                      defaultValue_other: `Merge ${g.members.length - 1} in`,
                    })}
                  </button>

                  {/* The reviewer has to be able to say no, or the nightly
                      sweep offers the same wrong answer every morning and the
                      queue becomes something nobody opens. */}
                  <button type="button" className="lb-btn ghost sm"
                    disabled={busy === g.key}
                    onClick={() => void dismiss(g)}>
                    {t('duplicate_authors.dismiss', {
                      defaultValue: 'Different people',
                    })}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
