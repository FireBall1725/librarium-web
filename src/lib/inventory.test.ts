// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import type { Copy } from '../types'
import { checkResult, matchOnShelf, placeCopy, type CheckExtra, type InventoryCopy } from './inventory'

const copy = (id: string, location: string | null, library = 'lib'): Copy =>
  ({ id, library_id: library, book_id: 'b', location_id: location } as Copy)

describe('which copy a scan moves', () => {
  it('moves nothing when a copy is already on the shelf', () => {
    expect(placeCopy([copy('a', 'office'), copy('b', 'shelf')], 'lib', 'shelf')).toMatchObject({ kind: 'here', copy: { id: 'b' } })
  })

  it('moves an unshelved copy before one that has a place', () => {
    expect(placeCopy([copy('a', 'office'), copy('b', null)], 'lib', 'shelf')).toMatchObject({ kind: 'move', copy: { id: 'b' }, from: null })
  })

  it('moves a lone copy from wherever it was', () => {
    expect(placeCopy([copy('a', 'office')], 'lib', 'shelf')).toMatchObject({ kind: 'move', copy: { id: 'a' }, from: 'office' })
  })

  it('asks which when every copy is on some other place', () => {
    expect(placeCopy([copy('a', 'office'), copy('b', 'bedroom')], 'lib', 'shelf').kind).toBe('ask')
  })

  it("ignores another library's copies", () => {
    expect(placeCopy([copy('a', null, 'other')], 'lib', 'shelf').kind).toBe('none')
  })
})

describe('a shelf check', () => {
  const inv = (id: string, book: string, loan = ''): InventoryCopy =>
    ({ id, book_id: book, on_loan_to: loan, book_title: book } as InventoryCopy)
  const shelf = [inv('1', 'dune'), inv('2', 'dune'), inv('3', 'hybrids', 'a friend'), inv('4', 'humans')]

  it('ticks off a second copy of the same book on the next scan', () => {
    expect(matchOnShelf(shelf, new Set(), 'dune')?.id).toBe('1')
    expect(matchOnShelf(shelf, new Set(['1']), 'dune')?.id).toBe('2')
    expect(matchOnShelf(shelf, new Set(['1', '2']), 'dune')).toBeNull()
  })

  it('splits what was not scanned into missing and lent out, and sorts the extras', () => {
    const extras: CheckExtra[] = [
      { code: 'x', title: 'Moved', copy: copy('9', 'office'), from: 'office' },
      { code: 'y', title: 'Stranger', copy: null, from: null },
    ]
    const r = checkResult(shelf, new Set(['1', '2']), extras)
    expect(r.missing.map(c => c.id)).toEqual(['4'])
    expect(r.onLoan.map(c => c.id)).toEqual(['3'])
    expect(r.elsewhere.map(e => e.title)).toEqual(['Moved'])
    expect(r.notHere.map(e => e.title)).toEqual(['Stranger'])
  })
})
