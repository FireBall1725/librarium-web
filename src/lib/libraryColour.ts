// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

/**
 * A stable colour per library, derived from its id since the schema carries
 * none.
 *
 * Shared so the swatch beside a library means the same thing everywhere it
 * appears: the sidebar rail, and the picker that asks which library you meant.
 * Two functions computing this separately would drift the moment one changed.
 *
 * The id, not the name, so renaming a library leaves its colour alone. What
 * does move it is the id changing — deleting and re-creating a library, or a
 * restore that reassigns ids. Locally that means every run of
 * seed-sample-library.py repaints the rail, since it inserts libraries with
 * gen_random_uuid(); that is the seeder, not a bug here.
 *
 * Known limit: only the hue varies, so two libraries can land close enough to
 * be the same colour at 9x9 pixels. Hues are effectively random, so the odds of
 * some pair falling within 20 degrees are about 30% at three libraries and 73%
 * at five. Fixing that properly means a colour column on the library, assigned
 * from a palette and editable the way shelves already are; until the swatch
 * actually fails someone in practice, it is not worth a migration.
 */
export function libraryColour(id: string | null | undefined): string {
  // Tolerates a missing id rather than throwing. This is a presentation
  // helper called from the rail during render, and a payload whose shape
  // changed once took the whole app to a blank page over a swatch colour.
  if (!id) return 'var(--color-line-strong)'
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0
  return `oklch(0.68 0.15 ${h % 360})`
}
