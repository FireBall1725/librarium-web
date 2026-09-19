// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The box Inventory scans into: a hardware scanner, a typed code, or the
// camera. While it's on screen it takes the scanner's scans, so they don't
// open Add books instead.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { registerScanTarget, useScannerEnabled } from '../../lib/barcodeScanner'
import { upcLookupCode } from '../../lib/barcode'
import { Icon } from '../../lib/icons'
import { useToast } from '../Toast'
import CameraView from '../addBooks/CameraView'

export default function ScanBox({ placeholder, onCode, disabled }: {
  placeholder: string
  onCode: (code: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const scannerOn = useScannerEnabled()
  const [text, setText] = useState('')
  const [camera, setCamera] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  const onCodeRef = useRef(onCode)
  useEffect(() => { onCodeRef.current = onCode })

  useEffect(() => registerScanTarget(b => {
    if (b.kind === 'invalid') return
    onCodeRef.current(b.kind === 'isbn' ? b.isbn13 : upcLookupCode(b))
  }), [])

  if (camera) {
    return (
      <CameraView onCode={code => onCodeRef.current(code)}
        onStop={() => { setCamera(false); setTimeout(() => box.current?.focus(), 0) }}
        onError={message => { setCamera(false); toast.show(message, { variant: 'error' }) }} />
    )
  }
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="barcode" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
          <input ref={box} id="inventory-scan" type="text" autoFocus autoComplete="off" value={text} disabled={disabled}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || !text.trim()) return
              onCodeRef.current(text.trim())
              setText('')
            }}
            placeholder={placeholder} aria-label={placeholder}
            className="lb-field w-full! py-2.5! pl-9! text-[15px]!" />
        </div>
        <button type="button" className="lb-btn ghost px-3!" onClick={() => setCamera(true)} disabled={disabled}
          aria-label={t('add_books.use_camera', { defaultValue: 'Use the camera' })}
          title={t('add_books.use_camera', { defaultValue: 'Use the camera' })}>
          <Icon name="camera" className="h-5 w-5" />
        </button>
      </div>
      {scannerOn && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-content-muted">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
          {t('add_books.scanner_ready', { defaultValue: 'Ready for a barcode scanner' })}
        </p>
      )}
    </div>
  )
}
