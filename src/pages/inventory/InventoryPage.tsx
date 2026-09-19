// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Inventory: where a library's copies physically are. Add books answers what
// you own; this answers where it is. One library at a time, four tabs, and
// the library, tab and place live in the URL so a shelf can be linked to.
// See plans/inventory.md.

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import type { CopyLocation, Library, MediaType } from '../../types'
import { fetchInventory, type InventorySummary } from '../../lib/inventory'
import { usePageTitle } from '../../hooks/usePageTitle'
import PageHeader from '../../components/PageHeader'
import AddBooksButton from '../../components/addBooks/AddBooksButton'
import PlacesTab from './PlacesTab'
import ShelveTab from './ShelveTab'
import CheckTab from './CheckTab'
import UnshelvedTab from './UnshelvedTab'

type Tab = 'places' | 'shelve' | 'check' | 'unshelved'
const TABS: Tab[] = ['places', 'shelve', 'check', 'unshelved']
const LIB_KEY = 'librarium:inventory:library'

export default function InventoryPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('inventory.title', { defaultValue: 'Inventory' }))
  const [params, setParams] = useSearchParams()
  const [libraries, setLibraries] = useState<Library[] | null>(null)
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])
  const [places, setPlaces] = useState<CopyLocation[]>([])
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [version, setVersion] = useState(0)

  const tab: Tab = TABS.find(x => x === params.get('tab')) ?? 'places'
  const placeId = params.get('place')
  const remembered = (() => { try { return window.localStorage.getItem(LIB_KEY) } catch { return null } })()
  const libraryId = [params.get('lib'), remembered].find(id => id && libraries?.some(l => l.id === id)) ?? libraries?.[0]?.id ?? ''
  const library = libraries?.find(l => l.id === libraryId)

  const set = useCallback((next: Partial<{ lib: string; tab: Tab; place: string | null }>) => {
    setParams(p => {
      const q = new URLSearchParams(p)
      if (next.lib !== undefined) { q.set('lib', next.lib); q.delete('place') }
      if (next.tab !== undefined) q.set('tab', next.tab)
      if (next.place !== undefined) {
        if (next.place) q.set('place', next.place)
        else q.delete('place')
      }
      return q
    }, { replace: next.tab === undefined })
  }, [setParams])

  useEffect(() => {
    void callApi<Library[]>('/api/v1/libraries').then(l => setLibraries(l ?? [])).catch(() => setLibraries([]))
    void callApi<MediaType[]>('/api/v1/media-types').then(m => setMediaTypes(m ?? [])).catch(() => {})
  }, [callApi])

  const reload = useCallback(async () => {
    if (!libraryId) return
    const [ps, inv] = await Promise.all([
      callApi<{ items: CopyLocation[] }>(`/api/v1/libraries/${libraryId}/locations`).then(r => r?.items ?? []).catch((): CopyLocation[] => []),
      fetchInventory(callApi, libraryId, null, 1).catch(() => null),
    ])
    setPlaces(ps)
    if (inv) setSummary(inv.summary)
    setVersion(v => v + 1)
  }, [callApi, libraryId])

  useEffect(() => {
    if (!libraryId) return
    try { window.localStorage.setItem(LIB_KEY, libraryId) } catch { /* not kept */ }
    let live = true
    void Promise.all([
      callApi<{ items: CopyLocation[] }>(`/api/v1/libraries/${libraryId}/locations`).then(r => r?.items ?? []).catch((): CopyLocation[] => []),
      fetchInventory(callApi, libraryId, null, 1).catch(() => null),
    ]).then(([ps, inv]) => {
      if (!live) return
      setPlaces(ps)
      setSummary(inv ? inv.summary : null)
    })
    return () => { live = false }
  }, [callApi, libraryId])

  const tabLabel: Record<Tab, string> = {
    places: t('inventory.tab_places', { defaultValue: 'Places' }),
    shelve: t('inventory.tab_shelve', { defaultValue: 'Shelve' }),
    check: t('inventory.tab_check', { defaultValue: 'Check a shelf' }),
    unshelved: t('inventory.tab_unshelved', { defaultValue: 'Unshelved' }),
  }

  return (
    <>
      <PageHeader
        title={t('inventory.title', { defaultValue: 'Inventory' })}
        description={t('inventory.description', { defaultValue: 'Where your books are: which shelf, and what hasn’t been shelved yet.' })}
        actions={<AddBooksButton libraryId={libraryId || undefined} />}
      />
      <div className="mx-auto max-w-screen-2xl space-y-4 px-4 py-5 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          {(libraries?.length ?? 0) > 1 && (
            <select id="inventory-library" aria-label={t('add_books.library', { defaultValue: 'Library' })}
              className="lb-field w-auto! py-1.5! font-semibold!" value={libraryId} onChange={e => set({ lib: e.target.value })}>
              {libraries!.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <nav className="flex flex-wrap gap-0.5 rounded-lg bg-surface-inset p-0.5" aria-label={t('inventory.title', { defaultValue: 'Inventory' })}>
            {TABS.map(x => (
              <button key={x} type="button" aria-current={tab === x ? 'page' : undefined} onClick={() => set({ tab: x })}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${tab === x ? 'bg-surface text-content shadow-sm' : 'text-content-muted hover:text-content'}`}>
                {tabLabel[x]}
                {x === 'unshelved' && (summary?.unshelved ?? 0) > 0 && (
                  <span className="rounded-full bg-warning-surface px-1.5 text-[11px] font-bold tabular-nums text-warning-strong">{summary!.unshelved}</span>
                )}
              </button>
            ))}
          </nav>
          {summary && (
            <p className="ml-auto flex flex-wrap gap-x-4 text-[13px] text-content-muted">
              <span>{t('inventory.sum_copies', { count: summary.copies, defaultValue: '{{count}} copies' })}</span>
              <span>{t('inventory.sum_shelved', { count: summary.shelved, defaultValue: '{{count}} on a shelf' })}</span>
              <span>{t('inventory.sum_on_loan', { count: summary.on_loan, defaultValue: '{{count}} on loan' })}</span>
            </p>
          )}
        </div>

        {!libraries ? (
          <p className="text-[13px] text-content-muted">{t('common.loading', { defaultValue: 'Loading…' })}</p>
        ) : !libraryId ? (
          <p className="text-[13px] text-content-muted">{t('scanner.no_libraries', { defaultValue: "You don't have a library to add books to yet." })}</p>
        ) : tab === 'places' ? (
          <PlacesTab libraryId={libraryId} places={places} placeId={placeId} version={version}
            onPlace={id => set({ place: id })}
            onShelve={id => set({ tab: 'shelve', place: id })}
            onCheck={id => set({ tab: 'check', place: id })} />
        ) : tab === 'shelve' ? (
          <ShelveTab key={libraryId} libraryId={libraryId} libraryName={library?.name ?? ''} places={places} placeId={placeId}
            onPlace={id => set({ place: id })} mediaTypes={mediaTypes} onChanged={reload} />
        ) : tab === 'check' ? (
          <CheckTab key={libraryId} libraryId={libraryId} libraryName={library?.name ?? ''} places={places} placeId={placeId}
            onPlace={id => set({ place: id })} mediaTypes={mediaTypes} onChanged={reload} />
        ) : (
          <UnshelvedTab key={libraryId} libraryId={libraryId} places={places} onChanged={reload}
            onShelve={() => set({ tab: 'shelve' })} />
        )}
      </div>
    </>
  )
}
