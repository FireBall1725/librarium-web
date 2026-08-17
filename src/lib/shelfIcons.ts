// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The icons a shelf can wear.
//
// Shelves used to store an arbitrary emoji, picked with a whole emoji-picker
// dependency, which meant they were the one thing in the rail not drawn from
// the app's own icon set. A row of emoji beside rows of Material icons reads as
// two products.
//
// A named subset rather than the full set: most of the icon set is navigation
// (back, settings, import) and offering it whole would be a menu of mostly
// wrong answers.

import type { IconName } from './icons'

export const SHELF_ICONS: IconName[] = [
  'tag', 'star', 'wish', 'check', 'clock', 'next',
  'lent', 'books', 'libraries', 'series', 'gaps', 'suggested',
]

export const DEFAULT_SHELF_ICON: IconName = 'tag'

/**
 * The icon to draw for a shelf.
 *
 * Anything unrecognised falls back, which covers both a shelf saved before this
 * existed (its value is an emoji) and one saved with no icon at all. Rendering
 * the stored string raw would put the old emoji back in a row of drawn icons,
 * which is the thing this replaces.
 */
export function shelfIcon(stored: string | null | undefined): IconName {
  if (stored && (SHELF_ICONS as string[]).includes(stored)) return stored as IconName
  return DEFAULT_SHELF_ICON
}
