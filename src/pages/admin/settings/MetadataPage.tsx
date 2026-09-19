// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725
//
// Lookups: which metadata providers this server asks, as a plain on/off list.
//
// There is no order any more. Every provider that's on is asked on every
// lookup at once, and each field is pre-selected from the answers themselves
// (see the API's MergeBookResults), so the old "search order" list is gone.
// Everything that isn't on the list lives in the catalogue panel.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../../../auth/AuthContext'
import type { ProviderStatus } from '../../../types'
import PageHeader from '../../../components/PageHeader'
import SidePanel from '../../../components/SidePanel'
import { useToast } from '../../../components/Toast'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { Switch } from '../../../components/settings/SettingRow'
import { errorMessage } from '../../../lib/errorMessage'
import {
  TEST_PROVIDER, catalogueRegions, filterCatalogue, hasSettings, isListed, kindOf,
  languageNames, needsNoKey, needsSetup, type CatalogueKind,
} from '../../../lib/lookupCatalogue'

type TestResult = { status: 'testing' } | { status: 'ok'; title: string } | { status: 'fail'; error: string }

// One label per capability; the chip text already says which is which.
function useCapabilityLabel() {
  const { t } = useTranslation()
  return (cap: string) => {
    switch (cap) {
      case 'book_isbn': return t('lookups.cap_isbn', { defaultValue: 'ISBN' })
      case 'book_upc': return t('lookups.cap_upc', { defaultValue: 'Barcode' })
      case 'book_search': return t('lookups.cap_search', { defaultValue: 'Title search' })
      case 'series_name': return t('lookups.cap_series', { defaultValue: 'Series' })
      case 'series_volumes': return t('lookups.cap_volumes', { defaultValue: 'Series volumes' })
      case 'contributor': return t('lookups.cap_authors', { defaultValue: 'Authors' })
      default: return cap
    }
  }
}

