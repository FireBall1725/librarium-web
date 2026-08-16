// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import type { MediaType } from '../types'

interface Props {
  value: string
  mediaTypes: MediaType[]
  onChange: (id: string) => void
}

export default function MediaTypeSelect({ value, mediaTypes, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const selected = mediaTypes.find(mt => mt.id === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between rounded-lg border border-line-strong dark:bg-surface-raised dark:text-white px-3 py-2 text-sm text-left focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
      >
        <span className={selected ? 'text-content ' : 'text-content-subtle'}>
          {selected?.display_name ?? 'Select type…'}
        </span>
        <svg
          className={`w-4 h-4 text-content-subtle transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-surface-raised shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {mediaTypes.map(mt => {
            const isSelected = mt.id === value
            return (
              <li key={mt.id}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onChange(mt.id); setOpen(false) }}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors ${
                    isSelected
                      ? 'bg-accent-surface'
                      : 'hover:bg-surface-inset/50'
                  }`}
                >
                  <span className="mt-0.5 w-4 flex-shrink-0 text-accent">
                    {isSelected && (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-content">{mt.display_name}</span>
                    {mt.description && (
                      <span className="block text-xs text-content-muted mt-0.5 leading-snug">{mt.description}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
