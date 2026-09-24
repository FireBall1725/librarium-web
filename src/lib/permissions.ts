// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { createContext, useContext } from 'react'

/** One row of GET /api/v1/me/libraries: a library and what the caller holds there. */
export interface LibraryAccess {
  library_id: string
  name: string
  role: string
  permissions: string[]
}

/** Which permission names someone holds, by library. */
export type PermissionMap = Map<string, Set<string>>

export function toPermissionMap(rows: LibraryAccess[]): PermissionMap {
  return new Map(rows.map(r => [r.library_id, new Set(r.permissions)]))
}

/**
 * Whether the map grants perm in libraryId, or in any library when libraryId
 * is left out. The API decides every request either way; this only picks which
 * controls to draw, so a button that would answer 403 isn't offered.
 */
export function canIn(map: PermissionMap, perm: string, libraryId?: string): boolean {
  if (libraryId) return map.get(libraryId)?.has(perm) ?? false
  for (const perms of map.values()) if (perms.has(perm)) return true
  return false
}

export interface PermissionsValue {
  can: (perm: string, libraryId?: string) => boolean
  /** False until the first answer arrives, so callers can tell "no" from "not yet". */
  loaded: boolean
  refresh: () => void
}

// No provider means no information, and hiding everything on that basis would
// strip controls from every test and preview that renders a page on its own.
export const PermissionsContext = createContext<PermissionsValue>({
  can: () => true,
  loaded: true,
  refresh: () => {},
})

export function usePermissions(): PermissionsValue {
  return useContext(PermissionsContext)
}
