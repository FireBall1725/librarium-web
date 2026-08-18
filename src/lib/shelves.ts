// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import type { Shelf } from '../types'

/**
 * The shelf names more than one library uses.
 *
 * A shelf belongs to a single library, and the rail lists every library's
 * shelves together, so two libraries each with a "Favourites" produced two
 * rows that read as the same shelf listed twice. Only the names in this set
 * get their library shown beside them; qualifying every shelf would be noise
 * for the usual case where the name is already unique.
 *
 * Folded to lower case and trimmed, so "Favourites" and " favourites " count
 * as the clash they look like on screen rather than passing as distinct.
 */
export function ambiguousShelfNames(shelves: Shelf[]): Set<string> {
  const counts = new Map<string, number>()
  for (const sh of shelves) {
    const key = shelfNameKey(sh.name)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name))
}

/** The folded form both the set and the lookup have to agree on. */
export const shelfNameKey = (name: string): string => name.trim().toLowerCase()
