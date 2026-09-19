// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import type { ProviderStatus } from '../types'
import { filterCatalogue, isListed, needsNoKey, needsSetup, type CatalogueFilter } from './lookupCatalogue'

function provider(p: Partial<ProviderStatus>): ProviderStatus {
  return { name: 'x', display_name: 'X', description: '', requires_key: false, capabilities: [], enabled: false, has_api_key: false, ...p }
}

const openLibrary = provider({ name: 'open_library', display_name: 'Open Library', region: 'Worldwide', enabled: true })
const finna = provider({ name: 'finna', display_name: 'Finna', region: 'Finland', languages: ['fi', 'sv'], contributed_by: 'tonipuh' })
const isbndb = provider({ name: 'isbndb', display_name: 'ISBNdb', region: 'Worldwide', requires_key: true })
const isfdb = provider({
  name: 'isfdb', display_name: 'ISFDB', region: 'Worldwide', contributed_by: 'ennui2342',
  config_fields: [{ key: 'base_url', label: 'Mirror base URL', type: 'url', required: true }],
})
const test = provider({ name: 'test', display_name: 'Test Provider', enabled: true })
const all = [openLibrary, finna, isbndb, isfdb, test]
const base: CatalogueFilter = { kind: 'data', query: '', region: '', noKey: false, community: false }

describe('isListed', () => {
  it('trusts the server flag, else treats enabled as listed', () => {
    expect(isListed(provider({ enabled: false, listed: true }))).toBe(true)
    expect(isListed(provider({ enabled: true, listed: false }))).toBe(false)
    expect(isListed(provider({ enabled: true }))).toBe(true)
  })
})

describe('needsSetup and needsNoKey', () => {
  it('asks for a key or a required field until one is saved', () => {
    expect(needsSetup(isbndb)).toBe(true)
    expect(needsSetup({ ...isbndb, has_api_key: true })).toBe(false)
    expect(needsSetup(isfdb)).toBe(true)
    expect(needsSetup({ ...isfdb, config: { base_url: 'http://x' } })).toBe(false)
    expect(needsSetup(finna)).toBe(false)
  })
  it('counts only providers that need nothing as no key', () => {
    expect([openLibrary, finna, isbndb, isfdb].filter(needsNoKey).map(p => p.name)).toEqual(['open_library', 'finna'])
  })
})

describe('filterCatalogue', () => {
  const names = (f: Partial<CatalogueFilter>) => filterCatalogue(all, { ...base, ...f }, 'en').map(p => p.name)

  it('never shows the test provider', () => {
    expect(names({})).not.toContain('test')
  })
  it('finds a provider by a language name as well as its code', () => {
    expect(names({ query: 'finnish' })).toEqual(['finna'])
    expect(names({ query: 'sv' })).toEqual(['finna'])
  })
  it('filters by region, key and contributor', () => {
    expect(names({ region: 'Finland' })).toEqual(['finna'])
    expect(names({ noKey: true })).toEqual(['open_library', 'finna'])
    expect(names({ community: true })).toEqual(['finna', 'isfdb'])
  })
  it('keeps Where to buy separate', () => {
    expect(names({ kind: 'buy' })).toEqual([])
  })
})
