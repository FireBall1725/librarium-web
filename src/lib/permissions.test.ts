// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, it, expect } from 'vitest'
import { canIn, toPermissionMap } from './permissions'

const map = toPermissionMap([
  { library_id: 'a', name: 'Ours', role: 'library_editor', permissions: ['series:read', 'series:update'] },
  { library_id: 'b', name: 'Theirs', role: 'library_owner', permissions: ['series:read', 'series:update', 'series:delete'] },
])

describe('canIn', () => {
  it('answers for the library asked about, not another one', () => {
    // The editor in a can't delete there, even though they can in b.
    expect(canIn(map, 'series:delete', 'a')).toBe(false)
    expect(canIn(map, 'series:delete', 'b')).toBe(true)
    expect(canIn(map, 'series:update', 'a')).toBe(true)
  })

  it('says no for a library the reader has no row for', () => {
    expect(canIn(map, 'series:read', 'c')).toBe(false)
  })

  it('answers "anywhere" when no library is named', () => {
    expect(canIn(map, 'series:delete')).toBe(true)
    expect(canIn(map, 'members:update')).toBe(false)
  })
})
