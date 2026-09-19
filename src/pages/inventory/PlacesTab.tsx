// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Browse by place: the place tree on the left, the picked place on the
// right. A bookcase is drawn shelf by shelf; a shelf or any other place lists
// the copies on it.

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import type { CopyLocation } from '../../types'
import { buildTree, flatten, pathOf, shelfSpot } from '../../lib/places'
import { fetchInventory, type InventoryCopy } from '../../lib/inventory'
import { Icon } from '../../lib/icons'
import BookCover from '../../components/BookCover'
import Bookcase from '../../components/inventory/Bookcase'

export default function PlacesTab({ libraryId, places, placeId, onPlace, onShelve, onCheck, version }: {
  libraryId: string
  places: CopyLocation[]
  placeId: string | null
  onPlace: (id: string | null) => void
  onShelve: (id: string) => void
  onCheck: (id: string) => void
  /** Bumped when copies moved, so the list reloads. */
  version: number
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const nodes = useMemo(() => flatten(buildTree(places)), [places])
  const place = places.find(p => p.id === placeId) ?? null
  // A shelf is shown inside its bookcase; the bookcase alone lists nothing.
  const spot = placeId ? shelfSpot(placeId, places) : null
  const bookcase = spot?.bookcase ?? null
  const listed = place && place.shelf_count == null ? place : null

  const [copies, setCopies] = useState<InventoryCopy[] | null>(null)
  const [loadedFor, setLoadedFor] = useState('')
  const key = `${listed?.id}:${version}`
  if (loadedFor !== key) { setLoadedFor(key); setCopies(null) }
  useEffect(() => {
    if (!listed) return
    let live = true
    void fetchInventory(callApi, libraryId, listed.id)
      .then(r => { if (live) setCopies(r.items) })
      .catch(() => { if (live) setCopies([]) })
    return () => { live = false }
  }, [callApi, libraryId, listed, version])

  if (places.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
        <p className="font-semibold text-content">{t('inventory.no_places', { defaultValue: 'No places in this library yet' })}</p>
        <p className="mt-1 text-[13px] text-content-muted">{t('inventory.no_places_note', { defaultValue: 'Add your rooms and bookcases first, then come back to shelve.' })}</p>
        <Link to="/settings/shelves" className="lb-btn mt-4 inline-flex">{t('inventory.set_up_places', { defaultValue: 'Set up places' })}</Link>
      </div>
    )
  }

  return (
    <div className="grid overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-[16rem_minmax(0,1fr)]">
      <ul className="flex flex-col gap-0.5 border-b border-line bg-surface-muted p-2.5 md:border-b-0 md:border-r">
        {nodes.map(n => {
          const on = n.place.id === placeId || n.place.id === bookcase?.id
          const isCase = n.place.shelf_count != null
          // A bookcase's shelves are picked from its drawing, not the tree.
          if (n.place.parent_id && places.find(p => p.id === n.place.parent_id)?.shelf_count != null) return null
          return (
            <li key={n.place.id}>
              <button type="button" onClick={() => onPlace(n.place.id)} style={{ paddingLeft: `${0.5 + n.depth * 0.9}rem` }}
                className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[13.5px] font-semibold ${on ? 'bg-accent-surface text-accent' : 'text-content-secondary hover:bg-surface-inset'}`}>
                <Icon name={isCase ? 'books' : 'home'} className="h-4 w-4 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">{n.place.name}</span>
                <span className="text-[12px] font-normal tabular-nums text-content-muted">{n.total}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="min-w-0 space-y-4 p-4">
        {!place ? (
          <p className="py-10 text-center text-[13px] text-content-muted">{t('inventory.pick_place', { defaultValue: 'Pick a place to see what’s on it.' })}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="lb-display text-[22px] text-content">{pathOf(place.id, places).join(' › ')}</h2>
                {bookcase && (
                  <p className="text-[12.5px] text-content-muted">
                    {t('inventory.case_meta', { count: bookcase.shelf_count ?? 0, defaultValue: '{{count}} shelves' })}
                    {' · '}
                    {bookcase.shelf_numbering === 'bottom_up'
                      ? t('inventory.shelf_one_bottom', { defaultValue: 'shelf 1 at the bottom' })
                      : t('inventory.shelf_one_top', { defaultValue: 'shelf 1 at the top' })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="lb-btn ghost sm inline-flex items-center gap-1.5" onClick={() => onShelve(place.id)}>
                  <Icon name="barcode" className="h-3.5 w-3.5" />{t('inventory.shelve_here', { defaultValue: 'Shelve here' })}
                </button>
                {listed && (
                  <button type="button" className="lb-btn ghost sm inline-flex items-center gap-1.5" onClick={() => onCheck(place.id)}>
                    <Icon name="check" className="h-3.5 w-3.5" />{t('inventory.check_this', { defaultValue: 'Check this shelf' })}
                  </button>
                )}
              </div>
            </div>

            {bookcase && (
              <Bookcase bookcase={bookcase} places={places} current={spot?.shelf != null ? placeId : null}
                onPick={id => { if (id) onPlace(id) }} />
            )}
            {bookcase && spot?.shelf == null && (
              <p className="text-[12.5px] text-content-muted">{t('inventory.pick_shelf', { defaultValue: 'Pick a shelf to see its books.' })}</p>
            )}

            {listed && (copies === null ? (
              <p className="text-[13px] text-content-muted">{t('common.loading', { defaultValue: 'Loading…' })}</p>
            ) : copies.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong px-6 py-8 text-center text-[13px] text-content-muted">
                {t('inventory.empty_place', { defaultValue: 'Nothing is filed here yet.' })}
              </p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
                {copies.map(c => (
                  <li key={c.id} className="min-w-0">
                    <Link to={`/libraries/${libraryId}/books/${c.book_id}`} className="block">
                      <BookCover title={c.book_title} coverUrl={c.cover_url} hideLabel={false} />
                      <span className="mt-1 block truncate text-[12px] font-semibold text-content">{c.book_title}</span>
                      <span className="block truncate text-[11.5px] text-content-muted">
                        {c.on_loan_to ? t('inventory.lent_to', { name: c.on_loan_to, defaultValue: 'Lent to {{name}}' }) : c.book_authors}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
