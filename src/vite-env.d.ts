/// <reference types="vite/client" />

declare const __APP_VERSION__: string

// BarcodeDetector is a browser API not yet in TypeScript's lib
declare class BarcodeDetector {
  constructor(options?: { formats: string[] })
  detect(image: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>
  static getSupportedFormats(): Promise<string[]>
}
