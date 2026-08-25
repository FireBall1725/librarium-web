// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { NavLink } from 'react-router-dom'
import { Icon } from '../lib/icons'
import { listHref, listIcon, type SavedList } from '../lib/lists'

/**
 * One view in the rail.
 *
 * Its own component because the rail draws two sections of them now, yours and
 * the ones a library shares with you, and ninety lines of drag handling copied
 * into both is ninety lines that drift apart.
 *
 * Dragging is scoped to a section: `shown` is the section this row belongs to,
 * so a drop resolves against its neighbours and a row cannot be dragged from
 * one section into the other. Moving a private view into the shared section
 * would mean sharing it, which is a decision, not a drag.
 */
export default function ViewRow({
  list: l, shown, dragging, dragOver, current, count, qualifier,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, onNudge,
}: {
  list: SavedList
  /** The section this row is in, for working out which side the drop line goes on. */
  shown: SavedList[]
  dragging: string | null
  dragOver: string | null
  /** Whether the filter on screen is this view's. */
  current: boolean
  count?: number
  /** Library name, shown only when two views share a name. */
  qualifier?: string
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver: (id: string) => void
  onDragLeave: (id: string) => void
  onDrop: (fromId: string) => void
  onNudge: (id: string, delta: -1 | 1) => void
}) {
  const dropping = dragOver === l.id && dragging !== l.id
  // Which side of this row the line goes on: dragging downwards, the row lands
  // after the one it is over.
  const fromAt = shown.findIndex(x => x.id === dragging)
  const overAt = shown.findIndex(x => x.id === l.id)
  const after = fromAt >= 0 && overAt > fromAt

  return (
    <NavLink
      to={listHref(l)}
      draggable
      onDragStart={e => {
        onDragStart(l.id)
        e.dataTransfer.effectAllowed = 'move'
        // Firefox starts no drag at all without payload.
        e.dataTransfer.setData('text/plain', l.id)
      }}
      onDragEnd={onDragEnd}
      onDragOver={e => {
        if (!dragging || dragging === l.id) return
        // A row from the other section is not a valid target, and saying so by
        // refusing the drop is what makes the boundary real rather than advisory.
        if (fromAt < 0) return
        // Without this the drop never fires: the default is to refuse.
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver(l.id)
      }}
      onDragLeave={() => onDragLeave(l.id)}
      onDrop={e => {
        e.preventDefault()
        const from = dragging ?? e.dataTransfer.getData('text/plain')
        if (from && from !== l.id) onDrop(from)
      }}
      onKeyDown={e => {
        // Alt, so the bare arrows still walk the rail.
        if (!e.altKey) return
        if (e.key === 'ArrowUp') { e.preventDefault(); onNudge(l.id, -1) }
        if (e.key === 'ArrowDown') { e.preventDefault(); onNudge(l.id, 1) }
      }}
      className={() => [
        'lb-navrow lb-draggable',
        current ? 'on' : '',
        dragging === l.id ? 'lb-dragging' : '',
        // A line where the row would land, rather than moving everything under
        // the cursor: the rail is short enough that a live reshuffle reads as
        // flicker.
        dropping ? `lb-drop-line ${after ? 'lb-drop-after' : 'lb-drop-before'}` : '',
      ].filter(Boolean).join(' ')}
      title={[l.name, qualifier, l.description].filter(Boolean).join(' · ') || undefined}
    >
      {/* The universal six-dot grip, so a row reads as grabbable without having
          to be dragged to find out. Absolutely positioned in the row's existing
          padding, so the icon below stays in line with the nav icons above. */}
      <span className="lb-drag-grip" aria-hidden="true">
        <svg width="6" height="12" viewBox="0 0 6 12" fill="currentColor">
          <circle cx="1.5" cy="2" r="1" /><circle cx="4.5" cy="2" r="1" />
          <circle cx="1.5" cy="6" r="1" /><circle cx="4.5" cy="6" r="1" />
          <circle cx="1.5" cy="10" r="1" /><circle cx="4.5" cy="10" r="1" />
        </svg>
      </span>
      {/* Tinted with the view's own colour. The icon set is the app's own: a
          shelf used to store an arbitrary emoji, which made them the one thing
          in the rail not drawn from the same set as everything above. */}
      <Icon name={listIcon(l)} style={l.color ? { color: l.color } : undefined} />
      <span className="min-w-0 flex-1 truncate">
        {l.name}
        {/* Which library, but only when the name alone does not say. Two views
            shared into different libraries and both called Favourites read as
            one row listed twice. Qualifying every one would be noise for the
            usual case where the name is already unique. */}
        {qualifier && (
          <span className="ml-1.5 text-[11px] text-content-faint">{qualifier}</span>
        )}
      </span>
      <ViewCount value={count} />
    </NavLink>
  )
}

/** The number beside a row, absent rather than zero while it is unknown. */
function ViewCount({ value }: { value?: number }) {
  if (value === undefined) return null
  return <span className="count">{value.toLocaleString()}</span>
}
