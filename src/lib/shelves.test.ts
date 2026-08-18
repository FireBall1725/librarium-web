// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { ambiguousShelfNames, shelfNameKey } from './shelves'
import type { Shelf } from '../types'

const shelf = (name: string, libraryID: string): Shelf => ({
  id: `${libraryID}:${name}`,
  library_id: libraryID,
  name,
  description: '',
  color: '',
  icon: '',
  display_order: 0,
  book_count: 0,
  tags: [],
  created_at: '',
  updated_at: '',
})

describe('ambiguousShelfNames', () => {
  it('finds a name two libraries both use', () => {
    // The real case: one Favourites in Book Collection, one in Test Library,
    // listed together in the rail as the same row twice.
    const got = ambiguousShelfNames([
      shelf('Favourites', 'lib-a'),
      shelf('Favourites', 'lib-b'),
      shelf('Lent out', 'lib-a'),
    ])
    expect([...got]).toEqual(['favourites'])
  })

  it('leaves unique names alone, so nothing is qualified needlessly', () => {
    const got = ambiguousShelfNames([
      shelf('Favourites', 'lib-a'),
      shelf('Lent out', 'lib-a'),
      shelf('Re-read someday', 'lib-b'),
    ])
    expect(got.size).toBe(0)
  })

  it('treats case and surrounding space as the clash it looks like', () => {
    const got = ambiguousShelfNames([
      shelf('Favourites', 'lib-a'),
      shelf(' favourites ', 'lib-b'),
    ])
    expect([...got]).toEqual(['favourites'])
  })

  it('agrees with the key the lookup uses', () => {
    // The set is built from shelfNameKey and read with it; if they diverge the
    // qualifier silently never renders.
    const shelves = [shelf('Favourites', 'lib-a'), shelf('Favourites', 'lib-b')]
    const got = ambiguousShelfNames(shelves)
    expect(got.has(shelfNameKey(shelves[0].name))).toBe(true)
  })

  it('handles three libraries sharing one name', () => {
    const got = ambiguousShelfNames([
      shelf('Favourites', 'lib-a'),
      shelf('Favourites', 'lib-b'),
      shelf('Favourites', 'lib-c'),
    ])
    expect([...got]).toEqual(['favourites'])
  })

  it('is empty for no shelves', () => {
    expect(ambiguousShelfNames([]).size).toBe(0)
  })
})
