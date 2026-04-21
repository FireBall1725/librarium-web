// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useState } from 'react'
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { AIProviderStatus, AIPermissions, AIConfigField } from '../../../types'
import PageHeader from '../../../components/PageHeader'
import { usePageTitle } from '../../../hooks/usePageTitle'

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; reply: string }
  | { status: 'fail'; error: string }

interface ProviderCardProps {
  provider: AIProviderStatus
  onSaved: (updated: AIProviderStatus[]) => void
  onActivate: (name: string) => void
  activating: boolean
}

function isSensitive(field: AIConfigField): boolean {
  return field.type === 'password' || field.key === 'api_key'
}

// OllamaModel mirrors the subset of /api/tags we expose through the Go proxy
// at /api/v1/admin/connections/ai/ollama/models. Size is bytes; parameter_size
// and quantization are descriptive strings like "7B" / "Q4_K_M" when present.
interface OllamaModel {
  name: string
  size: number
  modified: string
  digest: string
  family?: string
  parameter_size?: string
  quantization?: string
}

function formatOllamaSize(bytes: number): string {
  if (!bytes || bytes <= 0) return ''
  const gb = bytes / 1_073_741_824
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / 1_048_576
  return `${mb.toFixed(0)} MB`
}

// OllamaModelPicker renders a dropdown populated from the Ollama host's
// /api/tags (fetched via the Go proxy so the browser never talks to Ollama
// directly). Falls back to a plain text input if the host is unreachable —
// better to let the admin save a config they know is correct than to block
// them on a transient network error.
function OllamaModelPicker({
  value,
  onChange,
  placeholder,
  configuredBaseURL,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  configuredBaseURL: string
}) {
  const { callApi } = useAuth()
  const [models, setModels] = useState<OllamaModel[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customMode, setCustomMode] = useState(false)

  const fetchModels = useCallback(async () => {
    // No point fetching if the admin hasn't saved a base URL yet — the backend
    // reads the stored config, not a parameter. Show the text input and wait.
    if (!configuredBaseURL) {
      setModels(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await callApi<{ models: OllamaModel[] }>(
        '/api/v1/admin/connections/ai/ollama/models'
      )
      setModels(res?.models ?? [])
    } catch (err) {
      setModels(null)
      setError(err instanceof ApiError ? err.message : "couldn't reach Ollama")
    } finally {
      setLoading(false)
    }
  }, [callApi, configuredBaseURL])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // Unreachable or not yet configured → plain text input. Keeps the admin
  // unblocked: they can type a model name and save without the fetch working.
  if (!models || customMode) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {models && (
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Pick from installed models"
          >
            List
          </button>
        )}
        <button
          type="button"
          onClick={fetchModels}
          disabled={loading || !configuredBaseURL}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          title={configuredBaseURL ? 'Refresh model list' : 'Save a base URL first'}
        >
          {loading ? '…' : '↻'}
        </button>
        {error && !loading && (
          <span className="self-center text-xs text-amber-600 dark:text-amber-400">{error}</span>
        )}
      </div>
    )
  }

  const selectValue = models.some(m => m.name === value) ? value : ''

  return (
    <div className="flex gap-2">
      <select
        value={selectValue}
        onChange={e => {
          if (e.target.value === '__custom__') {
            setCustomMode(true)
            onChange('')
          } else {
            onChange(e.target.value)
          }
        }}
        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {models.length === 0 ? (
          <option value="">No models pulled — use `ollama pull` on the host</option>
        ) : (
          <>
            {selectValue === '' && <option value="">Select a model…</option>}
            {models.map(m => {
              const meta = [m.parameter_size, m.quantization, formatOllamaSize(m.size)]
                .filter(Boolean)
                .join(' · ')
              return (
                <option key={m.digest} value={m.name}>
                  {m.name}{meta ? ` — ${meta}` : ''}
                </option>
              )
            })}
          </>
        )}
        <option value="__custom__">Custom…</option>
      </select>
      <button
        type="button"
        onClick={fetchModels}
        disabled={loading}
        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        title="Refresh model list"
      >
        {loading ? '…' : '↻'}
      </button>
    </div>
  )
}

// OsaurusModel mirrors the subset of /v1/models we expose through the Go proxy
// at /api/v1/admin/connections/ai/osaurus/models. Osaurus returns OpenAI-shape
// records, so we only get an id and (optionally) owned_by — no size / quant
// metadata like Ollama provides.
interface OsaurusModel {
  id: string
  owned_by?: string
  created?: number
}

