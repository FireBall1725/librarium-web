// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// One book: scan or type, check the card, add. Nothing is added until the
// button is pressed, and a new scan replaces the book on screen, so a
// mis-scan never adds anything.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import type { Book, ISBNLookupResult, MediaType } from '../../types'
import { classifyBarcode, upcLookupCode, type ScannedIdentifier } from '../../lib/barcode'
import { registerScanTarget, useScannerEnabled } from '../../lib/barcodeScanner'
import { mergedToResult, type Picks } from '../../lib/mergedLookup'
import { addLookedUpBook, learnFromPair, lookUpCode, type Lookup } from '../../lib/addBooksFlow'
import type { Destination } from '../../lib/addBooks'
import { Icon } from '../../lib/icons'
import { useToast } from '../Toast'
import CameraView from './CameraView'
import FoundBook from './FoundBook'

export default function OneBook({
  destination, addLabel, libraryName, mediaTypes, initialCode, initialTitle, onAdded, onEdit, onManual, onImport, onDuplicate, onHolding,
}: {
  destination: Destination
  /** "Add to Book Collection › Shelf 3". */
  addLabel: string
  libraryName: string
  mediaTypes: MediaType[]
  initialCode?: string
  initialTitle?: string
  onAdded: (book: Book, wasNew: boolean) => void
  onEdit: (result: ISBNLookupResult, identifier: ScannedIdentifier | null, wasNew: boolean) => void
  onManual: (barcode?: string) => void
  onImport: () => void
  /** A lookup found a book this library already has. */
  onDuplicate?: (book: Book) => void
  /** A found book is on screen and not added yet. */
  onHolding?: (holding: boolean) => void
}) {
  const { callApi } = useAuth()
  const { t } = useTranslation()
  const toast = useToast()
  const scannerOn = useScannerEnabled()
  const [text, setText] = useState(initialCode ?? initialTitle ?? '')
  const [camera, setCamera] = useState(false)
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [picks, setPicks] = useState<Picks>({})
  // Opened with a code or a title, it starts out asking.
  const [busy, setBusy] = useState<'looking' | 'searching' | 'adding' | null>(
    initialCode ? 'looking' : initialTitle ? 'searching' : null)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [results, setResults] = useState<ISBNLookupResult[] | null>(null)
  const box = useRef<HTMLInputElement>(null)
  // Only the newest lookup may land: a slow answer for the last scan must
  // not replace the card for this one.
  const seq = useRef(0)
  // A paperback UPC nobody could resolve, for learning from the ISBN scanned next.
  const unresolvedUpc = useRef<string | null>(null)
  const lastAsked = useRef('')

  const clear = () => { setLookup(null); setPicks({}); setError(null); setResults(null) }

  // Plain functions, not callbacks: they read the destination of this
  // render, and the scan target reaches them through a ref.
  async function lookUp(code: string) {
    const n = ++seq.current
    clear()
    setBusy('looking')
    await fetchLookup(code, n)
  }

  // The lookup itself, which sets state only once an answer is in; lookUp
  // clears the screen first.
  async function fetchLookup(code: string, n: number) {
    lastAsked.current = code
    const barcode = classifyBarcode(code)
    if (barcode.kind === 'isbn' && unresolvedUpc.current) {
      const upc = unresolvedUpc.current
      void learnFromPair(callApi, upc, barcode.isbn13).then(learned => {
        if (learned) toast.show(t('add_book.learned'))
      })
    }
    unresolvedUpc.current = null
    try {
      const found = await lookUpCode(callApi, code, destination.libraryId)
      if (n !== seq.current) return
      if (!found.merged) {
        setError({
          message: found.barcode.kind === 'isbn' ? t('merged.none') : t('merged.none_upc'),
          code: found.barcode.kind === 'invalid' ? undefined : code,
        })
        return
      }
      if ((found.barcode.kind === 'upc' || found.barcode.kind === 'ean') && found.barcode.addon && found.byUPC) {
        unresolvedUpc.current = found.code
      }
      setLookup(found)
      if (found.duplicate) onDuplicate?.(found.duplicate)
    } catch (err) {
      if (n !== seq.current) return
      setError({ message: err instanceof ApiError ? err.message : t('add_books.lookup_failed', { defaultValue: 'The lookup failed.' }), code })
    } finally {
      if (n === seq.current) setBusy(null)
    }
  }

  const search = async (q: string) => {
    const n = ++seq.current
    clear()
    setBusy('searching')
    await fetchSearch(q, n)
  }

  async function fetchSearch(q: string, n: number) {
    try {
      const found = await callApi<ISBNLookupResult[]>(`/api/v1/lookup/books?q=${encodeURIComponent(q)}`)
      if (n !== seq.current) return
      setResults(found ?? [])
    } catch (err) {
      if (n !== seq.current) return
      setError({ message: err instanceof ApiError ? err.message : t('add_books.lookup_failed', { defaultValue: 'The lookup failed.' }) })
    } finally {
      if (n === seq.current) setBusy(null)
    }
  }

  // The box takes a barcode, a typed ISBN or UPC, or a title.
  const submit = (raw: string) => {
    const q = raw.trim()
    if (!q) return
    box.current?.select()
    if (classifyBarcode(q).kind !== 'invalid') void lookUp(q)
    else void search(q)
  }

  // A hardware scan replaces whatever is on screen.
  const lookUpRef = useRef(lookUp)
  useEffect(() => { lookUpRef.current = lookUp })
  useEffect(() => registerScanTarget(b => {
    if (b.kind === 'invalid') return
    const code = b.kind === 'isbn' ? b.isbn13 : upcLookupCode(b)
    setText(code)
    void lookUpRef.current(code)
  }), [])

  // Opened with a code or a title: go straight to it.
  useEffect(() => {
    if (initialCode) void fetchLookup(initialCode, ++seq.current)
    else if (initialTitle) void fetchSearch(initialTitle, ++seq.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The library changed under a showing book: its duplicate check is stale.
  const shownFor = useRef(destination.libraryId)
  useEffect(() => {
    if (shownFor.current === destination.libraryId) return
    shownFor.current = destination.libraryId
    if (lookup) void lookUpRef.current(lastAsked.current)
  }, [destination.libraryId, lookup])

  const add = async () => {
    if (!lookup?.merged) return
    setBusy('adding')
    try {
      const book = await addLookedUpBook(callApi, mergedToResult(lookup.merged, picks), destination, mediaTypes, lookup.identifier)
      onAdded(book, !lookup.duplicate)
      clear()
      setText('')
      box.current?.focus()
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t('add_books.add_failed', { defaultValue: "Couldn't add the book." }), { variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const merged = lookup?.merged
  useEffect(() => {
    onHolding?.(!!merged)
    return () => onHolding?.(false)
  }, [merged, onHolding])
  const showWays = !lookup && !error && !results && !busy && !camera

  return (
    <div className="space-y-4">
      {camera ? (
        <CameraView
          onCode={code => { setText(code); void lookUp(code) }}
          onStop={() => { setCamera(false); setTimeout(() => box.current?.focus(), 0) }}
          onError={message => { setCamera(false); setError({ message }) }}
        />
      ) : (
        <div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Icon name="barcode" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
              <input ref={box} id="add-books-box" type="text" autoFocus autoComplete="off" value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(text) }}
                placeholder={t('add_books.box', { defaultValue: 'Scan, or type an ISBN, UPC or title' })}
                aria-label={t('add_books.box', { defaultValue: 'Scan, or type an ISBN, UPC or title' })}
                className="lb-field w-full! py-2.5! pl-9! text-[15px]!" />
            </div>
            <button type="button" className="lb-btn ghost px-3!" onClick={() => setCamera(true)}
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
      )}

      {showWays && (
        <div className="grid gap-2.5 sm:grid-cols-3">
          <WayIn icon="camera" title={t('add_books.use_camera', { defaultValue: 'Use the camera' })}
            note={t('add_books.use_camera_note', { defaultValue: 'Reads the paperback add-on too' })} onClick={() => setCamera(true)} />
          <WayIn icon="pencil" title={t('add_books.enter_yourself', { defaultValue: 'Enter it yourself' })}
            note={t('add_books.enter_yourself_note', { defaultValue: 'The full form, nothing looked up' })} onClick={() => onManual()} />
          <WayIn icon="import" title={t('add_books.import_csv', { defaultValue: 'Import a CSV' })}
            note={t('add_books.import_csv_note', { defaultValue: 'From Goodreads, Libib and others' })} onClick={onImport} />
        </div>
      )}

      {(busy === 'looking' || busy === 'searching') && (
        <div className="lb-card flex items-center gap-3 p-4 text-[13px] text-content-muted" role="status">
          <Icon name="refresh" className="h-4 w-4 animate-spin" />
          {t('add_books.asking', { defaultValue: 'Asking the providers…' })}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-danger-line bg-danger-surface px-4 py-3 text-[13px] text-danger-strong">
          <p>{error.message}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {error.code && (
              <button type="button" className="inline-flex items-center gap-1 font-semibold hover:underline" onClick={() => void lookUp(error.code!)}>
                <Icon name="refresh" className="h-3.5 w-3.5" />
                {t('add_book.ask_again')}
              </button>
            )}
            <button type="button" className="inline-flex items-center gap-1 font-semibold hover:underline" onClick={() => onManual(error.code)}>
              <Icon name="pencil" className="h-3.5 w-3.5" />
              {t('add_books.enter_yourself', { defaultValue: 'Enter it yourself' })}
            </button>
          </div>
        </div>
      )}

      {results && (
        results.length === 0
          ? <p className="text-[13px] text-content-muted">{t('add_books.no_results', { defaultValue: 'Nothing found for that title.' })}</p>
          : (
            <ul className="space-y-1.5">
              {results.map((r, i) => (
                <li key={i}>
                  {/* With an ISBN, the result is looked up in full like a scan;
                      without one, it goes to the form as it is. */}
                  <button type="button"
                    onClick={() => (r.isbn_13 || r.isbn_10) ? void lookUp(r.isbn_13 || r.isbn_10) : onEdit(r, null, true)}
                    className="flex w-full gap-3 rounded-xl border border-line bg-surface p-2.5 text-left hover:border-accent-line hover:bg-accent-surface">
                    {r.cover_url
                      ? <img src={r.cover_url} alt="" referrerPolicy="no-referrer" className="h-14 w-10 shrink-0 rounded bg-surface-strong object-cover" />
                      : <div className="h-14 w-10 shrink-0 rounded bg-surface-strong" />}
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold text-content">{r.title}</span>
                      <span className="block truncate text-[12px] text-content-secondary">{r.authors?.join(', ')}</span>
                      <span className="block text-[11.5px] text-content-muted">{[r.publish_date?.slice(0, 4), r.provider_display].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
      )}

      {lookup && merged && (
        <div className="space-y-3">
          {lookup.duplicate && (
            <div className="flex flex-wrap items-baseline gap-x-3 rounded-xl border border-warning-line bg-warning-surface px-4 py-2.5 text-[13px] text-warning-strong">
              <span>{t('add_books.already_here', { library: libraryName, defaultValue: 'Already in {{library}}. Adding it makes a second copy.' })}</span>
              <Link to={`/libraries/${destination.libraryId}/books/${lookup.duplicate.id}`} className="font-semibold underline hover:no-underline">
                {t('add_books.view_it', { defaultValue: 'View it' })}
              </Link>
            </div>
          )}
          {lookup.byUPC && (
            <p className="rounded-xl border border-warning-line bg-warning-surface px-4 py-2.5 text-[13px] text-warning-strong">{t('add_book.upc_warning')}</p>
          )}
          {merged.from_isbn && (
            <p className="text-[12.5px] text-content-muted">{t('add_book.from_isbn', { isbn: merged.from_isbn })}</p>
          )}
          {(merged.other_isbns?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-warning-line bg-warning-surface px-4 py-2.5 text-[13px] text-warning-strong">
              {t('add_book.other_isbns')}
              <ul className="mt-1 space-y-0.5">
                {merged.other_isbns!.map(o => (
                  <li key={o.isbn}>
                    <button type="button" className="underline hover:no-underline" onClick={() => { setText(o.isbn); void lookUp(o.isbn) }}>
                      {o.title || o.isbn}
                    </button>
                    <span className="ml-1.5 text-content-muted">{o.isbn}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <FoundBook merged={merged} picks={picks} onPicks={setPicks}
            onAskAgain={() => void lookUp(lastAsked.current)} asking={busy === 'looking'} />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="lb-btn ghost inline-flex items-center gap-1.5" disabled={busy === 'adding'}
              onClick={() => onEdit(mergedToResult(merged, picks), lookup.identifier, !lookup.duplicate)}>
              <Icon name="pencil" className="h-4 w-4" />
              {t('add_books.edit_first', { defaultValue: 'Edit details first' })}
            </button>
            <button type="button" className="lb-btn inline-flex items-center gap-1.5 disabled:opacity-50" disabled={busy === 'adding'} onClick={() => void add()}>
              <Icon name="check" className="h-4 w-4" />
              {busy === 'adding' ? t('add_books.adding', { defaultValue: 'Adding…' }) : addLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function WayIn({ icon, title, note, onClick }: { icon: 'camera' | 'pencil' | 'import'; title: string; note: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-accent-line hover:bg-accent-surface">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-surface text-accent">
        <Icon name={icon} className="h-4.5 w-4.5" />
      </span>
      <span>
        <span className="block text-[13.5px] font-semibold text-content">{title}</span>
        <span className="block text-[12px] text-content-muted">{note}</span>
      </span>
    </button>
  )
}
