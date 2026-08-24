// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The icons a list can wear.
//
// One set, because there is one thing now. Shelves and saved views each had
// their own picker offering an overlapping subset of the same icons, so the
// same twelve pictures were maintained in two files and a reader choosing an
// icon got a different menu depending on which of the two they happened to be
// making.
//
// A named subset rather than the whole icon set: most of it is navigation
// (back, settings, import) and offering that whole would be a menu of mostly
// wrong answers.

import type { IconName } from './icons'

export const LIST_ICONS: IconName[] = [
  'tag', 'star', 'wish', 'check', 'clock', 'next',
  'lent', 'books', 'libraries', 'series', 'gaps', 'suggested', 'newview',
]

/** What a list wears when it has said nothing and is not one we ship. */
export const DEFAULT_LIST_ICON: IconName = 'tag'

/**
 * The icons the lists we ship wear.
 *
 * Keyed on builtin_key rather than on the row id: the id is a UUID minted per
 * install, so a map keyed on it would work on the machine it was written for
 * and nowhere else.
 */
const BUILTIN_ICONS: Record<string, IconName> = {
  reading: 'next',
  unread: 'books',
  read: 'gaps',
  favourites: 'star',
  'five-stars': 'star',
  signed: 'wish',
}

/**
 * Which icon to draw.
 *
 * The reader's choice wins. Failing that, a list we ship keeps the icon it
 * shipped with, so nothing had to be migrated when the field was added. A
 * smart list nobody has styled gets the generic view icon rather than the tag,
 * because a tag on something with no hand-picked members reads as a mistake.
 */
export function listIconName(
  icon: string | null | undefined,
  builtinKey?: string,
  kind?: 'manual' | 'smart',
): IconName {
  if (icon && (LIST_ICONS as string[]).includes(icon)) return icon as IconName
  if (builtinKey && BUILTIN_ICONS[builtinKey]) return BUILTIN_ICONS[builtinKey]
  return kind === 'smart' ? 'newview' : DEFAULT_LIST_ICON
}
