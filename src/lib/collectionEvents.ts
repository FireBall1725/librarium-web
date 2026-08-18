// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

/**
 * "Something the sidebar shows has changed."
 *
 * The rail loads libraries, shelves and counts once on mount, so a page that
 * adds a shelf or a library leaves it stale until a reload. Adding a shelf in
 * Settings and going back to the library showed the old list, which reads as
 * the shelf not having been created.
 *
 * An event rather than lifted state: the rail and the page that mutates are on
 * opposite sides of the route tree, and threading a refresh callback through
 * every settings page to reach the shell is a lot of wiring for one message.
 *
 * The name lived as a bare string at four call sites, which is how two of them
 * came to be missing — nothing points out the pages that never send it.
 */
export const COLLECTION_CHANGED = 'librarium:collection-changed'

/** Tell the rail to reload. Safe to call where there is no window. */
export function announceCollectionChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COLLECTION_CHANGED))
}