// OsaurusModelPicker mirrors OllamaModelPicker against the Osaurus server's
// /v1/models endpoint. Separate component because the data shape and "no
// models available" messaging differ — Osaurus models are pulled via the
// desktop app, not a CLI.
function OsaurusModelPicker({
  value,
  onChange,
  placeholder,
  configuredBaseURL,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  configuredBaseURL: string
}) {
  const { callApi } = useAuth()
  const [models, setModels] = useState<OsaurusModel[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customMode, setCustomMode] = useState(false)

  const fetchModels = useCallback(async () => {
    if (!configuredBaseURL) {
      setModels(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await callApi<{ models: OsaurusModel[] }>(
        '/api/v1/admin/connections/ai/osaurus/models'
      )
      setModels(res?.models ?? [])
    } catch (err) {
      setModels(null)
      setError(err instanceof ApiError ? err.message : "couldn't reach Osaurus")
    } finally {
      setLoading(false)
    }
  }, [callApi, configuredBaseURL])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  if (!models || customMode) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {models && (
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Pick from installed models"
          >
            List
          </button>
        )}
        <button
          type="button"
          onClick={fetchModels}
          disabled={loading || !configuredBaseURL}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          title={configuredBaseURL ? 'Refresh model list' : 'Save a base URL first'}
        >
          {loading ? '…' : '↻'}
        </button>
        {error && !loading && (
          <span className="self-center text-xs text-amber-600 dark:text-amber-400">{error}</span>
        )}
      </div>
    )
  }

  const selectValue = models.some(m => m.id === value) ? value : ''

  return (
    <div className="flex gap-2">
      <select
        value={selectValue}
        onChange={e => {
          if (e.target.value === '__custom__') {
            setCustomMode(true)
            onChange('')
          } else {
            onChange(e.target.value)
          }
        }}
        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {models.length === 0 ? (
          <option value="">No models downloaded — download one in the Osaurus app</option>
        ) : (
          <>
            {selectValue === '' && <option value="">Select a model…</option>}
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.id}{m.owned_by ? ` — ${m.owned_by}` : ''}
              </option>
            ))}
          </>
        )}
        <option value="__custom__">Custom…</option>
      </select>
      <button
        type="button"
        onClick={fetchModels}
        disabled={loading}
        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        title="Refresh model list"
      >
        {loading ? '…' : '↻'}
      </button>
    </div>
  )
}

