// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import type { Copy, MergedBookResult } from '../types'
import { MAX_KEPT, countBy, pendingRows, isRepeat, loadQueue, matchesFilter, newestCopy, saveQueue, type QueueRow } from './addBooksQueue'

const row = (id: string, state: QueueRow['state'], extra: Partial<QueueRow> = {}): QueueRow => ({
  id, code: `978000000000${id}`, scannedAt: 0, state, ...extra,
})

const memory = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    m,
  }
}

describe('the queue filters', () => {
  it('puts found books under Ready, and unsure or failed ones under Needs you', () => {
    expect(matchesFilter(row('1', 'ready'), 'ready')).toBe(true)
    expect(matchesFilter(row('1', 'ready'), 'needs_you')).toBe(false)
    expect(matchesFilter(row('1', 'needs_you'), 'needs_you')).toBe(true)
    expect(matchesFilter(row('1', 'failed'), 'needs_you')).toBe(true)
    expect(matchesFilter(row('1', 'added'), 'needs_you')).toBe(false)
  })

  it('hides skipped rows everywhere', () => {
    expect(countBy([row('1', 'skipped'), row('2', 'added'), row('3', 'have')])).toEqual({ all: 2, ready: 0, added: 1, needs_you: 0, have: 1 })
  })
})

describe('a repeated scan', () => {
  it('is the same scan inside the window', () => {
    expect(isRepeat([row('1', 'looking', { code: 'x', scannedAt: 1000 })], 'x', 2000)).toBe(true)
  })

  it('is a second copy after it, or after another book', () => {
    expect(isRepeat([row('1', 'added', { code: 'x', scannedAt: 1000 })], 'x', 9000)).toBe(false)
    expect(isRepeat([row('2', 'added', { code: 'y', scannedAt: 1500 }), row('1', 'added', { code: 'x', scannedAt: 1000 })], 'x', 2000)).toBe(false)
  })
})

describe('undo', () => {
  const copy = (id: string, lib: string, at: string) => ({ id, library_id: lib, created_at: at }) as Copy

  it('takes back the newest copy in this library', () => {
    expect(newestCopy([copy('a', 'l', '2026-09-01'), copy('b', 'l', '2026-09-19'), copy('c', 'other', '2026-09-20')], 'l')?.id).toBe('b')
  })

  it('finds nothing when this library has no copy', () => {
    expect(newestCopy([copy('c', 'other', '2026-09-20')], 'l')).toBeNull()
  })
})

describe('keeping the queue', () => {
  const merged = { categories: [], covers: [] } as MergedBookResult

  it('survives a reload, per library', () => {
    const store = memory()
    saveQueue('lib', [row('1', 'added')], store)
    expect(loadQueue('lib', store)).toHaveLength(1)
    expect(loadQueue('other', store)).toEqual([])
  })

  it('turns a row cut off mid-lookup into a failed one', () => {
    const store = memory()
    saveQueue('lib', [row('1', 'looking'), row('2', 'adding')], store)
    expect(loadQueue('lib', store).map(r => r.state)).toEqual(['failed', 'failed'])
  })

  it('drops the provider answers from settled rows only', () => {
    const store = memory()
    saveQueue('lib', [row('1', 'added', { merged }), row('2', 'needs_you', { merged })], store)
    const back = loadQueue('lib', store)
    expect(back[0].merged).toBeUndefined()
    expect(back[1].merged).toEqual(merged)
  })

  it('drops old finished rows past the cap, never ones waiting on you', () => {
    const store = memory()
    const many = Array.from({ length: MAX_KEPT + 5 }, (_, i) => row(String(i), i === MAX_KEPT + 4 ? 'needs_you' : 'added'))
    saveQueue('lib', many, store)
    const back = loadQueue('lib', store)
    expect(back).toHaveLength(MAX_KEPT + 1)
    expect(back.at(-1)?.state).toBe('needs_you')
  })

  it('counts the rows still looking up or waiting on you', () => {
    const store = memory()
    saveQueue('lib', [row('1', 'added'), row('2', 'needs_you'), row('3', 'looking'), row('4', 'skipped')], store)
    expect(pendingRows('lib', store)).toBe(2)
  })

  it('clears the key when the queue is empty, and shrugs off junk', () => {
    const store = memory()
    saveQueue('lib', [row('1', 'added')], store)
    saveQueue('lib', [], store)
    expect(store.m.size).toBe(0)
    store.setItem('librarium:add-books:queue:lib', '{not json')
    expect(loadQueue('lib', store)).toEqual([])
  })
})
