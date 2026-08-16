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
      <div className="rounded-lg bg-danger-surface border border-danger-line px-4 py-3 text-sm text-danger-strong">
        {error}
      </div>
    )
  }
  if (schedules === null) {
    return <div className="text-sm text-content-subtle">Loading schedules…</div>
  }
  if (schedules.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-content-muted">
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
    <div className="rounded-lg border border-line bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-surface-muted">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-content">{initial.display_name}</h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              enabled
                ? 'bg-success-surface text-success ring-1 ring-success-line'
                : 'bg-surface-inset text-content-muted'
            }`}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
            {initial.last_fired_at && (
              <span className="text-xs text-content-subtle">
                Last fired: {new Date(initial.last_fired_at).toLocaleString()}
              </span>
            )}
          </div>
          {initial.description && (
            <p className="text-xs text-content-muted mt-0.5">{initial.description}</p>
          )}
        </div>
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
          />
          <div className="w-10 h-6 bg-surface-strong peer-focus:outline-none rounded-full peer peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface-raised after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">
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
          <p className="mt-2 font-mono text-xs text-content-tertiary">{cron}</p>
          {cronErr && (
            <p className="mt-1 text-xs text-danger">{cronErr.description}</p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setCron(initial.cron); setEnabled(initial.enabled); setCronErr(undefined) }}
            disabled={!dirty || saving}
            className="rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-inset disabled:opacity-50 transition-colors"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || !!cronErr}
            className="rounded-md border border-accent-line bg-accent-surface px-3 py-1.5 text-sm font-medium text-accent-strong hover:bg-accent-surface disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
