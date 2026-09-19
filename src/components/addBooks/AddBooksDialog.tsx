// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Add books: one dialog for adding a single book and for scanning a stack,
// with one destination bar over both. Replaces AddBookModal at its call sites
// and takes the same props; the full form still lives in AddBookModal, which
// this hosts for Enter it yourself and Edit details first.
// See plans/add-book-rework.md.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import type { Book, CopyLocation, ISBNLookupResult, Library, MediaType } from '../../types'
import { fetchLists, type SavedList } from '../../lib/lists'
import { registerScanTarget } from '../../lib/barcodeScanner'
import type { ScannedIdentifier } from '../../lib/barcode'
import { pathOf } from '../../lib/places'
import {
  PREFS_KEY, destinationForLibrary, destinationFromPrefs, nextShelf, prefsWithDestination,
  type AddBooksPrefs, type Destination,
} from '../../lib/addBooks'
import { undoAdd } from '../../lib/addBooksFlow'
import { pendingRows, saveQueue } from '../../lib/addBooksQueue'
import { ConfirmDialog } from '../Dialog'
import { Icon } from '../../lib/icons'
import { useToast } from '../Toast'
import AddBookModal from '../AddBookModal'
import DestinationBar from './DestinationBar'
import OneBook from './OneBook'
import ManyBooks from './ManyBooks'

type Mode = 'one' | 'many'

interface Manual {
  result?: ISBNLookupResult
  identifier?: ScannedIdentifier | null
  barcode?: string
}

