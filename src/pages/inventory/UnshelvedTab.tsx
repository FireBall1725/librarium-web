// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Unshelved: every copy in the library with no place. Pick some and put them
// on one place. Past a handful, taking them to the bookcase and using Shelve
// is quicker, so that's offered too.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import type { CopyLocation } from '../../types'
import { fetchInventory, moveCopy, type InventoryCopy } from '../../lib/inventory'
import { useToast } from '../../components/Toast'
import BookCover from '../../components/BookCover'
import PlaceSelect from '../../components/inventory/PlaceSelect'

type Sort = 'newest' | 'author' | 'title'
const PAGE = 200

export default function UnshelvedTab({ libraryId, places, onShelve, onChanged }: {
  libraryId: string
  places: CopyLocation[]
  onShelve: () => void
  onChanged: () => Promise<void> | void
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<InventoryCopy[] | null>(null)
  const [total, setTotal] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [placeId, setPlaceId] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('newest')
  const [moving, setMoving] = useState(false)

  const load = useCallback(async (offset: number) => {
    const r = await fetchInventory(callApi, libraryId, 'none', PAGE, offset)
    setTotal(r.total)
    setItems(prev => (offset === 0 ? r.items : [...(prev ?? []), ...r.items]))
  }, [callApi, libraryId])

  useEffect(() => {
    let live = true
    void fetchInventory(callApi, libraryId, 'none', PAGE, 0)
      .then(r => { if (live) { setItems(r.items); setTotal(r.total) } })
      .catch(() => { if (live) setItems([]) })
    return () => { live = false }
  }, [callApi, libraryId])

  const sorted = useMemo(() => {
    const list = [...(items ?? [])]
    const by = (f: (c: InventoryCopy) => string) => list.sort((a, b) => f(a).localeCompare(f(b), undefined, { sensitivity: 'base', numeric: true }))
    if (sort === 'author') by(c => `${c.book_authors || '￿'} ${c.book_title}`)
    if (sort === 'title') by(c => c.book_title)
    return list
  }, [items, sort])

  const toggle = (id: string) => setPicked(p => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const move = async () => {
    if (!placeId || picked.size === 0) return
    setMoving(true)
    const ids = [...picked]
    const done: string[] = []
    for (const id of ids) {
      try { await moveCopy(callApi, id, placeId); done.push(id) } catch { /* counted below */ }
    }
    setItems(prev => (prev ?? []).filter(c => !done.includes(c.id)))
    setTotal(n => n - done.length)
    setPicked(new Set())
    setMoving(false)
    if (done.length < ids.length) toast.show(t('inventory.some_failed', { count: ids.length - done.length, defaultValue: "{{count}} couldn't be moved." }), { variant: 'error' })
    else toast.show(t('inventory.moved_count', { count: done.length, defaultValue: 'Moved {{count}} books' }))
    void onChanged()
  }

  const sortLabel: Record<Sort, string> = {
    newest: t('inventory.sort_newest', { defaultValue: 'Newest first' }),
    author: t('inventory.sort_author', { defaultValue: 'By author' }),
    title: t('inventory.sort_title', { defaultValue: 'By title' }),
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-muted px-4 py-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-line-strong" role="group" aria-label={t('inventory.sort', { defaultValue: 'Sort' })}>
          {(['newest', 'author', 'title'] as const).map(s => (
            <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)}
              className={`px-3 py-1.5 text-[12.5px] font-semibold ${sort === s ? 'bg-accent-surface text-accent' : 'text-content-secondary hover:bg-surface-inset'}`}>
              {sortLabel[s]}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] tabular-nums text-content-muted">{t('inventory.picked', { count: picked.size, defaultValue: '{{count}} picked' })}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-content-secondary">{t('inventory.put_on', { defaultValue: 'Put on' })}</span>
          <PlaceSelect id="unshelved-place" label={t('inventory.place', { defaultValue: 'Place' })} places={places} value={placeId} onChange={setPlaceId} />
          <button type="button" className="lb-btn sm disabled:opacity-50" disabled={!placeId || picked.size === 0 || moving} onClick={() => void move()}>
            {moving ? t('inventory.moving', { defaultValue: 'Moving…' }) : t('inventory.move', { defaultValue: 'Move' })}
          </button>
        </span>
      </div>

      {items === null ? (
        <p className="px-6 py-12 text-center text-[13px] text-content-muted">{t('common.loading', { defaultValue: 'Loading…' })}</p>
      ) : items.length === 0 ? (
        <p className="px-6 py-12 text-center text-[13px] text-content-muted">{t('inventory.all_shelved', { defaultValue: 'Every copy has a place.' })}</p>
      ) : (
        <>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {sorted.map(c => (
              <li key={c.id}>
                <label htmlFor={`un-${c.id}`} className="grid cursor-pointer grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 hover:bg-surface-muted">
                  <input type="checkbox" id={`un-${c.id}`} checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-[var(--color-accent)]" />
                  <BookCover title={c.book_title} coverUrl={c.cover_url} hideLabel className="w-8" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-content">{c.book_title}</span>
                    <span className="block truncate text-[12px] text-content-muted">{c.book_authors}</span>
                  </span>
                  <span className="text-[12px] tabular-nums text-content-muted">{c.created_at.slice(0, 10)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[12.5px] text-content-muted">
            <span className="tabular-nums">{t('inventory.showing', { shown: items.length, total, defaultValue: 'Showing {{shown}} of {{total}}' })}</span>
            {items.length < total && (
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void load(items.length)}>
                {t('inventory.show_more', { defaultValue: 'Show more' })}
              </button>
            )}
            <span className="ml-auto">
              {t('inventory.or_shelve', { defaultValue: 'Or take them to the bookcase and' })}{' '}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={onShelve}>{t('inventory.use_shelve', { defaultValue: 'use Shelve' })}</button>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
