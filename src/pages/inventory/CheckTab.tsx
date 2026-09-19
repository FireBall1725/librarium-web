// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Check a shelf: the shelf's copies as spines, each lit when it's scanned.
// Finish lists only what doesn't match, each with its own fix. Nothing
// changes until one of those is pressed.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../../auth/AuthContext'
import type { Copy, CopyLocation, MediaType } from '../../types'
import { pathOf } from '../../lib/places'
import {
  checkResult, fetchInventory, findBookHere, matchOnShelf, moveCopy,
  type CheckExtra, type InventoryCopy,
} from '../../lib/inventory'
import { Icon } from '../../lib/icons'
import { useToast } from '../../components/Toast'
import ScanBox from '../../components/inventory/ScanBox'
import PlaceSelect from '../../components/inventory/PlaceSelect'
import AddBooksDialog from '../../components/addBooks/AddBooksDialog'

type Fix = 'unshelved' | 'left' | 'moved' | 'added'

export default function CheckTab({ libraryId, libraryName, places, placeId, onPlace, mediaTypes, onChanged }: {
  libraryId: string
  libraryName: string
  places: CopyLocation[]
  placeId: string | null
  onPlace: (id: string | null) => void
  mediaTypes: MediaType[]
  onChanged: () => Promise<void> | void
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const toast = useToast()
  const [shelf, setShelf] = useState<InventoryCopy[] | null>(null)
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [extras, setExtras] = useState<CheckExtra[]>([])
  const [finished, setFinished] = useState(false)
  const [fixed, setFixed] = useState<Record<string, Fix>>({})
  const [adding, setAdding] = useState<string | null>(null)
  const nameOf = (id: string | null | undefined) => (id ? pathOf(id, places).join(' › ') : '')

  // A new shelf starts a new check.
  const [checking, setChecking] = useState<string | null>(null)
  if (checking !== placeId) {
    setChecking(placeId)
    setShelf(null); setSeen(new Set()); setExtras([]); setFinished(false); setFixed({})
  }
  useEffect(() => {
    if (!placeId) return
    let live = true
    void fetchInventory(callApi, libraryId, placeId)
      .then(r => { if (live) setShelf(r.items) })
      .catch(() => { if (live) setShelf([]) })
    return () => { live = false }
  }, [callApi, libraryId, placeId])

  const scan = async (raw: string) => {
    if (!placeId || !shelf) return
    try {
      const found = await findBookHere(callApi, raw, libraryId)
      if (found.kind === 'invalid') {
        toast.show(t('scanner.not_book', { code: found.code }), { variant: 'error' })
        return
      }
      if (found.kind === 'unknown') {
        setExtras(xs => [...xs, { code: found.code, title: found.code, copy: null, from: null }])
        return
      }
      const mine = matchOnShelf(shelf, seen, found.book.id)
      if (mine) {
        setSeen(s => new Set(s).add(mine.id))
        return
      }
      if (shelf.some(c => c.book_id === found.book.id)) {
        toast.show(t('inventory.scanned_already', { title: found.book.title, defaultValue: 'Already scanned {{title}}' }))
        return
      }
      const r = await callApi<{ items: Copy[] }>(`/api/v1/books/${found.book.id}/copies`)
      const copies = (r?.items ?? []).filter(c => c.library_id === libraryId)
      const copy = copies.find(c => !c.location_id) ?? copies[0] ?? null
      setExtras(xs => [...xs, { code: raw, title: found.book.title, copy, from: copy?.location_id ?? null }])
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t('add_books.lookup_failed', { defaultValue: 'The lookup failed.' }), { variant: 'error' })
    }
  }

  const fix = async (key: string, copyId: string, to: string | null, as: Fix) => {
    try {
      await moveCopy(callApi, copyId, to)
      setFixed(f => ({ ...f, [key]: as }))
      void onChanged()
    } catch {
      toast.show(t('inventory.move_failed', { defaultValue: "Couldn't move it." }), { variant: 'error' })
    }
  }

  const result = shelf ? checkResult(shelf, seen, extras) : null
  const done = (key: string) => fixed[key]
  const doneLabel = (f: Fix) => ({
    unshelved: t('inventory.fixed_unshelved', { defaultValue: 'Unshelved' }),
    left: t('inventory.fixed_left', { defaultValue: 'Left as it is' }),
    moved: t('inventory.fixed_moved', { defaultValue: 'Moved here' }),
    added: t('inventory.added_here', { defaultValue: 'Added here' }),
  })[f]
  const nothingOff = result && result.missing.length + result.elsewhere.length + result.notHere.length === 0

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-muted px-4 py-3">
        <PlaceSelect id="check-place" label={t('inventory.shelf', { defaultValue: 'Shelf' })} places={places} value={placeId} onChange={onPlace} />
        {shelf && (
          <>
            <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-line" role="progressbar"
              aria-valuemin={0} aria-valuemax={shelf.length} aria-valuenow={seen.size}>
              <div className="h-full rounded-full bg-success transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${shelf.length ? Math.round((seen.size / shelf.length) * 100) : 0}%` }} />
            </div>
            <span className="text-[12.5px] tabular-nums text-content-muted">
              {t('inventory.scanned_of', { seen: seen.size, total: shelf.length, defaultValue: '{{seen}} of {{total}} scanned' })}
            </span>
            {finished
              ? <button type="button" className="lb-btn ghost sm" onClick={() => { setSeen(new Set()); setExtras([]); setFinished(false); setFixed({}) }}>{t('inventory.start_over', { defaultValue: 'Start over' })}</button>
              : <button type="button" className="lb-btn sm" onClick={() => setFinished(true)}>{t('inventory.finish', { defaultValue: 'Finish' })}</button>}
          </>
        )}
      </div>

      {!placeId ? (
        <p className="px-6 py-12 text-center text-[13px] text-content-muted">{t('inventory.pick_check', { defaultValue: 'Pick the shelf to check.' })}</p>
      ) : shelf === null ? (
        <p className="px-6 py-12 text-center text-[13px] text-content-muted">{t('common.loading', { defaultValue: 'Loading…' })}</p>
      ) : (
        <div className="space-y-4 p-4">
          {!finished && <ScanBox placeholder={t('inventory.scan_check', { defaultValue: 'Scan each book on the shelf' })} onCode={code => void scan(code)} />}

          {/* The shelf as spines: dashed until scanned, green once seen, blue for a
              book that isn't recorded here, amber for one not in this library. */}
          <div className="flex min-h-40 items-end gap-1 overflow-x-auto border-b-8 border-line-strong px-1 pt-2">
            {shelf.length === 0 && extras.length === 0 && (
              <p className="w-full pb-6 text-center text-[13px] text-content-muted">{t('inventory.empty_place', { defaultValue: 'Nothing is filed here yet.' })}</p>
            )}
            {shelf.map(c => (
              <Spine key={c.id} title={c.book_title} tone={seen.has(c.id) ? 'seen' : c.on_loan_to && finished ? 'loan' : 'todo'} />
            ))}
            {extras.map((x, i) => <Spine key={`x${i}`} title={x.title} tone={x.copy ? 'extra' : 'stranger'} />)}
          </div>

          {finished && result && (
            <div className="space-y-2">
              <h3 className="lb-eyebrow">{t('inventory.whats_off', { defaultValue: 'What’s off' })}</h3>
              {nothingOff && (
                <p className="flex items-center gap-2 rounded-xl bg-success-surface px-4 py-3 text-[13.5px] font-semibold text-success-strong">
                  <Icon name="check" className="h-4 w-4" />{t('inventory.all_here', { defaultValue: 'This shelf matches.' })}
                </p>
              )}
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {result.missing.map(c => (
                  <Result key={c.id} chip={t('inventory.not_scanned', { defaultValue: 'Not scanned' })} tone="bad" title={c.book_title}
                    note={t('inventory.recorded_here', { defaultValue: 'Recorded on this shelf' })} done={done(c.id) && doneLabel(done(c.id)!)}>
                    <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void fix(c.id, c.id, null, 'unshelved')}>{t('inventory.unshelve', { defaultValue: 'Unshelve' })}</button>
                    <button type="button" className="text-content-muted hover:underline" onClick={() => setFixed(f => ({ ...f, [c.id]: 'left' }))}>{t('inventory.leave_it', { defaultValue: 'Leave it' })}</button>
                  </Result>
                ))}
                {result.onLoan.map(c => (
                  <Result key={c.id} chip={t('inventory.on_loan', { defaultValue: 'On loan' })} tone="muted" title={c.book_title}
                    note={t('inventory.lent_to', { name: c.on_loan_to, defaultValue: 'Lent to {{name}}' })} />
                ))}
                {result.elsewhere.map((x, i) => (
                  <Result key={`e${i}`} chip={t('inventory.elsewhere', { defaultValue: 'Recorded elsewhere' })} tone="accent" title={x.title}
                    note={x.from
                      ? t('inventory.recorded_on', { place: nameOf(x.from), defaultValue: 'Recorded on {{place}}' })
                      : t('inventory.recorded_nowhere', { defaultValue: 'Not filed anywhere yet' })} done={done(`e${i}`) && doneLabel(done(`e${i}`)!)}>
                    <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void fix(`e${i}`, x.copy!.id, placeId, 'moved')}>{t('inventory.move_here', { defaultValue: 'Move here' })}</button>
                  </Result>
                ))}
                {result.notHere.map((x, i) => (
                  <Result key={`n${i}`} chip={t('inventory.not_in', { library: libraryName, defaultValue: 'Not in {{library}}' })} tone="warn" title={x.title}
                    note={x.code} done={done(`n${i}`) && doneLabel(done(`n${i}`)!)}>
                    <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setAdding(`n${i}:${x.code}`)}>{t('inventory.add_here', { defaultValue: 'Add it here' })}</button>
                  </Result>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {adding && (
        <AddBooksDialog libraryId={libraryId} placeId={placeId ?? undefined} mediaTypes={mediaTypes}
          initialIsbn={adding.slice(adding.indexOf(':') + 1)}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setFixed(f => ({ ...f, [adding.slice(0, adding.indexOf(':'))]: 'added' }))
            setAdding(null)
            void onChanged()
          }} />
      )}
    </div>
  )
}

function Spine({ title, tone }: { title: string; tone: 'todo' | 'seen' | 'extra' | 'stranger' | 'loan' }) {
  const toneCls = {
    todo: 'border border-dashed border-line-strong bg-surface-inset text-content-secondary',
    seen: 'bg-success text-white',
    extra: 'bg-accent text-white',
    stranger: 'bg-warning text-white',
    loan: 'border border-dashed border-line-strong bg-surface-muted text-content-muted',
  }[tone]
  // Height from the title, so a row of spines doesn't read as one block.
  const h = 112 + ((title.length * 7) % 48)
  return (
    <div title={title} style={{ height: h }}
      className={`flex w-9 shrink-0 rotate-180 items-end justify-center overflow-hidden whitespace-nowrap rounded-t-[3px] py-1.5 text-[12px] font-semibold [writing-mode:vertical-rl] transition-colors motion-reduce:transition-none ${toneCls}`}>
      <span className="truncate">{title}</span>
    </div>
  )
}

function Result({ chip, tone, title, note, done, children }: {
  chip: string
  tone: 'bad' | 'muted' | 'accent' | 'warn'
  title: string
  note: string
  done?: string | false
  children?: React.ReactNode
}) {
  const toneCls = {
    bad: 'bg-danger-surface text-danger-strong',
    muted: 'bg-surface-inset text-content-secondary',
    accent: 'bg-accent-surface text-accent',
    warn: 'bg-warning-surface text-warning-strong',
  }[tone]
  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 ${done ? 'opacity-60' : ''}`}>
      <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap ${toneCls}`}>{chip}</span>
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-semibold text-content">{title}</p>
        <p className="truncate text-[12px] text-content-muted">{note}</p>
      </div>
      <div className="flex gap-3 text-[12.5px]">{done ? <span className="text-content-muted">{done}</span> : children}</div>
    </li>
  )
}
