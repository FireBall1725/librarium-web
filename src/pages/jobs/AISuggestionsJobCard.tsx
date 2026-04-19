// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useMemo, useState } from 'react'
import { useAuth, ApiError } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'
import RunDetailPanel, { RunSummary } from '../../components/RunDetailPanel'
import type { AISuggestionsJobConfig, SuggestionRunView } from '../../types'

// INTERVAL_PRESETS are friendly labels over minute counts. Custom values stay
// editable in the raw input so admins can pick anything.
const INTERVAL_PRESETS: Array<{ minutes: number; label: string }> = [
  { minutes: 60,       label: 'Every hour' },
  { minutes: 6 * 60,   label: 'Every 6 hours' },
  { minutes: 12 * 60,  label: 'Every 12 hours' },
  { minutes: 24 * 60,  label: 'Daily' },
  { minutes: 3 * 24 * 60, label: 'Every 3 days' },
  { minutes: 7 * 24 * 60, label: 'Weekly' },
]

function formatInterval(minutes: number): string {
  const p = INTERVAL_PRESETS.find(x => x.minutes === minutes)
  if (p) return p.label
  if (minutes <= 0) return 'Disabled'
  const h = minutes / 60
  if (h % 24 === 0 && h > 0) return `Every ${h / 24} day${h / 24 === 1 ? '' : 's'}`
  if (minutes % 60 === 0) return `Every ${h} hour${h === 1 ? '' : 's'}`
  return `Every ${minutes} minutes`
}

export default function AISuggestionsJobCard() {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const [config, setConfig] = useState<AISuggestionsJobConfig | null>(null)
  const [initial, setInitial] = useState<AISuggestionsJobConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [runs, setRuns] = useState<SuggestionRunView[] | null>(null)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  useEffect(() => {
    callApi<AISuggestionsJobConfig>('/api/v1/admin/jobs/ai-suggestions')
      .then(cfg => {
        if (cfg) {
          setConfig(cfg)
          setInitial(cfg)
        }
      })
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load job config'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadRuns = useMemo(
    () => () => {
      callApi<SuggestionRunView[]>('/api/v1/admin/jobs/ai-suggestions/runs')
        .then(data => setRuns(data ?? []))
        .catch(() => setRuns([]))
    },
    [callApi]
  )

  useEffect(() => {
    if (expanded) loadRuns()
  }, [expanded, loadRuns])

  // Poll while any run is in progress so status updates without manual refresh.
  const hasRunning = useMemo(() => (runs ?? []).some(r => r.status === 'running'), [runs])
  useEffect(() => {
    if (!expanded || !hasRunning) return
    const id = setInterval(loadRuns, 3000)
    return () => clearInterval(id)
  }, [expanded, hasRunning, loadRuns])

  const dirty = config !== null && initial !== null && JSON.stringify(config) !== JSON.stringify(initial)

  const set = <K extends keyof AISuggestionsJobConfig>(key: K, value: AISuggestionsJobConfig[K]) => {
    setConfig(prev => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    try {
      const updated = await callApi<AISuggestionsJobConfig>('/api/v1/admin/jobs/ai-suggestions', {
        method: 'PUT',
        body: JSON.stringify(config),
      })
      if (updated) {
        setConfig(updated)
        setInitial(updated)
        showToast('Job config saved', { variant: 'success' })
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save'
      setError(msg)
      showToast(msg, { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleRunNow = async () => {
    setRunning(true)
    try {
      const res = await callApi<{ enqueued: number }>('/api/v1/admin/jobs/ai-suggestions/run', {
        method: 'POST',
      })
      showToast(
        res && typeof res.enqueued === 'number'
          ? `Enqueued suggestions for ${res.enqueued} user${res.enqueued === 1 ? '' : 's'}`
          : 'Enqueued suggestions run',
        { variant: 'success' }
      )
      // Refresh the runs list so the newly-queued run appears right away;
      // the polling effect will flip it from running → completed in the background.
      loadRuns()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to enqueue run', { variant: 'error' })
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
        Loading job config…
      </div>
    )
  }

  if (!config) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 px-5 py-4 text-sm text-red-600 dark:text-red-400">
        {error ?? 'Failed to load job config.'}
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <svg
            className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">AI suggestions</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                config.enabled
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}>
                {config.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Generates per-user book suggestions using the active AI provider. {formatInterval(config.interval_minutes)}.
            </p>
          </div>
          <div onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleRunNow}
              disabled={running}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {running ? 'Running…' : 'Run now'}
            </button>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 px-5 py-5 space-y-4">
          {/* Enabled */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Enabled</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Master switch. When off, the scheduler won't enqueue any runs.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.enabled}
                onChange={e => set('enabled', e.target.checked)}
              />
              <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>

          {/* Cadence */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">Cadence</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              How often the scheduler should enqueue a run for each opted-in user.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={
                  INTERVAL_PRESETS.some(p => p.minutes === config.interval_minutes)
                    ? String(config.interval_minutes)
                    : '__custom__'
                }
                onChange={e => {
                  if (e.target.value !== '__custom__') {
                    set('interval_minutes', Number(e.target.value))
                  }
                }}
                className="rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {INTERVAL_PRESETS.map(p => (
                  <option key={p.minutes} value={p.minutes}>{p.label}</option>
                ))}
                <option value="__custom__">Custom…</option>
              </select>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={config.interval_minutes}
                  onChange={e => set('interval_minutes', Math.max(0, Number(e.target.value)))}
                  className="w-28 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">minutes</span>
              </div>
            </div>
          </div>

          {/* Per-user caps */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">Max buy suggestions / run</label>
              <input
                type="number"
                min={0}
                value={config.max_buy_per_user}
                onChange={e => set('max_buy_per_user', Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">Max read-next suggestions / run</label>
              <input
                type="number"
                min={0}
                value={config.max_read_next_per_user}
                onChange={e => set('max_read_next_per_user', Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Include taste profile */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Include taste profile in prompt</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Still gated by each user's opt-in and the deployment permission toggle.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.include_taste_profile}
                onChange={e => set('include_taste_profile', e.target.checked)}
              />
              <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>

          {/* User run rate limit */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">User run rate limit (per day)</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Maximum number of user-triggered "Run now" requests allowed per user in 24 hours. 0 disables user-triggered runs.
            </p>
            <input
              type="number"
              min={0}
              value={config.user_run_rate_limit_per_day}
              onChange={e => set('user_run_rate_limit_per_day', Math.max(0, Number(e.target.value)))}
              className="mt-1 w-28 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save config'}
            </button>
            {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
          </div>

          {/* Recent runs */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Recent runs</p>
              <button
                type="button"
                onClick={loadRuns}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Refresh
              </button>
            </div>
            {runs === null ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Loading runs…</p>
            ) : runs.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No runs yet. Click "Run now" above to enqueue one for every opted-in user.
              </p>
            ) : (
              <ul className="space-y-2">
                {runs.slice(0, 10).map(run => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedRunId(prev => (prev === run.id ? null : run.id))}
                      className="w-full text-left"
                    >
                      <RunSummary run={run} />
                    </button>
                    {expandedRunId === run.id && (
                      <div className="mt-2">
                        <RunDetailPanel
                          endpoint={`/api/v1/admin/jobs/ai-suggestions/runs/${run.id}`}
                          hideSummary
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
