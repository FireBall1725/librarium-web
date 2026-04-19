// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState } from 'react'
import { useAuth, ApiError } from '../auth/AuthContext'
import type { SuggestionRunDetail, SuggestionRunEvent, SuggestionRunView } from '../types'

interface RunDetailPanelProps {
  // Absolute API path for the run detail endpoint:
  //   /api/v1/me/suggestions/runs/{id}   (user view)
  //   /api/v1/admin/jobs/ai-suggestions/runs/{id}   (admin view)
  endpoint: string
  // Optional compact summary rendered above the event timeline. When the
  // embedding page already shows the run summary, pass hideSummary.
  hideSummary?: boolean
}

// RunDetailPanel fetches and renders one suggestions run: the metadata
// (provider, tokens, cost, status) and the ordered event timeline. Events
// are rendered in collapsible groups so a long run doesn't drown the page —
// the interesting ones (prompt, ai_response, backfill) expand by default,
// per-candidate enrichment decisions collapse by default.
export default function RunDetailPanel({ endpoint, hideSummary }: RunDetailPanelProps) {
  const { callApi } = useAuth()
  const [detail, setDetail] = useState<SuggestionRunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError(null)
    callApi<SuggestionRunDetail>(endpoint)
      .then(d => {
        if (!cancelled) setDetail(d ?? null)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load run')
      })
    return () => {
      cancelled = true
    }
  }, [callApi, endpoint])

  if (error) {
    return (
      <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-sm text-gray-500 dark:text-gray-400">
        Loading run…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!hideSummary && <RunSummary run={detail.run} />}
      <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-100 dark:border-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Timeline ({detail.events.length} events)
        </div>
        <ol className="divide-y divide-gray-100 dark:divide-gray-800">
          {detail.events.map(e => (
            <EventRow key={e.seq} event={e} />
          ))}
          {detail.events.length === 0 && (
            <li className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400">
              No events recorded for this run.
            </li>
          )}
        </ol>
      </div>
    </div>
  )
}

