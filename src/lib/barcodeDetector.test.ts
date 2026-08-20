// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { afterEach, describe, expect, it, vi } from 'vitest'

const prepareZXingModule = vi.fn()
const PonyfillDetector = vi.fn()

vi.mock('barcode-detector/pure', () => ({
  prepareZXingModule,
  BarcodeDetector: PonyfillDetector,
}))
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({
  default: '/assets/zxing_reader-abc123.wasm',
}))

const { getBarcodeReader, hasNativeDetector } = await import('./barcodeDetector')

afterEach(() => {
  vi.clearAllMocks()
  delete (window as unknown as Record<string, unknown>).BarcodeDetector
})

describe('hasNativeDetector', () => {
  it('is false on a WebKit-shaped browser', () => {
    expect(hasNativeDetector()).toBe(false)
  })

  it('is true once the platform API is present', () => {
    ;(window as unknown as Record<string, unknown>).BarcodeDetector = class {}
    expect(hasNativeDetector()).toBe(true)
  })
})

describe('getBarcodeReader', () => {
  it('uses the platform detector when there is one', async () => {
    const Native = vi.fn()
    ;(window as unknown as Record<string, unknown>).BarcodeDetector = Native
    await getBarcodeReader(['ean_13'])
    expect(Native).toHaveBeenCalledWith({ formats: ['ean_13'] })
    expect(PonyfillDetector).not.toHaveBeenCalled()
    // No WebAssembly decoder is configured for a browser that does not need it.
    expect(prepareZXingModule).not.toHaveBeenCalled()
  })

  it('falls back to the WebAssembly decoder otherwise', async () => {
    await getBarcodeReader(['ean_13', 'upc_a'])
    expect(PonyfillDetector).toHaveBeenCalledWith({ formats: ['ean_13', 'upc_a'] })
  })

  it('serves the .wasm from our own assets, never from a CDN', async () => {
    // Regression guard. zxing-wasm defaults to fetching its binary from
    // jsDelivr, and an earlier version of this file configured the wrong
    // module instance — the override looked right and the browser still went
    // to the CDN, which would break the "no external calls" promise and any
    // offline or CSP-restricted deployment.
    await getBarcodeReader(['ean_13'])

    expect(prepareZXingModule).toHaveBeenCalledTimes(1)
    const { overrides } = prepareZXingModule.mock.calls[0][0]
    const resolved = overrides.locateFile('zxing_reader.wasm', 'https://cdn.example/')

    expect(resolved).toBe('/assets/zxing_reader-abc123.wasm')
    expect(resolved).not.toMatch(/^https?:\/\//)
  })

  it('leaves non-wasm files to the default resolution', async () => {
    await getBarcodeReader(['ean_13'])
    const { overrides } = prepareZXingModule.mock.calls[0][0]
    expect(overrides.locateFile('something.js', '/base/')).toBe('/base/something.js')
  })
})
