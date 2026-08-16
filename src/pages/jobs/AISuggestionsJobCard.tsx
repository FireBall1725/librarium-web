// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState } from 'react'
import { useAuth, ApiError } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'
import type { AISuggestionsJobConfig } from '../../types'

interface AISuggestionsJobCardProps {
  // Fires after a successful Run now so the parent can reload the jobs list
  // and surface the new run immediately.
  onRunKicked?: () => void
}

export default function AISuggestionsJobCard({ onRunKicked }: AISuggestionsJobCardProps = {}) {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const [config, setConfig] = useState<AISuggestionsJobConfig | null>(null)
  const [initial, setInitial] = useState<AISuggestionsJobConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

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
      // Ask the parent to refresh its jobs list so the new run appears
      // without the admin needing to reload the page.
      onRunKicked?.()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to enqueue run', { variant: 'error' })
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="border border-line rounded-xl bg-surface px-5 py-4 text-sm text-content-muted">
        Loading job config…
      </div>
    )
  }

  if (!config) {
    return (
      <div className="border border-line rounded-xl bg-surface px-5 py-4 text-sm text-danger">
        {error ?? 'Failed to load job config.'}
      </div>
    )
  }

  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-5 py-4 hover:bg-surface-muted transition-colors"
      >
        <div className="flex items-center gap-4">
          <svg
            className={`w-4 h-4 text-content-subtle flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-content">AI suggestions</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                config.enabled
                  ? 'bg-success-surface text-success-strong'
                  : 'bg-surface-inset text-content-muted'
              }`}>
                {config.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-content-muted mt-0.5">
              Generates per-user book suggestions using the active AI provider. Schedule is managed above.
            </p>
          </div>
          <div onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleRunNow}
              disabled={running}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-inset disabled:opacity-50 transition-colors"
            >
              {running ? 'Running…' : 'Run now'}
            </button>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line-subtle bg-surface-muted px-5 py-5 space-y-4">
          {/* Enabled */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-content">Enabled</p>
              <p className="text-xs text-content-muted mt-0.5">
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
 <div className="w-10 h-6 bg-surface-strong peer-focus:outline-none rounded-full peer peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface-raised after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>

          {/* Per-user cooldown — separate concern from the schedule cron
              above. The scheduler fires on the cron; this value gates each
              individual user so they don't get a new run more often than
              this even if the cron fires more frequently. */}
          <div>
            <label className="block text-sm font-medium text-content">Per-user cooldown</label>
            <p className="text-xs text-content-muted mt-0.5">
              Minimum time between scheduled runs for the same user. Manual and admin runs bypass this.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={config.interval_minutes}
                onChange={e => set('interval_minutes', Math.max(0, Number(e.target.value)))}
                className="w-28 rounded-md border border-line-strong dark:bg-surface-raised dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <span className="text-xs text-content-muted">minutes</span>
            </div>
          </div>

          {/* Per-user caps */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-content">Max buy suggestions / run</label>
              <input
                type="number"
                min={0}
                value={config.max_buy_per_user}
                onChange={e => set('max_buy_per_user', Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-md border border-line-strong dark:bg-surface-raised dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content">Max read-next suggestions / run</label>
              <input
                type="number"
                min={0}
                value={config.max_read_next_per_user}
                onChange={e => set('max_read_next_per_user', Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-md border border-line-strong dark:bg-surface-raised dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Include taste profile */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-content">Include taste profile in prompt</p>
              <p className="text-xs text-content-muted mt-0.5">
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
 <div className="w-10 h-6 bg-surface-strong peer-focus:outline-none rounded-full peer peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface-raised after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
 </label>
 </div>

 {/* Max tokens */}
 <div className="grid gap-3 sm:grid-cols-2">
 <div>
 <label className="block text-sm font-medium text-content">Max tokens (initial pass)</label>
 <p className="text-xs text-content-muted mt-0.5">
 Output-token cap for the first suggestion request. Thinking models (qwen3, deepseek-r1, extended-thinking Claude) need a higher cap — 6000 is a reasonable starting point.
 </p>
 <input
 type="number"
 min={0}
 value={config.max_tokens_initial}
 onChange={e => set('max_tokens_initial', Math.max(0, Number(e.target.value)))}
 className="mt-1 w-28 rounded-md border border-line-strong dark:bg-surface-raised px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-content dark:text-white">Max tokens (backfill)</label>
 <p className="text-xs text-content-muted mt-0.5">
 Cap for each backfill retry when the first pass didn't fill every slot. Smaller is fine because backfill only asks for what's missing.
              </p>
              <input
                type="number"
                min={0}
                value={config.max_tokens_backfill}
                onChange={e => set('max_tokens_backfill', Math.max(0, Number(e.target.value)))}
 className="mt-1 w-28 rounded-md border border-line-strong dark:bg-surface-raised px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
 />
 </div>
 </div>

 {/* User run rate limit */}
 <div>
 <label className="block text-sm font-medium text-content dark:text-white">User run rate limit (per day)</label>
 <p className="text-xs text-content-muted mt-0.5">
 Maximum number of user-triggered "Run now" requests allowed per user in 24 hours. Check "Unlimited" for local providers like Ollama or Osaurus; <code>0</code> disables user-triggered runs entirely.
 </p>
 <div className="mt-1 flex items-center gap-3">
 <input
 type="number"
 min={0}
 value={config.user_run_rate_limit_per_day < 0 ? '' : config.user_run_rate_limit_per_day}
                disabled={config.user_run_rate_limit_per_day < 0}
                onChange={e => set('user_run_rate_limit_per_day', Math.max(0, Number(e.target.value)))}
 className="w-28 rounded-md border border-line-strong dark:bg-surface-raised dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
 />
 <label className="inline-flex items-center gap-2 text-sm text-content-secondary cursor-pointer select-none">
 <input
 type="checkbox"
 checked={config.user_run_rate_limit_per_day < 0}
 onChange={e => set('user_run_rate_limit_per_day', e.target.checked ? -1 : 1)}
 className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
 />
 Unlimited
 </label>
 </div>
 </div>

 <div className="flex items-center gap-3 pt-2">
 <button
 type="button"
 onClick={handleSave}
 disabled={saving || !dirty}
 className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition-colors"
 >
 {saving ? 'Saving…' : 'Save config'}
            </button>
            {error && <span className="text-sm text-danger">{error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
