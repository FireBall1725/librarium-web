// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useTranslation } from 'react-i18next'

/**
 * A-Z filter for an index surface.
 *
 * Every letter is always shown, and the empty ones are disabled rather than
 * hidden. A bar that only lists the letters you happen to own moves under the
 * pointer as the collection changes, so the reader has to re-find M every time;
 * a fixed bar is a stable place to aim at, and the greyed letters are honest
 * about what the collection does not have.
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function AlphabetBar({
  available,
  active,
  onSelect,
}: {
  /** Letters with at least one entry behind them. '#' is included when present. */
  available: Set<string>
  /** Currently selected letter, or null for all. */
  active: string | null
  onSelect: (letter: string | null) => void
}) {
  const { t } = useTranslation()

  const letter = (value: string, label: string) => {
    const enabled = available.has(value)
    const on = active === value
    return (
      <button
        key={value}
        type="button"
        disabled={!enabled}
        aria-pressed={on}
        onClick={() => onSelect(on ? null : value)}
        className={`min-w-[25px] rounded-md px-1.5 py-1 text-xs font-semibold transition-colors ${
          on
            ? 'bg-accent-surface text-accent'
            : enabled
              ? 'text-content-tertiary hover:bg-surface-inset hover:text-content'
              : 'cursor-default text-content-faint opacity-40'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap gap-0.5">
      <button
        type="button"
        aria-pressed={active === null}
        onClick={() => onSelect(null)}
        className={`min-w-[25px] rounded-md px-1.5 py-1 text-xs font-semibold transition-colors ${
          active === null
            ? 'bg-accent-surface text-accent'
            : 'text-content-tertiary hover:bg-surface-inset hover:text-content'
        }`}
      >
        {t('index.all', { defaultValue: 'All' })}
      </button>
      {LETTERS.map(c => letter(c, c))}
      {/* Only offered when something files under it, since most collections
          have no such entries and an always-present # reads as broken. */}
      {available.has('#') && letter('#', '#')}
    </div>
  )
}
