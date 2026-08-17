// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
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
  // Track status in a ref so the polling interval can self-terminate without
  // forcing the effect to restart every time detail changes.
  const statusRef = useRef<string | null>(null)
  const timelineRef = useRef<HTMLOListElement | null>(null)
  const eventCountRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError(null)
    statusRef.current = null

    const load = () =>
      callApi<SuggestionRunDetail>(endpoint)
        .then(d => {
          if (cancelled) return
          setDetail(d ?? null)
          statusRef.current = d?.run.status ?? null
        })
        .catch(err => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load run')
        })

    load()
    // Poll while the run is still live; stop once it reaches a terminal state.
    const id = setInterval(() => {
      if (cancelled) return
      const status = statusRef.current
      if (status && status !== 'running') return
      load()
    }, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [callApi, endpoint])

  // Auto-scroll the timeline to the bottom while the run is live and new
  // events are coming in. Admins who expand a running job want to watch the
  // tail — once the run finishes we stop yanking their scroll position.
  useEffect(() => {
    const count = detail?.events.length ?? 0
    const prev = eventCountRef.current
    eventCountRef.current = count
    if (statusRef.current !== 'running') return
    if (count <= prev) return
    const el = timelineRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [detail])

  if (error) {
    // Expanding an orchestrator/dispatcher umbrella row (e.g. the admin
    // Run Now wrapper around per-user fanout) has no associated run
    // record — GetRun 404s with "run not found". Render a neutral
    // placeholder instead of a red error, since nothing actually failed.
    if (/not found/i.test(error)) {
      return (
        <div className="rounded-md border border-line bg-surface-muted p-3 text-sm text-content-muted">
          This entry is a dispatcher — the per-user suggestion runs it queued each have their own row below.
        </div>
      )
    }
    return (
      <div className="rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger-strong">
        {error}
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="rounded-md border border-line bg-surface-muted p-3 text-sm text-content-muted">
        Loading run…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!hideSummary && <RunSummary run={detail.run} />}
      <div className="rounded-md border border-line bg-surface">
        <div className="border-b border-line-subtle px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
          Timeline ({detail.events.length} events)
        </div>
        <ol
          ref={timelineRef}
          className="max-h-96 overflow-auto divide-y divide-line-subtle"
        >
          {detail.events.map(e => (
            <EventRow key={e.seq} event={e} />
          ))}
          {detail.events.length === 0 && (
            <li className="px-3 py-4 text-xs text-content-muted">
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
    <div className="rounded-md border border-line bg-surface p-3 text-xs text-content-secondary">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <StatusBadge status={run.status} />
        <span>
          <span className="text-content-muted">Triggered by </span>
          <span className="font-medium">{run.triggered_by}</span>
        </span>
        <span>
          <span className="text-content-muted">Provider </span>
          <span className="font-medium">{run.provider_type}</span>
          {run.model_id && <span className="text-content-muted"> ({run.model_id})</span>}
        </span>
        <span>
          <span className="text-content-muted">Started </span>
          <span className="font-medium">{new Date(run.started_at).toLocaleString()}</span>
        </span>
        {durationMs !== null && (
          <span>
            <span className="text-content-muted">Duration </span>
            <span className="font-medium">{formatDuration(durationMs)}</span>
          </span>
        )}
        <span>
          <span className="text-content-muted">Tokens </span>
          <span className="font-medium">{run.tokens_in.toLocaleString()} in</span>
          <span className="text-content-muted"> / </span>
          <span className="font-medium">{run.tokens_out.toLocaleString()} out</span>
        </span>
        <span>
          <span className="text-content-muted">Cost </span>
          <span className="font-medium">${run.estimated_cost_usd.toFixed(4)}</span>
        </span>
      </div>
      {run.error && (
        <div className="mt-2 rounded border border-danger-line bg-danger-surface p-2 text-danger-strong">
          <span className="font-semibold">Error:</span> {run.error}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'completed'
      ? 'bg-success-surface text-success-strong '
      : status === 'failed'
        ? 'bg-danger-surface text-danger-strong '
        : status === 'running'
          ? 'bg-accent-surface text-accent-strong '
          : 'bg-surface-inset text-content-tertiary '
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}>{status}</span>
}

function EventRow({ event }: { event: SuggestionRunEvent }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-2 text-left"
      >
        <svg
          className={`mt-1 h-3 w-3 flex-shrink-0 text-content-subtle transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-mono text-content-subtle">#{event.seq}</span>
            <TypeBadge type={event.type} />
            <EventHeadline event={event} />
            <span className="ml-auto text-[11px] text-content-subtle">
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
    pipeline_start: 'bg-accent-surface text-accent-strong ',
    pipeline_end: 'bg-accent-surface text-accent-strong ',
    prompt: 'bg-accent-surface text-accent-strong',
    backfill_prompt: 'bg-accent-surface text-accent-strong',
    ai_response: 'bg-accent-surface text-accent',
    backfill_response: 'bg-accent-surface text-accent',
    enrichment_decision: 'bg-warning-surface text-warning-strong ',
    read_next_match: 'bg-success-surface text-success',
    error: 'bg-danger-surface text-danger-strong ',
  }
  const cls = styles[type] ?? 'bg-surface-inset text-content-tertiary '
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
        <span className="text-content-secondary truncate">
          {outcome === 'accepted' ? '✓' : '✗'} {title}
          {outcome === 'rejected' && reason && (
            <span className="text-content-subtle"> — {reason}</span>
          )}
        </span>
      )
    }
    case 'read_next_match': {
      const outcome = str(c.outcome)
      const title = str(c.title)
      const reason = str(c.reason)
      return (
        <span className="text-content-secondary truncate">
          {outcome === 'accepted' ? '✓' : '✗'} {title}
          {outcome === 'rejected' && reason && (
            <span className="text-content-subtle"> — {reason}</span>
          )}
        </span>
      )
    }
    case 'ai_response':
    case 'backfill_response': {
      const model = str(c.model)
      return (
        <span className="text-content-muted">
          {num(c.tokens_in)} in / {num(c.tokens_out)} out
          {model && <span className="ml-2 text-content-subtle">· {model}</span>}
        </span>
      )
    }
    case 'pipeline_start': {
      const model = str(c.model)
      return (
        <span className="text-content-muted">
          {num(c.library_titles)} titles, {num(c.blocks)} blocks
          {model && <span className="ml-2 text-content-subtle">· {model}</span>}
        </span>
      )
    }
    case 'pipeline_end':
      return (
        <span className="text-content-muted">
          {num(c.buy_count)} buy, {num(c.read_next_count)} read_next
        </span>
      )
    case 'error':
      return <span className="text-danger truncate">{str(c.error)}</span>
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
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface-muted p-2 text-[11px] font-mono text-content-strong">
          {String(c[textKey])}
        </pre>
      )}
      {event.type === 'enrichment_decision' && (
        <EnrichmentDecisionBody content={c} />
      )}
      <details className="text-[11px] text-content-muted">
        <summary className="cursor-pointer select-none">Raw JSON</summary>
        <pre className="mt-1 max-h-64 overflow-auto rounded border border-line bg-surface-muted p-2 font-mono text-content-secondary">
          {JSON.stringify(c, null, 2)}
        </pre>
      </details>
    </div>
  )
}

// EnrichmentDecisionBody lays out the decision sub-panels in a way that makes
// the title+author fallback path legible: if we recovered from a bad ISBN,
// render the recovered book first, then relabel the primary lookup as the
// rejected candidate. A plain accept (primary ISBN resolved correctly) falls
// back to the original single-block layout.
function EnrichmentDecisionBody({ content }: { content: Record<string, unknown> }) {
  const recoveredVia = str(content.recovered_via)
  const primaryReject = str(content.primary_reject_reason)
  const recoveredTitle = str(content.recovered_title)
  const recoveredAuthor = str(content.recovered_author)
  const recoveredISBN = str(content.recovered_isbn)
  const metadataLookup = content.metadata_lookup

  if (recoveredVia) {
    const primaryLookup =
      metadataLookup && typeof metadataLookup === 'object'
        ? (metadataLookup as Record<string, unknown>)
        : null
    return (
      <div className="rounded border border-line bg-surface-muted px-2 py-1.5 text-[11px] space-y-1">
        <div>
          <span className="text-content-muted">ISBN lookup failed{primaryReject ? ` (${primaryReject})` : ''}</span>
          {primaryLookup && str(primaryLookup.title) !== '' && (
            <>
              <span className="text-content-muted"> — returned </span>
              <span className="font-medium text-content-strong">{str(primaryLookup.title)}</span>
              {typeof primaryLookup.authors === 'string' && primaryLookup.authors !== '' && (
                <span className="text-content-muted"> — {primaryLookup.authors}</span>
              )}
            </>
          )}
        </div>
        <div>
          <span className="text-content-muted">Matched via title+author: </span>
          <span className="font-medium text-content-strong">{recoveredTitle}</span>
          {recoveredAuthor && (
            <span className="text-content-muted"> — {recoveredAuthor}</span>
          )}
          {recoveredISBN && (
            <span className="text-content-subtle"> · ISBN {recoveredISBN}</span>
          )}
        </div>
      </div>
    )
  }

  if (metadataLookup && typeof metadataLookup === 'object') {
    return <MetadataLookup lookup={metadataLookup} label="Metadata provider resolved" />
  }
  return null
}

function MetadataLookup({ lookup, label }: { lookup: unknown; label: string }) {
  if (!lookup || typeof lookup !== 'object') return null
  const l = lookup as Record<string, unknown>
  return (
    <div className="rounded border border-line bg-surface-muted px-2 py-1.5 text-[11px]">
      <span className="text-content-muted">{label}: </span>
      <span className="font-medium text-content-strong">{str(l.title)}</span>
      {typeof l.authors === 'string' && l.authors !== '' && (
        <span className="text-content-muted"> — {l.authors}</span>
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
