// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import {
  PermissionsContext, canIn, toPermissionMap,
  type LibraryAccess, type PermissionMap, type PermissionsValue,
} from '../lib/permissions'

// Roles change rarely and a stale answer only draws a button the API refuses,
// so a tab coming back to the front is the one moment worth asking again.
const REFRESH_AFTER_MS = 30_000

/** Loads what the reader may do in each library, for usePermissions(). */
export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user, callApi } = useAuth()
  const [map, setMap] = useState<PermissionMap | null>(null)
  const lastFetch = useRef(0)
  const userId = user?.id

  const refresh = useCallback(() => {
    if (!userId) return
    lastFetch.current = Date.now()
    // The handler wraps its list in data and respond.JSON wraps that again, so
    // callApi's one unwrap leaves { data: [...] }. Take either shape.
    callApi<LibraryAccess[] | { data: LibraryAccess[] }>('/api/v1/me/libraries')
      .then(body => setMap(toPermissionMap(Array.isArray(body) ? body : body?.data ?? [])))
      // Keep what we had. An empty map on a blip would hide every control.
      .catch(() => {})
  }, [callApi, userId])

  useEffect(() => {
    if (!userId) return
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > REFRESH_AFTER_MS) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId, refresh])

  const isAdmin = user?.is_instance_admin === true
  const value = useMemo<PermissionsValue>(() => ({
    can: (perm, libraryId) => isAdmin || (map !== null && canIn(map, perm, libraryId)),
    loaded: isAdmin || map !== null,
    refresh,
  }), [isAdmin, map, refresh])

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}
