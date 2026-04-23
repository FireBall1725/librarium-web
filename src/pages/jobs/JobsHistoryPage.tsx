// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import RunDetailPanel from '../../components/RunDetailPanel'
import { usePageTitle } from '../../hooks/usePageTitle'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobType = 'import' | 'metadata' | 'cover' | 'cover_backfill' | 'ai_suggestions'
type JobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled'

interface ImportItem {
  id: string
  row_number: number
  status: 'pending' | 'done' | 'skipped' | 'failed'
  title: string
  isbn: string
  message: string
  book_id?: string
}

interface EnrichmentItem {
  id: string
  book_id?: string
  book_title: string
  status: 'pending' | 'done' | 'failed' | 'skipped'
  message?: string
}

interface Job {
  id: string
  type: JobType
  library_id: string
  library_name?: string
  status: JobStatus
  // import jobs use rows; enrichment batches use books — normalised below
  total_rows: number
  processed_rows: number
  failed_rows: number
  skipped_rows: number
  created_at: string
  updated_at: string
  items?: ImportItem[]
  // AI-suggestion-run-only fields (undefined for imports/enrichment)
  triggered_by?: string
  provider_type?: string
  model_id?: string
  tokens_in?: number
  tokens_out?: number
  estimated_cost_usd?: number
  user_id?: string
  run_error?: string
  finished_at?: string
}

// UnifiedJobRow mirrors the JobView the unified /admin/jobs/history
// endpoint returns. Progress is a kind-specific JSON blob the umbrella
// row holds for summary UI — counters extracted via unifiedToJob below.
interface UnifiedJobRow {
  id: string
  kind: string
  status: string
  triggered_by: string
  created_by?: string | null
  schedule_id?: string | null
  error?: string
  progress: Record<string, unknown>
  started_at?: string | null
  finished_at?: string | null
  created_at: string
  updated_at: string
}

// unifiedToJob folds the umbrella row + kind-specific progress into the
// page-local Job shape so the existing per-kind rendering still works.
function unifiedToJob(u: UnifiedJobRow): Job {
  const mappedStatus: JobStatus =
    u.status === 'pending' ? 'pending'
      : u.status === 'running' ? 'processing'
      : u.status === 'completed' ? 'done'
      : u.status === 'failed' ? 'failed'
      : u.status === 'cancelled' ? 'cancelled'
      : 'pending'

  // Kind-specific counters live in progress as { processed, failed, skipped, total }
  // for import and enrichment; AI suggestions writes { tokens_in, tokens_out, cost_usd }.
  const p = u.progress ?? {}
  const num = (k: string): number => {
    const v = p[k]
    return typeof v === 'number' ? v : 0
  }

  let jobType: JobType
  switch (u.kind) {
    case 'import':         jobType = 'import'; break
    case 'enrichment':     jobType = 'metadata'; break
    case 'ai_suggestions': jobType = 'ai_suggestions'; break
    case 'cover_backfill': jobType = 'cover_backfill'; break
    default:               jobType = 'metadata'; break
  }

  return {
    id: u.id,
    type: jobType,
    library_id: '', // umbrella rows don't carry library_id; the per-kind
                   // detail fetch still does when the UI needs it
    status: mappedStatus,
    total_rows: num('total'),
    processed_rows: num('processed'),
    failed_rows: num('failed'),
    skipped_rows: num('skipped'),
    created_at: u.created_at,
    updated_at: u.updated_at,
    triggered_by: u.triggered_by,
    tokens_in: num('tokens_in'),
    tokens_out: num('tokens_out'),
    estimated_cost_usd: typeof p.cost_usd === 'number' ? (p.cost_usd as number) : 0,
    run_error: u.error || undefined,
    finished_at: u.finished_at || undefined,
  }
}

