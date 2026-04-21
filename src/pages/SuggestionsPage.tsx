// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import SuggestionCard from '../components/SuggestionCard'
import { usePageTitle } from '../hooks/usePageTitle'
import type { SuggestionView } from '../types'

type TypeFilter = 'all' | 'buy' | 'read_next' | 'saved'

type RunView = {
  id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  started_at: string
  finished_at?: string
}

type QuotaView = {
  used: number
  limit: number
  resets_at?: string
  unlimited: boolean
}

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
  const isSaved = filter === 'saved'

  // Keep the two status buckets in separate state so tab counts stay accurate
  // regardless of which tab is active — the All/Read next/Buy counts are all
  // drawn from newItems, Saved is drawn from savedItems.
  const [newItems, setNewItems] = useState<SuggestionView[] | null>(null)
  const [savedItems, setSavedItems] = useState<SuggestionView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [quota, setQuota] = useState<QuotaView | null>(null)
  const [activeRun, setActiveRun] = useState<RunView | null>(null)
  const [activeEventCount, setActiveEventCount] = useState<number>(0)
  // Track the last-seen running run so we can detect the running→completed
  // transition and refresh items/quota when it finishes.
  const lastRunningIdRef = useRef<string | null>(null)

  const reload = useCallback(() => {
    setError(null)
    Promise.all([
      callApi<SuggestionView[]>('/api/v1/me/suggestions?status=new'),
      callApi<SuggestionView[]>('/api/v1/me/suggestions?status=interested'),
    ])
      .then(([fresh, saved]) => {
        setNewItems(fresh ?? [])
        setSavedItems(saved ?? [])
      })
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t])

  useEffect(() => {
    reload()
  }, [reload])

  const refreshQuota = useCallback(() => {
    callApi<QuotaView>('/api/v1/me/suggestions/quota')
      .then(data => setQuota(data ?? null))
      .catch(() => {})
  }, [callApi])

  useEffect(() => {
    refreshQuota()
  }, [refreshQuota])

  // Poll for in-flight runs so we can show progress and auto-refresh items
  // when a run finishes (covers /run-now kicked from here as well as runs
  // started by the scheduler or another device).
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      let runs: RunView[] | undefined
      try {
        runs = await callApi<RunView[]>('/api/v1/me/suggestions/runs')
      } catch {
        return
      }
      if (cancelled) return
      const inflight = runs?.find(r => r.status === 'running') ?? null
      setActiveRun(inflight)
      if (inflight) {
        lastRunningIdRef.current = inflight.id
        try {
          const detail = await callApi<{ run: RunView; events: unknown[] }>(`/api/v1/me/suggestions/runs/${inflight.id}`)
          if (!cancelled) setActiveEventCount(detail?.events?.length ?? 0)
        } catch {
          // Leave the previous count if the detail fetch transiently fails.
        }
      } else if (lastRunningIdRef.current !== null) {
        // Just transitioned running → done; refresh everything.
        lastRunningIdRef.current = null
        setActiveEventCount(0)
        reload()
        refreshQuota()
      }
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [callApi, reload, refreshQuota])

  const handleChanged = useCallback(() => {
    // Status changes (interested / dismissed / added / block) shuffle a row
    // between the two status buckets — simplest to just refetch both. The
    // endpoint is cheap and avoids bespoke reconciliation logic.
    reload()
  }, [reload])

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
      // Refresh quota immediately so the counter moves without waiting for the
      // next poll tick. The runs-poll effect handles completion.
      refreshQuota()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('suggestions_page.run_failed')
      showToast(msg, { variant: 'error' })
    } finally {
      setRunning(false)
    }
  }

  const filtered = useMemo(() => {
    if (isSaved) return savedItems
    if (newItems === null) return null
    if (filter === 'all') return newItems
    return newItems.filter(s => s.type === filter)
  }, [newItems, savedItems, isSaved, filter])

  const buyCount = useMemo(() => newItems?.filter(s => s.type === 'buy').length ?? 0, [newItems])
  const readNextCount = useMemo(() => newItems?.filter(s => s.type === 'read_next').length ?? 0, [newItems])
  const savedCount = savedItems?.length ?? 0

  const quotaExhausted = quota !== null && !quota.unlimited && quota.used >= quota.limit
  const runDisabled = running || activeRun !== null || quotaExhausted

  return (
    <>
      <PageHeader
        title={t('suggestions_page.title')}
        description={t('suggestions_page.description')}
        actions={
          <div className="flex items-center gap-3">
            {quota !== null && (
              <span className="text-xs text-gray-500 dark:text-gray-400" title={quota.resets_at ? t('suggestions_page.quota.resets_at', { at: new Date(quota.resets_at).toLocaleString() }) : undefined}>
                {quota.unlimited
                  ? t('suggestions_page.quota.unlimited', { used: quota.used })
                  : t('suggestions_page.quota.label', { remaining: Math.max(0, quota.limit - quota.used), limit: quota.limit })}
              </span>
            )}
            <button
              type="button"
              onClick={runNow}
              disabled={runDisabled}
              className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
            >
              {running || activeRun !== null ? t('suggestions_page.running') : t('suggestions_page.run_now')}
            </button>
          </div>
        }
      />
      <div className="p-4 sm:p-6 space-y-4 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2">
          <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('suggestions_page.filters.all', { count: newItems?.length ?? 0 })}
          </FilterTab>
          <FilterTab active={filter === 'read_next'} onClick={() => setFilter('read_next')}>
            {t('suggestions_page.filters.read_next', { count: readNextCount })}
          </FilterTab>
          <FilterTab active={filter === 'buy'} onClick={() => setFilter('buy')}>
            {t('suggestions_page.filters.buy', { count: buyCount })}
          </FilterTab>
          <FilterTab active={filter === 'saved'} onClick={() => setFilter('saved')}>
            {t('suggestions_page.filters.saved', { count: savedCount })}
          </FilterTab>
        </div>

        {activeRun && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3">
            <svg className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {t('suggestions_page.progress.title')}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {activeEventCount > 0
                  ? t('suggestions_page.progress.steps', { count: activeEventCount })
                  : t('suggestions_page.progress.starting')}
              </p>
            </div>
          </div>
        )}

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
              {t(isSaved ? 'suggestions_page.saved_empty.title' : 'suggestions_page.empty.title')}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t(isSaved ? 'suggestions_page.saved_empty.hint' : 'suggestions_page.empty.hint')}
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
