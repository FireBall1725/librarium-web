// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// A marked bookcase drawn shelf by shelf, each shelf filled to how many
// copies it holds, in the numbering the bookcase uses (shelf 1 at the top or
// the bottom). A shelf with no place yet is drawn empty.

import { useTranslation } from 'react-i18next'
import type { CopyLocation } from '../../types'
import { shelfChoices } from '../../lib/places'

export default function Bookcase({ bookcase, places, current, onPick, compact }: {
  bookcase: CopyLocation
  places: CopyLocation[]
  /** The shelf's place id to draw as the one being worked on. */
  current?: string | null
  onPick?: (placeId: string | null, number: number) => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  const shelves = shelfChoices(bookcase, places, t('shelves_settings.shelf_prefix', { defaultValue: 'Shelf ' }))
  // Drawn in the order they stand: shelf 1 at the bottom goes last.
  const drawn = bookcase.shelf_numbering === 'bottom_up' ? [...shelves].reverse() : shelves
  const most = Math.max(1, ...shelves.map(s => s.place?.copy_count ?? 0))

  return (
    <div className="flex flex-col gap-1 rounded-md border-4 border-line-strong bg-surface-inset p-1.5">
      {drawn.map(s => {
        const count = s.place?.copy_count ?? 0
        const on = !!s.place && s.place.id === current
        return (
          <button key={s.number} type="button" disabled={!onPick}
            onClick={() => onPick?.(s.place?.id ?? null, s.number)}
            className={`grid items-center gap-2.5 rounded border px-2.5 text-left ${compact ? 'min-h-7 grid-cols-[3.5rem_minmax(0,1fr)_2rem] text-[11.5px]' : 'min-h-9 grid-cols-[4.5rem_minmax(0,1fr)_2.75rem] text-[12.5px]'} ${on ? 'border-2 border-accent bg-accent-surface' : 'border-line bg-surface'} ${onPick ? 'cursor-pointer hover:border-accent-line' : 'cursor-default'}`}>
            <span className={`font-semibold ${on ? 'text-accent' : 'text-content-muted'}`}>{s.name}</span>
            {/* Fill, not a count of spines: a shelf of 80 would be 80 marks. */}
            <span className="h-2 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-accent/60" style={{ width: `${Math.round((count / most) * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums text-content-muted">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