// Legacy batchToJob / runToJob helpers removed with the unified history
// endpoint — unifiedToJob above handles every kind now.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: JobType }) {
  const cfg: Record<JobType, { label: string; cls: string }> = {
    import:         { label: 'Import',         cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
    metadata:       { label: 'Metadata',       cls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' },
    cover:          { label: 'Covers',         cls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
    cover_backfill: { label: 'Cover backfill', cls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
    ai_suggestions: { label: 'Suggestions',    cls: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' },
  }
  const { label, cls } = cfg[type] ?? cfg.import
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

function formatDurationSec(startIso: string, endIso?: string): string | null {
  if (!endIso) return null
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m${s.toString().padStart(2, '0')}s`
}

function StatusBadge({ status }: { status: JobStatus }) {
  const cfg: Record<JobStatus, { label: string; cls: string; spin?: boolean }> = {
    pending:    { label: 'Queued',     cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
    processing: { label: 'Processing', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', spin: true },
    done:       { label: 'Done',       cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
    failed:     { label: 'Failed',     cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
    cancelled:  { label: 'Cancelled',  cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' },
  }
  const { label, cls, spin } = cfg[status] ?? cfg.failed
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {spin && <span className="w-2 h-2 rounded-full border border-blue-500 border-t-transparent animate-spin" />}
      {label}
    </span>
  )
}

function ItemStatusDot({ status }: { status: ImportItem['status'] }) {
  const cls: Record<ImportItem['status'], string> = {
    pending: 'bg-gray-300 dark:bg-gray-600',
    done:    'bg-green-500',
    skipped: 'bg-amber-400',
    failed:  'bg-red-500',
  }
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls[status]}`} />
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Job row ──────────────────────────────────────────────────────────────────

function JobRow({
  job,
  onCancelled,
  onDeleted,
}: {
  job: Job
  onCancelled: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const { callApi } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState<ImportItem[] | null>(job.items ?? null)
  const [enrichItems, setEnrichItems] = useState<EnrichmentItem[] | null>(null)
  const [loadingItems, setLoadingItems] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isAISuggestions = job.type === 'ai_suggestions'
  const isCoverBackfill = job.type === 'cover_backfill'
  // Cover-backfill parents and AI suggestion rows delete via the unified
  // /admin/jobs/:id route (cascades through the kind-specific legacy
  // tables); enrichment and import jobs still hit their per-kind endpoints.
  const canCancel   = !isCoverBackfill && (job.status === 'pending' || job.status === 'processing')
  const canDelete   = job.status === 'done' || job.status === 'failed' || job.status === 'cancelled'
  const isActive    = job.status === 'pending' || job.status === 'processing'
  const isEnrichment = job.type === 'metadata' || job.type === 'cover'

  // While an enrichment batch is expanded and still running, poll its items so
  // the per-book status list updates in real time (same cadence as the parent poll).
  useEffect(() => {
    if (!expanded || !isEnrichment || !isActive) return
    const refresh = () => {
      callApi<{ items: EnrichmentItem[] }>(`/api/v1/enrichment-batches/${job.id}`)
        .then(full => setEnrichItems(full.items ?? []))
        .catch(() => {})
    }
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [expanded, isEnrichment, isActive, job.id, callApi])

  const toggleExpand = async () => {
    const isEnr = job.type === 'metadata' || job.type === 'cover'
    // AI suggestion runs expand into a RunDetailPanel, which self-fetches.
    // Cover-backfill parents are orchestrators with no items — the expand
    // panel just shows the summary, no fetch required.
    if (!expanded && !isAISuggestions && !isCoverBackfill) {
      setLoadingItems(true)
      try {
        if (isEnr) {
          const full = await callApi<{ items: EnrichmentItem[] }>(`/api/v1/enrichment-batches/${job.id}`)
          setEnrichItems(full.items ?? [])
        } else if (items === null) {
          const full = await callApi<Job>(`/api/v1/libraries/${job.library_id}/imports/${job.id}`)
          setItems(full.items ?? [])
        }
      } catch {
        if (isEnr) setEnrichItems([])
        else setItems([])
      } finally {
        setLoadingItems(false)
      }
    }
    setExpanded(e => !e)
  }

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canCancel || cancelling) return
    setCancelling(true)
    try {
      if (isAISuggestions) {
        await callApi(`/api/v1/admin/jobs/ai-suggestions/runs/${job.id}`, { method: 'DELETE' })
      } else if (isEnrichment) {
        await callApi(`/api/v1/enrichment-batches/${job.id}/cancel`, { method: 'POST' })
      } else {
        await callApi(`/api/v1/imports/${job.id}/cancel`, { method: 'POST' })
      }
      onCancelled(job.id)
    } catch {
      // non-fatal — parent will refresh
    } finally {
      setCancelling(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canDelete || deleting) return
    setDeleting(true)
    try {
      const path = isCoverBackfill || isAISuggestions
        ? `/api/v1/admin/jobs/${job.id}`
        : isEnrichment
          ? `/api/v1/enrichment-batches/${job.id}`
          : `/api/v1/imports/${job.id}`
      await callApi(path, { method: 'DELETE' })
      onDeleted(job.id)
    } catch {
      setDeleting(false)
    }
  }

  const successRows = job.status === 'done'
    ? Math.max(0, job.processed_rows - job.failed_rows - job.skipped_rows)
    : null

  return (
    <div className="bg-white dark:bg-gray-900">
      <button
        onClick={toggleExpand}
        className="w-full text-left px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <svg
            className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          <div className="flex-1 min-w-0 grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3">
            <TypeBadge type={job.type} />
            <StatusBadge status={job.status} />

            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {isAISuggestions
                    ? `Triggered by ${job.triggered_by ?? 'scheduler'}${job.user_id ? ` · user ${job.user_id.slice(0, 8)}` : ''}`
                    : (job.library_name ?? job.library_id)}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                  {job.id.slice(0, 8)}
                </span>
              </div>
              {isAISuggestions ? (
                isActive ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span>Running…</span>
                    {job.provider_type && (
                      <span className="text-gray-400">{job.provider_type}{job.model_id ? ` (${job.model_id})` : ''}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {job.provider_type && (
                      <span>{job.provider_type}{job.model_id ? ` (${job.model_id})` : ''}</span>
                    )}
                    {(job.tokens_in !== undefined || job.tokens_out !== undefined) && (
                      <span className="tabular-nums">
                        {formatTokens(job.tokens_in ?? 0)} in / {formatTokens(job.tokens_out ?? 0)} out
                      </span>
                    )}
                    {job.estimated_cost_usd !== undefined && job.estimated_cost_usd > 0 && (
                      <span className="tabular-nums">${job.estimated_cost_usd.toFixed(4)}</span>
                    )}
                    {formatDurationSec(job.created_at, job.finished_at) && (
                      <span className="tabular-nums">{formatDurationSec(job.created_at, job.finished_at)}</span>
                    )}
                    {job.run_error && (
                      <span className="text-red-600 dark:text-red-400 truncate max-w-xs" title={job.run_error}>
                        {job.run_error}
                      </span>
                    )}
                  </div>
                )
              ) : isActive ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden max-w-xs">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-500"
                      style={{ width: job.total_rows > 0 ? `${Math.round((job.processed_rows / job.total_rows) * 100)}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {job.processed_rows}/{job.total_rows}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{job.total_rows} {isEnrichment ? 'books' : 'rows'}</span>
                  {successRows !== null && successRows > 0 && (
                    <span className="text-green-600 dark:text-green-400">
                      {successRows} {isEnrichment ? 'updated' : 'added'}
                    </span>
                  )}
                  {job.skipped_rows > 0 && <span className="text-amber-600 dark:text-amber-400">{job.skipped_rows} skipped</span>}
                  {job.failed_rows > 0 && <span className="text-red-600 dark:text-red-400">{job.failed_rows} failed</span>}
                </div>
              )}
            </div>

            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
              {formatDate(job.created_at)}
            </span>

            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 transition-colors px-1 py-0.5 rounded"
                  title="Cancel job"
                >
                  {cancelling ? '…' : 'Cancel'}
                </button>
              )}
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 transition-colors px-1 py-0.5 rounded"
                  title="Delete job"
                >
                  {deleting ? '…' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          {isAISuggestions ? (
            <div className="px-5 py-4">
              <RunDetailPanel
                endpoint={`/api/v1/admin/jobs/ai-suggestions/runs/${job.id}`}
                hideSummary
              />
            </div>
          ) : isCoverBackfill ? (
            <div className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p>
                Enumerated {job.total_rows} book{job.total_rows === 1 ? '' : 's'} missing covers and dispatched cover-only enrichment batches.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Per-book progress lives on the child Metadata rows above/below.
              </p>
              {job.run_error && (
                <p className="text-xs text-red-600 dark:text-red-400">{job.run_error}</p>
              )}
            </div>
          ) : loadingItems ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-400 dark:text-gray-500">
              <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mr-2" />
              Loading…
            </div>
          ) : isEnrichment ? (
            enrichItems && enrichItems.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {enrichItems.map(item => (
                  <div key={item.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                    <ItemStatusDot status={item.status} />
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-800 dark:text-gray-200 font-medium">
                        {item.book_title || <span className="text-gray-400 italic font-mono text-xs">{item.book_id?.slice(0, 8) ?? 'Unknown'}</span>}
                      </span>
                      {item.message && (
                        <p className={`text-xs mt-0.5 ${
                          item.status === 'failed' ? 'text-red-600 dark:text-red-400'
                            : item.status === 'skipped' ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {item.message}
                        </p>
                      )}
                    </div>
                    {item.book_id && (
                      <Link
                        to={job.library_id
                          ? `/libraries/${job.library_id}/books/${item.book_id}`
                          : `/books/${item.book_id}`}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                        onClick={e => e.stopPropagation()}
                      >
                        View
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-4 text-sm text-gray-400 dark:text-gray-500">No items.</p>
            )
          ) : items && items.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map(item => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                  <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500 w-8 flex-shrink-0 pt-0.5 text-right">
                    {item.row_number}
                  </span>
                  <ItemStatusDot status={item.status} />
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-800 dark:text-gray-200 font-medium">
                      {item.title || <span className="text-gray-400 italic">Untitled</span>}
                    </span>
                    {item.isbn && <span className="ml-2 text-xs text-gray-400 font-mono">{item.isbn}</span>}
                    {item.message && (
                      <p className={`text-xs mt-0.5 ${
                        item.status === 'failed' ? 'text-red-600 dark:text-red-400'
                          : item.status === 'skipped' ? 'text-amber-600 dark:text-amber-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {item.message}
                      </p>
                    )}
                  </div>
                  {item.book_id && (
                    <Link
                      to={`/libraries/${job.library_id}/books/${item.book_id}`}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      View
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-4 text-sm text-gray-400 dark:text-gray-500">No items.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── JobsPage ─────────────────────────────────────────────────────────────────

export default function JobsHistoryPage() {
  const { callApi } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const burstTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  usePageTitle('Job history')

  const loadJobs = async () => {
    try {
      // One fetch replaces the three-endpoint fanout — the unified
      // /admin/jobs/history returns every kind in one paginated shape.
      const resp = await callApi<{ items: UnifiedJobRow[]; total: number }>(
        '/api/v1/admin/jobs/history?limit=200'
      )
      const merged = (resp?.items ?? []).map(unifiedToJob)
      setJobs(merged)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadJobs()
    return () => {
      burstTimers.current.forEach(t => clearTimeout(t))
      burstTimers.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-poll while any job is active
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'processing')
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(loadJobs, 3000)
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs])

  const handleCancelled = (id: string) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'cancelled' as JobStatus } : j))
  }

  const handleDeleted = (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  const handleClearFinished = async () => {
    if (clearingAll) return
    setClearingAll(true)
    try {
      await callApi('/api/v1/admin/jobs/history', { method: 'DELETE' })
      setJobs(prev => prev.filter(j => j.status === 'pending' || j.status === 'processing'))
    } catch {
      // non-fatal
    } finally {
      setClearingAll(false)
    }
  }

  const hasFinished = jobs.some(j => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-500">
        <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Job history"
        description="Every job run across every kind, newest first."
        breadcrumbs={[
          { label: 'Settings', to: '/admin/settings' },
          { label: 'Jobs', to: '/admin/settings/jobs' },
          { label: 'History' },
        ]}
        actions={hasFinished ? (
          <button
            onClick={handleClearFinished}
            disabled={clearingAll}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-red-400 hover:text-red-600 dark:hover:border-red-500 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
          >
            {clearingAll ? 'Clearing…' : 'Clear finished'}
          </button>
        ) : undefined}
      />
      <div className="max-w-4xl px-8 py-8">

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No jobs yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Start an import from the Import tool to see background jobs here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
          {jobs.map(job => (
            <JobRow
              key={job.id}
              job={job}
              onCancelled={handleCancelled}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
    </>
  )
}
