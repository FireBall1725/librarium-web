// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Shelve: pick a shelf, scan along it, Next shelf. Each scan moves your copy
// onto the shelf and says what changed. It never adds a book: one this
// library doesn't have offers Add, which opens Add books set to the shelf.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../../auth/AuthContext'
import type { Book, Copy, CopyLocation, MediaType } from '../../types'
import { pathOf, shelfSpot } from '../../lib/places'
import { findBookHere, goToNextShelf, moveCopy, placeCopy } from '../../lib/inventory'
import { Icon } from '../../lib/icons'
import { useToast } from '../../components/Toast'
import ScanBox from '../../components/inventory/ScanBox'
import PlaceSelect from '../../components/inventory/PlaceSelect'
import Bookcase from '../../components/inventory/Bookcase'
import AddBooksDialog from '../../components/addBooks/AddBooksDialog'

interface Row {
  id: string
  code: string
  title: string
  authors: string
  status: 'looking' | 'moved' | 'here' | 'ask' | 'unknown' | 'added' | 'undone' | 'failed'
  /** The copy moved, and where it was, for Undo. */
  copyId?: string
  from?: string | null
  /** Every copy elsewhere, when the person has to say which one this is. */
  choices?: Copy[]
  /** Place in this shelf's run, counting from 1. */
  pos?: number
  error?: string
}

