// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { Navigate, useLocation } from 'react-router-dom'

/**
 * Sends any /admin/settings/* URL to its /settings/* equivalent.
 *
 * A component rather than one Navigate per moved page: the mapping is a prefix
 * swap, the child paths are unchanged, and listing them twice invites the two
 * lists to drift the next time a page is added. Search and the query string
 * ride along so a deep link into a job kind still lands where it meant to.
 */
export default function LegacySettingsRedirect() {
  const location = useLocation()
  const to = location.pathname.replace(/^\/admin\/settings/, '/settings')
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />
}