export default function MetadataPage() {
  const { t, i18n } = useTranslation()
  const { callApi } = useAuth()
  const toast = useToast()
  const capLabel = useCapabilityLabel()
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, TestResult>>({})
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  // The provider whose settings panel is open; adding means save also turns it on.
  const [settingsFor, setSettingsFor] = useState<{ name: string; adding: boolean } | null>(null)
  usePageTitle(t('lookups.title', { defaultValue: 'Lookups' }))

  useEffect(() => {
    callApi<ProviderStatus[]>('/api/v1/admin/providers')
      .then(ps => setProviders(ps ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : t('lookups.load_failed', { defaultValue: "Couldn't load the providers." })))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The server merges what's sent into the saved config, so only the changed
  // keys go over the wire.
  const save = useCallback(async (name: string, cfg: Record<string, string>) => {
    const updated = await callApi<ProviderStatus[]>(`/api/v1/admin/providers/${name}`, { method: 'PUT', body: JSON.stringify(cfg) })
    if (updated) setProviders(updated)
  }, [callApi])

  const run = useCallback(async (name: string, cfg: Record<string, string>, done: string) => {
    try {
      await save(name, cfg)
      toast.show(done)
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t('lookups.save_failed', { defaultValue: "Couldn't save that change." }), { variant: 'error' })
    }
  }, [save, toast, t])

  const test = async (p: ProviderStatus) => {
    setTests(prev => ({ ...prev, [p.name]: { status: 'testing' } }))
    try {
      const res = await callApi<{ ok: boolean; title?: string; error?: string }>(`/api/v1/admin/providers/${p.name}/test`, { method: 'POST' })
      setTests(prev => ({
        ...prev,
        [p.name]: res?.ok
          ? { status: 'ok', title: res.title ?? '' }
          : { status: 'fail', error: errorMessage(res, t('lookups.test_unknown', { defaultValue: 'Unknown error' })) },
      }))
    } catch (err) {
      setTests(prev => ({ ...prev, [p.name]: { status: 'fail', error: err instanceof ApiError ? err.message : t('lookups.test_request_failed', { defaultValue: 'The test request failed.' }) } }))
    }
  }

  const add = (p: ProviderStatus) => {
    // A provider that needs a key or a URL opens its settings first; the save
    // there turns it on.
    if (needsSetup(p)) {
      setSettingsFor({ name: p.name, adding: true })
      return
    }
    void run(p.name, { listed: 'true', enabled: 'true' }, t('lookups.added', { name: p.display_name, defaultValue: '{{name}} added and on' }))
  }

  const listed = providers.filter(isListed)
  const groups: { kind: CatalogueKind; title: string; items: ProviderStatus[] }[] = [
    { kind: 'data', title: t('lookups.group_data', { defaultValue: 'Book data' }), items: listed.filter(p => kindOf(p) === 'data') },
    { kind: 'buy', title: t('lookups.group_buy', { defaultValue: 'Where to buy · shown to everyone on this server' }), items: listed.filter(p => kindOf(p) === 'buy') },
  ]
  const settingsProvider = settingsFor ? providers.find(p => p.name === settingsFor.name) : undefined
  const catalogueCount = providers.filter(p => p.name !== TEST_PROVIDER).length

  return (
    <>
      <PageHeader
        title={t('lookups.title', { defaultValue: 'Lookups' })}
        description={t('lookups.description', { defaultValue: "Every provider that's on is asked on every lookup. You pick what to keep for each book." })}
        breadcrumbs={[{ label: t('settings.title', { defaultValue: 'Settings' }), to: '/settings' }, { label: t('lookups.title', { defaultValue: 'Lookups' }) }]}
        actions={
          <button type="button" className="lb-btn" onClick={() => setCatalogueOpen(true)} disabled={loading}>
            {t('lookups.browse', { count: catalogueCount, defaultValue: 'Browse the catalogue ({{count}})' })}
          </button>
        }
      />
      <div className="px-8 py-6">
        <div className="max-w-[1180px] space-y-5">
          <p className="max-w-[78ch] rounded-lg bg-accent-surface px-4 py-3 text-sm text-accent-strong">
            {t('lookups.lede', { defaultValue: "No order to manage. When providers disagree, the book screen shows every answer and pre-selects one: the value most providers agree on, else the longest description, the most detailed date, or the largest cover." })}
          </p>

          {error && <div className="rounded-lg border border-danger-line bg-danger-surface p-4 text-sm text-danger-strong">{error}</div>}

          {loading ? (
            <div className="py-20 text-center text-content-muted">{t('common.loading', { defaultValue: 'Loading…' })}</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface-raised">
              {groups.map(g => (
                <section key={g.kind} aria-label={g.title}>
                  <h2 className="border-t border-line bg-surface-inset px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.13em] text-content-muted first:border-t-0">
                    {g.title}
                  </h2>
                  {g.items.length === 0 ? (
                    <p className="border-t border-line px-4 py-4 text-sm text-content-muted">
                      {g.kind === 'buy'
                        ? t('lookups.buy_empty', { defaultValue: 'No bookstores yet. Where to buy links come in a later update.' })
                        : t('lookups.data_empty', { defaultValue: 'Nothing is on. Add a provider from the catalogue so lookups find books.' })}
                    </p>
                  ) : g.items.map(p => (
                    <ProviderRow
                      key={p.name}
                      provider={p}
                      test={tests[p.name]}
                      capLabel={capLabel}
                      onTest={() => test(p)}
                      onSettings={() => setSettingsFor({ name: p.name, adding: false })}
                      onToggle={on => run(p.name, { enabled: on ? 'true' : 'false' },
                        on ? t('lookups.turned_on', { name: p.display_name, defaultValue: '{{name}} on' })
                           : t('lookups.turned_off', { name: p.display_name, defaultValue: '{{name}} off. Still listed, not asked.' }))}
                      onRemove={() => run(p.name, { listed: 'false', enabled: 'false' },
                        t('lookups.removed', { name: p.display_name, defaultValue: "{{name}} removed. It's back in the catalogue." }))}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <Catalogue
        open={catalogueOpen}
        onClose={() => setCatalogueOpen(false)}
        providers={providers}
        locale={i18n.language}
        capLabel={capLabel}
        onAdd={add}
      />

      {settingsProvider && (
        <ProviderSettings
          key={settingsProvider.name}
          provider={settingsProvider}
          adding={!!settingsFor?.adding}
          onClose={() => setSettingsFor(null)}
          onSave={async cfg => {
            await save(settingsProvider.name, settingsFor?.adding ? { ...cfg, listed: 'true', enabled: 'true' } : cfg)
            toast.show(settingsFor?.adding
              ? t('lookups.added', { name: settingsProvider.display_name, defaultValue: '{{name}} added and on' })
              : t('lookups.saved', { name: settingsProvider.display_name, defaultValue: '{{name}} saved' }))
            setSettingsFor(null)
          }}
        />
      )}
    </>
  )
}

function ProviderRow({ provider: p, test, capLabel, onTest, onSettings, onToggle, onRemove }: {
  provider: ProviderStatus
  test?: TestResult
  capLabel: (cap: string) => string
  onTest: () => void
  onSettings: () => void
  onToggle: (on: boolean) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const isTest = p.name === TEST_PROVIDER
  const setup = needsSetup(p)

  const status = !test ? null
    : test.status === 'testing' ? <span className="text-content-muted">{t('lookups.testing', { defaultValue: 'Testing…' })}</span>
    : test.status === 'ok' ? <span className="text-success"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success align-[1px]" aria-hidden="true" />{t('lookups.test_passed', { title: test.title, defaultValue: 'Test passed: {{title}}' })}</span>
    : <span className="text-danger"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-danger align-[1px]" aria-hidden="true" />{test.error}</span>

  return (
    <div className="grid grid-cols-1 items-center gap-3 border-t border-line px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <b className="text-[14px] font-semibold text-content">{p.display_name}</b>
          {p.contributed_by && <span className="text-xs text-content-muted">{t('lookups.by', { who: p.contributed_by, defaultValue: 'by {{who}}' })}</span>}
          {isTest && <span className="lb-chip warn">{t('lookups.test_provider', { defaultValue: 'Test provider' })}</span>}
        </div>
        <p className="mt-0.5 text-[13px] text-content-muted">{p.description}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {p.capabilities.map(c => <span key={c} className="lb-cap">{capLabel(c)}</span>)}
          {p.region && <span className="text-content-muted">· {p.region}</span>}
          {status && <span className="basis-full">{status}</span>}
          {setup && <span className="basis-full text-warning">{t('lookups.needs_setup', { defaultValue: 'Needs its settings before it can be turned on.' })}</span>}
        </div>
      </div>
      {!isTest && (
        <div className="flex flex-wrap items-center justify-start gap-1.5 sm:justify-end">
          {kindOf(p) === 'data' && (
            <button type="button" className="lb-btn ghost sm" onClick={onTest} disabled={test?.status === 'testing'}>
              {t('lookups.test', { defaultValue: 'Test' })}
            </button>
          )}
          {hasSettings(p) && (
            <button type="button" className="lb-btn ghost sm" onClick={onSettings}>{t('lookups.settings', { defaultValue: 'Settings' })}</button>
          )}
          <button type="button" className="lb-btn ghost sm" onClick={onRemove}>{t('lookups.remove', { defaultValue: 'Remove' })}</button>
          <Switch
            checked={p.enabled}
            disabled={setup && !p.enabled}
            label={t('lookups.switch_label', { name: p.display_name, defaultValue: '{{name}} on' })}
            onChange={onToggle}
          />
        </div>
      )}
    </div>
  )
}

function Catalogue({ open, onClose, providers, locale, capLabel, onAdd }: {
  open: boolean
  onClose: () => void
  providers: ProviderStatus[]
  locale: string
  capLabel: (cap: string) => string
  onAdd: (p: ProviderStatus) => void
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<CatalogueKind>('data')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [noKey, setNoKey] = useState(false)
  const [community, setCommunity] = useState(false)

  const regions = useMemo(() => catalogueRegions(providers), [providers])
  const items = filterCatalogue(providers, { kind, query, region, noKey, community }, locale)

  const tab = (k: CatalogueKind, label: string) => (
    <button type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold ${kind === k ? 'border-accent text-content' : 'border-transparent text-content-muted hover:text-content'}`}>
      {label}
    </button>
  )
  const filterChip = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button type="button" aria-pressed={on} onClick={() => set(!on)}
      className={`h-8 rounded-full px-3 text-[12.5px] font-semibold ${on ? 'bg-accent-surface text-accent-strong' : 'border border-line text-content-muted hover:text-content'}`}>
      {label}
    </button>
  )

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={t('lookups.catalogue', { defaultValue: 'Lookup catalogue' })}
      header={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="catalogue-search" type="search" value={query} onChange={e => setQuery(e.target.value)}
              placeholder={t('lookups.search_placeholder', { defaultValue: 'Search by name, country or language' })}
              aria-label={t('lookups.search_label', { defaultValue: 'Search the catalogue' })}
              className="lb-field min-w-0" style={{ flex: '1 1 220px', width: 'auto' }}
            />
            <select id="catalogue-region" value={region} onChange={e => setRegion(e.target.value)} className="lb-field" style={{ width: 'auto' }}
              aria-label={t('lookups.region', { defaultValue: 'Region' })}>
              <option value="">{t('lookups.any_region', { defaultValue: 'Any region' })}</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {filterChip(noKey, setNoKey, t('lookups.filter_no_key', { defaultValue: 'No key needed' }))}
            {filterChip(community, setCommunity, t('lookups.filter_community', { defaultValue: 'Community built' }))}
          </div>
          <div role="tablist" className="-mx-5 flex gap-1 border-b border-line px-5">
            {tab('data', t('lookups.tab_data', { defaultValue: 'Book data' }))}
            {tab('buy', t('lookups.tab_buy', { defaultValue: 'Where to buy' }))}
          </div>
        </>
      }
    >
      {items.length === 0 ? (
        <p className="py-8 text-center text-content-muted">
          {kind === 'buy' && !query && !region && !noKey && !community
            ? t('lookups.buy_empty', { defaultValue: 'No bookstores yet. Where to buy links come in a later update.' })
            : t('lookups.no_match', { defaultValue: 'Nothing matches those filters.' })}
        </p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}>
          {items.map(p => {
            const added = isListed(p)
            const langs = languageNames(p.languages, locale)
            return (
              <article key={p.name} className={`flex flex-col gap-2.5 rounded-xl border bg-surface-raised p-3.5 ${added ? 'border-accent' : 'border-line'}`}>
                <h3 className="text-[15px] font-semibold text-content">{p.display_name}</h3>
                <p className="text-[12.5px] leading-snug text-content-muted">{p.description}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.capabilities.map(c => <span key={c} className="lb-cap">{capLabel(c)}</span>)}
                  {needsNoKey(p)
                    ? <span className="lb-chip good">{t('lookups.no_key', { defaultValue: 'No key' })}</span>
                    : p.requires_key
                      ? <span className="lb-chip warn">{t('lookups.api_key', { defaultValue: 'API key' })}</span>
                      : <span className="lb-chip warn">{t('lookups.setup_needed', { defaultValue: 'Settings needed' })}</span>}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-xs">
                  {p.region && <><dt className="text-content-muted">{t('lookups.region', { defaultValue: 'Region' })}</dt><dd className="text-content-secondary">{p.region}</dd></>}
                  {langs.length > 0 && <><dt className="text-content-muted">{t('lookups.languages', { defaultValue: 'Languages' })}</dt><dd className="text-content-secondary">{langs.join(', ')}</dd></>}
                  {p.sends && <><dt className="text-content-muted">{t('lookups.sends', { defaultValue: 'Sends' })}</dt><dd className="text-content-secondary">{p.sends}</dd></>}
                </dl>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-content-muted">
                    {p.contributed_by
                      ? t('lookups.by_cap', { who: p.contributed_by, defaultValue: 'By {{who}}' })
                      : t('lookups.built_in', { defaultValue: 'Built in' })}
                  </span>
                  {added
                    ? <button type="button" className="lb-btn sm" disabled>{t('lookups.added_label', { defaultValue: 'Added' })}</button>
                    : <button type="button" className="lb-btn sm" onClick={() => onAdd(p)}>{t('lookups.add', { defaultValue: 'Add' })}</button>}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </SidePanel>
  )
}

function ProviderSettings({ provider: p, adding, onClose, onSave }: {
  provider: ProviderStatus
  adding: boolean
  onClose: () => void
  onSave: (cfg: Record<string, string>) => Promise<void>
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Providers with only a legacy single key get one field for it.
  const fields = p.config_fields?.length
    ? p.config_fields
    : [{ key: 'api_key', label: t('lookups.api_key', { defaultValue: 'API key' }), type: 'password', required: true }]
  const missing = fields.some(f => f.required && !p.config?.[f.key] && !(f.key === 'api_key' && p.has_api_key) && !values[f.key])

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const cfg: Record<string, string> = {}
      for (const [k, v] of Object.entries(values)) if (v) cfg[k] = v
      await onSave(cfg)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('lookups.save_failed', { defaultValue: "Couldn't save that change." }))
      setSaving(false)
    }
  }

  return (
    <SidePanel
      open
      width="narrow"
      onClose={onClose}
      title={p.display_name}
      footer={
        <>
          <button type="button" className="lb-btn ghost" onClick={onClose}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
          <button type="button" className="lb-btn" onClick={submit} disabled={saving || missing}>
            {saving ? t('lookups.saving', { defaultValue: 'Saving…' })
              : adding ? t('lookups.add_and_turn_on', { defaultValue: 'Add and turn on' })
              : t('common.save', { defaultValue: 'Save' })}
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-content-muted">{p.description}</p>
      {p.help_text && (
        <div className="mb-4 rounded-lg border border-accent-line bg-accent-surface px-3 py-2 text-sm text-accent-strong">
          {p.help_text}
          {p.help_url && <> <a href={p.help_url} target="_blank" rel="noopener noreferrer" className="font-medium underline hover:no-underline">{t('lookups.help_link', { defaultValue: 'Where to get it' })}</a></>}
        </div>
      )}
      {fields.map(f => {
        const saved = f.key === 'api_key' && !p.config_fields?.length ? p.has_api_key : !!p.config?.[f.key]
        const id = `provider-${p.name}-${f.key}`
        return (
          <div key={f.key} className="mb-3.5">
            <label htmlFor={id} className="mb-1 block text-xs font-semibold text-content-secondary">
              {f.label} {saved && <span className="font-normal text-success">{t('lookups.saved_marker', { defaultValue: '(saved)' })}</span>}
            </label>
            <input
              id={id}
              type={f.type === 'password' ? 'password' : f.type === 'url' ? 'url' : 'text'}
              value={values[f.key] ?? ''}
              onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={saved ? (f.type === 'password' ? '••••••••••••' : p.config?.[f.key]) : f.placeholder}
              className="lb-field"
            />
            {f.help_text && <p className="mt-1 text-xs text-content-muted">{f.help_text}</p>}
          </div>
        )
      })}
      {p.docs_url && (
        <p className="text-xs text-content-muted">
          <a href={p.docs_url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">{t('lookups.docs', { defaultValue: 'Provider documentation' })}</a>
        </p>
      )}
      {error && <div className="mt-3 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger-strong">{error}</div>}
    </SidePanel>
  )
}
