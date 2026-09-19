// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// One looked-up book as a card: the cover, title and authors, who found it,
// and every field the lookup found, compact. A field the providers disagreed
// on says how many answers there were and opens them in place, so checking
// the data doesn't mean opening the edit form.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MergedBookResult } from '../../types'
import {
  MERGED_FIELDS, fieldOptions, pickedAuthors, pickedValue, providerNames, summariseProviders,
  type MergedFieldKey, type Picks,
} from '../../lib/mergedLookup'
import { Icon } from '../../lib/icons'

// Title and authors lead the card; the rest sit in the grid below.
const GRID_FIELDS = MERGED_FIELDS.filter(k => k !== 'title' && k !== 'authors')

export default function FoundBook({ merged, picks, onPicks, onAskAgain, asking }: {
  merged: MergedBookResult
  picks: Picks
  onPicks: (p: Picks) => void
  onAskAgain?: () => void
  asking?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<MergedFieldKey | 'cover' | null>(null)
  const names = providerNames(merged)
  const summary = summariseProviders(merged.providers)
  const covers = merged.covers ?? []
  const cover = covers[picks.cover ?? 0]
  const title = pickedValue(merged, 'title', picks)
  const authors = pickedAuthors(merged, picks)

  const label = (k: MergedFieldKey) => t(`merged.${k === 'publish_date' ? 'published' : k === 'page_count' ? 'pages' : k}`)
  const toggle = (k: MergedFieldKey | 'cover') => setOpen(o => (o === k ? null : k))

  const answers = (k: MergedFieldKey) => {
    const n = fieldOptions(merged[k], names).length
    if (n < 2) return null
    return (
      <button type="button" aria-expanded={open === k} onClick={() => toggle(k)}
        className="shrink-0 rounded-md border border-warning-line bg-warning-surface px-1.5 py-0.5 text-[11px] font-semibold text-warning-strong hover:brightness-95">
        {t('merged.answers', { count: n })}
      </button>
    )
  }

  const options = (k: MergedFieldKey) => {
    if (open !== k) return null
    const pick = picks[k] ?? 0
    return (
      <div className="mt-1.5 flex flex-col gap-1" role="radiogroup" aria-label={label(k)}>
        {fieldOptions(merged[k], names).map((o, i) => (
          <label key={i} className={`grid cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border px-2 py-1.5 text-[13px] ${i === pick ? 'border-accent bg-accent-surface' : 'border-line bg-surface'}`}>
            <input type="radio" name={`found-${k}`} id={`found-${k}-${i}`} checked={i === pick}
              className="mt-0.5 accent-[var(--color-accent)]"
              onChange={() => onPicks({ ...picks, [k]: i })} />
            <span className={k === 'description' ? 'lb-read line-clamp-4' : 'break-words'}>{o.value}</span>
            <span className="whitespace-nowrap text-[11px] text-content-muted">{o.sourceNames.join(', ')}</span>
          </label>
        ))}
      </div>
    )
  }

  return (
    <div className="lb-card space-y-3.5 p-4">
      <div className="flex gap-4">
        <div className="w-[84px] shrink-0">
          {cover
            ? <img src={cover.cover_url} alt="" referrerPolicy="no-referrer" className="aspect-[2/3] w-full rounded-md bg-surface-strong object-cover shadow-sm" />
            : <div className="aspect-[2/3] w-full rounded-md border border-dashed border-line-strong bg-surface-muted" />}
          {covers.length > 1 && (
            <button type="button" aria-expanded={open === 'cover'} onClick={() => toggle('cover')}
              className="mt-1.5 w-full text-center text-[11px] font-semibold text-accent hover:underline">
              {t('add_books.covers', { count: covers.length, defaultValue: '{{count}} covers' })}
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="lb-display min-w-0 flex-1 text-[21px] leading-tight text-content">{title || t('add_books.no_title', { defaultValue: 'No title' })}</h3>
            {answers('title')}
          </div>
          {options('title')}
          <div className="mt-1 flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[13.5px] text-content-secondary">{authors.join(', ')}</p>
            {answers('authors')}
          </div>
          {options('authors')}
          {summary && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[12px] text-content-muted">
              <span>
                {t('add_books.found_by', { names: summary.answered.map(p => p.display_name).join(', '), seconds: summary.seconds, defaultValue: 'Found by {{names}} in {{seconds}} s' })}
              </span>
              {onAskAgain && (
                <button type="button" disabled={asking} onClick={onAskAgain}
                  className="inline-flex items-center gap-1 font-semibold text-accent hover:underline disabled:opacity-50">
                  <Icon name="refresh" className={`h-3.5 w-3.5 ${asking ? 'animate-spin' : ''}`} />
                  {t('add_book.ask_again', { defaultValue: 'Ask again' })}
                </button>
              )}
            </p>
          )}
        </div>
      </div>

      {open === 'cover' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2" role="radiogroup" aria-label={t('merged.cover')}>
          {covers.map((c, i) => (
            <button key={c.cover_url} type="button" role="radio" aria-checked={i === (picks.cover ?? 0)}
              aria-label={t('merged.use_cover', { name: names[c.source] ?? c.source_display })}
              onClick={() => onPicks({ ...picks, cover: i })}
              className={`rounded-md border-2 p-0.5 text-left ${i === (picks.cover ?? 0) ? 'border-accent' : 'border-transparent'}`}>
              <img src={c.cover_url} alt="" referrerPolicy="no-referrer" className="aspect-[2/3] w-full rounded-sm bg-surface-strong object-cover" />
              <small className="block truncate text-[10px] text-content-muted">{names[c.source] ?? c.source_display}</small>
            </button>
          ))}
        </div>
      )}

      <dl className="grid gap-x-5 gap-y-2 border-t border-line pt-3 sm:grid-cols-2">
        {GRID_FIELDS.filter(k => merged[k]).map(k => (
          <div key={k} className={k === 'description' ? 'sm:col-span-2' : ''}>
            <div className="flex items-start gap-2">
              <dt className="w-[76px] shrink-0 pt-px text-[11.5px] font-semibold text-content-muted">{label(k)}</dt>
              <dd className={`min-w-0 flex-1 text-[13px] text-content ${k === 'description' ? 'lb-read line-clamp-3 text-[14px]' : 'break-words'}`}>
                {pickedValue(merged, k, picks)}
              </dd>
              {answers(k)}
            </div>
            {options(k)}
          </div>
        ))}
      </dl>
    </div>
  )
}
