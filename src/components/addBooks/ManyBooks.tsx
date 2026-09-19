// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Many books: every scan is a row, looked up in the background while the next
// book is picked up. A clean match is added straight away (or held, if you'd
// rather look first); anything unsure waits in Needs you without stopping the
// queue. The queue is kept in the browser, per library, so a bookcase can
// span more than one sitting.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import type { Book, CopyLocation, MediaType } from '../../types'
import { classifyBarcode, upcLookupCode } from '../../lib/barcode'
import { registerScanTarget, useScannerEnabled } from '../../lib/barcodeScanner'
import { mergedToResult, type Picks } from '../../lib/mergedLookup'
import { disagreements, judgeLookup, type Destination } from '../../lib/addBooks'
import { addLookedUpBook, lookUpCode, undoAdd } from '../../lib/addBooksFlow'
import {
  countBy, isRepeat, loadQueue, matchesFilter, patchRow, saveQueue,
  type QueueFilter, type QueueRow,
} from '../../lib/addBooksQueue'
import { pathOf } from '../../lib/places'
import { Icon } from '../../lib/icons'
import { useToast } from '../Toast'
import CameraView from './CameraView'
import FoundBook from './FoundBook'

// Lookups at once. A USB scanner can fire a book a second; the providers
// behind the merged lookup don't need twenty requests in flight.
const PARALLEL = 3

