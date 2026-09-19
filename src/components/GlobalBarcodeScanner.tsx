// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Listens for a hardware barcode scanner on every page.
//
// A scan of a book you already have opens it; a new one opens Add Book with
// the ISBN filled in. The barcode is an identity, so libraries are checked
// first and providers are only asked once Add Book opens.

import { useCallback, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { useToast } from './Toast'
import AddBookModal from './AddBookModal'
import { classifyBarcode, upcLookupCode } from '../lib/barcode'
import { currentScanTarget, useScannerEnabled } from '../lib/barcodeScanner'
import { useBarcodeScanner } from '../lib/useBarcodeScanner'
import { announceCollectionChanged } from '../lib/collectionEvents'
import type { Book, Library, MediaType } from '../types'

export default function GlobalBarcodeScanner() {
  const { callApi } = useAuth()
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const enabled = useScannerEnabled()

  const [addFor, setAddFor] = useState<{ isbn: string; libraries: Library[]; mediaTypes: MediaType[]; libraryId?: string } | null>(null)

  // The library the reader is looking at, if any: a /libraries/:id route, or
  // the ?lib= filter on Books.
  const currentLibrary = useCallback(() => {
    const m = location.pathname.match(/\/libraries\/([^/]+)/)
    return m?.[1] ?? params.get('lib') ?? undefined
  }, [location.pathname, params])

  const handleScan = useCallback(async (raw: string) => {
    const barcode = classifyBarcode(raw)
    if (barcode.kind === 'invalid') {
      toast.show(t('scanner.not_book', { code: barcode.code, defaultValue: `That barcode isn't a book barcode: ${barcode.code}` }), { variant: 'error' })
      return
    }
    const shown = barcode.kind === 'isbn' ? barcode.isbn13 : barcode.code
    toast.show(t('scanner.scanned', { code: shown, defaultValue: `Scanned ${shown}` }))

    // An open Add Book takes the scan itself.
    const target = currentScanTarget()
    if (target) {
      target(barcode)
      return
    }

    let libraries: Library[]
    try {
      libraries = (await callApi<Library[]>('/api/v1/libraries')) ?? []
    } catch {
      toast.show(t('scanner.lookup_failed', { code: shown, defaultValue: `Couldn't check your libraries for ${shown}` }), { variant: 'error' })
      return
    }
    if (!libraries.length) {
      toast.show(t('scanner.no_libraries', { defaultValue: "You don't have a library to add books to yet." }), { variant: 'error' })
      return
    }

    const here = currentLibrary()
    const mediaTypes = () => callApi<MediaType[]>('/api/v1/media-types').then(m => m ?? []).catch((): MediaType[] => [])

    // Books aren't found by UPC yet, so a UPC goes straight to Add Book, which
    // looks it up the same way it looks up an ISBN.
    if (barcode.kind !== 'isbn') {
      setAddFor({
        isbn: upcLookupCode(barcode),
        libraries,
        mediaTypes: await mediaTypes(),
        libraryId: libraries.some(l => l.id === here) ? here : undefined,
      })
      return
    }

    // Look in the library on screen first, then the rest, and open the first hit.
    const ordered = [...libraries].sort((a, b) => (a.id === here ? -1 : b.id === here ? 1 : 0))
    const found = await Promise.all(ordered.map(lib =>
      callApi<Book>(`/api/v1/libraries/${lib.id}/book-by-isbn/${encodeURIComponent(barcode.isbn13)}`)
        .then(book => (book ? { lib, book } : null))
        .catch(() => null),
    ))
    const hit = found.find(Boolean)
    if (hit) {
      navigate(`/libraries/${hit.lib.id}/books/${hit.book.id}`)
      return
    }

    setAddFor({
      isbn: barcode.isbn13,
      libraries,
      mediaTypes: await mediaTypes(),
      libraryId: libraries.some(l => l.id === here) ? here : undefined,
    })
  }, [callApi, currentLibrary, navigate, t, toast])

  useBarcodeScanner(raw => { void handleScan(raw) }, { enabled })

  if (!addFor) return null
  return (
    <AddBookModal
      // Remount on a new ISBN so the modal starts clean.
      key={addFor.isbn}
      libraryId={addFor.libraryId}
      libraries={addFor.libraryId ? undefined : addFor.libraries}
      mediaTypes={addFor.mediaTypes}
      initialIsbn={addFor.isbn}
      onClose={() => setAddFor(null)}
      onSaved={book => {
        setAddFor(null)
        announceCollectionChanged()
        toast.show(t('scanner.added', { title: book.title, defaultValue: `Added ${book.title}` }), {
          action: { label: t('scanner.view', { defaultValue: 'View' }), to: `/libraries/${book.library_id ?? addFor.libraryId ?? addFor.libraries[0].id}/books/${book.id}` },
        })
      }}
    />
  )
}
