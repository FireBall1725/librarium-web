// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const prepareZXingModule = vi.fn()
const readBarcodes = vi.fn()

vi.mock('zxing-wasm/reader', () => ({ prepareZXingModule, readBarcodes }))
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({
  default: '/assets/zxing_reader-abc123.wasm',
}))

const { getBarcodeReader } = await import('./barcodeDetector')

// jsdom has no canvas, so hand the reader a context that records a frame.
const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 }
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => frame),
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  delete (window as unknown as Record<string, unknown>).BarcodeDetector
})

const video = (width = 1920, height = 1080) =>
  Object.defineProperties(document.createElement('video'), {
    videoWidth: { value: width },
    videoHeight: { value: height },
  })

describe('getBarcodeReader', () => {
  it('reads the add-on beside a UPC', async () => {
    // A paperback's bare UPC is shared by every book at its price; the add-on
    // is what names it, and the platform detector never reports it.
    readBarcodes.mockResolvedValue([
      { text: '003714500799134500', isValid: true },
      { text: 'garbage', isValid: false },
    ])
    const reader = await getBarcodeReader()
    expect(await reader.detect(video())).toEqual([{ rawValue: '003714500799134500' }])
    expect(readBarcodes).toHaveBeenCalledWith(frame, expect.objectContaining({ eanAddOnSymbol: 'Read' }))
  })

  it('uses zxing even where the platform has a detector', async () => {
    const Native = vi.fn()
    ;(window as unknown as Record<string, unknown>).BarcodeDetector = Native
    readBarcodes.mockResolvedValue([])
    const reader = await getBarcodeReader()
    await reader.detect(video())
    expect(Native).not.toHaveBeenCalled()
    expect(readBarcodes).toHaveBeenCalled()
  })

  it('reads nothing before the video has a frame', async () => {
    const reader = await getBarcodeReader()
    expect(await reader.detect(video(0, 0))).toEqual([])
    expect(readBarcodes).not.toHaveBeenCalled()
  })

  it('serves the .wasm from our own assets, never from a CDN', async () => {
    // Regression guard. zxing-wasm defaults to fetching its binary from
    // jsDelivr, which would break the "no external calls" promise and any
    // offline or CSP-restricted deployment.
    await getBarcodeReader()

    expect(prepareZXingModule).toHaveBeenCalledTimes(1)
    const { overrides } = prepareZXingModule.mock.calls[0][0]
    const resolved = overrides.locateFile('zxing_reader.wasm', 'https://cdn.example/')

    expect(resolved).toBe('/assets/zxing_reader-abc123.wasm')
    expect(resolved).not.toMatch(/^https?:\/\//)
  })

  it('finds the .wasm when the app is served from a sub-path', async () => {
    // vite bakes the URL into a JS chunk as /assets/..., and the container
    // entrypoint rewrites index.html only. Without withBase, an instance
    // mounted at /librarium asks the host root for the binary and gets a 404.
    ;(window as unknown as Record<string, unknown>).__LIBRARIUM_BASE_PATH__ = '/librarium'
    vi.resetModules()
    const { getBarcodeReader: mounted } = await import('./barcodeDetector')

    await mounted()
    const { overrides } = prepareZXingModule.mock.calls[0][0]
    expect(overrides.locateFile('zxing_reader.wasm', 'https://cdn.example/'))
      .toBe('/librarium/assets/zxing_reader-abc123.wasm')

    delete (window as unknown as Record<string, unknown>).__LIBRARIUM_BASE_PATH__
    vi.resetModules()
  })

  it('leaves non-wasm files to the default resolution', async () => {
    await getBarcodeReader()
    const { overrides } = prepareZXingModule.mock.calls[0][0]
    expect(overrides.locateFile('something.js', '/base/')).toBe('/base/something.js')
  })
})
