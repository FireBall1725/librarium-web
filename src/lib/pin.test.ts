// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { isPin, pinProblem } from './pin'

describe('isPin', () => {
  it('accepts 4 to 8 digits', () => {
    for (const v of ['1234', '00000', '12345678']) expect(isPin(v)).toBe(true)
  })
  it('rejects anything else', () => {
    for (const v of ['', '123', '123456789', '12a4', ' 1234', '1234 ', '12.34', '١٢٣٤']) {
      expect(isPin(v)).toBe(false)
    }
  })
})

describe('pinProblem', () => {
  it('passes a valid PIN typed twice', () => {
    expect(pinProblem('4821', '4821')).toBeNull()
  })
  it('flags a mismatch', () => {
    expect(pinProblem('4821', '4812')).toBe('mismatch')
    expect(pinProblem('4821', '')).toBe('mismatch')
  })
  it('flags the format before the match', () => {
    expect(pinProblem('12', '12')).toBe('format')
    expect(pinProblem('12', '34')).toBe('format')
  })
})
