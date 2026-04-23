// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import { usePageTitle } from '../../hooks/usePageTitle'

// Schedule is the wire-shape returned by GET /admin/jobs/schedules —
// one row per registered schedulable kind.
interface Schedule {
  id: string
  kind: string
  display_name: string
  description: string
  cron: string
  enabled: boolean
  last_fired_at?: string
}

// JobsPage is the jobs admin overview: a grid of cards, one per
// schedulable kind. Non-schedulable kinds (imports / enrichment kicked
// off by user actions) intentionally don't appear here — their rows
// surface in /admin/settings/jobs/history but they have no settings
// page. Click a card to drill into per-kind settings.
export default function JobsPage() {
  const { callApi } = useAuth()
  const [schedules, setSchedules] = useState<Schedule[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  usePageTitle('Jobs')

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await callApi<Schedule[]>('/api/v1/admin/jobs/schedules')
      setSchedules(list ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load jobs')
    }
  }, [callApi])

  useEffect(() => { load() }, [load])

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Scheduled background tasks. Click any job to configure or run."
        breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Jobs' }]}
        actions={
          <Link
            to="/admin/settings/jobs/history"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
          >
            View history →
          </Link>
        }
      />
      <div className="p-8 max-w-4xl mx-auto">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {schedules === null ? (
          <div className="text-sm text-gray-400 dark:text-gray-500">Loading…</div>
        ) : schedules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No scheduled jobs registered</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {schedules.map(s => (
              <JobOverviewCard key={s.kind} schedule={s} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function JobOverviewCard({ schedule }: { schedule: Schedule }) {
  return (
    <Link
      to={`/admin/settings/jobs/${encodeURIComponent(schedule.kind)}`}
      className="block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {schedule.display_name}
        </h3>
        <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          schedule.enabled
            ? 'bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
        }`}>
          {schedule.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      {schedule.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{schedule.description}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
        <span className="font-mono">{schedule.cron}</span>
        {schedule.last_fired_at && (
          <span>Last fired {new Date(schedule.last_fired_at).toLocaleString()}</span>
        )}
      </div>
    </Link>
  )
}
