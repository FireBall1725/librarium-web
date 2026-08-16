// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// What in settings needs attention, shared by the rail and the index.
//
// Both surfaces mark the same pages: the index lists the problems above its
// tiles, the rail puts a dot beside the page that holds each one. One source
// for both, because a dot in the rail with nothing behind it on the page is
// worse than no dot at all.

import { useEffect, useState } from 'react'
import type { ProviderStatus } from '../types'

export interface AttentionItem {
  /** Route of the page that can fix it, which is also what the rail keys on. */
  to: string
  title: string
  detail: string
}

type CallApi = <T>(path: string, init?: RequestInit) => Promise<T>

/**
 * Only fetches when asked. Layout wraps every page, and the providers list has
 * no business being requested while someone is reading their books.
 */
export function useSettingsAttention(callApi: CallApi, enabled: boolean): AttentionItem[] {
  const [items, setItems] = useState<AttentionItem[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    callApi<ProviderStatus[]>('/api/v1/admin/providers')
      .then(list => {
        if (cancelled) return
        // A provider that is enabled but has no key fails every lookup it is
        // asked for, and does it silently. That is the whole reason this
        // exists: nothing else in the product would ever tell you.
        const keyless = (list ?? []).filter(p => p.enabled && p.requires_key && !p.has_api_key)
        setItems(keyless.map(p => ({
          to: '/settings/metadata',
          title: `${p.display_name || p.name} is on but has no API key`,
          detail: 'Every lookup it is asked for fails silently.',
        })))
      })
      .catch(() => { /* No attention list is better than no settings page. */ })

    return () => { cancelled = true }
  }, [callApi, enabled])

  // Derived rather than cleared in the effect: clearing would be a setState in
  // the effect body, and a caller that turns off should see nothing on the very
  // same render rather than after a second pass.
  return enabled ? items : []
}

/** The routes carrying at least one problem, for the rail's dots. */
export function attentionRoutes(items: AttentionItem[]): Set<string> {
  return new Set(items.map(i => i.to))
}
