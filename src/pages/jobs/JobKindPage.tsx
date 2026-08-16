// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { usePageTitle } from '../../hooks/usePageTitle'
import AISuggestionsJobCard from './AISuggestionsJobCard'
import HistoryPruneJobCard from './HistoryPruneJobCard'
import JobSchedulesSection from './JobSchedulesSection'

interface Schedule {
  kind: string
  display_name: string
  description: string
  cron: string
  enabled: boolean
  last_fired_at?: string
}

interface UnifiedJobRow {
  id: string
  kind: string
  status: string
  triggered_by: string
  error?: string
  progress: Record<string, unknown>
  started_at?: string | null
  finished_at?: string | null
  created_at: string
}

// JobKindPage is the per-kind settings surface: schedule editor +
// (for AI suggestions) the provider-specific config + a "Run now"
// button + recent runs filtered to this kind. Reached from the jobs
// overview.
export default function JobKindPage() {
  const { kind = '' } = useParams<{ kind: string }>()
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [recent, setRecent] = useState<UnifiedJobRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  usePageTitle(schedule ? schedule.display_name : 'Job')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [schedules, history] = await Promise.all([
        callApi<Schedule[]>('/api/v1/admin/jobs/schedules'),
        callApi<{ items: UnifiedJobRow[] }>(
          `/api/v1/admin/jobs/history?kind=${encodeURIComponent(kind)}&limit=10`,
        ),
      ])
      const match = (schedules ?? []).find(s => s.kind === kind)
      setSchedule(match ?? null)
      setRecent(history?.items ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load job')
    }
  }, [callApi, kind])

  useEffect(() => { load() }, [load])

  // Run now uses the generic /admin/jobs/schedules/:kind/run endpoint,
  // which fires the kind's Enqueue hook directly with triggered_by=admin.
  // Works for every kind that has an Enqueue registered.
  const runNow = async () => {
    setRunning(true)
    try {
      await callApi(`/api/v1/admin/jobs/schedules/${encodeURIComponent(kind)}/run`, {
        method: 'POST',
      })
      showToast(`${schedule?.display_name || kind} run queued`, { variant: 'success' })
      setTimeout(load, 1500)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to run', { variant: 'error' })
    } finally {
      setRunning(false)
    }
  }

  const runNowAvailable = useMemo(() => schedule !== null, [schedule])

  if (error) {
    return (
      <>
        <PageHeader title="Job" breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Jobs', to: '/settings/jobs' }]} />
        <div className="max-w-3xl px-8 py-8">
          <div className="rounded-lg bg-danger-surface border border-danger-line px-4 py-3 text-sm text-danger-strong">
            {error}
          </div>
        </div>
      </>
    )
  }

  const title = schedule?.display_name || kind || 'Job'

  return (
    <>
      <PageHeader
        title={title}
        description={schedule?.description}
        breadcrumbs={[
          { label: 'Settings', to: '/settings' },
          { label: 'Jobs', to: '/settings/jobs' },
          { label: title },
        ]}
        actions={runNowAvailable ? (
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="rounded-lg border border-accent-line bg-accent-surface px-3 py-2 text-sm font-medium text-accent-strong hover:bg-accent-surface disabled:opacity-50 transition-colors"
          >
            {running ? 'Running…' : 'Run now'}
          </button>
        ) : undefined}
      />
      <div className="max-w-3xl px-8 py-8 space-y-6">
        {/* Schedule editor. Uses the existing section but filtered to
            this one kind. */}
        {schedule ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-content-muted">
              Schedule
            </h2>
            <JobSchedulesSection kind={kind} />
          </section>
        ) : (
          <div className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-content-muted">
            No schedule registered for this kind.
          </div>
        )}

        {/* AI suggestions carries extra config beyond the cron — model
            caps, token budgets, per-user cooldown. Rendered inline. */}
        {kind === 'ai_suggestions' && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-content-muted">
              Configuration
            </h2>
            <AISuggestionsJobCard onRunKicked={() => setTimeout(load, 1500)} />
          </section>
        )}

        {/* History cleanup carries the retention window in its schedule
            config rather than a kind-specific endpoint. */}
        {kind === 'history_prune' && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-content-muted">
              Retention
            </h2>
            <HistoryPruneJobCard />
          </section>
        )}

        {/* Recent runs for this kind — drops users into the history
            page for a full list. */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-content-muted">
              Recent runs
            </h2>
            <Link
              to={`/admin/settings/jobs/history?kind=${encodeURIComponent(kind)}`}
              className="text-xs text-accent hover:underline"
            >
              View all →
            </Link>
          </div>
          <RecentRuns rows={recent} />
        </section>
      </div>
    </>
  )
}

function RecentRuns({ rows }: { rows: UnifiedJobRow[] | null }) {
  if (rows === null) {
    return <div className="text-sm text-content-subtle">Loading…</div>
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-content-muted">
        No runs yet.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-line bg-surface divide-y divide-line-subtle">
      {rows.map(r => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <StatusDot status={r.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-content-strong font-medium capitalize">
                {r.status}
              </span>
              <span className="text-xs text-content-subtle">
                · {new Date(r.created_at).toLocaleString()}
              </span>
              <span className="text-xs text-content-subtle">
                · {r.triggered_by}
              </span>
            </div>
            {r.error && (
              <p className="mt-0.5 text-xs text-danger">{r.error}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const cls = status === 'completed' ? 'bg-success'
    : status === 'running'   ? 'bg-accent animate-pulse'
    : status === 'failed'    ? 'bg-danger'
    : status === 'cancelled' ? 'bg-content-faint'
    :                          'bg-warning'
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />
}
