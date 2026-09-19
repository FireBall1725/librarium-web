// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Which lookup providers show where on the admin Lookups page, and the
// catalogue's search and filters. The server owns the details; this only
// decides what to show.

import type { ProviderStatus } from '../types'

// The built-in test provider answers one fake ISBN. It's for checking the
// pipeline, so it never shows in the catalogue.
export const TEST_PROVIDER = 'test'

export type CatalogueKind = 'data' | 'buy'

export function kindOf(p: ProviderStatus): CatalogueKind {
  return p.kind === 'buy' ? 'buy' : 'data'
}

// Older servers don't send listed; a provider that's on was on the list.
export function isListed(p: ProviderStatus): boolean {
  return p.listed ?? p.enabled
}

// A provider can't be switched on until its key or required settings are in.
export function needsSetup(p: ProviderStatus): boolean {
  if (p.config_fields?.length) {
    return p.config_fields.some(f => f.required && !p.config?.[f.key])
  }
  return p.requires_key && !p.has_api_key
}

export function hasSettings(p: ProviderStatus): boolean {
  return (p.config_fields?.length ?? 0) > 0 || p.requires_key
}

export function isCommunity(p: ProviderStatus): boolean {
  return !!p.contributed_by
}

// A provider that needs nothing from the admin: no key, no required field.
export function needsNoKey(p: ProviderStatus): boolean {
  if (p.requires_key) return false
  return !(p.config_fields ?? []).some(f => f.required)
}

export interface CatalogueFilter {
  kind: CatalogueKind
  query: string
  region: string
  noKey: boolean
  community: boolean
}

// Language codes as names in the reader's language, so "fi" can be found by
// searching "Finnish".
export function languageNames(codes: string[] | undefined, locale: string): string[] {
  if (!codes?.length) return []
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([locale], { type: 'language' })
  } catch {
    // Old engines: fall back to the codes.
  }
  return codes.map(c => names?.of(c) ?? c)
}

export function filterCatalogue(providers: ProviderStatus[], f: CatalogueFilter, locale: string): ProviderStatus[] {
  const q = f.query.trim().toLowerCase()
  return providers.filter(p => {
    if (p.name === TEST_PROVIDER || kindOf(p) !== f.kind) return false
    if (f.region && p.region !== f.region) return false
    if (f.noKey && !needsNoKey(p)) return false
    if (f.community && !isCommunity(p)) return false
    if (!q) return true
    const haystack = [
      p.display_name, p.description, p.region, p.contributed_by,
      ...(p.languages ?? []), ...languageNames(p.languages, locale),
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(q)
  })
}

export function catalogueRegions(providers: ProviderStatus[]): string[] {
  return [...new Set(providers.map(p => p.region).filter((r): r is string => !!r))].sort()
}