// ProviderCard renders a single AI provider config card. Fields are driven by
// the server-declared `config_fields` so Anthropic (api_key + model), OpenAI
// (api_key + model), Ollama (base_url + model), and Osaurus (base_url +
// model + optional api_key) all render correctly without client-side shape
// knowledge.
function ProviderCard({ provider, onSaved, onActivate, activating }: ProviderCardProps) {
  const { callApi } = useAuth()
  const [values, setValues] = useState<Record<string, string>>({})
  const [enabled, setEnabled] = useState(provider.enabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })

  useEffect(() => {
    setEnabled(provider.enabled)
  }, [provider.enabled])

  // Seed non-sensitive values from the server config on mount / provider change
  // so the user sees their saved model ID / base URL and can edit in place.
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const f of provider.config_fields) {
      if (!isSensitive(f)) next[f.key] = provider.config?.[f.key] ?? ''
    }
    setValues(next)
  }, [provider])

  const setValue = (key: string, v: string) => {
    setValues(prev => ({ ...prev, [key]: v }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const body: Record<string, string> = { enabled: enabled ? 'true' : 'false' }
      for (const f of provider.config_fields) {
        const v = values[f.key] ?? ''
        // Only send a sensitive field if the user typed something. Omitting
        // preserves what's stored server-side (avoids clobbering saved keys).
        if (isSensitive(f)) {
          if (v) body[f.key] = v
        } else {
          body[f.key] = v
        }
      }
      const updated = await callApi<AIProviderStatus[]>(
        `/api/v1/admin/connections/ai/${provider.name}`,
        { method: 'PUT', body: JSON.stringify(body) }
      )
      if (updated) {
        onSaved(updated)
        // Clear sensitive inputs so the "(saved)" indicator is the source of truth.
        setValues(prev => {
          const next = { ...prev }
          for (const f of provider.config_fields) {
            if (isSensitive(f)) next[f.key] = ''
          }
          return next
        })
        setSuccess(true)
        setTimeout(() => setSuccess(false), 2000)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTestState({ status: 'testing' })
    try {
      const res = await callApi<{ ok: boolean; reply?: string; error?: string }>(
        `/api/v1/admin/connections/ai/${provider.name}/test`,
        { method: 'POST' }
      )
      if (res?.ok) {
        setTestState({ status: 'ok', reply: res.reply ?? '(no reply)' })
      } else {
        setTestState({ status: 'fail', error: res?.error ?? 'Unknown error' })
      }
    } catch (err) {
      setTestState({ status: 'fail', error: err instanceof ApiError ? err.message : 'Request failed' })
    }
  }

  const canToggleOn = !provider.config_fields.some(f => isSensitive(f) && f.required)
    || provider.has_api_key
    || Boolean(values['api_key'])

  return (
    <div className={`rounded-xl border bg-white dark:bg-gray-800 p-5 ${
      provider.active
        ? 'border-blue-500 ring-1 ring-blue-500/30 dark:border-blue-400'
        : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white">{provider.display_name}</h3>
            {provider.active && (
              <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                Active
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{provider.description}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0" title={
          !canToggleOn ? 'Save an API key first' : ''
        }>
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            disabled={!canToggleOn && !enabled}
          />
          <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>

      {provider.help_text && (
        <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
          {provider.help_text}
          {provider.help_url && (
            <> <a href={provider.help_url} target="_blank" rel="noopener noreferrer" className="font-medium underline hover:no-underline">Learn more →</a></>
          )}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {provider.config_fields.map(field => {
          const sensitive = isSensitive(field)
          const placeholder = sensitive && provider.has_api_key
            ? '••••••••••••••••'
            : field.placeholder ?? ''
          const isOllamaModel = provider.name === 'ollama' && field.key === 'model'
          const isOsaurusModel = provider.name === 'osaurus' && field.key === 'model'
          return (
            <div key={field.key} className={(field.options?.length || isOllamaModel || isOsaurusModel) ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {field.label}
                {sensitive && provider.has_api_key && (
                  <span className="ml-1 text-green-600 dark:text-green-400">(saved)</span>
                )}
                {field.required && !provider.has_api_key && sensitive && (
                  <span className="ml-1 text-gray-400">*</span>
                )}
              </label>
              {isOllamaModel ? (
                <OllamaModelPicker
                  value={values[field.key] ?? ''}
                  onChange={v => setValue(field.key, v)}
                  placeholder={placeholder}
                  configuredBaseURL={provider.config?.base_url ?? ''}
                />
              ) : isOsaurusModel ? (
                <OsaurusModelPicker
                  value={values[field.key] ?? ''}
                  onChange={v => setValue(field.key, v)}
                  placeholder={placeholder}
                  configuredBaseURL={provider.config?.base_url ?? ''}
                />
              ) : field.options && field.options.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    value={
                      field.options.includes(values[field.key] ?? '')
                        ? values[field.key] ?? ''
                        : '__custom__'
                    }
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setValue(field.key, '')
                      } else {
                        setValue(field.key, e.target.value)
                      }
                    }}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {field.options.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    <option value="__custom__">Custom…</option>
                  </select>
                  <input
                    type="text"
                    value={values[field.key] ?? ''}
                    onChange={e => setValue(field.key, e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <input
                  type={sensitive ? 'password' : field.type === 'url' ? 'url' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={e => setValue(field.key, e.target.value)}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
              {field.help_text && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.help_text}</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testState.status === 'testing' || !provider.enabled}
            title={!provider.enabled ? 'Enable the provider first' : ''}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {testState.status === 'testing' ? 'Testing…' : 'Test'}
          </button>
          {!provider.active && provider.enabled && (
            <button
              type="button"
              onClick={() => onActivate(provider.name)}
              disabled={activating}
              className="rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
            >
              {activating ? 'Activating…' : 'Set active'}
            </button>
          )}
          {success && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
        {testState.status === 'ok' && (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-700 dark:text-green-300">
            Connected — reply: <span className="font-medium">{testState.reply}</span>
          </div>
        )}
        {testState.status === 'fail' && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {testState.error}
          </div>
        )}
      </div>
    </div>
  )
}

const PERMISSION_ITEMS: Array<{ key: keyof AIPermissions; label: string; description: string }> = [
  {
    key: 'reading_history',
    label: 'Reading history',
    description: "Titles the user has read or is currently reading.",
  },
  {
    key: 'ratings',
    label: 'Ratings',
    description: 'Per-book star ratings and read status.',
  },
  {
    key: 'favourites',
    label: 'Favourites',
    description: 'Books the user has marked as favourites.',
  },
  {
    key: 'full_library',
    label: 'Full library',
    description: 'All books in the library, including unread candidates.',
  },
  {
    key: 'taste_profile',
    label: 'Taste profile',
    description: 'Genre / theme / author preferences from the profile form.',
  },
]

interface PermissionsCardProps {
  permissions: AIPermissions
  onSaved: (p: AIPermissions) => void
}

function PermissionsCard({ permissions, onSaved }: PermissionsCardProps) {
  const { callApi } = useAuth()
  const [local, setLocal] = useState<AIPermissions>(permissions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    setLocal(permissions)
  }, [permissions])

  const dirty =
    local.reading_history !== permissions.reading_history ||
    local.ratings !== permissions.ratings ||
    local.favourites !== permissions.favourites ||
    local.full_library !== permissions.full_library ||
    local.taste_profile !== permissions.taste_profile

  const toggle = (k: keyof AIPermissions) => {
    setLocal(prev => ({ ...prev, [k]: !prev[k] }))
    setSuccess(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const updated = await callApi<AIPermissions>(
        '/api/v1/admin/connections/ai/permissions',
        { method: 'PUT', body: JSON.stringify(local) }
      )
      if (updated) {
        onSaved(updated)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 2000)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save permissions')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <h3 className="font-semibold text-gray-900 dark:text-white">Data-access permissions</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Controls which personal data the AI may see. Combined restrictively with each user's opt-in — if either
        is off, that category is withheld.
      </p>
      <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
        {PERMISSION_ITEMS.map(item => (
          <div key={item.key} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={local[item.key]}
                onChange={() => toggle(item.key)}
              />
              <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save permissions'}
        </button>
        {success && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  )
}

export default function AIPage() {
  const { callApi } = useAuth()
  const [providers, setProviders] = useState<AIProviderStatus[]>([])
  const [permissions, setPermissions] = useState<AIPermissions>({
    reading_history: false,
    ratings: false,
    favourites: false,
    full_library: false,
    taste_profile: false,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activating, setActivating] = useState<string | null>(null)
  usePageTitle('AI Connections')

  const reloadProviders = useCallback(async () => {
    try {
      const ps = await callApi<AIProviderStatus[]>('/api/v1/admin/connections/ai')
      setProviders(ps ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load providers')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    Promise.all([
      callApi<AIProviderStatus[]>('/api/v1/admin/connections/ai'),
      callApi<AIPermissions>('/api/v1/admin/connections/ai/permissions'),
    ])
      .then(([ps, perms]) => {
        setProviders(ps ?? [])
        if (perms) setPermissions(perms)
      })
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleActivate = async (name: string) => {
    setActivating(name)
    try {
      await callApi('/api/v1/admin/connections/ai/active', {
        method: 'POST',
        body: JSON.stringify({ provider: name }),
      })
      await reloadProviders()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to set active provider')
    } finally {
      setActivating(null)
    }
  }

  const handleDeactivate = async () => {
    setActivating('__clear__')
    try {
      await callApi('/api/v1/admin/connections/ai/active', {
        method: 'POST',
        body: JSON.stringify({ provider: '' }),
      })
      await reloadProviders()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to clear active provider')
    } finally {
      setActivating(null)
    }
  }

  const active = providers.find(p => p.active)

  return (
    <>
      <PageHeader
        title="AI"
        description="Configure AI providers for book suggestions. Only one provider is active at a time."
        breadcrumbs={[{ label: 'Connections', to: '/admin/connections' }, { label: 'AI' }]}
      />
      <div className="max-w-3xl px-8 py-8 space-y-8">
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-500 dark:text-gray-400">
            Loading…
          </div>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Providers
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    {active
                      ? <>Active: <span className="font-medium text-gray-700 dark:text-gray-300">{active.display_name}</span></>
                      : 'No provider active — suggestions are disabled.'}
                  </p>
                </div>
                {active && (
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    disabled={activating !== null}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    Clear active
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {providers.map(p => (
                  <ProviderCard
                    key={p.name}
                    provider={p}
                    onSaved={setProviders}
                    onActivate={handleActivate}
                    activating={activating === p.name}
                  />
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Permissions
              </h2>
              <PermissionsCard permissions={permissions} onSaved={setPermissions} />
            </section>
          </>
        )}
      </div>
    </>
  )
}