export function RunSummary({ run }: { run: SuggestionRunView }) {
  const durationMs = run.finished_at
    ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
    : null
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-xs text-gray-700 dark:text-gray-300">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <StatusBadge status={run.status} />
        <span>
          <span className="text-gray-500 dark:text-gray-400">Triggered by </span>
          <span className="font-medium">{run.triggered_by}</span>
        </span>
        <span>
          <span className="text-gray-500 dark:text-gray-400">Provider </span>
          <span className="font-medium">{run.provider_type}</span>
          {run.model_id && <span className="text-gray-500 dark:text-gray-400"> ({run.model_id})</span>}
        </span>
        <span>
          <span className="text-gray-500 dark:text-gray-400">Started </span>
          <span className="font-medium">{new Date(run.started_at).toLocaleString()}</span>
        </span>
        {durationMs !== null && (
          <span>
            <span className="text-gray-500 dark:text-gray-400">Duration </span>
            <span className="font-medium">{formatDuration(durationMs)}</span>
          </span>
        )}
        <span>
          <span className="text-gray-500 dark:text-gray-400">Tokens </span>
          <span className="font-medium">{run.tokens_in.toLocaleString()} in</span>
          <span className="text-gray-500 dark:text-gray-400"> / </span>
          <span className="font-medium">{run.tokens_out.toLocaleString()} out</span>
        </span>
        <span>
          <span className="text-gray-500 dark:text-gray-400">Cost </span>
          <span className="font-medium">${run.estimated_cost_usd.toFixed(4)}</span>
        </span>
      </div>
      {run.error && (
        <div className="mt-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-2 text-red-700 dark:text-red-300">
          <span className="font-semibold">Error:</span> {run.error}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'completed'
      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
      : status === 'failed'
        ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
        : status === 'running'
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}>{status}</span>
}

// Events that are visually noisy (one per candidate) start collapsed.
const DEFAULT_COLLAPSED = new Set(['enrichment_decision', 'read_next_match'])

function EventRow({ event }: { event: SuggestionRunEvent }) {
  const [open, setOpen] = useState(!DEFAULT_COLLAPSED.has(event.type))
  return (
    <li className="px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-2 text-left"
      >
        <svg
          className={`mt-1 h-3 w-3 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-mono text-gray-400 dark:text-gray-500">#{event.seq}</span>
            <TypeBadge type={event.type} />
            <EventHeadline event={event} />
            <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">
              {new Date(event.created_at).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </button>
      {open && <EventBody event={event} />}
    </li>
  )
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    pipeline_start: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    pipeline_end: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    prompt: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    backfill_prompt: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    ai_response: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
    backfill_response: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
    enrichment_decision: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    read_next_match: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    error: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  }
  const cls = styles[type] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{type}</span>
}

// EventHeadline renders a short one-line summary for known event types so
// the collapsed timeline is scannable without expanding every row.
function EventHeadline({ event }: { event: SuggestionRunEvent }) {
  const c = event.content
  switch (event.type) {
    case 'enrichment_decision': {
      const outcome = str(c.outcome)
      const title = str(c.title)
      const reason = str(c.reason)
      return (
        <span className="text-gray-700 dark:text-gray-300 truncate">
          {outcome === 'accepted' ? '✓' : '✗'} {title}
          {outcome === 'rejected' && reason && (
            <span className="text-gray-400 dark:text-gray-500"> — {reason}</span>
          )}
        </span>
      )
    }
    case 'read_next_match': {
      const outcome = str(c.outcome)
      const title = str(c.title)
      const reason = str(c.reason)
      return (
        <span className="text-gray-700 dark:text-gray-300 truncate">
          {outcome === 'accepted' ? '✓' : '✗'} {title}
          {outcome === 'rejected' && reason && (
            <span className="text-gray-400 dark:text-gray-500"> — {reason}</span>
          )}
        </span>
      )
    }
    case 'ai_response':
    case 'backfill_response':
      return (
        <span className="text-gray-500 dark:text-gray-400">
          {num(c.tokens_in)} in / {num(c.tokens_out)} out
        </span>
      )
    case 'pipeline_start':
      return (
        <span className="text-gray-500 dark:text-gray-400">
          {num(c.library_titles)} titles, {num(c.blocks)} blocks
        </span>
      )
    case 'pipeline_end':
      return (
        <span className="text-gray-500 dark:text-gray-400">
          {num(c.buy_count)} buy, {num(c.read_next_count)} read_next
        </span>
      )
    case 'error':
      return <span className="text-red-600 dark:text-red-400 truncate">{str(c.error)}</span>
    default:
      return null
  }
}

function EventBody({ event }: { event: SuggestionRunEvent }) {
  const c = event.content
  // Prompts and AI responses have a prominent text blob — render it with
  // a monospace block so newlines are preserved.
  const textKey =
    event.type === 'prompt' || event.type === 'backfill_prompt'
      ? 'prompt'
      : event.type === 'ai_response' || event.type === 'backfill_response'
        ? 'text'
        : null

  return (
    <div className="mt-2 ml-5 space-y-2">
      {textKey && typeof c[textKey] === 'string' && (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/50 p-2 text-[11px] font-mono text-gray-800 dark:text-gray-200">
          {String(c[textKey])}
        </pre>
      )}
      {event.type === 'enrichment_decision' && c.metadata_lookup ? (
        <MetadataLookup lookup={c.metadata_lookup} />
      ) : null}
      <details className="text-[11px] text-gray-500 dark:text-gray-400">
        <summary className="cursor-pointer select-none">Raw JSON</summary>
        <pre className="mt-1 max-h-64 overflow-auto rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/50 p-2 font-mono text-gray-700 dark:text-gray-300">
          {JSON.stringify(c, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function MetadataLookup({ lookup }: { lookup: unknown }) {
  if (!lookup || typeof lookup !== 'object') return null
  const l = lookup as Record<string, unknown>
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/50 px-2 py-1.5 text-[11px]">
      <span className="text-gray-500 dark:text-gray-400">Metadata provider resolved: </span>
      <span className="font-medium text-gray-800 dark:text-gray-200">{str(l.title)}</span>
      {typeof l.authors === 'string' && l.authors !== '' && (
        <span className="text-gray-500 dark:text-gray-400"> — {l.authors}</span>
      )}
    </div>
  )
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : 0
}
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rs = Math.floor(s % 60)
  return `${m}m ${rs}s`
}
