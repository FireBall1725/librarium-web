// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Barcode detection that also works on iOS.
//
// The scanner in AddBookModal uses the platform's BarcodeDetector, which
// Chrome and Edge implement and WebKit does not. WebKit's position on the
// Shape Detection API is "support" and a draft implementation exists behind
// the ShapeDetection preference, but it ships off by default. Because every
// browser on iOS is required to use WebKit, that makes scanning unavailable
// on iPhone and iPad whatever browser the reader picked — which is precisely
// the device they are holding while standing at a bookshelf.
//
// So: use the platform API where it exists, and fall back to a WebAssembly
// decoder where it does not.

import type { BarcodeFormat } from 'barcode-detector/pure'

/** The one shape the scanner needs from either implementation. */
export interface BarcodeReader {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

/** True when the browser ships the Shape Detection API itself. */
export function hasNativeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

/**
 * A detector for the given symbologies, native if possible.
 *
 * The fallback is imported dynamically so the WebAssembly decoder is a
 * separate chunk: a reader on Chrome never downloads it, and a reader on
 * Safari pays for it only once they actually open the scanner.
 */
export async function getBarcodeReader(formats: BarcodeFormat[]): Promise<BarcodeReader> {
  if (hasNativeDetector()) {
    const Native = (window as unknown as {
      BarcodeDetector: new (o: { formats: BarcodeFormat[] }) => BarcodeReader
    }).BarcodeDetector
    return new Native({ formats })
  }

  const [pure, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/pure'),
    // Vite emits this as a hashed asset in the build output. Resolving it
    // through the bundler rather than a string keeps it working under a
    // sub-path deployment, and keeps the URL in the integrity-checked build.
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])

  // zxing-wasm defaults to fetching its binary from the jsDelivr CDN. That is
  // an external request from a self-hosted, privacy-focused app that promises
  // it makes none unless asked, so it has to be redirected at our own asset.
  //
  // It must be barcode-detector's re-export of prepareZXingModule, not the one
  // from zxing-wasm: the package inlines its own copy of zxing, so configuring
  // the zxing-wasm module directly leaves a second, unconfigured instance —
  // which is the one that actually runs, and which really does hit the CDN.
  pure.prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasmUrl : prefix + path,
    },
    fireImmediately: false,
  })

  return new pure.BarcodeDetector({ formats })
}
