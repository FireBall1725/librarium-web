// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

/**
 * Fetches a local API image with the Bearer token and returns an object URL
 * suitable for use as an <img src>.  External URLs (provider cover art etc.)
 * are passed through unchanged.  The object URL is revoked on cleanup.
 */
export function useAuthenticatedImage(url: string | null | undefined): string | null {
  const { getToken } = useAuth()
  const [src, setSrc] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!url) {
      setSrc(null)
      return
    }

    // External URLs (e.g. OpenLibrary, provider previews) don't need auth.
    if (!url.startsWith('/api/')) {
      setSrc(url)
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const token = await getToken()
        if (cancelled) return
        const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
        if (cancelled) return
        if (!res.ok) { setSrc(null); return }
        const blob = await res.blob()
        if (cancelled) return
        const newBlobUrl = URL.createObjectURL(blob)
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = newBlobUrl
        setSrc(newBlobUrl)
      } catch {
        if (!cancelled) setSrc(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url, getToken])

  // Revoke the blob URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  return src
}
