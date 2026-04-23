// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { usePageTitle } from '../../hooks/usePageTitle'
import AISuggestionsJobCard from './AISuggestionsJobCard'
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

  // Run now posts to the kind-specific endpoint; each kind wires a
  // different admin trigger. AI suggestions uses the scheduled fanout
  // path; cover backfill has no admin trigger yet (cron-only).
  const runNow = async () => {
    setRunning(true)
    try {
      switch (kind) {
        case 'ai_suggestions':
          await callApi('/api/v1/admin/jobs/ai-suggestions/run', { method: 'POST' })
          showToast('AI suggestions run queued', { variant: 'success' })
          break
        default:
          showToast('Run Now is not available for this job', { variant: 'error' })
      }
      // Short delay then reload so the new row shows up in recent runs.
      setTimeout(load, 1500)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to run', { variant: 'error' })
    } finally {
      setRunning(false)
    }
  }

  const runNowAvailable = useMemo(() => kind === 'ai_suggestions', [kind])

  if (error) {
    return (
      <>
        <PageHeader title="Job" breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Jobs', to: '/admin/settings/jobs' }]} />
        <div className="p-8 max-w-3xl mx-auto">
          <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
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
          { label: 'Settings', to: '/admin/settings' },
          { label: 'Jobs', to: '/admin/settings/jobs' },
          { label: title },
        ]}
        actions={runNowAvailable ? (
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
          >
            {running ? 'Running…' : 'Run now'}
          </button>
        ) : undefined}
      />
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        {/* Schedule editor. Uses the existing section but filtered to
            this one kind. */}
        {schedule ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Schedule
            </h2>
            <JobSchedulesSection kind={kind} />
          </section>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No schedule registered for this kind.
          </div>
        )}

        {/* AI suggestions carries extra config beyond the cron — model
            caps, token budgets, per-user cooldown. Rendered inline. */}
        {kind === 'ai_suggestions' && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Configuration
            </h2>
            <AISuggestionsJobCard onRunKicked={() => setTimeout(load, 1500)} />
          </section>
        )}

        {/* Recent runs for this kind — drops users into the history
            page for a full list. */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Recent runs
            </h2>
            <Link
              to={`/admin/settings/jobs/history?kind=${encodeURIComponent(kind)}`}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
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
    return <div className="text-sm text-gray-400 dark:text-gray-500">Loading…</div>
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No runs yet.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
      {rows.map(r => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <StatusDot status={r.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-800 dark:text-gray-200 font-medium capitalize">
                {r.status}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                · {new Date(r.created_at).toLocaleString()}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                · {r.triggered_by}
              </span>
            </div>
            {r.error && (
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{r.error}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const cls = status === 'completed' ? 'bg-green-500'
    : status === 'running'   ? 'bg-blue-500 animate-pulse'
    : status === 'failed'    ? 'bg-red-500'
    : status === 'cancelled' ? 'bg-gray-400'
    :                          'bg-amber-400'
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />
}
