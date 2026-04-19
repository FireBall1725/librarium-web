// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../auth/AuthContext'
import type { SuggestionView } from '../types'
import SuggestionCard from './SuggestionCard'

interface SuggestionsWidgetProps {
  type: 'buy' | 'read_next'
  limit?: number
}

// SuggestionsWidget renders a dashboard row of AI-generated suggestions for a
// single type. It is hidden entirely when the list is empty so a fresh install
// stays clean (per the feature plan: no placeholder noise).
export default function SuggestionsWidget({ type, limit = 5 }: SuggestionsWidgetProps) {
  const { callApi } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [items, setItems] = useState<SuggestionView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    callApi<SuggestionView[]>(`/api/v1/me/suggestions?type=${type}&status=new`)
      .then(data => {
        if (!cancelled) setItems(data ?? [])
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [callApi, type, t])

  const handleChanged = useCallback((id: string, status: string | null) => {
    setItems(prev => {
      if (prev === null) return prev
      if (status === null) return prev.filter(s => s.id !== id)
      return prev.map(s => (s.id === id ? { ...s, status } : s))
    })
  }, [])

  // Hide entirely on error, while loading, or when empty — suggestions are
  // additive. No point shouting about a failed load on the main dashboard.
  if (error || items === null || items.length === 0) return null

  const title = type === 'buy' ? t('suggestions.buy_title') : t('suggestions.read_next_title')
  const visible = items.slice(0, limit)

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
        <Link
          to={`/suggestions?type=${type}`}
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t('suggestions.see_all')}
        </Link>
      </div>
      <div className="px-5 pb-5 flex gap-3 overflow-x-auto scrollbar-thin">
        {visible.map(s => (
          <SuggestionCard key={s.id} suggestion={s} onChanged={handleChanged} />
        ))}
      </div>
    </div>
  )
}
