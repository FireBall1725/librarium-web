// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

/**
 * What the caller should be drawing right now.
 *
 * `idle` and `loading` are different answers and used to look the same: there
 * was only a src or no src, so a cover that existed but had not arrived
 * rendered the same "no cover" placeholder as one that did not exist, then
 * swapped. That is the flash.
 */
export type ImageStatus = 'idle' | 'loading' | 'ready' | 'none'

export interface AuthenticatedImage {
  /** Attach to the element that should come into view before fetching. */
  ref: (node: Element | null) => void
  src: string | null
  status: ImageStatus
}

/**
 * Fetches a local API image with the Bearer token and returns an object URL
 * suitable for use as an <img src>. External URLs (provider cover art etc.)
 * are passed through unchanged. The object URL is revoked on cleanup.
 *
 * Deferred until the element is near the viewport. The image needs a Bearer
 * token, so it cannot be an ordinary <img src> and `loading="lazy"` does
 * nothing for it: the browser never sees a request to defer. Without this every
 * cover on a page fetches at mount, which on the authors page is three spines
 * per author and around a thousand requests fired at once.
 */
export function useAuthenticatedImage(url: string | null | undefined): AuthenticatedImage {
  const { getToken } = useAuth()
  const [src, setSrc] = useState<string | null>(null)
  const [status, setStatus] = useState<ImageStatus>(url ? 'idle' : 'none')
  const [visible, setVisible] = useState(false)
  const blobUrlRef = useRef<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // A callback ref rather than useEffect on a ref object: the node arrives on
  // mount and can change, and this fires for both without a second effect.
  const ref = useCallback((node: Element | null) => {
    observerRef.current?.disconnect()
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      // jsdom and older browsers: fetch rather than never showing anything.
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setVisible(true)
        io.disconnect()
      }
    // A wide margin so a cover is already there by the time it is scrolled to,
    // rather than arriving after the reader is looking at the space it fills.
    }, { rootMargin: '400px' })
    io.observe(node)
    observerRef.current = io
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  useEffect(() => {
    if (!url) {
      setSrc(null)
      setStatus('none')
      return
    }
    setStatus('idle')
    if (!visible) return

    // External URLs (e.g. OpenLibrary, provider previews) don't need auth.
    if (!url.startsWith('/api/')) {
      setSrc(url)
      setStatus('ready')
      return
    }

    let cancelled = false
    setStatus('loading')

    ;(async () => {
      try {
        const token = await getToken()
        if (cancelled) return
        const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
        if (cancelled) return
        if (!res.ok) { setSrc(null); setStatus('none'); return }
        const blob = await res.blob()
        if (cancelled) return
        const newBlobUrl = URL.createObjectURL(blob)
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = newBlobUrl
        setSrc(newBlobUrl)
        setStatus('ready')
      } catch {
        if (!cancelled) { setSrc(null); setStatus('none') }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url, getToken, visible])

  // Revoke the blob URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  return { ref, src, status }
}
