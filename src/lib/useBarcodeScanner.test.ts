// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBarcodeScanner } from './useBarcodeScanner'

let clock = 0
beforeEach(() => {
  clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function press(key: string, gapMs: number, target: EventTarget = document.body) {
  clock += gapMs
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  target.dispatchEvent(e)
  return e
}

function type(text: string, gapMs: number, target?: EventTarget) {
  for (const ch of text) press(ch, gapMs, target)
  return press('Enter', gapMs, target)
}

describe('useBarcodeScanner', () => {
  it('fires on a fast burst ending in Enter', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))
    type('9780441172719', 10)
    expect(onScan).toHaveBeenCalledWith('9780441172719')
  })

  it('ignores human-speed typing', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))
    type('9780441172719', 120)
    expect(onScan).not.toHaveBeenCalled()
  })

  it('leaves typing in a field alone', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))
    const input = document.createElement('input')
    document.body.appendChild(input)
    type('9780441172719', 10, input)
    expect(onScan).not.toHaveBeenCalled()
  })

  it('drops bursts shorter than the minimum', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))
    type('123', 10)
    expect(onScan).not.toHaveBeenCalled()
  })

  it('swallows keys mid-scan so shortcuts do not fire', () => {
    renderHook(() => useBarcodeScanner(() => {}))
    press('9', 10)
    const second = press('7', 10)
    expect(second.defaultPrevented).toBe(true)
  })

  it('does nothing when turned off', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan, { enabled: false }))
    type('9780441172719', 10)
    expect(onScan).not.toHaveBeenCalled()
  })
})
