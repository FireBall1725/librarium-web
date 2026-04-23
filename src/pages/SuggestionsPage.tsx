// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import SuggestionCard from '../components/SuggestionCard'
import CustomRequestModal from '../components/CustomRequestModal'
import { usePageTitle } from '../hooks/usePageTitle'
import type {
  SuggestionQuotaView,
  SuggestionRunView,
  SuggestionSteeringInput,
  SuggestionSteeringView,
  SuggestionView,
} from '../types'

type TypeFilter = 'all' | 'buy' | 'read_next' | 'saved'

// SuggestionsPage is the /suggestions overflow surface. Scope model:
//   - default:    ?run_id absent → mixed pool (status=new + status=interested)
//   - scoped:     ?run_id=<uuid> → that run's suggestions, banner, pill recount
export default function SuggestionsPage() {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const { t } = useTranslation(['dashboard', 'common'])
  usePageTitle(t('suggestions_page.title'))

  const [searchParams, setSearchParams] = useSearchParams()
  const filter = (searchParams.get('type') as TypeFilter | null) ?? 'all'
  const scopedRunId = searchParams.get('run_id')
  const isSaved = filter === 'saved' && !scopedRunId

  // Keep the two status buckets in separate state so tab counts stay accurate
  // regardless of which tab is active — the All/Read next/Buy counts are all
  // drawn from newItems, Saved is drawn from savedItems. In scoped mode, both
  // come from the same scoped list (we don't render the Saved tab there).
  const [newItems, setNewItems] = useState<SuggestionView[] | null>(null)
  const [savedItems, setSavedItems] = useState<SuggestionView[] | null>(null)
  const [scopedItems, setScopedItems] = useState<SuggestionView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [quota, setQuota] = useState<SuggestionQuotaView | null>(null)
  const [activeRun, setActiveRun] = useState<SuggestionRunView | null>(null)
  const [activeEventCount, setActiveEventCount] = useState<number>(0)
  const [recentRuns, setRecentRuns] = useState<SuggestionRunView[] | null>(null)
  const [scopedRun, setScopedRun] = useState<SuggestionRunView | null>(null)
  const [recentExpanded, setRecentExpanded] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  // Pre-fill source for the modal — used when user clicks ✎ on the banner or
  // "Re-run" in the history panel. Null means open blank.
  const [modalInitial, setModalInitial] = useState<SuggestionSteeringView | null>(null)
  // Track the last-seen running run so we can detect the running→completed
  // transition, refresh items, and auto-scope to it.
  const lastRunningIdRef = useRef<string | null>(null)
  // Default the mixed view to the last 30 days so old never-actioned
  // suggestions don't stack up indefinitely. "Show older" flips this off.
  const [showOlder, setShowOlder] = useState(false)

  const loadMixed = useCallback(() => {
    setError(null)
    const window = showOlder ? '' : '&since=30d'
    Promise.all([
      callApi<SuggestionView[]>(`/api/v1/me/suggestions?status=new${window}`),
      callApi<SuggestionView[]>(`/api/v1/me/suggestions?status=interested${window}`),
    ])
      .then(([fresh, saved]) => {
        setNewItems(fresh ?? [])
        setSavedItems(saved ?? [])
      })
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t, showOlder])

  const loadScoped = useCallback((runId: string) => {
    setError(null)
    callApi<SuggestionView[]>(`/api/v1/me/suggestions?run_id=${encodeURIComponent(runId)}`)
      .then(items => setScopedItems(items ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t])

  // Fetch mixed or scoped list depending on URL.
  useEffect(() => {
    if (scopedRunId) {
      loadScoped(scopedRunId)
      // Mixed lists can be cleared — pill counts in scoped mode use scopedItems.
      setNewItems(null)
      setSavedItems(null)
    } else {
      loadMixed()
      setScopedItems(null)
      setScopedRun(null)
    }
  }, [scopedRunId, loadScoped, loadMixed])

  // Fetch the scoped run metadata (for the banner) whenever scope changes.
  useEffect(() => {
    if (!scopedRunId) {
      setScopedRun(null)
      return
    }
    let cancelled = false
    callApi<{ run: SuggestionRunView }>(`/api/v1/me/suggestions/runs/${scopedRunId}`)
      .then(d => {
        if (!cancelled) setScopedRun(d?.run ?? null)
      })
      .catch(() => {
        if (!cancelled) setScopedRun(null)
      })
    return () => {
      cancelled = true
    }
  }, [scopedRunId, callApi])

  const refreshQuota = useCallback(() => {
    callApi<SuggestionQuotaView>('/api/v1/me/suggestions/quota')
      .then(data => setQuota(data ?? null))
      .catch(() => {})
  }, [callApi])

  useEffect(() => {
    refreshQuota()
  }, [refreshQuota])

  // Poll runs every 4s for (a) in-flight status + event count, (b) the
  // auto-scope transition when a manual run completes, and (c) powering the
  // Recent runs panel without a second endpoint.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      let runs: SuggestionRunView[] | undefined
      try {
        runs = await callApi<SuggestionRunView[]>('/api/v1/me/suggestions/runs')
      } catch {
        return
      }
      if (cancelled) return
      setRecentRuns(runs ?? [])
      const inflight = runs?.find(r => r.status === 'running') ?? null
      setActiveRun(inflight)
      if (inflight) {
        lastRunningIdRef.current = inflight.id
        try {
          const detail = await callApi<{ run: SuggestionRunView; events: unknown[] }>(
            `/api/v1/me/suggestions/runs/${inflight.id}`,
          )
          if (!cancelled) setActiveEventCount(detail?.events?.length ?? 0)
        } catch {
          // Leave the previous count if the detail fetch transiently fails.
        }
      } else if (lastRunningIdRef.current !== null) {
        // Just transitioned running → done. Auto-scope to the run we were
        // watching (user-triggered or otherwise — if it finished while they
        // were looking, they want to see it).
        const finishedId = lastRunningIdRef.current
        lastRunningIdRef.current = null
        setActiveEventCount(0)
        const params = new URLSearchParams(searchParams)
        params.set('run_id', finishedId)
        params.delete('type')
        setSearchParams(params, { replace: true })
        refreshQuota()
      }
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [callApi, refreshQuota, searchParams, setSearchParams])

  const handleChanged = useCallback(() => {
    // Status changes shuffle a row between buckets — simplest to just refetch.
    if (scopedRunId) loadScoped(scopedRunId)
    else loadMixed()
  }, [scopedRunId, loadScoped, loadMixed])

  const setFilter = (next: TypeFilter) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('type')
    else params.set('type', next)
    setSearchParams(params, { replace: true })
  }

  const setScope = (runId: string | null) => {
    const params = new URLSearchParams(searchParams)
    if (runId) params.set('run_id', runId)
    else params.delete('run_id')
    // Always drop the type filter when scope changes — we want "All" in the
    // scoped run by default so the user sees everything that came out of it.
    params.delete('type')
    setSearchParams(params, { replace: false })
  }

  const openModal = (initial: SuggestionSteeringView | null) => {
    setModalInitial(initial)
    setModalOpen(true)
  }

  const submitRun = useCallback(
    async (steering: SuggestionSteeringInput | null) => {
      setRunning(true)
      try {
        const body = steering ? JSON.stringify({ steering }) : undefined
        await callApi('/api/v1/me/suggestions/run', {
          method: 'POST',
          body,
        })
        showToast(t('suggestions_page.run_queued'), { variant: 'success' })
        setModalOpen(false)
        refreshQuota()
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : t('suggestions_page.run_failed')
        showToast(msg, { variant: 'error' })
      } finally {
        setRunning(false)
      }
    },
    [callApi, showToast, t, refreshQuota],
  )

  const runNow = async () => submitRun(null)

  // Active list + counts: in scoped mode, everything comes from scopedItems
  // (filtered by type tab). In default mode, today's behaviour.
  const filtered = useMemo(() => {
    if (scopedRunId) {
      if (scopedItems === null) return null
      if (filter === 'all' || filter === 'saved') return scopedItems
      return scopedItems.filter(s => s.type === filter)
    }
    if (isSaved) return savedItems
    if (newItems === null) return null
    if (filter === 'all') return newItems
    return newItems.filter(s => s.type === filter)
  }, [scopedRunId, scopedItems, isSaved, filter, newItems, savedItems])

  const pillCounts = useMemo(() => {
    if (scopedRunId) {
      const items = scopedItems ?? []
      return {
        all: items.length,
        buy: items.filter(s => s.type === 'buy').length,
        readNext: items.filter(s => s.type === 'read_next').length,
        saved: 0,
      }
    }
    return {
      all: newItems?.length ?? 0,
      buy: newItems?.filter(s => s.type === 'buy').length ?? 0,
      readNext: newItems?.filter(s => s.type === 'read_next').length ?? 0,
      saved: savedItems?.length ?? 0,
    }
  }, [scopedRunId, scopedItems, newItems, savedItems])

  const available = quota?.available ?? true
  const quotaExhausted = quota !== null && !quota.unlimited && quota.used >= quota.limit
  const runDisabled = running || activeRun !== null || quotaExhausted || !available

  return (
    <>
      <PageHeader
        title={t('suggestions_page.title')}
        description={t('suggestions_page.description')}
        actions={
          available ? (
            <div className="flex items-center gap-3">
              {quota !== null && (
                <span
                  className="text-xs text-gray-500 dark:text-gray-400"
                  title={quota.resets_at ? t('suggestions_page.quota.resets_at', { at: new Date(quota.resets_at).toLocaleString() }) : undefined}
                >
                  {quota.unlimited
                    ? t('suggestions_page.quota.unlimited', { used: quota.used })
                    : t('suggestions_page.quota.label', { remaining: Math.max(0, quota.limit - quota.used), limit: quota.limit })}
                </span>
              )}
              <button
                type="button"
                onClick={() => openModal(null)}
                disabled={runDisabled}
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Custom request…
              </button>
              <button
                type="button"
                onClick={runNow}
                disabled={runDisabled}
                className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
              >
                {running || activeRun !== null ? t('suggestions_page.running') : t('suggestions_page.run_now')}
              </button>
            </div>
          ) : null
        }
      />
      <div className="p-4 sm:p-6 space-y-4 max-w-screen-2xl mx-auto">
        {!available ? (
          <UnavailableCard reason={quota?.unavailable_reason ?? null} />
        ) : (
          <>
            {scopedRunId && (
              <SteeringBanner
                run={scopedRun}
                onEdit={() => openModal(scopedRun?.steering ?? null)}
                onClear={() => setScope(null)}
              />
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>
                {t('suggestions_page.filters.all', { count: pillCounts.all })}
              </FilterTab>
              <FilterTab active={filter === 'read_next'} onClick={() => setFilter('read_next')}>
                {t('suggestions_page.filters.read_next', { count: pillCounts.readNext })}
              </FilterTab>
              <FilterTab active={filter === 'buy'} onClick={() => setFilter('buy')}>
                {t('suggestions_page.filters.buy', { count: pillCounts.buy })}
              </FilterTab>
              {/* Saved tab is only meaningful in default (mixed) mode. */}
              {!scopedRunId && (
                <FilterTab active={filter === 'saved'} onClick={() => setFilter('saved')}>
                  {t('suggestions_page.filters.saved', { count: pillCounts.saved })}
                </FilterTab>
              )}
              {/* The 30-day window applies to the mixed pool (new + saved),
                  not to a scoped-run view — there, users want every item
                  the run produced regardless of age. */}
              {!scopedRunId && (
                <button
                  type="button"
                  onClick={() => setShowOlder(o => !o)}
                  className="ml-auto text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
                >
                  {showOlder ? 'Last 30 days only' : 'Show older suggestions'}
                </button>
              )}
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

            <RecentRunsPanel
              runs={recentRuns}
              expanded={recentExpanded}
              onToggle={() => setRecentExpanded(e => !e)}
              activeRunId={scopedRunId}
              onView={id => setScope(id)}
              onRerun={run => openModal(run.steering ?? null)}
            />
          </>
        )}
      </div>

      <CustomRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={submitRun}
        submitting={running}
        initial={modalInitial}
      />
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

function UnavailableCard({ reason }: { reason: string | null }) {
  const title =
    reason === 'job_disabled'
      ? 'AI suggestions are currently disabled'
      : reason === 'no_provider'
        ? 'No AI provider is configured'
        : reason === 'not_opted_in'
          ? "You haven't opted in to AI features"
          : 'AI suggestions are not available'
  const body =
    reason === 'job_disabled' ? (
      <>The site administrator has paused the AI suggestions job. Ask them to re-enable it from the admin settings.</>
    ) : reason === 'no_provider' ? (
      <>
        An administrator needs to configure an AI provider under{' '}
        <Link to="/admin/connections/ai" className="text-blue-600 dark:text-blue-400 hover:underline">
          Connections → AI
        </Link>{' '}
        before suggestions can run.
      </>
    ) : reason === 'not_opted_in' ? (
      <>
        Enable AI features on your{' '}
        <Link to="/profile" className="text-blue-600 dark:text-blue-400 hover:underline">
          profile page
        </Link>{' '}
        to start getting book suggestions.
      </>
    ) : (
      <>Suggestions can't run right now. Please check back later.</>
    )
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 text-center">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 max-w-xl mx-auto">{body}</p>
    </div>
  )
}

// Relative-time formatter used by the banner + Recent runs panel. We prefer
// "just now" / "3 days ago" over absolute timestamps when the run is recent
// so the UI feels live; older runs fall back to a locale date.
function relativeTime(iso: string | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString()
}

// Palette classes echo the modal's chip colours so the banner and Recent
// runs entries are visually traceable back to what the user asked for.
const bannerChipClasses = {
  indigo: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300',
  purple: 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300',
  emerald: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  gray: 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
}

function BannerChip({
  palette,
  children,
  italic,
}: {
  palette: keyof typeof bannerChipClasses
  children: React.ReactNode
  italic?: boolean
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${bannerChipClasses[palette]} ${italic ? 'italic' : ''}`}
    >
      {children}
    </span>
  )
}

function SteeringBanner({
  run,
  onEdit,
  onClear,
}: {
  run: SuggestionRunView | null
  onEdit: () => void
  onClear: () => void
}) {
  // Banner appears for both steered and unsteered scoped runs. For unsteered
  // runs we just show a "Scheduled run" label so the scope is legible.
  const steering = run?.steering
  const isSteered = Boolean(
    steering &&
      ((steering.authors?.length ?? 0) > 0 ||
        (steering.series?.length ?? 0) > 0 ||
        (steering.genres?.length ?? 0) > 0 ||
        (steering.tags?.length ?? 0) > 0 ||
        (steering.notes ?? '').trim().length > 0),
  )
  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              {isSteered ? 'Custom request' : 'Scheduled run'}
              <span className="ml-1.5 font-normal text-blue-700/80 dark:text-blue-300/80">
                · {relativeTime(run?.started_at)}
              </span>
            </span>
          </div>
          {isSteered && steering ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(steering.authors?.length ?? 0) > 0 && (
                <BannerChip palette="indigo">
                  Authors: {steering.authors!.map(a => a.name).join(', ')}
                </BannerChip>
              )}
              {(steering.series?.length ?? 0) > 0 && (
                <BannerChip palette="purple">
                  Series: {steering.series!.map(s => s.name).join(', ')}
                </BannerChip>
              )}
              {(steering.genres?.length ?? 0) > 0 && (
                <BannerChip palette="emerald">
                  Genres: {steering.genres!.map(g => g.name).join(', ')}
                </BannerChip>
              )}
              {(steering.tags?.length ?? 0) > 0 && (
                <BannerChip palette="amber">
                  Tags: {steering.tags!.map(tag => tag.name).join(', ')}
                </BannerChip>
              )}
              {steering.notes && (
                <BannerChip palette="gray" italic>
                  "{steering.notes}"
                </BannerChip>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-blue-700 dark:text-blue-300">
              Showing the results of this scheduled run. Clear to return to the mixed pool.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {isSteered && (
            <button
              type="button"
              onClick={onEdit}
              className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline whitespace-nowrap"
            >
              Edit & re-run
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            title="Clear scope"
            className="p-1 -m-1 rounded text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
            aria-label="Clear scope"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// truncate helps the Recent Runs summary chips stay one-line-ish without
// destroying intent. Notes are already short in practice but may still need
// clipping on narrow viewports.
function truncate(s: string, max = 32): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function RecentRunsPanel({
  runs,
  expanded,
  onToggle,
  activeRunId,
  onView,
  onRerun,
}: {
  runs: SuggestionRunView[] | null
  expanded: boolean
  onToggle: () => void
  activeRunId: string | null
  onView: (id: string) => void
  onRerun: (run: SuggestionRunView) => void
}) {
  const visibleRuns = useMemo(() => (runs ?? []).slice(0, 5), [runs])
  return (
    <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent runs</h3>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {expanded && (
        <ul className="space-y-2">
          {runs === null ? (
            <li className="text-xs text-gray-400">Loading…</li>
          ) : visibleRuns.length === 0 ? (
            <li className="text-xs text-gray-400">No runs yet.</li>
          ) : (
            visibleRuns.map(run => {
              const steering = run.steering
              const isSteered = Boolean(
                steering &&
                  ((steering.authors?.length ?? 0) > 0 ||
                    (steering.series?.length ?? 0) > 0 ||
                    (steering.genres?.length ?? 0) > 0 ||
                    (steering.tags?.length ?? 0) > 0 ||
                    (steering.notes ?? '').trim().length > 0),
              )
              const isActive = run.id === activeRunId
              const canView = run.status === 'completed'
              const when = relativeTime(run.started_at)
              const count = run.suggestion_count ?? 0
              return (
                <li
                  key={run.id}
                  className={
                    isActive
                      ? 'rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2.5'
                      : 'rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2.5'
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            isSteered
                              ? isActive
                                ? 'text-xs font-semibold text-blue-900 dark:text-blue-100'
                                : 'text-xs font-semibold text-gray-900 dark:text-white'
                              : 'text-xs font-semibold text-gray-500 dark:text-gray-400'
                          }
                        >
                          {isSteered ? 'Custom' : 'Scheduled'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          · {when}
                          {run.status === 'running' ? ' · running…' : ` · ${count} suggestions`}
                        </span>
                      </div>
                      {isSteered && steering && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(steering.authors?.length ?? 0) > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${bannerChipClasses.indigo}`}>
                              {steering.authors!.map(a => a.name).join(', ')}
                            </span>
                          )}
                          {(steering.series?.length ?? 0) > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${bannerChipClasses.purple}`}>
                              {steering.series!.map(s => s.name).join(', ')}
                            </span>
                          )}
                          {(steering.genres?.length ?? 0) > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${bannerChipClasses.emerald}`}>
                              {steering.genres!.map(g => g.name).join(', ')}
                            </span>
                          )}
                          {(steering.tags?.length ?? 0) > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${bannerChipClasses.amber}`}>
                              {steering.tags!.map(t => t.name).join(', ')}
                            </span>
                          )}
                          {steering.notes && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] italic ${bannerChipClasses.gray}`}>
                              "{truncate(steering.notes, 28)}"
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {canView && !isActive && (
                        <button
                          type="button"
                          onClick={() => onView(run.id)}
                          className="text-xs font-medium text-gray-600 dark:text-gray-400 hover:underline"
                        >
                          View
                        </button>
                      )}
                      {isSteered && (
                        <button
                          type="button"
                          onClick={() => onRerun(run)}
                          className={
                            isActive
                              ? 'text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline'
                              : 'text-xs font-medium text-gray-600 dark:text-gray-400 hover:underline'
                          }
                        >
                          Re-run
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
