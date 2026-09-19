// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Where new books go: library, place, read status and a list. The same bar
// sits over every view of the Add books dialog, and what's picked is
// remembered per library, so the next visit opens on the same shelf.

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { CopyLocation, Library } from '../../types'
import type { SavedList } from '../../lib/lists'
import { buildTree, flatten } from '../../lib/places'
import { nextShelf, type Destination } from '../../lib/addBooks'
import { Icon } from '../../lib/icons'

export default function DestinationBar({
  destination, onChange, libraries, places, lists, onNextShelf, locked,
}: {
  destination: Destination
  onChange: (d: Destination) => void
  libraries: Library[]
  places: CopyLocation[]
  lists: SavedList[]
  /** Moves to the next shelf, creating its place when there isn't one. */
  onNextShelf: () => void
  /** Why the library can't change right now, if it can't. */
  locked?: string
}) {
  const { t } = useTranslation()
  // Every place, nested, the shelves of a bookcase included. The indent is
  // non-breaking spaces because an option can't hold markup.
  const options = useMemo(() => flatten(buildTree(places)).map(n => ({
    id: n.place.id,
    label: '\u00a0\u00a0\u00a0'.repeat(n.depth) + n.place.name,
  })), [places])
  const next = nextShelf(destination.locationId, places, t('shelves_settings.shelf_prefix', { defaultValue: 'Shelf ' }))
  const set = (patch: Partial<Destination>) => onChange({ ...destination, ...patch })

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-surface-muted px-5 py-2.5 text-[12.5px]">
      <span className="lb-eyebrow mr-1">{t('add_books.adding_to', { defaultValue: 'Adding to' })}</span>

      {libraries.length > 1 ? (
        <select id="add-books-library" aria-label={t('add_books.library', { defaultValue: 'Library' })}
          className="lb-field w-auto! max-w-[14rem] py-1! font-semibold! disabled:opacity-60"
          value={destination.libraryId} disabled={!!locked} title={locked}
          onChange={e => set({ libraryId: e.target.value })}>
          {libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      ) : (
        <span className="font-semibold text-content">{libraries[0]?.name}</span>
      )}

      <select id="add-books-place" aria-label={t('add_books.place', { defaultValue: 'Place' })}
        className="lb-field w-auto! max-w-[16rem] py-1!"
        value={destination.locationId ?? ''}
        onChange={e => set({ locationId: e.target.value || null })}>
        <option value="">{t('add_books.no_place', { defaultValue: 'No place' })}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>

      {next && (
        <button type="button" className="lb-btn ghost sm inline-flex items-center gap-1" onClick={onNextShelf}
          title={t('add_books.next_shelf_hint', { name: next.name, defaultValue: 'Move on to {{name}}' })}>
          {t('add_books.next_shelf', { defaultValue: 'Next shelf' })}
          <Icon name="next" className="h-3.5 w-3.5" />
        </button>
      )}

      <select id="add-books-read" aria-label={t('add_books.read_status', { defaultValue: 'Read status' })}
        className="lb-field w-auto! py-1!"
        value={destination.readStatus}
        onChange={e => set({ readStatus: e.target.value as Destination['readStatus'] })}>
        <option value="unread">{t('read_status.unread', { defaultValue: 'Unread' })}</option>
        <option value="reading">{t('read_status.reading', { defaultValue: 'Reading' })}</option>
        <option value="read">{t('read_status.read', { defaultValue: 'Read' })}</option>
      </select>

      {lists.length > 0 && (
        <select id="add-books-list" aria-label={t('add_books.list', { defaultValue: 'List' })}
          className="lb-field w-auto! max-w-[14rem] py-1!"
          value={destination.listId ?? ''}
          onChange={e => set({ listId: e.target.value || null })}>
          <option value="">{t('add_books.no_list', { defaultValue: 'No list' })}</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}

      <span className="ml-auto text-[11.5px] text-content-muted">{t('add_books.kept', { defaultValue: 'Kept for next time' })}</span>
    </div>
  )
}
