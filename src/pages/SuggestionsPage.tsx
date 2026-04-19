// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import SuggestionCard from '../components/SuggestionCard'
import { usePageTitle } from '../hooks/usePageTitle'
import type { SuggestionView } from '../types'

type TypeFilter = 'all' | 'buy' | 'read_next'

// SuggestionsPage is the /suggestions overflow surface: users land here from
// the dashboard widget's "See all" link and can also trigger a user-scoped
// regen. The dashboard remains the primary surface.
export default function SuggestionsPage() {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const { t } = useTranslation(['dashboard', 'common'])
  usePageTitle(t('suggestions_page.title'))

  const [searchParams, setSearchParams] = useSearchParams()
  const filter = (searchParams.get('type') as TypeFilter | null) ?? 'all'

  const [items, setItems] = useState<SuggestionView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const reload = useCallback(() => {
    setItems(null)
    setError(null)
    callApi<SuggestionView[]>('/api/v1/me/suggestions?status=new')
      .then(data => setItems(data ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t])

  useEffect(() => {
    reload()
  }, [reload])

  const handleChanged = useCallback((id: string, status: string | null) => {
    setItems(prev => {
      if (prev === null) return prev
      if (status === null) return prev.filter(s => s.id !== id)
      return prev.map(s => (s.id === id ? { ...s, status } : s))
    })
  }, [])

  const setFilter = (next: TypeFilter) => {
    if (next === 'all') {
      searchParams.delete('type')
    } else {
      searchParams.set('type', next)
    }
    setSearchParams(searchParams, { replace: true })
  }

  const runNow = async () => {
    setRunning(true)
    try {
      await callApi('/api/v1/me/suggestions/run', { method: 'POST' })
      showToast(t('suggestions_page.run_queued'), { variant: 'success' })
      // Worker is async; results land when the run completes. We refetch
      // immediately so in-flight card removals don't leave stale state, but
      // fresh suggestions may take a beat.
      reload()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('suggestions_page.run_failed')
      showToast(msg, { variant: 'error' })
    } finally {
      setRunning(false)
    }
  }

  const filtered = useMemo(() => {
    if (items === null) return null
    if (filter === 'all') return items
    return items.filter(s => s.type === filter)
  }, [items, filter])

  const buyCount = useMemo(() => items?.filter(s => s.type === 'buy').length ?? 0, [items])
  const readNextCount = useMemo(() => items?.filter(s => s.type === 'read_next').length ?? 0, [items])

  return (
    <>
      <PageHeader
        title={t('suggestions_page.title')}
        description={t('suggestions_page.description')}
        actions={
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
          >
            {running ? t('suggestions_page.running') : t('suggestions_page.run_now')}
          </button>
        }
      />
      <div className="p-4 sm:p-6 space-y-4 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2">
          <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('suggestions_page.filters.all', { count: items?.length ?? 0 })}
          </FilterTab>
          <FilterTab active={filter === 'read_next'} onClick={() => setFilter('read_next')}>
            {t('suggestions_page.filters.read_next', { count: readNextCount })}
          </FilterTab>
          <FilterTab active={filter === 'buy'} onClick={() => setFilter('buy')}>
            {t('suggestions_page.filters.buy', { count: buyCount })}
          </FilterTab>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : filtered === null ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[2/3] rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
                <div className="h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                <div className="h-2 w-2/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {t('suggestions_page.empty.title')}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('suggestions_page.empty.hint')}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {filtered.map(s => (
              <SuggestionCard key={s.id} suggestion={s} onChanged={handleChanged} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-blue-600 text-white px-3 py-1.5 text-xs font-medium'
          : 'rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 px-3 py-1.5 text-xs font-medium transition-colors'
      }
    >
      {children}
    </button>
  )
}
