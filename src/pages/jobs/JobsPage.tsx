// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { usePageTitle } from '../../hooks/usePageTitle'

// Schedule is the wire-shape returned by GET /admin/jobs/schedules —
// one row per registered schedulable kind. next_fire_at is computed
// server-side from the cron + last_fired_at; empty when the schedule
// is disabled.
interface Schedule {
  id: string
  kind: string
  display_name: string
  description: string
  cron: string
  enabled: boolean
  last_fired_at?: string
  next_fire_at?: string
}

// JobsPage is the jobs admin overview: a table of schedulable kinds with
// inline enabled toggles and a live countdown to the next run. Click a
// row or the edit button to drill into per-kind settings. Non-schedulable
// kinds (imports / enrichment) don't appear here — they surface in
// /admin/settings/jobs/history but have no settings page.
export default function JobsPage() {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const navigate = useNavigate()
  const [schedules, setSchedules] = useState<Schedule[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
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

  // Tick once a second so the "next run in X" column counts down in
  // real time. One interval covers every row — cheaper than per-row
  // timers.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const toggleEnabled = async (s: Schedule, enabled: boolean) => {
    try {
      await callApi(`/api/v1/admin/jobs/schedules/${encodeURIComponent(s.kind)}`, {
        method: 'PUT',
        body: JSON.stringify({ cron: s.cron, enabled, config: {} }),
      })
      showToast(
        enabled ? `${s.display_name} enabled` : `${s.display_name} disabled`,
        { variant: 'success' },
      )
      load()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save', { variant: 'error' })
    }
  }

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Scheduled background tasks."
        breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Jobs' }]}
        actions={
          <Link
            to="/admin/settings/jobs/history"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
          >
            History
          </Link>
        }
      />
      <div className="p-8 max-w-5xl mx-auto">
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
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {['Name', 'Cron', 'Next run', 'Enabled', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {schedules.map(s => (
                  <tr
                    key={s.kind}
                    onClick={() => navigate(`/admin/settings/jobs/${encodeURIComponent(s.kind)}`)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{s.display_name}</p>
                      {s.description && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 max-w-md">
                          {s.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {s.cron}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {s.enabled && s.next_fire_at
                        ? formatCountdown(new Date(s.next_fire_at).getTime() - now)
                        : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={s.enabled}
                          onChange={e => toggleEnabled(s, e.target.checked)}
                        />
                        <div className="w-9 h-5 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <Link
                        to={`/admin/settings/jobs/${encodeURIComponent(s.kind)}`}
                        className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// formatCountdown turns milliseconds-until-fire into a compact
// "3h 10m 42s" string. Drops larger units when they'd be zero and
// collapses to "due now" when the fire time has passed (shouldn't
// normally happen — the scheduler tick handles it — but defensive).
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'due now'
  const totalSecs = Math.floor(ms / 1000)
  const days = Math.floor(totalSecs / 86400)
  const hrs  = Math.floor((totalSecs % 86400) / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  const parts: string[] = []
  if (days > 0)               parts.push(`${days}d`)
  if (days > 0 || hrs  > 0)   parts.push(`${hrs}h`)
  if (days > 0 || hrs > 0 || mins > 0) parts.push(`${mins}m`)
  parts.push(`${secs}s`)
  return 'in ' + parts.join(' ')
}
