// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import RunDetailPanel from '../../components/RunDetailPanel'
import { usePageTitle } from '../../hooks/usePageTitle'
import type { SuggestionRunView } from '../../types'
import AISuggestionsJobCard from './AISuggestionsJobCard'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobType = 'import' | 'metadata' | 'cover' | 'ai_suggestions'
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

// Raw shape returned by the enrichment-batches endpoint
interface EnrichmentBatchRaw {
  id: string
  library_id: string
  library_name?: string
  type: 'metadata' | 'cover'
  status: JobStatus
  total_books: number
  processed_books: number
  failed_books: number
  skipped_books: number
  created_at: string
  updated_at: string
}

function batchToJob(b: EnrichmentBatchRaw): Job {
  return {
    id: b.id,
    type: b.type,
    library_id: b.library_id,
    library_name: b.library_name,
    status: b.status,
    total_rows: b.total_books,
    processed_rows: b.processed_books,
    failed_rows: b.failed_books,
    skipped_rows: b.skipped_books,
    created_at: b.created_at,
    updated_at: b.updated_at,
  }
}

// runToJob folds a suggestion run into the Job shape so it sits alongside
// imports and enrichment batches in the unified history list.
function runToJob(r: SuggestionRunView): Job {
  const status: JobStatus =
    r.status === 'running' ? 'processing'
      : r.status === 'completed' ? 'done'
      : r.status === 'failed' ? 'failed'
      : 'pending'
  return {
    id: r.id,
    type: 'ai_suggestions',
    library_id: '',
    library_name: 'AI suggestions',
    status,
    total_rows: 0,
    processed_rows: 0,
    failed_rows: 0,
    skipped_rows: 0,
    created_at: r.started_at,
    updated_at: r.finished_at ?? r.started_at,
    triggered_by: r.triggered_by,
    provider_type: r.provider_type,
    model_id: r.model_id,
    tokens_in: r.tokens_in,
    tokens_out: r.tokens_out,
    estimated_cost_usd: r.estimated_cost_usd,
    user_id: r.user_id,
    run_error: r.error,
    finished_at: r.finished_at,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: JobType }) {
  const cfg: Record<JobType, { label: string; cls: string }> = {
    import:         { label: 'Import',      cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
    metadata:       { label: 'Metadata',    cls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' },
    cover:          { label: 'Covers',      cls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
    ai_suggestions: { label: 'Suggestions', cls: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' },
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
  // No cancel/delete endpoints exist for suggestion runs yet, so hide the
  // actions entirely for that type.
  const canCancel   = !isAISuggestions && (job.status === 'pending' || job.status === 'processing')
  const canDelete   = !isAISuggestions && (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled')
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
    // AI suggestion runs expand into a RunDetailPanel, which self-fetches —
    // skip the items lookup for that type.
    if (!expanded && !isAISuggestions) {
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
      const path = isEnrichment
        ? `/api/v1/enrichment-batches/${job.id}/cancel`
        : `/api/v1/imports/${job.id}/cancel`
      await callApi(path, { method: 'POST' })
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
      const path = isEnrichment
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
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={toggleExpand}
        className="w-full text-left px-5 py-4 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
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

export default function JobsPage() {
  const { callApi } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  usePageTitle('Jobs')

  const loadJobs = async () => {
    try {
      const [importData, batchData, runData] = await Promise.all([
        callApi<Job[]>('/api/v1/imports'),
        callApi<EnrichmentBatchRaw[]>('/api/v1/enrichment-batches'),
        // Suggestion runs are admin-only — tolerate failure so non-admins
        // (if they ever reach this page) still see imports/enrichment.
        callApi<SuggestionRunView[]>('/api/v1/admin/jobs/ai-suggestions/runs').catch(() => []),
      ])
      const imports = (importData ?? []).map(j => ({ ...j, type: 'import' as JobType }))
      const batches = (batchData ?? []).map(batchToJob)
      const runs = (runData ?? []).map(runToJob)
      // Merge and sort newest-first
      const merged = [...imports, ...batches, ...runs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setJobs(merged)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadJobs()
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
      await Promise.all([
        callApi('/api/v1/imports', { method: 'DELETE' }),
        callApi('/api/v1/enrichment-batches', { method: 'DELETE' }),
      ])
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
        title="Jobs"
        description="Background tasks across all libraries."
        breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Jobs' }]}
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
      <div className="p-8 max-w-4xl mx-auto">

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Scheduled jobs
        </h2>
        <AISuggestionsJobCard />
      </section>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        History
      </h2>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No jobs yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Start an import from the Import tool to see background jobs here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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
