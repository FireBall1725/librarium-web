// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The Books sort button and the panel it opens.
//
// The panel only sorts. Saving is the view's job, and a changed sort marks the
// view modified like a filter does, so Save changes and Revert on the toolbar
// cover it; a second save flow in here would be two ways to do one thing.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MAX_SORT_LEVELS, SORT_FIELDS, SORT_PRESETS, directionLabel, fieldLabel, sameSort, sortSummary,
  type SortField, type SortLevel,
} from '../lib/bookSort'

/**
 * One glyph for both directions in every language: the arrow is reading order
 * and the bars run small to big or big to small. The words beside it carry the
 * meaning; an arrow alone is read both ways.
 */
function DirectionIcon({ desc }: { desc: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-none">
      <path d="M3.5 2.5v11m0 0L1.5 11.5m2 2 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={desc ? 'M8 3.5h6.5M8 7.5h4.5M8 11.5h2.5' : 'M8 3.5h2.5M8 7.5h4.5M8 11.5h6.5'}
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function SortIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-none text-accent">
      <path d="M4 2.5v11M4 13.5l-2.5-2.5M4 13.5 6.5 11M9 4h5.5M9 8h4M9 12h2.5"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** English fallbacks for the preset names, used until a locale has them. */
const PRESET_NAMES: Record<string, string> = {
  shelf: 'Author, then series',
  by_shelf: 'Shelf, then author',
  title: 'Title',
  author_title: 'Author, then title',
  recent: 'Recently added',
  oldest: 'Oldest published',
}

const segBtn = (on: boolean) =>
  `inline-flex items-center gap-1.5 px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
    on ? 'bg-accent-surface text-accent' : 'text-content-tertiary hover:text-content-secondary'
  }`

export default function SortMenu({ value, effective, auto, onChange }: {
  /** The sort the reader picked; empty when they have not. */
  value: SortLevel[]
  /** What is actually in effect, which is the default when nothing was picked. */
  effective: SortLevel[]
  /** Nothing picked and the list is inside one series, so it is in reading order. */
  auto: boolean
  onChange: (levels: SortLevel[]) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Every edit starts from what is on screen, so changing one level of the
  // automatic series order makes it the reader's own sort rather than
  // starting again from nothing.
  const edit = (fn: (levels: SortLevel[]) => SortLevel[]) => onChange(fn(effective.map(l => ({ ...l }))))
  const move = (from: number, to: number) => edit(ls => {
    const [x] = ls.splice(from, 1)
    ls.splice(to, 0, x)
    return ls
  })
  const used = new Set(effective.map(l => l.field))
  const nextFree = SORT_FIELDS.find(f => !used.has(f))

  return (
    <span className="relative">
      <button ref={buttonRef} type="button" onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog" aria-expanded={open}
        className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition-colors ${
          open ? 'border-accent text-content' : 'border-line-strong text-content-secondary hover:bg-surface-inset'
        }`}>
        <SortIcon />
        <span className="text-content-tertiary">{t('sort.button', { defaultValue: 'Sort' })}</span>
        <span className="truncate font-medium text-content">
          {auto ? t('sort.series_order', { defaultValue: 'Series order' }) : sortSummary(effective, t)}
        </span>
        {auto && (
          <span className="rounded-full border border-success-line px-1.5 text-[10.5px] text-success-strong">
            {t('sort.automatic', { defaultValue: 'automatic' })}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Catches the click that dismisses, the way the view menu does. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label={t('sort.button', { defaultValue: 'Sort' })}
            className="absolute left-0 top-[calc(100%+8px)] z-50 grid w-[min(34rem,calc(100vw-2rem))] gap-3.5 rounded-xl border border-line-strong bg-surface-raised p-4 text-content shadow-xl">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="lb-display text-[22px] leading-none">{t('sort.title', { defaultValue: 'Sort' })}</h3>
              {value.length > 0 && (
                <button type="button" onClick={() => onChange([])}
                  className="text-xs text-content-tertiary hover:text-content">
                  {t('sort.reset', { defaultValue: 'Back to the default' })}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('sort.presets', { defaultValue: 'Quick picks' })}>
              {SORT_PRESETS.map(p => {
                const on = value.length > 0 && sameSort(p.levels, value)
                return (
                  <button key={p.id} type="button" aria-pressed={on}
                    onClick={() => onChange(p.levels.map(l => ({ ...l })))}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      on ? 'border-accent bg-accent-surface text-accent' : 'border-line-strong text-content-secondary hover:bg-surface-inset'
                    }`}>
                    {t(`sort.preset_${p.id}`, { defaultValue: PRESET_NAMES[p.id] })}
                  </button>
                )
              })}
            </div>

            {auto && (
              <p className="rounded-lg bg-success-surface px-2.5 py-2 text-xs text-success-strong">
                {t('sort.auto_hint', { defaultValue: "Filtered to one series, so it's in series order. Pick a sort to change that." })}
              </p>
            )}

            <ol className="grid gap-2">
              {effective.map((lv, i) => (
                <li key={`${lv.field}-${i}`} draggable
                  onDragStart={e => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move' }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) move(dragFrom, i); setDragFrom(null) }}
                  onDragEnd={() => setDragFrom(null)}
                  className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 rounded-lg border bg-surface p-2 sm:grid-cols-[1.25rem_4rem_minmax(0,1fr)_auto] ${
                    dragFrom === i ? 'border-accent opacity-60' : 'border-line'
                  }`}>
                  <span className="grid justify-items-center text-[10px] leading-none text-content-tertiary">
                    <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)}
                      aria-label={t('sort.move_up', { defaultValue: 'Move up' })} className="px-0.5 disabled:opacity-25">▲</button>
                    <button type="button" disabled={i === effective.length - 1} onClick={() => move(i, i + 1)}
                      aria-label={t('sort.move_down', { defaultValue: 'Move down' })} className="px-0.5 disabled:opacity-25">▼</button>
                  </span>
                  <label htmlFor={`sort-field-${i}`} className="hidden text-xs text-content-tertiary sm:block">
                    {i === 0 ? t('sort.sort_by', { defaultValue: 'Sort by' }) : t('sort.then_by', { defaultValue: 'then by' })}
                  </label>
                  <select id={`sort-field-${i}`} value={lv.field}
                    onChange={e => edit(ls => {
                      const field = e.target.value as SortField
                      ls[i] = { field, desc: false }
                      return ls
                    })}
                    className="w-full min-w-0 rounded-md border border-line-strong bg-surface px-2 py-1 text-[13px]">
                    {SORT_FIELDS.map(f => (
                      <option key={f} value={f} disabled={f !== lv.field && used.has(f)}>{fieldLabel(f, t)}</option>
                    ))}
                  </select>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex overflow-hidden rounded-md border border-line-strong" role="group"
                      aria-label={t('sort.direction', { defaultValue: 'Direction' })}>
                      {[false, true].map(desc => (
                        <button key={String(desc)} type="button" aria-pressed={lv.desc === desc}
                          aria-label={directionLabel(lv.field, desc, t)} title={directionLabel(lv.field, desc, t)}
                          onClick={() => edit(ls => { ls[i] = { ...ls[i], desc }; return ls })}
                          className={segBtn(lv.desc === desc)}>
                          <DirectionIcon desc={desc} />
                          {/* Icon only on a phone, where the words do not fit. */}
                          <span className="hidden sm:inline">{directionLabel(lv.field, desc, t)}</span>
                        </button>
                      ))}
                    </span>
                    <button type="button" disabled={effective.length === 1}
                      onClick={() => edit(ls => ls.filter((_, j) => j !== i))}
                      aria-label={t('sort.remove', { defaultValue: 'Remove this level' })}
                      className="px-1 text-base leading-none text-content-tertiary hover:text-content disabled:opacity-25">×</button>
                  </span>
                  {lv.field === 'series' && (
                    <span className="col-start-2 col-end-4 flex flex-wrap items-center gap-1.5 text-xs text-content-tertiary sm:col-start-3 sm:col-end-5">
                      {t('sort.standalones', { defaultValue: 'Books not in a series:' })}
                      <span className="inline-flex overflow-hidden rounded-md border border-line-strong" role="group"
                        aria-label={t('sort.standalones', { defaultValue: 'Books not in a series:' })}>
                        <button type="button" aria-pressed={!lv.mixed} className={segBtn(!lv.mixed)}
                          onClick={() => edit(ls => { ls[i] = { ...ls[i], mixed: undefined }; return ls })}>
                          {t('sort.standalones_after', { defaultValue: 'after the series' })}
                        </button>
                        <button type="button" aria-pressed={!!lv.mixed} className={segBtn(!!lv.mixed)}
                          onClick={() => edit(ls => { ls[i] = { ...ls[i], mixed: true }; return ls })}>
                          {t('sort.standalones_mixed', { defaultValue: 'mixed in by title' })}
                        </button>
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <button type="button" disabled={effective.length >= MAX_SORT_LEVELS || !nextFree}
              onClick={() => nextFree && edit(ls => [...ls, { field: nextFree, desc: false }])}
              className="justify-self-start rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-xs text-accent disabled:text-content-tertiary">
              + {t('sort.add_level', { defaultValue: 'Then sort by…' })}
            </button>
          </div>
        </>
      )}
    </span>
  )
}

