// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Detects a hardware barcode scanner (Bluetooth or USB) in keyboard mode.
//
// These type the code far faster than a person and end with Enter or Tab. We
// buffer keystrokes, reset on any human-speed gap, and treat a fast burst that
// ends in Enter as a scan. Ported from FireBin, minus the EIGP-114 separator
// handling that book barcodes never use.

import { useEffect, useRef } from 'react'

interface Options {
  enabled?: boolean
  /** Longest gap between characters that still counts as one scan (ms). Scanners are ~5-25 ms a key; people are 80+. */
  maxGapMs?: number
  /** Shorter bursts are ignored, so a quick double-tap doesn't fire. */
  minLength?: number
}

const isEditable = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

export function useBarcodeScanner(onScan: (code: string) => void, { enabled = true, maxGapMs = 50, minLength = 4 }: Options = {}) {
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return
    let buffer = ''
    let last = 0

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey || e.ctrlKey) return
      // Typing in a field is left alone, so scanning into the focused ISBN box just types there.
      if (isEditable(e.target)) return

      const now = performance.now()
      if (now - last > maxGapMs) buffer = ''
      const midScan = buffer.length > 0
      last = now

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= minLength) {
          const code = buffer
          buffer = ''
          e.preventDefault()
          e.stopPropagation()
          onScanRef.current(code)
        } else {
          buffer = ''
        }
        return
      }

      if (e.key.length === 1) {
        buffer += e.key
        // Once a fast burst is under way, swallow the keys so they can't reach
        // the page or its shortcuts halfway through a scan.
        if (midScan) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled, maxGapMs, minLength])
}
