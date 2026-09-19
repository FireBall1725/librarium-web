// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import type { ContributorResult } from '../types'

export const CONTRIBUTOR_ROLES = [
  'author', 'artist', 'illustrator', 'writer', 'penciller', 'inker',
  'colorist', 'letterer', 'translator', 'editor', 'narrator',
]

interface Props {
  contributor: ContributorResult | null
  role: string
  onContributorChange: (c: ContributorResult | null) => void
  onRoleChange: (role: string) => void
  onRemove: () => void
  /** Offered on every row after the first. */
  onJoinAbove?: () => void
}

export default function ContributorRow({ contributor, role, onContributorChange, onRoleChange, onRemove, onJoinAbove }: Props) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContributorResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contributor || query.length < 2) { setResults([]); setShowDropdown(false); return }
    const t = setTimeout(async () => {
      try {
        const cs = await callApi<ContributorResult[]>(`/api/v1/contributors?q=${encodeURIComponent(query)}`)
        setResults(cs ?? [])
        setShowDropdown(true)
      } catch { setResults([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [query, contributor, callApi])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const createAndSelect = async () => {
    if (!query.trim()) return
    try {
      const c = await callApi<ContributorResult>('/api/v1/contributors', {
        method: 'POST',
        body: JSON.stringify({ name: query.trim() }),
      })
      onContributorChange(c)
      setQuery('')
      setShowDropdown(false)
    } catch { /* ignore */ }
  }

  return (
    <div className="flex gap-2 items-start">
      <div ref={ref} className="relative flex-1">
        {contributor ? (
          <div className="flex items-center gap-2 rounded-lg border border-accent-line bg-accent-surface px-3 py-2 h-9">
            <span className="flex-1 text-sm text-content truncate">{contributor.name}</span>
            {/* The name goes back into the box rather than vanishing, so a
                wrong name is an edit, not a retype. */}
            <button type="button" onClick={() => { setQuery(contributor.name); onContributorChange(null) }}
              aria-label={t('contributor_row.change', { name: contributor.name, defaultValue: 'Change {{name}}' })}
              className="text-content-subtle hover:text-content-tertiary text-lg leading-none flex-shrink-0">×</button>
          </div>
        ) : (
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            className="w-full h-9 rounded-lg border border-line-strong dark:bg-surface-raised dark:text-white px-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Search contributor…" />
        )}
        {showDropdown && (results.length > 0 || query.trim().length >= 2) && (
          <ul className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface-raised shadow-lg overflow-hidden">
            {results.map(c => (
              <li key={c.id}>
                <button type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { onContributorChange(c); setQuery(''); setShowDropdown(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent-surface transition-colors">{c.name}</button>
              </li>
            ))}
            {query.trim().length >= 2 && (
              <li>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={createAndSelect}
                  className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-accent-surface transition-colors border-t border-line-subtle">
                  + Create "{query.trim()}"
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <select value={role} onChange={e => onRoleChange(e.target.value)}
        className="h-9 rounded-lg border border-line-strong dark:bg-surface-raised dark:text-white px-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent">
        {CONTRIBUTOR_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
      </select>
      {onJoinAbove && contributor && (
        <button type="button" onClick={onJoinAbove}
          title={t('contributor_row.join_above', { defaultValue: 'Join with the name above' })}
          aria-label={t('contributor_row.join_above', { defaultValue: 'Join with the name above' })}
          className="h-9 px-2 text-content-subtle hover:text-accent transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      )}
      <button type="button" onClick={onRemove}
        aria-label={t('contributor_row.remove', { defaultValue: 'Remove' })}
        className="h-9 px-2 text-content-subtle hover:text-danger transition-colors text-lg leading-none">×</button>
    </div>
  )
}
