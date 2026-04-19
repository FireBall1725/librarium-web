// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useState } from 'react'
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { ProviderStatus } from '../../../types'
import PageHeader from '../../../components/PageHeader'
import { usePageTitle } from '../../../hooks/usePageTitle'

const CAP_LABELS: Record<string, { label: string; cls: string }> = {
  book_isbn:      { label: 'ISBN Lookup',    cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  book_search:    { label: 'Book Search',    cls: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300' },
  series_name:    { label: 'Series Search',  cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  series_volumes: { label: 'Series Volumes', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
}

interface ProviderCardProps {
  provider: ProviderStatus
  onSaved: (updated: ProviderStatus[]) => void
}

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok'; title: string } | { status: 'fail'; error: string }

function ProviderCard({ provider, onSaved }: ProviderCardProps) {
  const { callApi } = useAuth()
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(provider.enabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })

  useEffect(() => {
    setEnabled(provider.enabled)
  }, [provider.enabled])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const cfg: Record<string, string> = { enabled: enabled ? 'true' : 'false' }
      if (provider.requires_key && apiKey) cfg.api_key = apiKey
      const updated = await callApi<ProviderStatus[]>(
        `/api/v1/admin/providers/${provider.name}`,
        { method: 'PUT', body: JSON.stringify(cfg) }
      )
      if (updated) {
        onSaved(updated)
        setApiKey('')
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
      const res = await callApi<{ ok: boolean; title?: string; error?: string }>(
        `/api/v1/admin/providers/${provider.name}/test`,
        { method: 'POST' }
      )
      if (res?.ok) {
        setTestState({ status: 'ok', title: res.title ?? '(no title)' })
      } else {
        setTestState({ status: 'fail', error: res?.error ?? 'Unknown error' })
      }
    } catch (err) {
      setTestState({ status: 'fail', error: err instanceof ApiError ? err.message : 'Request failed' })
    }
  }

  const isTest = provider.name === 'test'

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white">{provider.display_name}</h3>
            {provider.capabilities.map(cap => {
              const meta = CAP_LABELS[cap]
              return (
                <span key={cap} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta?.cls ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  {meta?.label ?? cap}
                </span>
              )
            })}
            {isTest && (
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                Built-in
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{provider.description}</p>
        </div>

        {!isTest && (
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              disabled={provider.requires_key && !provider.has_api_key && !apiKey}
            />
            <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        )}
      </div>

      {provider.requires_key && !isTest && (
        <div className="mt-3 space-y-2">
          {provider.help_text && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
              {provider.help_text}
              {provider.help_url && (
                <> <a href={provider.help_url} target="_blank" rel="noopener noreferrer" className="font-medium underline hover:no-underline">Get API key →</a></>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              API Key {provider.has_api_key && <span className="text-green-600 dark:text-green-400">(saved)</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={provider.has_api_key ? '••••••••••••••••' : 'Enter API key…'}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {!isTest && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={handleTest} disabled={testState.status === 'testing'}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {testState.status === 'testing' ? 'Testing…' : 'Test'}
            </button>
            {success && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
            {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
          </div>
          {testState.status === 'ok' && (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-700 dark:text-green-300">
              Connected — returned: <span className="font-medium">{testState.title}</span>
            </div>
          )}
          {testState.status === 'fail' && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {testState.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MetadataPage() {
  const { callApi } = useAuth()
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providerOrder, setProviderOrder] = useState<string[]>([])
  const [orderSaving, setOrderSaving] = useState(false)
  const [orderSaved, setOrderSaved] = useState(false)
  usePageTitle('Metadata')

  const loadOrder = useCallback(async () => {
    try {
      const res = await callApi<{ order: string[] }>('/api/v1/admin/providers/order')
      setProviderOrder(res?.order ?? [])
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    callApi<ProviderStatus[]>('/api/v1/admin/providers')
      .then(ps => setProviders(ps ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load providers'))
      .finally(() => setLoading(false))
    loadOrder()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const moveProvider = (index: number, direction: -1 | 1) => {
    setProviderOrder(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setOrderSaved(false)
  }

  const saveOrder = async () => {
    setOrderSaving(true)
    try {
      await callApi('/api/v1/admin/providers/order', {
        method: 'PUT',
        body: JSON.stringify({ order: providerOrder }),
      })
      setOrderSaved(true)
      setTimeout(() => setOrderSaved(false), 2000)
    } catch { /* ignore */ } finally {
      setOrderSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Metadata"
        description="Configure metadata providers for book and series lookups."
        breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Metadata' }]}
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
            {/* All providers in one section */}
            <section>
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Providers
              </h2>
              <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
                Each provider can support multiple capabilities. Badges indicate what each provider can do.
              </p>
              <div className="space-y-3">
                {providers.map(p => (
                  <ProviderCard key={p.name} provider={p} onSaved={setProviders} />
                ))}
              </div>
            </section>

            {/* Search order — only meaningful when multiple book providers are enabled */}
            {providerOrder.length > 1 && (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Search Order
                </h2>
                <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
                  When multiple providers return conflicting data for the same book, the higher-ranked provider wins.
                </p>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                  {providerOrder.map((name, idx) => {
                    const p = providers.find(p => p.name === name)
                    return (
                      <div key={name} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-5 text-center text-xs font-semibold text-gray-400 dark:text-gray-500">{idx + 1}</span>
                        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                          {p?.display_name ?? name}
                        </span>
                        <div className="flex gap-1">
                          <button onClick={() => moveProvider(idx, -1)} disabled={idx === 0}
                            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Move up">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button onClick={() => moveProvider(idx, 1)} disabled={idx === providerOrder.length - 1}
                            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Move down">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={saveOrder} disabled={orderSaving}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {orderSaving ? 'Saving…' : 'Save order'}
                  </button>
                  {orderSaved && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}
