// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
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
}

export default function ContributorRow({ contributor, role, onContributorChange, onRoleChange, onRemove }: Props) {
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
          <div className="flex items-center gap-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 h-9">
            <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{contributor.name}</span>
            <button type="button" onClick={() => { onContributorChange(null); setQuery('') }}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none flex-shrink-0">×</button>
          </div>
        ) : (
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            className="w-full h-9 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Search contributor…" />
        )}
        {showDropdown && (results.length > 0 || query.trim().length >= 2) && (
          <ul className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
            {results.map(c => (
              <li key={c.id}>
                <button type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { onContributorChange(c); setQuery(''); setShowDropdown(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">{c.name}</button>
              </li>
            ))}
            {query.trim().length >= 2 && (
              <li>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={createAndSelect}
                  className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-t border-gray-100 dark:border-gray-700">
                  + Create "{query.trim()}"
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <select value={role} onChange={e => onRoleChange(e.target.value)}
        className="h-9 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
        {CONTRIBUTOR_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
      </select>
      <button type="button" onClick={onRemove}
        className="h-9 px-2 text-gray-400 hover:text-red-500 transition-colors text-lg leading-none">×</button>
    </div>
  )
}
