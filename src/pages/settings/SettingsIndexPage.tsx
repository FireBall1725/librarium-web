// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Settings: five areas, every tile a door and a status readout.
//
// The old settings was a flat list of links, which told you nothing until you
// opened one. Each row here carries the value it leads to, so the page answers
// "how many media types are there" and "which AI provider is live" without a
// click, and answers "what is wrong" before either.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import { usePageTitle } from '../../hooks/usePageTitle'
import { SETTINGS_TREE, type FactKey, type SettingsPage } from '../../lib/settingsTree'
import { THEMES, readStoredTheme } from '../../lib/theme'
import type { AIProviderStatus, ProviderStatus } from '../../types'

/**
 * Facts are fetched from the same endpoints the destination pages use, rather
 * than from one summary endpoint built for this screen. A tile that disagrees
 * with the page it opens is worse than a tile with no number on it, and this
 * way there is no second source that can drift.
 */
type Facts = Partial<Record<FactKey, string>>

interface Attention {
  title: string
  detail: string
  to: string
}

export default function SettingsIndexPage() {
  const { t } = useTranslation()
  const { callApi, user } = useAuth()
  usePageTitle(t('nav.settings', { defaultValue: 'Settings' }))

  const [facts, setFacts] = useState<Facts>({})
  const [attention, setAttention] = useState<Attention[]>([])

  useEffect(() => {
    let cancelled = false
    const put = (patch: Facts) => { if (!cancelled) setFacts(prev => ({ ...prev, ...patch })) }

    // Each request fills in what it can and no more. One failing endpoint
    // costs its own row's number, not the page: a settings index that will not
    // render because a count is unavailable is a settings index you cannot use
    // to fix the thing that broke the count.
    callApi<unknown[]>('/api/v1/media-types')
      .then(r => put({ mediaTypes: t('settings_fact.types', { count: r.length, defaultValue: '{{count}} types' }) }))
      .catch(() => {})

    callApi<unknown[]>('/api/v1/genres')
      .then(r => put({ genres: t('settings_fact.genres', { count: r.length, defaultValue: '{{count}} genres' }) }))
      .catch(() => {})

    // A paged envelope, not a bare array: `total` is the account count, and
    // reading .length off the response would have counted the first page.
    callApi<{ total: number }>('/api/v1/admin/users')
      .then(r => put({ people: t('settings_fact.accounts', { count: r.total, defaultValue: '{{count}} accounts' }) }))
      .catch(() => {})

    callApi<ProviderStatus[]>('/api/v1/admin/providers')
      .then(list => {
        const on = list.filter(p => p.enabled)
        put({
          providers: t('settings_fact.providers_on', {
            on: on.length, total: list.length,
            defaultValue: '{{on}} of {{total}} on',
          }),
        })
        // A provider that is enabled but has no key fails every lookup it is
        // asked for, and does it silently. That is exactly the class of
        // problem this block exists to surface.
        const keyless = on.filter(p => p.requires_key && !p.has_api_key)
        if (!cancelled && keyless.length > 0) {
          setAttention(prev => [
            ...prev,
            ...keyless.map(p => ({
              title: t('settings_attn.no_key', {
                name: p.display_name || p.name,
                defaultValue: '{{name}} is on but has no API key',
              }),
              detail: t('settings_attn.no_key_detail', {
                defaultValue: 'Every lookup it is asked for fails silently.',
              }),
              to: '/admin/connections',
            })),
          ])
        }
      })
      .catch(() => {})

    callApi<AIProviderStatus[]>('/api/v1/admin/connections/ai')
      .then(list => {
        const active = list.find(p => p.active)
        put({
          aiProvider: active
            ? active.display_name || active.name
            : t('settings_fact.none', { defaultValue: 'None' }),
        })
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [callApi, t])

  // Client-side facts, which need no request at all. The theme label comes from
  // THEMES rather than a translation key, because that list is where the names
  // are defined and a second copy would be one more thing to keep in step.
  const stored = readStoredTheme()
  const localFacts: Facts = {
    theme: THEMES.find(x => x.id === stored)?.label ?? stored,
    displayName: user?.display_name || user?.username || '',
    version: `v${__APP_VERSION__}`,
  }

  const factFor = (page: SettingsPage): string | undefined => {
    if (page.staticFact) return page.staticFact
    if (!page.fact) return undefined
    return facts[page.fact] ?? localFacts[page.fact] ?? undefined
  }

  const needsAttention = new Set(attention.map(a => a.to))

  return (
    <>
      <PageHeader
        title={t('nav.settings', { defaultValue: 'Settings' })}
        description={t('settings.description', {
          defaultValue: 'Five areas. Every tile is a door and a status readout.',
        })}
      />

      <div className="px-8 py-6">
        {attention.length > 0 && (
          <section className="mb-7 rounded-xl border border-warning-line bg-warning-surface px-4 py-1">
            <h2 className="font-display flex items-baseline gap-2.5 py-3 text-[19px] font-semibold text-content">
              {t('settings.attention', { defaultValue: 'Needs attention' })}
              <span className="text-[11.5px] font-normal tabular-nums text-content-muted">
                {t('settings.attention_count', {
                  count: attention.length,
                  defaultValue: '{{count}} items',
                })}
              </span>
            </h2>
            <ul>
              {attention.map((a, i) => (
                <li key={i}
                  className="flex items-center gap-4 border-t border-warning-line py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-content">{a.title}</span>
                    <span className="font-read block text-[13px] text-content-tertiary">{a.detail}</span>
                  </span>
                  <Link to={a.to}
                    className="flex-none rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:brightness-110">
                    {t('settings.fix', { defaultValue: 'Fix' })}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* items-start so each tile is the height of its own contents. Stretched
            to the tallest, a one-row section reads as a section with rows
            missing. */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(285px,1fr))] items-start gap-4">
          {SETTINGS_TREE.map(section => (
            <section key={section.id}
              className="rounded-2xl border border-line bg-surface-raised px-4 pb-2 pt-1">
              <div className="flex items-baseline gap-2.5 border-b border-line-strong pb-2.5 pt-3">
                <h2 className="font-display text-[21px] font-semibold text-content">
                  {t(section.labelKey, { defaultValue: section.labelFallback })}
                </h2>
                <span className="ml-auto text-[11.5px] tabular-nums text-content-muted">
                  {t('settings.pages_count', {
                    count: section.pages.length,
                    defaultValue: '{{count}} pages',
                  })}
                </span>
              </div>
              <ul>
                {section.pages.map(page => {
                  const fact = factFor(page)
                  return (
                    <li key={page.id} className="border-b border-line last:border-b-0">
                      <Link to={page.to}
                        className="flex items-center gap-2.5 py-2.5 text-[13.5px] text-content-secondary transition-colors hover:text-accent">
                        {needsAttention.has(page.to) && (
                          <span className="size-1.5 flex-none rounded-full bg-warning" aria-hidden="true" />
                        )}
                        {t(page.labelKey, { defaultValue: page.labelFallback })}
                        {fact && (
                          <span className="ml-auto truncate text-xs tabular-nums text-content-muted">
                            {fact}
                          </span>
                        )}
                        <span className={`text-xs text-content-muted ${fact ? '' : 'ml-auto'}`} aria-hidden="true">›</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
