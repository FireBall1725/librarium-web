// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// A search input that offers filters as you type.
//
// The chrome only: the box, the list, the keyboard handling, and the rule that
// a suggestion is chosen on mousedown rather than click. What to suggest is the
// caller's business, because Books suggests genres, tags and authors while
// Series suggests what a run is, and the two share none of that vocabulary.
//
// Extracted from the Books search so Series could have the same behaviour
// rather than a copy of it that drifts.

import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface SuggestItem {
  /** Stable across renders, so the highlighted row does not jump. */
  key: string
  /** The word shown first: Tag, Library, Status. */
  group: string
  label: string
  count?: number
  /** Drawn instead of the label, for a suggestion a picture says faster. */
  render?: ReactNode
}

export default function SuggestBox({
  value, onChange, onCommitText, placeholder, ariaLabel, items, onPick,
  className = 'mb-6 w-full max-w-lg',
}: {
  value: string
  onChange: (next: string) => void
  /** Enter with nothing highlighted: keep it as a plain search. */
  onCommitText: (text: string) => void
  placeholder: string
  ariaLabel?: string
  items: SuggestItem[]
  onPick: (index: number) => void
  /**
   * The wrapper's classes, when the caller needs it to share a row.
   *
   * The box owns its own width by default. A page that puts its actions on the
   * same line has to own the layout instead, and the dropdown is positioned
   * against this element, so it cannot be wrapped in another div without the
   * list detaching from the input.
   */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // Clamped rather than reset. The list reshapes on every keystroke and a
  // stored index can outlive the row it pointed at.
  const active = items.length === 0 ? 0 : Math.min(highlighted, items.length - 1)

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const choose = (i: number) => {
    onPick(i)
    onChange('')
    setOpen(false)
    setHighlighted(0)
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        type="search"
        value={value}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls="suggest-list"
        aria-autocomplete="list"
        aria-label={ariaLabel}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlighted(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || items.length === 0) {
            if (e.key === 'Enter' && value.trim()) onCommitText(value.trim())
            return
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, items.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); choose(active) }
          else if (e.key === 'Escape') { setOpen(false) }
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none"
      />

      {open && items.length > 0 && (
        <ul
          id="suggest-list"
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-line-strong bg-surface-raised shadow-lg"
        >
          {items.map((s, i) => (
            <li key={s.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, not click: the input's blur would close the list
                // before a click ever landed.
                onMouseDown={e => { e.preventDefault(); choose(i) }}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  i === active ? 'bg-surface-inset text-content' : 'text-content-secondary'
                }`}
              >
                {/* The kind first, because the same word is often a tag and a
                    genre and a media type, and picking blind is picking wrong. */}
                <span className="w-[4.75rem] flex-none text-[10.5px] font-semibold uppercase tracking-wide text-content-faint">
                  {s.group}
                </span>
                {s.render ?? <span className="min-w-0 flex-1 truncate">{s.label}</span>}
                {s.count !== undefined && (
                  <span className="flex-none text-xs tabular-nums text-content-faint">{s.count}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
