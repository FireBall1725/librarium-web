// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { Stars } from './StarRating'
import { suggestFacets, suggestRating, textSuggestion, type Suggestion } from '../lib/filterSuggest'
import type { BookFacets, FacetKey } from '../lib/bookBrowse'
import type { SavedList } from '../lib/lists'
import type { ContributorResult } from '../types'

/**
 * The search box, which is also how you reach a filter from the keyboard.
 *
 * Every filter the rail can express was previously mouse-only. Typing went into
 * a single `q=` that matched titles and contributor names together, so asking
 * for an author also found books with their name in the title, and a tag could
 * only be reached by spotting it in the rail.
 *
 * A suggestion resolves to the same toggle a checkbox calls, so choosing
 * "Library: Book Collection" ticks that box and the chip is the box's own
 * rendering. Authors are the exception and are filtered by id without a rail
 * section: a collection has hundreds, and a rail listing every one is a wall
 * rather than a filter.
 */
export default function FilterSearch({
  value, onChange, onCommitText, facets, lists, selection,
  onToggleFacet, onPickContributor, onPickRating,
}: {
  value: string
  onChange: (next: string) => void
  /** Enter with nothing highlighted: keep it as a plain search. */
  onCommitText: (text: string) => void
  facets: BookFacets | null
  lists: SavedList[]
  selection: Record<FacetKey, string[]>
  onToggleFacet: (facet: FacetKey, value: string) => void
  onPickContributor: (id: string, name: string) => void
  /** Replace the rating selection outright: a comparison is a set, not one tick. */
  onPickRating: (values: string[]) => void
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [authors, setAuthors] = useState<ContributorResult[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  // Authors are searched rather than listed. There are hundreds and they are
  // not a facet, so unlike every other dimension they cannot come out of the
  // block already loaded.
  useEffect(() => {
    const q = value.trim()
    if (q.length < 2) return
    const mine = ++seq.current
    const timer = setTimeout(() => {
      void callApi<ContributorResult[]>(`/api/v1/contributors?q=${encodeURIComponent(q)}`)
        // One guard for the whole box: a slow reply to an earlier keystroke must
        // not overwrite a newer one, which is what makes suggestions flicker
        // back to a previous query.
        .then(r => { if (mine === seq.current) setAuthors((r ?? []).slice(0, 4)) })
        .catch(() => { if (mine === seq.current) setAuthors([]) })
    }, 180)
    return () => clearTimeout(timer)
  }, [value, callApi])

  const facetHits = suggestFacets(value, facets, lists, selection).slice(0, 6)
  // Gated on the length here rather than cleared in the effect, so a short box
  // shows nothing without a render spent writing an empty array back to state.
  const authorHits: Suggestion[] = value.trim().length < 2 ? [] : authors.map(a => ({
    kind: 'contributor', value: a.id, label: a.name, group: t('search.author', { defaultValue: 'Author' }),
  }))
  // A rating leads when the box parses as one. "4 stars" is not a title anybody
  // is searching for, and burying it under text matches would mean scrolling
  // past them to reach the thing that was actually typed.
  const rating = suggestRating(value)
  const suggestions: Suggestion[] = value.trim()
    ? [...(rating ? [rating] : []), ...facetHits, ...authorHits, textSuggestion(value)]
    : []

  // Kept in range as the list shrinks under the cursor, or Enter would take
  // whatever happened to be last.
  const active = Math.min(highlighted, Math.max(0, suggestions.length - 1))

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const choose = (s: Suggestion) => {
    setOpen(false)
    setHighlighted(0)
    switch (s.kind) {
      case 'facet':
        // The same call the checkbox makes. The chip and the tick are one
        // thing, so there is nothing else to update.
        onToggleFacet(s.facet, s.value)
        onChange('')
        break
      case 'contributor':
        onPickContributor(s.value, s.label)
        onChange('')
        break
      case 'rating':
        // Set rather than toggled. "Four stars and up" is one answer that
        // happens to cover several values, so adding them one at a time to
        // whatever was already ticked would produce a filter nobody asked for.
        onPickRating(s.values.map(String))
        onChange('')
        break
      default:
        onCommitText(s.value)
    }
  }

  return (
    <div ref={boxRef} className="relative mb-6 w-full max-w-lg">
      <input
        type="search"
        value={value}
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="filter-suggestions"
        aria-autocomplete="list"
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlighted(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || suggestions.length === 0) {
            if (e.key === 'Enter' && value.trim()) onCommitText(value.trim())
            return
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); choose(suggestions[active]) }
          else if (e.key === 'Escape') { setOpen(false) }
        }}
        placeholder={t('search.placeholder', {
          defaultValue: 'Search, or name an author, tag or library…',
        })}
        className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none"
      />

      {open && suggestions.length > 0 && (
        <ul
          id="filter-suggestions"
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-line-strong bg-surface-raised shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.kind}:${s.group}:${s.value}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, not click: the input's blur would close the list
                // before a click ever landed.
                onMouseDown={e => { e.preventDefault(); choose(s) }}
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
                {/* A rating is drawn rather than described. Reading "more than
                    three and a half stars" is slower than seeing it. */}
                {s.kind === 'rating' ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <Stars rating={s.threshold} />
                    <span className="truncate text-content-tertiary">{s.qualifier}</span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                )}
                {s.kind === 'facet' && s.count !== undefined && (
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
