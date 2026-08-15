// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useState } from 'react'
import { useAuth, ApiError } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'

// Retention lives in job_schedules.config for the history_prune kind, so
// saving it means writing the whole schedule row back — cron and enabled
// included, or the PUT would clear them.
interface PruneSchedule {
  kind: string
  cron: string
  enabled: boolean
  config: { max_age_days?: number; max_per_kind?: number }
}

// Mirrors DefaultRetentionMaxAgeDays / DefaultRetentionMaxPerKind on the
// api. Only used to fill the form when the schedule row carries no config
// yet; the api applies the same numbers when the keys are absent.
const DEFAULT_MAX_AGE_DAYS = 30
const DEFAULT_MAX_PER_KIND = 200

export default function HistoryPruneJobCard() {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const [schedule, setSchedule] = useState<PruneSchedule | null>(null)
  const [maxAgeDays, setMaxAgeDays] = useState(DEFAULT_MAX_AGE_DAYS)
  const [maxPerKind, setMaxPerKind] = useState(DEFAULT_MAX_PER_KIND)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await callApi<PruneSchedule[]>('/api/v1/admin/jobs/schedules')
      const row = (list ?? []).find(s => s.kind === 'history_prune') ?? null
      setSchedule(row)
      setMaxAgeDays(row?.config?.max_age_days ?? DEFAULT_MAX_AGE_DAYS)
      setMaxPerKind(row?.config?.max_per_kind ?? DEFAULT_MAX_PER_KIND)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load retention config')
    } finally {
      setLoading(false)
    }
  }, [callApi])

  useEffect(() => { load() }, [load])

  const dirty = schedule !== null && (
    maxAgeDays !== (schedule.config?.max_age_days ?? DEFAULT_MAX_AGE_DAYS) ||
    maxPerKind !== (schedule.config?.max_per_kind ?? DEFAULT_MAX_PER_KIND)
  )

  const save = async () => {
    if (!schedule) return
    setSaving(true)
    setError(null)
    try {
      await callApi('/api/v1/admin/jobs/schedules/history_prune', {
        method: 'PUT',
        body: JSON.stringify({
          cron: schedule.cron,
          enabled: schedule.enabled,
          config: { max_age_days: maxAgeDays, max_per_kind: maxPerKind },
        }),
      })
      showToast('Retention saved', { variant: 'success' })
      await load()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save retention'
      setError(msg)
      showToast(msg, { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
        Loading retention config…
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 px-5 py-4 text-sm text-red-600 dark:text-red-400">
        {error ?? 'No history_prune schedule registered.'}
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 px-5 py-5 space-y-5">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Each sweep deletes finished runs that fall outside either limit, along with their
        event logs, per-row items, and AI call records. Pending and running jobs are never
        touched. Set a limit to <code>0</code> to switch it off.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="prune-max-age" className="block text-sm font-medium text-gray-900 dark:text-white">
            Keep history for
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Age limit. Finished runs older than this are deleted.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="prune-max-age"
              type="number"
              min={0}
              max={3650}
              value={maxAgeDays}
              onChange={e => setMaxAgeDays(Math.max(0, Number(e.target.value)))}
              className="w-28 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">days</span>
          </div>
        </div>

        <div>
          <label htmlFor="prune-max-per-kind" className="block text-sm font-medium text-gray-900 dark:text-white">
            Keep at most
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Count limit, applied per job kind. The newest runs survive.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="prune-max-per-kind"
              type="number"
              min={0}
              max={100000}
              value={maxPerKind}
              onChange={e => setMaxPerKind(Math.max(0, Number(e.target.value)))}
              className="w-28 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">runs per kind</span>
          </div>
        </div>
      </div>

      {maxAgeDays === 0 && maxPerKind === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Both limits are off, so nothing will be deleted and job history will grow without bound.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save retention'}
        </button>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  )
}
