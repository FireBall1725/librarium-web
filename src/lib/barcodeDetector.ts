// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Barcode reading for the camera scanner.
//
// Every browser goes through zxing, compiled to WebAssembly. The platform
// BarcodeDetector was used where it existed, but it never reports the 5-digit
// add-on printed beside a paperback's UPC, and on a mass-market paperback the
// add-on is the only part that names the book: the UPC itself is shared by
// every book at the same price. WebKit doesn't ship BarcodeDetector anyway,
// so iOS was already on zxing.

import { withBase } from './basePath'

/** The one shape the scanner needs. */
export interface BarcodeReader {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

// Wider frames cost decode time and add nothing a barcode needs.
const MAX_FRAME_WIDTH = 1280

/**
 * A reader for book barcodes: EAN-13 (ISBNs), UPC-A and UPC-E with any
 * add-on, EAN-8, and Code 128.
 *
 * zxing is imported dynamically so its WebAssembly is a separate chunk,
 * fetched only when someone opens the scanner.
 */
export async function getBarcodeReader(): Promise<BarcodeReader> {
  const [zxing, { default: wasmUrl }] = await Promise.all([
    import('zxing-wasm/reader'),
    // Vite emits this as a hashed asset in the build output. Resolving it
    // through the bundler rather than a string keeps it working under a
    // sub-path deployment, and keeps the URL in the integrity-checked build.
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])

  // zxing-wasm defaults to fetching its binary from the jsDelivr CDN. That is
  // an external request from a self-hosted, privacy-focused app that promises
  // it makes none unless asked, so it has to be redirected at our own asset.
  zxing.prepareZXingModule({
    overrides: {
      // Through withBase, because vite bakes this in as a root-absolute path
      // and the container entrypoint only rewrites index.html, not the JS
      // chunks. On an instance served from a sub-path the browser would ask
      // the host root for the binary and get a 404.
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? withBase(wasmUrl) : prefix + path,
    },
    fireImmediately: false,
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  return {
    async detect(video) {
      if (!ctx || !video.videoWidth) return []
      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const results = await zxing.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
        formats: ['EAN/UPC', 'Code128'],
        // With Read, a code with an add-on comes back as the code followed
        // by the add-on's digits; one without comes back on its own.
        eanAddOnSymbol: 'Read',
      })
      return results.filter(r => r.isValid).map(r => ({ rawValue: r.text }))
    },
  }
}