export default function AddBooksDialog({
  libraryId, libraries: librariesProp, mediaTypes, onClose, onSaved, onDuplicate, initialIsbn, initialTitle,
}: {
  /** The library it was opened from, which it opens on. */
  libraryId?: string
  libraries?: Library[]
  mediaTypes: MediaType[]
  onClose: () => void
  /** Called on close when anything was added, with the last book added. */
  onSaved: (book: Book) => void
  onDuplicate?: (book: Book) => void
  initialIsbn?: string
  initialTitle?: string
}) {
  const { callApi } = useAuth()
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const titleId = useId()

  // Always opens on One book; Many books is a switch away.
  const [mode, setMode] = useState<Mode>('one')
  const [manual, setManual] = useState<Manual | null>(null)
  const [libraries, setLibraries] = useState<Library[]>(librariesProp ?? [])
  const [prefs, setPrefs] = useState<AddBooksPrefs | undefined>(undefined)
  const [destination, setDestination] = useState<Destination>(() =>
    destinationForLibrary(undefined, libraryId ?? librariesProp?.[0]?.id ?? ''))
  const [places, setPlaces] = useState<CopyLocation[]>([])
  const [lists, setLists] = useState<SavedList[]>([])
  const [manyBusy, setManyBusy] = useState(false)
  const lastSaved = useRef<Book | null>(null)

  // Libraries, when the caller only knew one; then the remembered destination.
  useEffect(() => {
    let live = true
    const libs = librariesProp?.length
      ? Promise.resolve(librariesProp)
      : callApi<Library[]>('/api/v1/libraries').then(l => l ?? []).catch((): Library[] => [])
    const saved = callApi<{ prefs: Record<string, unknown> }>('/api/v1/auth/me/preferences')
      .then(r => r?.prefs?.[PREFS_KEY] as AddBooksPrefs | undefined)
      .catch(() => undefined)
    void Promise.all([libs, saved]).then(([ls, p]) => {
      if (!live) return
      setLibraries(ls)
      setPrefs(p)
      if (ls.length) setDestination(destinationFromPrefs(p, ls.map(l => l.id), libraryId))
    })
    void fetchLists(callApi).then(all => { if (live) setLists(all.filter(l => l.kind === 'manual')) }).catch(() => {})
    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadPlaces = useCallback(async (lib: string) => {
    const r = await callApi<{ items: CopyLocation[] }>(`/api/v1/libraries/${lib}/locations`).catch(() => null)
    return r?.items ?? []
  }, [callApi])

  useEffect(() => {
    if (!destination.libraryId) return
    let live = true
    void loadPlaces(destination.libraryId).then(ps => { if (live) setPlaces(ps) })
    return () => { live = false }
  }, [destination.libraryId, loadPlaces])

  // A remembered place or list that's since been deleted is dropped.
  const placeGone = places.length > 0 && destination.locationId !== null && !places.some(p => p.id === destination.locationId)
  const listGone = lists.length > 0 && destination.listId !== null && !lists.some(l => l.id === destination.listId)
  const shown: Destination = useMemo(() => ({
    ...destination,
    locationId: placeGone ? null : destination.locationId,
    listId: listGone ? null : destination.listId,
  }), [destination, placeGone, listGone])

  const change = (d: Destination) => {
    // Another library opens on what was last picked there.
    const next = d.libraryId !== destination.libraryId ? destinationForLibrary(prefs, d.libraryId) : d
    if (next.libraryId !== destination.libraryId) setPlaces([])
    setDestination(next)
    const saved = prefsWithDestination(prefs, next)
    setPrefs(saved)
    void callApi('/api/v1/auth/me/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [PREFS_KEY]: saved }),
    }).catch(() => {})
  }

  const goNextShelf = async () => {
    const next = nextShelf(shown.locationId, places, t('shelves_settings.shelf_prefix', { defaultValue: 'Shelf ' }))
    if (!next) return
    let id = next.place?.id
    if (!id) {
      // The bookcase says it has this shelf, but no place was made for it yet.
      try {
        const created = await callApi<CopyLocation>(`/api/v1/libraries/${shown.libraryId}/locations`, {
          method: 'POST',
          body: JSON.stringify({ name: next.name, parent_id: next.bookcase.id }),
        })
        id = created?.id
        setPlaces(await loadPlaces(shown.libraryId))
      } catch {
        toast.show(t('add_books.next_shelf_failed', { name: next.name, defaultValue: "Couldn't make {{name}}." }), { variant: 'error' })
        return
      }
    }
    if (id) {
      change({ ...shown, locationId: id })
      toast.show(t('add_books.now_on', { name: next.name, defaultValue: 'Now filing on {{name}}' }))
    }
  }

  const library = libraries.find(l => l.id === shown.libraryId)
  const where = [library?.name, shown.locationId ? pathOf(shown.locationId, places).at(-1) : null].filter(Boolean).join(' › ')
  const addLabel = t('add_books.add_to', { where, defaultValue: 'Add to {{where}}' })

  const added = (book: Book, wasNew: boolean) => {
    lastSaved.current = book
    const at = shown
    toast.show(t('add_books.added', { title: book.title, defaultValue: 'Added {{title}}' }), {
      action: {
        label: t('add_books.undo', { defaultValue: 'Undo' }),
        onClick: () => {
          void undoAdd(callApi, book, at, { wasNew })
            .then(ok => toast.show(ok
              ? t('add_books.undone', { title: book.title, defaultValue: 'Took {{title}} back out' })
              : t('add_books.undo_failed', { defaultValue: "Couldn't undo that." }), ok ? undefined : { variant: 'error' }))
            .catch(() => toast.show(t('add_books.undo_failed', { defaultValue: "Couldn't undo that." }), { variant: 'error' }))
        },
      },
    })
  }

  // Read at close time, after the queue's last save for this library.
  const libraryRef = useRef(destination.libraryId)
  useEffect(() => { libraryRef.current = destination.libraryId })
  const close = useCallback(() => {
    // Closing means done; anything unfinished was confirmed away first.
    saveQueue(libraryRef.current, [])
    if (lastSaved.current) onSaved(lastSaved.current)
    else onClose()
  }, [onClose, onSaved])

  // Something not yet added asks before the dialog closes on it: a book on
  // One book's card, the form, or queue rows still looking up or waiting.
  const [confirming, setConfirming] = useState<{ waiting: number } | null>(null)
  const confirmingRef = useRef(false)
  useEffect(() => { confirmingRef.current = !!confirming })
  const manualRef = useRef(false)
  useEffect(() => { manualRef.current = !!manual })
  // A ref, not state: it only matters at the moment of closing.
  const holdingRef = useRef(false)
  const setHolding = useCallback((h: boolean) => { holdingRef.current = h }, [])
  const requestClose = useCallback(() => {
    if (confirmingRef.current) return
    const waiting = pendingRows(libraryRef.current)
    if (waiting > 0 || holdingRef.current || manualRef.current) setConfirming({ waiting })
    else close()
  }, [close])
  const closeAnyway = () => {
    setConfirming(null)
    close()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [requestClose])

  // While the form is open a scan would throw away what's typed, so it waits.
  useEffect(() => manual ? registerScanTarget(() => {
    toast.show(t('add_books.finish_first', { defaultValue: 'Add or cancel this book before scanning the next.' }), { variant: 'error' })
  }) : undefined, [manual, t, toast])

  const switchMode = (m: Mode) => { setMode(m); setManual(null) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) requestClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl ${mode === 'many' && !manual ? 'max-w-5xl' : 'max-w-3xl'}`}>
        <header className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="lb-display text-[22px] text-content">
            {manual ? t('add_books.manual_title', { defaultValue: 'Add a book by hand' }) : t('add_books.title', { defaultValue: 'Add books' })}
          </h2>
          {!manual && (
            <div className="flex rounded-lg bg-surface-inset p-0.5" role="tablist" aria-label={t('add_books.mode', { defaultValue: 'How many' })}>
              {(['one', 'many'] as const).map(m => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
                  // Leaving Many books mid-lookup would drop the answers on the floor.
                  disabled={mode === 'many' && m === 'one' && manyBusy}
                  title={mode === 'many' && m === 'one' && manyBusy ? t('add_books.library_locked', { defaultValue: 'Wait for the books being looked up to finish.' }) : undefined}
                  className={`rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${mode === m ? 'bg-surface text-content shadow-sm' : 'text-content-muted hover:text-content'}`}>
                  {m === 'one' ? t('add_books.one', { defaultValue: 'One book' }) : t('add_books.many', { defaultValue: 'Many books' })}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={requestClose} aria-label={t('common.close', { defaultValue: 'Close' })}
            className="ml-auto rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-inset hover:text-content">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>

        {shown.libraryId && (
          <DestinationBar destination={shown} onChange={change} libraries={libraries} places={places} lists={lists}
            onNextShelf={() => void goNextShelf()}
            locked={manyBusy && mode === 'many' ? t('add_books.library_locked', { defaultValue: 'Wait for the books being looked up to finish.' }) : undefined} />
        )}

        {manual && (
          <AddBookModal
            key={`${shown.libraryId}:${manual.result?.isbn_13 ?? manual.barcode ?? ''}`}
            mediaTypes={mediaTypes}
            onClose={() => setManual(null)}
            onSaved={book => { added(book, true); setManual(null) }}
            embed={{
              destination: shown,
              result: manual.result,
              identifier: manual.identifier,
              barcode: manual.barcode,
              onLookUp: () => setManual(null),
              addLabel,
            }}
          />
        )}
        {/* Kept mounted under the form, so a queue's lookups carry on. */}
        <div className="flex-1 overflow-y-auto px-5 py-5" hidden={!!manual}>
            {!shown.libraryId ? (
              <p className="text-[13px] text-content-muted">{t('add_books.loading', { defaultValue: 'Loading…' })}</p>
            ) : mode === 'one' ? (
              <OneBook
                destination={shown} addLabel={addLabel} libraryName={library?.name ?? ''} mediaTypes={mediaTypes}
                initialCode={initialIsbn} initialTitle={initialTitle}
                onAdded={added} onDuplicate={onDuplicate} onHolding={setHolding}
                onEdit={(result, identifier) => setManual({ result, identifier })}
                onManual={barcode => setManual({ barcode })}
                onImport={() => { close(); navigate('/import') }}
              />
            ) : (
              <ManyBooks
                destination={shown} places={places} mediaTypes={mediaTypes}
                onAdded={book => { lastSaved.current = book }}
                onManual={barcode => setManual({ barcode })}
                onSearch={() => switchMode('one')}
                onBusyChange={setManyBusy}
              />
            )}
        </div>
      </div>
      <ConfirmDialog
        open={!!confirming}
        title={confirming?.waiting
          ? t('add_books.close_waiting_title', { count: confirming.waiting, defaultValue: 'Close with {{count}} books still waiting?' })
          : t('add_books.close_book_title', { defaultValue: 'Close without adding this book?' })}
        description={confirming?.waiting
          ? t('add_books.close_waiting_body', { defaultValue: "They haven't been added. Closing drops them from the queue." })
          : t('add_books.close_book_body', { defaultValue: "It hasn't been added yet." })}
        confirmLabel={t('add_books.close_anyway', { defaultValue: 'Close anyway' })}
        destructive
        onCancel={() => setConfirming(null)}
        onConfirm={closeAnyway}
      />
    </div>
  )
}
