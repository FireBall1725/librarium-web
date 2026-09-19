// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Every place in a library as one nested select. Option text can't hold
// markup, so nesting is indented with non-breaking spaces.

import { useMemo } from 'react'
import type { CopyLocation } from '../../types'
import { buildTree, flatten } from '../../lib/places'

export default function PlaceSelect({ id, label, places, value, onChange, none, className = '' }: {
  id: string
  label: string
  places: CopyLocation[]
  value: string | null
  onChange: (placeId: string | null) => void
  /** An option for no place, with this text. Left out, a place must be picked. */
  none?: string
  className?: string
}) {
  const options = useMemo(() => flatten(buildTree(places)).map(n => ({
    id: n.place.id,
    label: '   '.repeat(n.depth) + n.place.name,
  })), [places])
  return (
    <select id={id} aria-label={label} className={`lb-field w-auto! max-w-[18rem] py-1! ${className}`}
      value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
      {none !== undefined ? <option value="">{none}</option> : !value && <option value="" disabled>{label}</option>}
      {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )
}
