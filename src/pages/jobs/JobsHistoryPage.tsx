// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import RunDetailPanel from '../../components/RunDetailPanel'
import { usePageTitle } from '../../hooks/usePageTitle'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobType = 'import' | 'metadata' | 'cover' | 'cover_backfill' | 'ai_suggestions' | 'ai_metadata_proposal'
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
  // kind_id is the per-kind detail row id (import_jobs.id /
  // enrichment_batches.id). The per-kind GET/cancel/delete endpoints
  // are keyed by it; without it the unified history's umbrella id
  // cannot reach the detail panel and items render as "No items."
  kind_id?: string
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
// kind_id and library_id are the per-kind detail row's primary key and
// scope; the per-kind GET/DELETE/cancel endpoints are still keyed by
// the per-kind id rather than the umbrella job id, so the row needs
// both to deep-link correctly.
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
  kind_id?: string | null
  library_id?: string | null
  library_name?: string | null
  // For enrichment jobs, "metadata" or "cover" so the badge can
  // distinguish a fill-missing-metadata pass from a cover backfill.
  // Empty for kinds that don't subdivide.
  subtype?: string | null
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

  // Enrichment is split into metadata vs cover via the subtype field.
  // Without it the badge would always read "Metadata" even for cover
  // batches, which is what landed in the original unified-history
  // collapse and confused the user when they enabled cover-only.
  let jobType: JobType
  switch (u.kind) {
    case 'import':                jobType = 'import'; break
    case 'enrichment':            jobType = u.subtype === 'cover' ? 'cover' : 'metadata'; break
    case 'ai_suggestions':        jobType = 'ai_suggestions'; break
    case 'cover_backfill':        jobType = 'cover_backfill'; break
    case 'ai_metadata_proposal':  jobType = 'ai_metadata_proposal'; break
    default:                      jobType = 'metadata'; break
  }

  return {
    id: u.id,
    kind_id: u.kind_id ?? undefined,
    type: jobType,
    library_id: u.library_id ?? '',
    library_name: u.library_name ?? undefined,
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
    import:               { label: 'Import',         cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
    metadata:             { label: 'Metadata',       cls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' },
    cover:                { label: 'Covers',         cls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
    cover_backfill:       { label: 'Cover backfill', cls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
    ai_suggestions:       { label: 'Suggestions',    cls: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' },
    ai_metadata_proposal: { label: 'AI proposal',    cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
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

// AICallsPanel pulls and renders ai_metadata_runs attached to a job. Used for
// enrichment-batch rows to surface the description-cleanup AI calls so the
// admin can expand each one and see prompt + response.
interface AIMetadataRun {
  id: string
  kind: string
  target_type: string
  target_id: string
  provider_type: string
  model_id: string
  status: string
  error: string
  tokens_in: number
  tokens_out: number
  estimated_cost_usd: number
  prompt: string
  response_text: string
  started_at: string
  finished_at: string | null
}

function AICallsPanel({ jobID }: { jobID: string }) {
  const { callApi } = useAuth()
  const [runs, setRuns] = useState<AIMetadataRun[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    callApi<AIMetadataRun[]>(`/api/v1/jobs/${jobID}/ai-runs`)
      .then(r => setRuns(r ?? []))
      .catch(() => setRuns([]))
  }, [callApi, jobID])

  if (!runs || runs.length === 0) return null

  const totalCost = runs.reduce((s, r) => s + (r.estimated_cost_usd || 0), 0)
  const totalTokens = runs.reduce((s, r) => s + (r.tokens_in || 0) + (r.tokens_out || 0), 0)

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">AI calls</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">{runs.length} · {totalTokens.toLocaleString()} tokens · ${totalCost.toFixed(4)}</span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {runs.map(r => (
          <div key={r.id}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(prev => prev === r.id ? null : r.id) }}
              className="w-full flex items-center gap-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded">
              <ItemStatusDot status={r.status === 'completed' ? 'done' : r.status === 'failed' ? 'failed' : 'pending'} />
              <span className="text-gray-700 dark:text-gray-300 font-medium font-mono text-xs">{r.kind}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-1 truncate">{r.target_type} {r.target_id.slice(0, 8)}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{r.tokens_in + r.tokens_out} tok</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">${r.estimated_cost_usd.toFixed(4)}</span>
              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded === r.id ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {expanded === r.id && (
              <div className="pb-3 space-y-2">
                {r.error && (
                  <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">
                    {r.error}
                  </div>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Prompt ({r.prompt.length} chars)</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">{r.prompt}</pre>
                </details>
                <details className="text-xs" open>
                  <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Response ({r.response_text.length} chars)</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">{r.response_text}</pre>
                </details>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">
                  {r.provider_type}/{r.model_id} · started {formatDate(r.started_at)}{r.finished_at ? ` · finished ${formatDate(r.finished_at)}` : ''}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

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
  const isAIMetadata    = job.type === 'ai_metadata_proposal'
  // Cover-backfill parents and AI suggestion rows delete via the unified
  // /admin/jobs/:id route (cascades through the kind-specific legacy
  // tables); enrichment and import jobs still hit their per-kind endpoints.
  // AI-metadata-proposal jobs run synchronously and are already finished by
  // the time their row appears in history; no cancel path needed.
  const canCancel   = !isCoverBackfill && !isAIMetadata && (job.status === 'pending' || job.status === 'processing')
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

  // Per-kind endpoints are keyed by the per-kind detail id (import_jobs.id,
  // enrichment_batches.id) — the unified history's umbrella id won't
  // resolve. kind_id falls back to id only for ai_suggestions / cover_backfill,
  // where the umbrella id is what the route already takes.
  const detailID = job.kind_id ?? job.id

  const toggleExpand = async () => {
    const isEnr = job.type === 'metadata' || job.type === 'cover'
    // AI suggestion runs expand into a RunDetailPanel, which self-fetches.
    // Cover-backfill parents are orchestrators with no items — the expand
    // panel just shows the summary, no fetch required.
    if (!expanded && !isAISuggestions && !isCoverBackfill && !isAIMetadata) {
      setLoadingItems(true)
      try {
        if (isEnr) {
          const full = await callApi<{ items: EnrichmentItem[] }>(`/api/v1/enrichment-batches/${detailID}`)
          setEnrichItems(full.items ?? [])
        } else if (items === null) {
          const full = await callApi<Job>(`/api/v1/libraries/${job.library_id}/imports/${detailID}`)
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
        await callApi(`/api/v1/enrichment-batches/${detailID}/cancel`, { method: 'POST' })
      } else {
        await callApi(`/api/v1/imports/${detailID}/cancel`, { method: 'POST' })
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
          ? `/api/v1/enrichment-batches/${detailID}`
          : `/api/v1/imports/${detailID}`
      await callApi(path, { method: 'DELETE' })
      onDeleted(job.id)
    } catch {
      setDeleting(false)
    }
  }

  const successRows = job.status === 'done'
    ? Math.max(0, job.processed_rows - job.failed_rows - job.skipped_rows)
    : null

  // Source column content — library for kinds that have one, otherwise who
  // triggered it (AI runs are user/admin-triggered without a library).
  const sourceLabel = (isAISuggestions || isAIMetadata)
    ? `Triggered by ${job.triggered_by ?? 'scheduler'}${job.user_id ? ` · user ${job.user_id.slice(0, 8)}` : ''}`
    : (job.library_name ?? job.library_id ?? '—')

  return (
    <Fragment>
      <tr
        onClick={toggleExpand}
        className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
      >
        <td className="pl-4 pr-1 py-3 w-8">
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-3 py-3 whitespace-nowrap"><TypeBadge type={job.type} /></td>
        <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={job.status} /></td>
        <td className="px-3 py-3 min-w-0">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{sourceLabel}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{job.id.slice(0, 8)}</span>
          </div>
        </td>
        <td className="px-3 py-3 min-w-0">
          {(isAISuggestions || isAIMetadata) ? (
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
            // processed/failed/skipped are disjoint buckets in the API; the
            // bar shows total rows the worker has finished with (sum).
            (() => {
              const handled = job.processed_rows + job.failed_rows + job.skipped_rows
              const pct = job.total_rows > 0 ? Math.round((handled / job.total_rows) * 100) : 0
              return (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden max-w-xs">
                    <div className="h-full rounded-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                    {handled}/{job.total_rows}
                  </span>
                </div>
              )
            })()
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
        </td>
        <td className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
          {formatDate(job.created_at)}
        </td>
        <td className="pl-3 pr-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 justify-end">
            {canCancel && (
              <button onClick={handleCancel} disabled={cancelling}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                title="Cancel job">
                {cancelling ? '…' : 'Cancel'}
              </button>
            )}
            {canDelete && (
              <button onClick={handleDelete} disabled={deleting}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                title="Delete job">
                {deleting ? '…' : 'Delete'}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-900/50">
          <td colSpan={7} className="border-b border-gray-100 dark:border-gray-800 p-0">
          {isAISuggestions ? (
            <div className="px-5 py-4">
              <RunDetailPanel
                endpoint={`/api/v1/admin/jobs/ai-suggestions/runs/${job.id}`}
                hideSummary
              />
            </div>
          ) : isAIMetadata ? (
            <div className="px-5 py-4">
              <RunDetailPanel
                endpoint={`/api/v1/admin/jobs/ai-metadata/runs/${job.id}`}
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
            <>
              {enrichItems && enrichItems.length > 0 ? (
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
              )}
              <AICallsPanel jobID={job.id} />
            </>
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
          </td>
        </tr>
      )}
    </Fragment>
  )
}

// ─── JobsPage ─────────────────────────────────────────────────────────────────

export default function JobsHistoryPage() {
  const { callApi } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  // Filter + pagination state. Each filter value maps to a backend query param;
  // the special 'metadata' / 'cover' filter values translate to kind=enrichment
  // + subtype=metadata|cover so the UI can split enrichment into its two
  // user-meaningful flavours.
  const [kindFilter, setKindFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const burstTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  usePageTitle('Job history')

  const loadJobs = async () => {
    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String((page - 1) * PAGE_SIZE))
      // Map UI kind values to backend kind + subtype.
      if (kindFilter === 'metadata') {
        params.set('kind', 'enrichment')
        params.set('subtype', 'metadata')
      } else if (kindFilter === 'cover') {
        params.set('kind', 'enrichment')
        params.set('subtype', 'cover')
      } else if (kindFilter !== '') {
        params.set('kind', kindFilter)
      }
      if (statusFilter !== '') params.set('status', statusFilter)
      const resp = await callApi<{ items: UnifiedJobRow[]; total: number }>(
        `/api/v1/admin/jobs/history?${params.toString()}`
      )
      const merged = (resp?.items ?? []).map(unifiedToJob)
      setJobs(merged)
      setTotal(resp?.total ?? 0)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  // Reload when filters or page change.
  useEffect(() => {
    loadJobs()
    return () => {
      burstTimers.current.forEach(t => clearTimeout(t))
      burstTimers.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter, statusFilter, page])

  // Reset to page 1 when filters change so the user doesn't end up on an
  // empty page from a previous filter's deeper offsets.
  useEffect(() => {
    setPage(1)
  }, [kindFilter, statusFilter])

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
      {/* Wider than the default admin max-w-4xl: the jobs table has 7 columns
          with badges + summaries + actions; max-w-4xl was clipping the
          Created column and the action buttons. max-w-7xl gives breathing
          room while still keeping the line lengths reasonable on huge
          monitors. */}
      <div className="max-w-7xl px-8 py-8">

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Type</span>
          <select value={kindFilter} onChange={e => setKindFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1 text-sm">
            <option value="">All</option>
            <option value="import">Import</option>
            <option value="metadata">Metadata</option>
            <option value="cover">Covers</option>
            <option value="cover_backfill">Cover backfill</option>
            <option value="ai_suggestions">AI suggestions</option>
            <option value="ai_metadata_proposal">AI proposal</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1 text-sm">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Done</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        {(kindFilter !== '' || statusFilter !== '') && (
          <button onClick={() => { setKindFilter(''); setStatusFilter('') }}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {total === 0 ? 'No matches' : total === 1 ? '1 job' : `${total.toLocaleString()} jobs`}
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {kindFilter !== '' || statusFilter !== '' ? 'No jobs match these filters' : 'No jobs yet'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {kindFilter !== '' || statusFilter !== ''
              ? 'Adjust the type or status filter above.'
              : 'Start an import from the Import tool to see background jobs here.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {['', 'Type', 'Status', 'Source', 'Summary', 'Created', ''].map((h, i) => (
                    <th key={i} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {jobs.map(job => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onCancelled={handleCancelled}
                    onDeleted={handleDeleted}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination — only renders when there are more jobs than fit in
              one page. Server enforces newest-first ordering. */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))} · showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  ← Newer
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= total}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Older →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </>
  )
}
