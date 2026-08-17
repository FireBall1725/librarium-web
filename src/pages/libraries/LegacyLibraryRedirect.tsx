// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { Navigate, useLocation, useParams } from 'react-router-dom'

/**
 * Sends a retired per-library section to its faceted equivalent.
 *
 * The redesign turns library from a folder you navigate into to a filter you
 * apply, so `/libraries/<id>/books` and `/books?lib=<id>` now describe the same
 * list. Once the second one exists, the first is a worse version of it: no
 * facets, no saved views, no cross-library selection.
 *
 * These stay as redirects rather than being deleted outright because the old
 * paths are in people's bookmarks and in the address bar of anyone who had the
 * app open when it updated. A redirect costs one route and keeps every one of
 * those working.
 *
 * The library moves from the path into the query, so this is not the prefix
 * swap that LegacySettingsRedirect does. Any other search parameters ride along
 * unchanged; `lib` is set rather than appended so a doubled redirect cannot
 * stack two of them.
 */
export default function LegacyLibraryRedirect({ to }: { to: string }) {
  const { libraryId } = useParams()
  const location = useLocation()

  const params = new URLSearchParams(location.search)
  if (libraryId) params.set('lib', libraryId)
  const query = params.toString()

  return <Navigate to={query ? `${to}?${query}` : to} replace />
}