export default function ManyBooks({ destination, places, mediaTypes, onAdded, onManual, onSearch, onBusyChange }: {
  destination: Destination
  places: CopyLocation[]
  mediaTypes: MediaType[]
  onAdded: (book: Book) => void
  onManual: (barcode?: string) => void
  /** Look for a book by title instead, in One book. */
  onSearch: () => void
  /** Lookups or adds are running, so the library mustn't change under them. */
  onBusyChange: (busy: boolean) => void
}) {
  const { callApi } = useAuth()
  const { t } = useTranslation()
  const toast = useToast()
  const scannerOn = useScannerEnabled()
  const lib = destination.libraryId
  const [rows, setRows] = useState<QueueRow[]>(() => loadQueue(lib))
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [addingAll, setAddingAll] = useState(false)
  const [camera, setCamera] = useState(false)
  const [text, setText] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [picks, setPicks] = useState<Picks>({})
  const box = useRef<HTMLInputElement>(null)

  // The loop below reads the newest values, not the ones it started with.
  const rowsRef = useRef(rows)
  const destRef = useRef(destination)
  useEffect(() => { rowsRef.current = rows; destRef.current = destination })

  // Another library is another queue.
  const [queueFor, setQueueFor] = useState(lib)
  if (queueFor !== lib) {
    setQueueFor(lib)
    setRows(loadQueue(lib))
    setOpen(null)
  }
  useEffect(() => { saveQueue(queueFor, rows) }, [queueFor, rows])

  const update = useCallback((id: string, patch: Partial<QueueRow>) => setRows(rs => patchRow(rs, id, patch)), [])

  const add = useCallback(async (row: QueueRow, rowPicks: Picks = {}) => {
    if (!row.merged) return
    const d = destRef.current
    const result = mergedToResult(row.merged, rowPicks)
    // A book already here gets a second copy, which Undo mustn't take off a list.
    const wasNew = row.state !== 'have'
    update(row.id, { state: 'adding', result })
    try {
      const book = await addLookedUpBook(callApi, result, d, mediaTypes, row.identifier ?? null)
      update(row.id, { state: 'added', bookId: book.id, locationId: d.locationId, listId: d.listId, wasNew })
      onAdded(book)
    } catch (err) {
      update(row.id, { state: 'failed', error: err instanceof ApiError ? err.message : t('add_books.add_failed', { defaultValue: "Couldn't add the book." }) })
    }
  }, [callApi, mediaTypes, onAdded, t, update])

  const lookUp = useCallback(async (row: QueueRow) => {
    update(row.id, { state: 'looking', error: undefined })
    try {
      const found = await lookUpCode(callApi, row.code, destRef.current.libraryId)
      const verdict = judgeLookup(found.merged, { byUPC: found.byUPC, alreadyHere: !!found.duplicate })
      const base: Partial<QueueRow> = {
        merged: found.merged,
        identifier: found.identifier,
        result: found.merged ? mergedToResult(found.merged, {}) : undefined,
        picked: disagreements(found.merged),
      }
      if (verdict.kind === 'have') {
        update(row.id, { ...base, state: 'have', bookId: found.duplicate!.id, haveTitle: found.duplicate!.title })
      } else if (verdict.kind === 'needs_you') {
        update(row.id, { ...base, state: 'needs_you', why: verdict.why })
      } else {
        // Found books wait for Add, so nothing lands without you saying so.
        update(row.id, { ...base, state: 'ready' })
      }
    } catch (err) {
      update(row.id, { state: 'failed', error: err instanceof ApiError ? err.message : t('add_books.lookup_failed', { defaultValue: 'The lookup failed.' }) })
    }
  }, [callApi, t, update])

  // Lookups run a few at a time, oldest first, so a burst of scans queues up
  // rather than all hitting the providers at once.
  const running = useRef(new Set<string>())
  const waiting = useRef<QueueRow[]>([])
  const pumpRef = useRef<() => void>(() => {})
  const pump = useCallback(() => {
    while (running.current.size < PARALLEL && waiting.current.length > 0) {
      const next = waiting.current.shift()!
      running.current.add(next.id)
      void lookUp(next).finally(() => { running.current.delete(next.id); pumpRef.current() })
    }
  }, [lookUp])
  useEffect(() => { pumpRef.current = pump })

  const enqueue = useCallback((raw: string) => {
    const b = classifyBarcode(raw)
    if (b.kind === 'invalid') {
      toast.show(t('scanner.not_book', { code: b.code }), { variant: 'error' })
      return
    }
    const code = b.kind === 'isbn' ? b.isbn13 : upcLookupCode(b)
    const now = Date.now()
    if (isRepeat(rowsRef.current, code, now)) return
    const row: QueueRow = { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, code, scannedAt: now, state: 'looking' }
    rowsRef.current = [row, ...rowsRef.current]
    setRows(rs => [row, ...rs])
    waiting.current.push(row)
    pump()
  }, [pump, t, toast])

  const enqueueRef = useRef(enqueue)
  useEffect(() => { enqueueRef.current = enqueue })
  useEffect(() => registerScanTarget(b => {
    if (b.kind === 'invalid') return
    enqueueRef.current(b.kind === 'isbn' ? b.isbn13 : upcLookupCode(b))
  }), [])

  // Oldest first, one at a time, so a shelf's copies go on in scan order.
  const addAll = async () => {
    setAddingAll(true)
    try {
      for (const row of rowsRef.current.filter(r => r.state === 'ready').reverse()) await add(row)
    } finally {
      setAddingAll(false)
    }
  }

  const retry = (row: QueueRow) => { waiting.current.push(row); update(row.id, { state: 'looking' }); pump() }

  const undo = async (row: QueueRow) => {
    if (!row.bookId) return
    try {
      const ok = await undoAdd(callApi, { id: row.bookId }, { ...destRef.current, listId: row.listId ?? null }, { wasNew: row.wasNew ?? true })
      if (ok) update(row.id, { state: 'undone' })
    } catch {
      toast.show(t('add_books.undo_failed', { defaultValue: "Couldn't undo that." }), { variant: 'error' })
    }
  }

  const openRow = (row: QueueRow) => { setOpen(o => (o === row.id ? null : row.id)); setPicks({}) }
  const opened = rows.find(r => r.id === open) ?? null
  const counts = useMemo(() => countBy(rows), [rows])
  const busy = rows.some(r => r.state === 'looking' || r.state === 'adding')
  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  const shown = rows.filter(r => matchesFilter(r, filter))
  const last = rows[0]
  const placeName = (id?: string | null) => (id ? pathOf(id, places).at(-1) : undefined)
  const clearDone = () => { setRows(rs => rs.filter(r => r.state === 'needs_you' || r.state === 'ready' || r.state === 'looking' || r.state === 'adding')); setOpen(null) }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <aside className="space-y-4">
        {camera ? (
          <CameraView onCode={enqueue} onStop={() => setCamera(false)}
            onError={message => { setCamera(false); toast.show(message, { variant: 'error' }) }} />
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Icon name="barcode" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
              <input ref={box} id="add-books-many-box" type="text" autoFocus autoComplete="off" value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { enqueue(text); setText('') } }}
                placeholder={t('add_books.many_box', { defaultValue: 'Scan, or type an ISBN or UPC' })}
                aria-label={t('add_books.many_box', { defaultValue: 'Scan, or type an ISBN or UPC' })}
                className="lb-field w-full! py-2.5! pl-9! text-[15px]!" />
            </div>
            {scannerOn && (
              <p className="flex items-center gap-1.5 text-[12px] text-content-muted">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
                {t('add_books.scanner_ready', { defaultValue: 'Ready for a barcode scanner' })}
              </p>
            )}
            <button type="button" className="lb-btn ghost sm inline-flex items-center gap-1.5" onClick={() => setCamera(true)}>
              <Icon name="camera" className="h-3.5 w-3.5" />
              {t('add_books.camera_instead', { defaultValue: 'Use the camera instead' })}
            </button>
          </div>
        )}

        {last && (
          <div className="flex gap-3 rounded-xl border border-line bg-surface-muted p-2.5">
            <Thumb row={last} size="lg" />
            <div className="min-w-0 text-[12.5px]">
              <p className="lb-eyebrow">{t('add_books.last_scanned', { defaultValue: 'Last scanned' })}</p>
              <p className="mt-0.5 line-clamp-2 font-semibold text-content">{last.result?.title || last.haveTitle || last.code}</p>
              <StateChip row={last} />
            </div>
          </div>
        )}

        <p className="text-[12px] text-content-muted">
          {t('add_books.found_waits', { defaultValue: "Found books wait in Ready until you add them. Anything the lookup isn't sure of waits in Needs you." })}
        </p>
      </aside>

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t('add_books.queue', { defaultValue: 'Queue' })}>
          {(['all', 'ready', 'added', 'needs_you', 'have'] as const).map(f => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={`lb-chip inline-flex items-center gap-1.5 ${filter === f ? 'on' : ''} ${f === 'needs_you' && counts.needs_you > 0 ? 'warn' : ''}`}>
              {t(`add_books.filter_${f}`, { defaultValue: { all: 'All', ready: 'Ready', added: 'Added', needs_you: 'Needs you', have: 'Already have' }[f] })}
              <span className="lb-num text-[11px] opacity-80">{counts[f]}</span>
            </button>
          ))}
          <span className="ml-auto flex items-center gap-3">
            {rows.some(r => r.state === 'added' || r.state === 'have' || r.state === 'undone' || r.state === 'skipped') && (
              <button type="button" className="text-[12px] text-content-muted hover:text-content hover:underline" onClick={clearDone}>
                {t('add_books.clear_done', { defaultValue: 'Clear finished rows' })}
              </button>
            )}
            <button type="button" className="lb-btn inline-flex items-center gap-1.5 disabled:opacity-50"
              disabled={addingAll || counts.ready === 0} onClick={() => void addAll()}>
              <Icon name="check" className="h-4 w-4" />
              {addingAll
                ? t('add_books.adding', { defaultValue: 'Adding…' })
                : t('add_books.add_all', { count: counts.ready, defaultValue: 'Add {{count}} books' })}
            </button>
          </span>
        </div>

        {opened?.merged && (
          <div className="space-y-2.5 rounded-xl border border-accent-line bg-accent-surface/40 p-3">
            {opened.why === 'bare_upc' && (
              <p className="rounded-lg border border-warning-line bg-warning-surface px-3 py-2 text-[12.5px] text-warning-strong">{t('add_book.upc_warning')}</p>
            )}
            {(opened.merged.other_isbns?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-warning-line bg-warning-surface px-3 py-2 text-[12.5px] text-warning-strong">
                {t('add_book.other_isbns')}
                <ul className="mt-1 space-y-0.5">
                  {opened.merged.other_isbns!.map(o => (
                    <li key={o.isbn}>
                      <button type="button" className="underline hover:no-underline"
                        onClick={() => { update(opened.id, { state: 'skipped' }); setOpen(null); enqueue(o.isbn) }}>
                        {o.title || o.isbn}
                      </button>
                      <span className="ml-1.5 text-content-muted">{o.isbn}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <FoundBook merged={opened.merged} picks={picks} onPicks={setPicks} />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {opened.state === 'added' ? (
                // Changing an added book is the edit form's job: its save
                // replaces the whole record, which this panel can't fill in.
                <Link to={`/libraries/${lib}/books/${opened.bookId}`} target="_blank" rel="noreferrer" className="lb-btn ghost">
                  {t('add_books.change_on_book', { defaultValue: 'Change it on the book page' })}
                </Link>
              ) : (
                <button type="button" className="lb-btn inline-flex items-center gap-1.5"
                  onClick={() => { void add(opened, picks); setOpen(null) }}>
                  <Icon name="check" className="h-4 w-4" />
                  {t('add_books.add_this', { defaultValue: 'Add this one' })}
                </button>
              )}
              <button type="button" className="lb-btn ghost" onClick={() => setOpen(null)}>{t('common.close', { defaultValue: 'Close' })}</button>
            </div>
          </div>
        )}

        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
            <p className="font-semibold text-content">{rows.length === 0
              ? t('add_books.empty', { defaultValue: 'Nothing scanned yet' })
              : t('add_books.empty_filter', { defaultValue: 'Nothing here' })}</p>
            {rows.length === 0 && (
              <p className="mt-1 text-[13px] text-content-muted">{t('add_books.empty_note', { defaultValue: 'Scan a book and it lands here while you reach for the next one.' })}</p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {shown.map(row => (
              <li key={row.id} className={`flex items-center gap-3 px-3 py-2 ${row.state === 'undone' ? 'opacity-60' : ''}`}>
                <Thumb row={row} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-content">{row.result?.title || row.haveTitle || row.code}</p>
                  <p className="truncate text-[12px] text-content-muted">
                    {[row.result?.authors?.join(', '), row.state === 'added' ? placeName(row.locationId) : null].filter(Boolean).join(' · ') || row.code}
                  </p>
                  {(row.state === 'needs_you' || row.state === 'failed') && (
                    <p className="text-[12px] text-warning-strong">{row.state === 'failed' ? row.error : why(t, row)}</p>
                  )}
                </div>
                <StateChip row={row} />
                {row.state === 'added' && (row.picked ?? 0) > 0 && row.merged !== undefined && (
                  <button type="button" onClick={() => openRow(row)}
                    className="shrink-0 rounded-md border border-warning-line bg-warning-surface px-1.5 py-0.5 text-[11px] font-semibold text-warning-strong">
                    {t('add_books.picked_for_you', { count: row.picked })}
                  </button>
                )}
                <RowActions row={row} onUndo={() => void undo(row)} onRetry={() => retry(row)} onOpen={() => openRow(row)}
                  onAdd={() => void add(row)} onSkip={() => update(row.id, { state: 'skipped' })}
                  onManual={() => onManual(row.code)} onSearch={() => { update(row.id, { state: 'skipped' }); onSearch() }} libraryId={lib} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function why(t: (k: string, o?: Record<string, unknown>) => string, row: QueueRow): string {
  switch (row.why) {
    case 'bare_upc': return t('add_books.why_bare_upc', { defaultValue: "A paperback UPC is shared by every book at that price. Check it's this one." })
    case 'several': return t('add_books.why_several', { defaultValue: 'That barcode could be more than one book.' })
    default: return t('add_books.why_not_found', { defaultValue: 'No provider knew this barcode.' })
  }
}

function Thumb({ row, size }: { row: QueueRow; size: 'sm' | 'lg' }) {
  const cls = size === 'sm' ? 'h-11 w-8' : 'h-[72px] w-12'
  const url = row.result?.cover_url
  return url
    ? <img src={url} alt="" referrerPolicy="no-referrer" className={`${cls} shrink-0 rounded bg-surface-strong object-cover`} />
    : <div className={`${cls} shrink-0 rounded bg-surface-strong`} />
}

function StateChip({ row }: { row: QueueRow }) {
  const { t } = useTranslation()
  const map: Record<QueueRow['state'], [string, string]> = {
    looking: [t('add_books.state_looking', { defaultValue: 'Looking up' }), 'text-content-muted'],
    adding: [t('add_books.adding', { defaultValue: 'Adding…' }), 'text-content-muted'],
    added: [t('add_books.state_added', { defaultValue: 'Added' }), 'text-success-strong'],
    have: [t('add_books.state_have', { defaultValue: 'Already have it' }), 'text-content-secondary'],
    needs_you: [t('add_books.state_needs_you', { defaultValue: 'Needs you' }), 'text-warning-strong'],
    ready: [t('add_books.state_ready', { defaultValue: 'Ready to add' }), 'text-accent'],
    failed: [t('add_books.state_failed', { defaultValue: 'Failed' }), 'text-danger'],
    undone: [t('add_books.state_undone', { defaultValue: 'Undone' }), 'text-content-muted'],
    skipped: [t('add_books.state_skipped', { defaultValue: 'Skipped' }), 'text-content-muted'],
  }
  const [label, tone] = map[row.state]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold ${tone}`}>
      {(row.state === 'looking' || row.state === 'adding') && <Icon name="refresh" className="h-3 w-3 animate-spin" />}
      {row.state === 'added' && <Icon name="check" className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}

function RowActions({ row, libraryId, onUndo, onRetry, onOpen, onAdd, onSkip, onManual, onSearch }: {
  row: QueueRow
  libraryId: string
  onUndo: () => void
  onRetry: () => void
  onOpen: () => void
  onAdd: () => void
  onSkip: () => void
  onManual: () => void
  onSearch: () => void
}) {
  const { t } = useTranslation()
  const btn = 'shrink-0 text-[12px] font-semibold text-accent hover:underline'
  switch (row.state) {
    case 'added':
      return <button type="button" className={btn} onClick={onUndo}>{t('add_books.undo', { defaultValue: 'Undo' })}</button>
    case 'have':
      return (
        <span className="flex shrink-0 gap-3">
          <button type="button" className={btn} onClick={onAdd}>{t('add_books.add_copy', { defaultValue: 'Add a copy' })}</button>
          <Link className={btn} to={`/libraries/${libraryId}/books/${row.bookId}`} target="_blank" rel="noreferrer">{t('add_books.view_it', { defaultValue: 'View it' })}</Link>
          {/* The match can be wrong too, a shared paperback UPC most of all. */}
          <button type="button" className={btn} onClick={onRetry}>{t('add_book.ask_again')}</button>
        </span>
      )
    case 'ready':
      return (
        <span className="flex shrink-0 gap-3">
          <button type="button" className={btn} onClick={onOpen}>{t('add_books.review', { defaultValue: 'Review' })}</button>
          <button type="button" className={btn} onClick={onAdd}>{t('add_books.add', { defaultValue: 'Add' })}</button>
        </span>
      )
    case 'needs_you':
      return (
        <span className="flex shrink-0 gap-3">
          {row.merged
            ? <button type="button" className={btn} onClick={onOpen}>{t('add_books.pick', { defaultValue: 'Pick' })}</button>
            : <button type="button" className={btn} onClick={onManual}>{t('add_books.enter', { defaultValue: 'Enter it' })}</button>}
          <button type="button" className={btn} onClick={onSearch}>{t('add_books.search', { defaultValue: 'Search' })}</button>
          <button type="button" className={btn} onClick={onRetry}>{t('add_book.ask_again')}</button>
          <button type="button" className="shrink-0 text-[12px] text-content-muted hover:underline" onClick={onSkip}>{t('add_books.skip', { defaultValue: 'Skip' })}</button>
        </span>
      )
    case 'failed':
      return (
        <span className="flex shrink-0 gap-3">
          <button type="button" className={btn} onClick={onRetry}>{t('add_book.ask_again')}</button>
          <button type="button" className="shrink-0 text-[12px] text-content-muted hover:underline" onClick={onSkip}>{t('add_books.skip', { defaultValue: 'Skip' })}</button>
        </span>
      )
    default:
      return null
  }
}
