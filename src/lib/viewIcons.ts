// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The icons a saved view can wear.
//
// Views used to have no say: the five built-ins were mapped by id and anything
// you saved yourself got the generic plus, so a rail of your own views was a
// column of identical icons. Shelves gained a picker; this is the same idea for
// the other named list in the rail.

import type { IconName } from './icons'
import type { SavedView } from './views'

export const VIEW_ICONS: IconName[] = [
  'newview', 'next', 'books', 'gaps', 'star', 'wish',
  'check', 'clock', 'tag', 'lent', 'series', 'suggested',
]

/**
 * Which icon to draw for a view.
 *
 * The reader's choice wins. Failing that, the built-ins keep the icons they
 * shipped with, so nothing had to be migrated when the field was added, and
 * anything else gets the generic one.
 */
export function viewIcon(v: SavedView): IconName {
  if (v.icon && (VIEW_ICONS as string[]).includes(v.icon)) return v.icon
  switch (v.id) {
    case 'reading': return 'next'
    case 'unread': return 'books'
    case 'read': return 'gaps'
    case 'five-stars': return 'star'
    case 'signed': return 'wish'
    default: return 'newview'
  }
}
