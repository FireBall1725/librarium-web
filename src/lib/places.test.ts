// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import type { CopyLocation } from '../types'
import { buildTree, caseInfo, flatten, missingShelves, pathOf, selfAndInside } from './places'

const place = (id: string, name: string, parent: string | null = null, extra: Partial<CopyLocation> = {}): CopyLocation => ({
  id, name, parent_id: parent, library_id: 'lib', copy_count: 0, created_at: '', ...extra,
})

// Library > Bookcase A > Shelf 1, Shelf 2, Shelf 10, and a loose Office.
const places = [
  place('lib-room', 'Library'),
  place('a', 'Bookcase A', 'lib-room', { copy_count: 1 }),
  place('a10', 'Shelf 10', 'a', { copy_count: 4 }),
  place('a1', 'Shelf 1', 'a', { copy_count: 2 }),
  place('a2', 'Shelf 2', 'a'),
  place('office', 'Office'),
]

describe('buildTree', () => {
  it('nests to any depth and sorts shelf numbers as numbers', () => {
    const flat = flatten(buildTree(places))
    expect(flat.map(n => `${n.depth}:${n.place.name}`)).toEqual([
      '0:Library', '1:Bookcase A', '2:Shelf 1', '2:Shelf 2', '2:Shelf 10', '0:Office',
    ])
  })

  it('adds up the copies inside each place', () => {
    const [library] = buildTree(places)
    expect(library.total).toBe(7)
    expect(library.children[0].total).toBe(7)
  })

  it('keeps a place whose parent is gone, or that sits in a loop', () => {
    const odd = [
      place('orphan', 'Orphan', 'missing'),
      place('x', 'X', 'y'),
      place('y', 'Y', 'x'),
    ]
    expect(flatten(buildTree(odd)).map(n => n.place.id).sort()).toEqual(['orphan', 'x', 'y'])
  })
})

describe('pathOf and selfAndInside', () => {
  it('names the way down from the top', () => {
    expect(pathOf('a2', places)).toEqual(['Library', 'Bookcase A', 'Shelf 2'])
  })

  it('finds everything inside a place, at every depth', () => {
    expect([...selfAndInside('lib-room', places)].sort()).toEqual(['a', 'a1', 'a10', 'a2', 'lib-room'])
  })
})

describe('caseInfo', () => {
  const shelves = places.filter(p => p.parent_id === 'a')

  it('guesses the count from the highest shelf number', () => {
    const info = caseInfo(places[1], shelves)!
    expect(info.count).toBe(10)
    expect(info.declared).toBe(false)
    expect(info.topDown).toBe(true)
    expect(info.prefix).toBe('Shelf ')
    expect([...info.have.keys()].sort((a, b) => a - b)).toEqual([1, 2, 10])
  })

  it('uses a declared count, but never fewer than a shelf name says', () => {
    expect(caseInfo({ ...places[1], shelf_count: 12 }, shelves)!.count).toBe(12)
    expect(caseInfo({ ...places[1], shelf_count: 4 }, shelves)!.count).toBe(10)
  })

  it('reads the numbering direction', () => {
    expect(caseInfo({ ...places[1], shelf_numbering: 'bottom_up' }, shelves)!.topDown).toBe(false)
  })

  it('keeps the naming the shelves use', () => {
    const b = [place('b1', 'B1', 'b'), place('b3', 'B3', 'b')]
    const info = caseInfo(place('b', 'Bookcase B'), b)!
    expect(info.prefix).toBe('B')
    expect(missingShelves(info, info.count)).toEqual(['B2'])
  })

  it('gives up when a shelf has no number', () => {
    expect(caseInfo(places[1], [...shelves, place('top', 'Top shelf', 'a')])).toBeNull()
  })

  it('has nothing to draw with no shelves and no count', () => {
    expect(caseInfo(place('e', 'Empty'), [])).toBeNull()
    expect(caseInfo(place('e', 'Empty', null, { shelf_count: 3 }), [])!.count).toBe(3)
  })
})

describe('missingShelves', () => {
  it('lists every number with no place, up to the count asked for', () => {
    const info = caseInfo(places[1], places.filter(p => p.parent_id === 'a'))!
    expect(missingShelves(info, 11)).toEqual(['Shelf 3', 'Shelf 4', 'Shelf 5', 'Shelf 6', 'Shelf 7', 'Shelf 8', 'Shelf 9', 'Shelf 11'])
  })

  it('names new shelves Shelf 1 onward when there is nothing to copy', () => {
    expect(missingShelves(null, 3)).toEqual(['Shelf 1', 'Shelf 2', 'Shelf 3'])
    expect(missingShelves(null, 2, 'Étagère ')).toEqual(['Étagère 1', 'Étagère 2'])
  })
})
