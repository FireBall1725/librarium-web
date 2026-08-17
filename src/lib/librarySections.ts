// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

/**
 * A library's own pages, the ones that are not a way of browsing the
 * collection.
 *
 * Books and Contributors left when they became `/books?lib=` and
 * `/authors?lib=`. Shelves left when a shelf became a filter with its own rail
 * section, Members when it moved to Settings, and Loans when it became a
 * top-level page: a loan is a book, a person and some dates, and the library is
 * only where the book happens to live.
 *
 * What remains is Series, which is the arcs and volumes editor and the last
 * thing in the folder.
 *
 * Shared because three places list them and a fourth would have drifted: the
 * sidebar, the tabs inside a library page, and the menu on a library card.
 */
export const LIBRARY_SECTIONS: Array<{ section: string; labelKey: string }> = [
  { section: 'series', labelKey: 'library_nav.series' },
]
