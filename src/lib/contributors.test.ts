// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it, vi } from 'vitest'
import type { ContributorResult } from '../types'
import { joinWithAbove } from './contributors'

const person = (id: string, name: string) => ({ id, name } as ContributorResult)

describe('joinWithAbove', () => {
  it('joins a split name back into one contributor', async () => {
    const callApi = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return [] // nobody by that name yet
      return person('joined', JSON.parse(String(init.body)).name)
    })
    const rows = [
      { contributor: person('k', 'Martin Luther King'), role: 'author' },
      { contributor: person('j', 'Jr.'), role: 'author' },
      { contributor: person('c', 'Coretta Scott King'), role: 'author' },
    ]
    const out = await joinWithAbove(callApi as never, rows, 1)
    expect(out.map(r => r.contributor?.name)).toEqual(['Martin Luther King, Jr.', 'Coretta Scott King'])
    expect(callApi).toHaveBeenLastCalledWith('/api/v1/contributors', expect.objectContaining({ method: 'POST' }))
  })

  it('reuses a contributor that already has the joined name', async () => {
    const existing = person('mlk', 'Martin Luther King, Jr.')
    const callApi = vi.fn(async () => [existing])
    const rows = [
      { contributor: person('k', 'Martin Luther King'), role: 'author' },
      { contributor: person('j', 'Jr.'), role: 'author' },
    ]
    expect((await joinWithAbove(callApi as never, rows, 1)).map(r => r.contributor)).toEqual([existing])
    expect(callApi).toHaveBeenCalledTimes(1)
  })

  it('leaves the rows alone when one has nobody picked', async () => {
    const rows = [{ contributor: null, role: 'author' }, { contributor: person('j', 'Jr.'), role: 'author' }]
    expect(await joinWithAbove(vi.fn() as never, rows, 1)).toBe(rows)
  })
})
