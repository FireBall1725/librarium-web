// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { ContributorResult } from '../types'

/**
 * Names for contributor ids, so a filter can say whose books it is showing.
 *
 * The filter travels in the URL as an id, which is right for a link but says
 * nothing to a reader. A bookmark, the back button, or a link someone was sent
 * all arrive with the id and no name, so the name has to be fetchable rather
 * than only remembered from the click that set it.
 */
export function useContributorNames(ids: string[]): Record<string, string> {
  const { callApi } = useAuth()
  const [names, setNames] = useState<Record<string, string>>({})

  // Joined rather than passed as an array: a fresh array every render would
  // re-fetch on every render.
  const key = ids.join(',')

  useEffect(() => {
    if (!key) return
    let live = true
    void callApi<ContributorResult[]>(`/api/v1/contributors?ids=${encodeURIComponent(key)}`)
      .then(rows => {
        if (!live) return
        // Merged rather than replaced, so removing one chip does not blank the
        // others while the reply for the shorter list is in flight.
        setNames(prev => {
          const next = { ...prev }
          for (const c of rows ?? []) next[c.id] = c.name
          return next
        })
      })
      .catch(() => {})
    return () => { live = false }
  }, [key, callApi])

  return names
}