export default function ShelveTab({ libraryId, libraryName, places, placeId, onPlace, mediaTypes, onChanged }: {
  libraryId: string
  libraryName: string
  places: CopyLocation[]
  placeId: string | null
  onPlace: (id: string | null) => void
  mediaTypes: MediaType[]
  /** Copies moved or places were made: reload counts and places. */
  onChanged: () => Promise<void> | void
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [filed, setFiled] = useState(0)
  const [adding, setAdding] = useState<{ code: string; rowId: string } | null>(null)
  const posRef = useRef(0)
  // The scan callback lives in ScanBox, so it reads the shelf from here.
  const placeRef = useRef(placeId)
  useEffect(() => { placeRef.current = placeId })
  const prefix = t('shelves_settings.shelf_prefix', { defaultValue: 'Shelf ' })
  const spot = placeId ? shelfSpot(placeId, places) : null
  const nameOf = (id: string | null | undefined) => (id ? pathOf(id, places).join(' › ') : '')

  const patch = (id: string, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))

  const file = async (rowId: string, copy: Copy, from: string | null) => {
    const place = placeRef.current
    if (!place) return
    try {
      await moveCopy(callApi, copy.id, place)
      const pos = ++posRef.current
      patch(rowId, { status: 'moved', copyId: copy.id, from, pos, choices: undefined })
      setFiled(n => n + 1)
      void onChanged()
    } catch (err) {
      patch(rowId, { status: 'failed', error: err instanceof ApiError ? err.message : undefined })
    }
  }

  const scan = async (raw: string) => {
    const place = placeRef.current
    if (!place) {
      toast.show(t('inventory.pick_shelf_first', { defaultValue: 'Pick the shelf you’re filling first.' }), { variant: 'error' })
      return
    }
    const rowId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setRows(rs => [{ id: rowId, code: raw, title: raw, authors: '', status: 'looking' }, ...rs])
    try {
      const found = await findBookHere(callApi, raw, libraryId)
      if (found.kind === 'invalid') {
        setRows(rs => rs.filter(r => r.id !== rowId))
        toast.show(t('scanner.not_book', { code: found.code }), { variant: 'error' })
        return
      }
      if (found.kind === 'unknown') {
        patch(rowId, { status: 'unknown', code: found.code, title: found.code })
        return
      }
      const book: Book = found.book
      patch(rowId, { title: book.title, authors: (book.contributors ?? []).filter(c => c.role === 'author').map(c => c.name).join(', ') })
      const r = await callApi<{ items: Copy[] }>(`/api/v1/books/${book.id}/copies`)
      const placement = placeCopy(r?.items ?? [], libraryId, place)
      if (placement.kind === 'here') patch(rowId, { status: 'here' })
      else if (placement.kind === 'move') await file(rowId, placement.copy, placement.from)
      else if (placement.kind === 'ask') patch(rowId, { status: 'ask', choices: placement.copies })
      else patch(rowId, { status: 'unknown' })
    } catch (err) {
      patch(rowId, { status: 'failed', error: err instanceof ApiError ? err.message : undefined })
    }
  }

  const undo = async (row: Row) => {
    if (!row.copyId) return
    try {
      await moveCopy(callApi, row.copyId, row.from ?? null)
      patch(row.id, { status: 'undone' })
      setFiled(n => n - 1)
      void onChanged()
    } catch {
      toast.show(t('add_books.undo_failed', { defaultValue: "Couldn't undo that." }), { variant: 'error' })
    }
  }

  const next = async () => {
    try {
      const to = await goToNextShelf(callApi, libraryId, placeId, places, prefix)
      if (!to) return
      if (to.created) await onChanged()
      onPlace(to.id)
      posRef.current = 0
      setRows([])
      toast.show(t('add_books.now_on', { name: to.name, defaultValue: 'Now filing on {{name}}' }))
    } catch {
      toast.show(t('inventory.next_failed', { defaultValue: "Couldn't move on to the next shelf." }), { variant: 'error' })
    }
  }

  const hasNext = !!spot && spot.shelf != null && spot.shelf < (spot.bookcase.shelf_count ?? 0)

  return (
    <div className="grid overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0 space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="lb-eyebrow">{t('inventory.scanning_into', { defaultValue: 'Scanning into' })}</span>
          <PlaceSelect id="shelve-place" label={t('inventory.shelf', { defaultValue: 'Shelf' })} places={places} value={placeId}
            onChange={id => { onPlace(id); posRef.current = 0; setRows([]) }} />
          {hasNext && (
            <button type="button" className="lb-btn inline-flex items-center gap-1.5" onClick={() => void next()}>
              <Icon name="next" className="h-4 w-4" />{t('add_books.next_shelf', { defaultValue: 'Next shelf' })}
            </button>
          )}
        </div>

        <ScanBox placeholder={t('inventory.scan_next', { defaultValue: 'Scan the next book on the shelf' })} onCode={code => void scan(code)} disabled={!placeId} />

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center text-[13px] text-content-muted">
            {placeId
              ? t('inventory.shelve_empty', { defaultValue: 'Scan a book and it shows here, with what changed.' })
              : t('inventory.pick_shelf_first', { defaultValue: 'Pick the shelf you’re filling first.' })}
          </p>
        ) : (
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {rows.map(row => (
              <li key={row.id} className={`grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 ${row.status === 'undone' ? 'opacity-60' : ''}`}>
                <span className="text-right text-[12px] font-bold tabular-nums text-content-muted">{row.status === 'moved' ? row.pos : ''}</span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-content">{row.title}</p>
                  <p className="truncate text-[12px] text-content-muted">{row.status === 'failed' ? row.error ?? t('inventory.move_failed', { defaultValue: "Couldn't move it." }) : row.authors || row.code}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Status row={row} nameOf={nameOf} libraryName={libraryName} />
                  {row.status === 'moved' && (
                    <button type="button" className="text-[12.5px] font-semibold text-accent hover:underline" onClick={() => void undo(row)}>
                      {t('add_books.undo', { defaultValue: 'Undo' })}
                    </button>
                  )}
                  {row.status === 'unknown' && (
                    <button type="button" className="text-[12.5px] font-semibold text-accent hover:underline" onClick={() => setAdding({ code: row.code, rowId: row.id })}>
                      {t('inventory.add_it', { defaultValue: 'Add it' })}
                    </button>
                  )}
                  {row.status === 'ask' && row.choices?.map(c => (
                    <button key={c.id} type="button" className="lb-btn ghost sm" onClick={() => void file(row.id, c, c.location_id)}>
                      {t('inventory.the_one_in', { place: nameOf(c.location_id), defaultValue: 'The one in {{place}}' })}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <aside className="space-y-4 border-t border-line bg-surface-muted p-4 md:border-l md:border-t-0">
        {spot && <Bookcase bookcase={spot.bookcase} places={places} current={placeId} compact
          onPick={id => { if (id) { onPlace(id); posRef.current = 0; setRows([]) } }} />}
        <div>
          <p className="lb-display text-[44px] leading-none tabular-nums text-content">{filed}</p>
          <p className="text-[12.5px] text-content-muted">{t('inventory.filed_session', { count: filed, defaultValue: 'copies filed this session' })}</p>
        </div>
      </aside>

      {adding && (
        <AddBooksDialog libraryId={libraryId} placeId={placeId ?? undefined} mediaTypes={mediaTypes} initialIsbn={adding.code}
          onClose={() => setAdding(null)}
          onSaved={() => {
            patch(adding.rowId, { status: 'added', pos: ++posRef.current })
            setFiled(n => n + 1)
            setAdding(null)
            void onChanged()
          }} />
      )}
    </div>
  )
}

function Status({ row, nameOf, libraryName }: { row: Row; nameOf: (id: string | null | undefined) => string; libraryName: string }) {
  const { t } = useTranslation()
  const chip = (tone: string, text: string) => <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${tone}`}>{text}</span>
  switch (row.status) {
    case 'looking': return chip('bg-surface-inset text-content-muted', t('add_books.state_looking', { defaultValue: 'Looking up' }))
    case 'moved': return row.from
      ? chip('bg-accent-surface text-accent', t('inventory.moved_from', { place: nameOf(row.from), defaultValue: 'Moved from {{place}}' }))
      : chip('bg-success-surface text-success-strong', t('inventory.was_unshelved', { defaultValue: 'Was unshelved' }))
    case 'here': return chip('bg-surface-inset text-content-secondary', t('inventory.already_here', { defaultValue: 'Already here' }))
    case 'ask': return chip('bg-warning-surface text-warning-strong', t('inventory.which_copy', { defaultValue: 'Which copy is this?' }))
    case 'unknown': return chip('bg-warning-surface text-warning-strong', t('inventory.not_in', { library: libraryName, defaultValue: 'Not in {{library}}' }))
    case 'added': return chip('bg-success-surface text-success-strong', t('inventory.added_here', { defaultValue: 'Added here' }))
    case 'undone': return chip('bg-surface-inset text-content-muted', t('add_books.state_undone', { defaultValue: 'Undone' }))
    case 'failed': return chip('bg-danger-surface text-danger-strong', t('add_books.state_failed', { defaultValue: 'Failed' }))
  }
}
