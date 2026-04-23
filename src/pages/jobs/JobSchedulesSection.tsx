// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useState } from 'react'
import { Cron } from 'react-js-cron'
import type { CronError } from 'react-js-cron'
import 'react-js-cron/dist/styles.css'
import { useAuth, ApiError } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'

// Mirrors ScheduleView on the api side — one row per registered schedulable
// job kind. Config is intentionally kept opaque here; kind-specific config
// lives in the corresponding job card (e.g. AISuggestionsJobCard edits the
// AI suggestions config directly via /admin/jobs/ai-suggestions). This
// section only owns the cron expression + enabled flag.
interface Schedule {
  id: string
  kind: string
  display_name: string
  description: string
  cron: string
  enabled: boolean
  config: Record<string, unknown>
  last_fired_at?: string
}

interface JobSchedulesSectionProps {
  // kind filters to a single kind's schedule row. Used by the per-kind
  // settings page; omitted by the (future) multi-kind admin index.
  kind?: string
}

export default function JobSchedulesSection({ kind }: JobSchedulesSectionProps = {}) {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const [schedules, setSchedules] = useState<Schedule[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await callApi<Schedule[]>('/api/v1/admin/jobs/schedules')
      const filtered = kind ? (list ?? []).filter(s => s.kind === kind) : (list ?? [])
      setSchedules(filtered)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load schedules')
    }
  }, [callApi, kind])

  useEffect(() => { load() }, [load])

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        {error}
      </div>
    )
  }
  if (schedules === null) {
    return <div className="text-sm text-gray-400 dark:text-gray-500">Loading schedules…</div>
  }
  if (schedules.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No scheduled jobs registered.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {schedules.map(s => (
        <ScheduleRow
          key={s.kind}
          initial={s}
          onSaved={load}
          onError={setError}
          showToast={showToast}
        />
      ))}
    </div>
  )
}

function ScheduleRow({ initial, onSaved, onError, showToast }: {
  initial: Schedule
  onSaved: () => void
  onError: (msg: string) => void
  showToast: (msg: string, opts?: { variant?: 'success' | 'error' }) => void
}) {
  const { callApi } = useAuth()
  const [cron, setCron] = useState(initial.cron)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [cronErr, setCronErr] = useState<CronError>()
  const [saving, setSaving] = useState(false)

  // Detect dirty state so the Save button only lights up when there's
  // something to persist — prevents accidental churn of updated_at.
  const dirty = cron !== initial.cron || enabled !== initial.enabled

  const save = async () => {
    if (cronErr) {
      onError(cronErr.description || 'Invalid cron expression')
      return
    }
    setSaving(true)
    try {
      await callApi(`/api/v1/admin/jobs/schedules/${encodeURIComponent(initial.kind)}`, {
        method: 'PUT',
        body: JSON.stringify({ cron, enabled, config: initial.config }),
      })
      showToast(`${initial.display_name} schedule saved`, { variant: 'success' })
      onSaved()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save schedule', { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{initial.display_name}</h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              enabled
                ? 'bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
            {initial.last_fired_at && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Last fired: {new Date(initial.last_fired_at).toLocaleString()}
              </span>
            )}
          </div>
          {initial.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{initial.description}</p>
          )}
        </div>
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
          />
          <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Schedule (cron)
          </label>
          <div className="cron-editor">
            <Cron
              value={cron}
              setValue={(v: string) => setCron(v)}
              onError={setCronErr}
              clearButton={false}
            />
          </div>
          <p className="mt-2 font-mono text-xs text-gray-600 dark:text-gray-400">{cron}</p>
          {cronErr && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{cronErr.description}</p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setCron(initial.cron); setEnabled(initial.enabled); setCronErr(undefined) }}
            disabled={!dirty || saving}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || !!cronErr}
            className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
