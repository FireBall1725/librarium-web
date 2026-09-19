// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The hardware scanner's on/off setting, and where scans go.
//
// The setting is per browser, like the reading font: it is about the scanner
// plugged into this computer, not about the account.

import { useEffect, useState } from 'react'
import type { Barcode } from './barcode'

export const SCANNER_STORAGE_KEY = 'librarium:barcode-scanner'
const CHANGED = 'librarium:barcode-scanner-changed'

export function readScannerEnabled(): boolean {
  try {
    return window.localStorage.getItem(SCANNER_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function storeScannerEnabled(on: boolean) {
  try {
    window.localStorage.setItem(SCANNER_STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Private windows can refuse storage; the setting just won't stick.
  }
  window.dispatchEvent(new Event(CHANGED))
}

export function useScannerEnabled(): boolean {
  const [on, setOn] = useState(readScannerEnabled)
  useEffect(() => {
    const update = () => setOn(readScannerEnabled())
    window.addEventListener(CHANGED, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(CHANGED, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return on
}

// An open Add Book modal takes scans itself, so a second modal never opens on
// top of it. The most recently registered target wins.
type ScanTarget = (barcode: Barcode) => void
const targets: ScanTarget[] = []

export function registerScanTarget(target: ScanTarget): () => void {
  targets.push(target)
  return () => {
    const i = targets.lastIndexOf(target)
    if (i >= 0) targets.splice(i, 1)
  }
}

export function currentScanTarget(): ScanTarget | null {
  return targets[targets.length - 1] ?? null
}
