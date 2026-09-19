// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// One merged lookup result with a picker per field. The server pre-selects
// each value from the answers (agreement, else the longest description, the
// most detailed date, the largest cover) and says why; here the person can
// switch any field to another provider's answer before importing.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ISBNLookupResult, MergedBookResult, MergedFieldResult } from '../types'
import {
  MERGED_FIELDS, fieldOptions, mergedToResult, providerNames, summariseProviders,
  type MergedFieldKey, type Picks,
} from '../lib/mergedLookup'

export default function MergedLookup({ merged, onUse }: {
  merged: MergedBookResult
  onUse: (result: ISBNLookupResult) => void
}) {
  const { t } = useTranslation()
  const [picks, setPicks] = useState<Picks>({})
  const [open, setOpen] = useState<Partial<Record<MergedFieldKey, boolean>>>({})
  const names = providerNames(merged)
  const summary = summariseProviders(merged.providers)
  const covers = merged.covers ?? []
  const coverPick = picks.cover ?? 0

  const label = (k: MergedFieldKey) => {
    switch (k) {
      case 'title': return t('merged.title', { defaultValue: 'Title' })
      case 'subtitle': return t('merged.subtitle', { defaultValue: 'Subtitle' })
      case 'authors': return t('merged.authors', { defaultValue: 'Authors' })
      case 'publisher': return t('merged.publisher', { defaultValue: 'Publisher' })
      case 'publish_date': return t('merged.published', { defaultValue: 'Published' })
      case 'page_count': return t('merged.pages', { defaultValue: 'Pages' })
      case 'language': return t('merged.language', { defaultValue: 'Language' })
      case 'isbn_13': return t('merged.isbn_13', { defaultValue: 'ISBN-13' })
      case 'isbn_10': return t('merged.isbn_10', { defaultValue: 'ISBN-10' })
      case 'description': return t('merged.description', { defaultValue: 'Description' })
    }
  }

  const why = (f: MergedFieldResult, picked: boolean, total: number) => {
    if (picked) return t('merged.why_picked', { defaultValue: 'You picked this' })
    switch (f.reason) {
      case 'agreed': return t('merged.why_agreed', { count: f.sources?.length ?? 1, total, defaultValue: '{{count}} of {{total}} agree' })
      case 'only': return t('merged.why_only', { defaultValue: 'Only one provider had this' })
      case 'longest': return t('merged.why_longest', { defaultValue: 'Longest' })
      case 'most_detail': return t('merged.why_most_detail', { defaultValue: 'Most detail' })
      case 'first': return t('merged.why_first', { defaultValue: 'No agreement, first answer' })
      default: return ''
    }
  }

  return (
    <div className="space-y-3">
      {summary && (
        <p className="text-[12.5px] text-content-muted">
          <b className="font-semibold text-content-secondary">
            {t('merged.answered', { count: summary.answered.length, seconds: summary.seconds, defaultValue: '{{count}} providers answered in {{seconds}} s' })}
          </b>
          {summary.answered.length > 0 && <>: {summary.answered.map(p => p.display_name).join(', ')}.</>}
          {summary.noRecord.length > 0 && <> {t('merged.no_record', { names: summary.noRecord.map(p => p.display_name).join(', '), defaultValue: 'No record at {{names}}.' })}</>}
          {summary.missed.length > 0 && <> {t('merged.missed', { names: summary.missed.map(p => p.display_name).join(', '), defaultValue: '{{names}} missed the deadline.' })}</>}
          {summary.failed.length > 0 && <> {t('merged.failed', { names: summary.failed.map(p => p.display_name).join(', '), defaultValue: "{{names}} didn't answer." })}</>}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        {covers.length > 0 && (
          <div className="flex flex-col gap-2">
            <img src={covers[coverPick]?.cover_url} alt="" referrerPolicy="no-referrer"
              className="aspect-[2/3] w-full rounded-md bg-surface-strong object-cover shadow-sm" />
            {covers.length > 1 && (
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('merged.cover', { defaultValue: 'Cover' })}>
                {covers.map((c, i) => (
                  <button key={c.cover_url} type="button" role="radio" aria-checked={i === coverPick}
                    onClick={() => setPicks(p => ({ ...p, cover: i }))}
                    aria-label={t('merged.use_cover', { name: names[c.source] ?? c.source_display, defaultValue: 'Use the {{name}} cover' })}
                    className={`flex flex-col gap-0.5 rounded-md border-2 p-0.5 text-left ${i === coverPick ? 'border-accent' : 'border-transparent'}`}>
                    <img src={c.cover_url} alt="" referrerPolicy="no-referrer" className="aspect-[2/3] w-full rounded-sm bg-surface-strong object-cover" />
                    <small className="text-[10px] leading-tight text-content-muted">
                      {names[c.source] ?? c.source_display}
                      {c.width && c.height ? <><br />{c.width} × {c.height}</> : null}
                    </small>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-content-muted">
              {picks.cover !== undefined
                ? t('merged.why_picked', { defaultValue: 'You picked this' })
                : merged.cover_reason === 'largest' ? t('merged.cover_largest', { defaultValue: 'Largest cover' }) : ''}
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-line bg-surface-raised">
          {MERGED_FIELDS.filter(k => merged[k]).map(k => {
            const f = merged[k]!
            const opts = fieldOptions(f, names)
            const pick = picks[k] ?? 0
            const chosen = opts[pick] ?? opts[0]
            const total = opts.reduce((n, o) => n + o.sources.length, 0)
            const single = opts.length === 1
            const radio = `merged-${k}`
            return (
              <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-start gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
                <div className="pt-0.5 text-xs font-semibold text-content-secondary">{label(k)}</div>
                <div className="min-w-0 text-sm text-content">
                  <span className={k === 'description' ? 'lb-read line-clamp-3 text-[14.5px]' : 'break-words'}>{chosen.value}</span>
                  <span className="mt-0.5 block text-[11.5px] text-content-muted">
                    {t('merged.from', { names: chosen.sourceNames.join(', '), defaultValue: 'From {{names}}' })}
                    {why(f, pick !== 0, total) && <> · {why(f, pick !== 0, total)}</>}
                  </span>
                </div>
                {single
                  ? (chosen.sources.length > 1 && <span className="whitespace-nowrap pt-0.5 text-[11.5px] font-semibold text-success">{t('merged.all_agree', { defaultValue: 'All agree' })}</span>)
                  : (
                    <button type="button" className="lb-btn ghost sm whitespace-nowrap" aria-expanded={!!open[k]}
                      onClick={() => setOpen(o => ({ ...o, [k]: !o[k] }))}>
                      {t('merged.answers', { count: opts.length, defaultValue: '{{count}} answers' })}
                    </button>
                  )}
                {!single && open[k] && (
                  <div className="col-span-2 col-start-2 flex flex-col gap-1.5" role="radiogroup" aria-label={label(k)}>
                    {opts.map((o, i) => (
                      <label key={i} className={`grid cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-lg border px-2.5 py-2 text-[13.5px] ${i === pick ? 'border-accent bg-accent-surface' : 'border-line bg-surface'}`}>
                        <input type="radio" name={radio} id={`${radio}-${i}`} checked={i === pick} className="mt-0.5 accent-[var(--color-accent)]"
                          onChange={() => setPicks(p => ({ ...p, [k]: i }))} />
                        <span className={k === 'description' ? 'lb-read line-clamp-4' : 'break-words'}>{o.value}</span>
                        <span className="whitespace-nowrap text-[11.5px] text-content-muted">{o.sourceNames.join(', ')}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-[12.5px] text-content-muted">
          {summary
            ? t('merged.kept', { count: summary.answered.length, defaultValue: "Every provider's answer is kept with the edition, so you can switch any field later." })
            : ''}
        </span>
        <button type="button" className="lb-btn" onClick={() => onUse(mergedToResult(merged, picks))}>
          {t('merged.use', { defaultValue: 'Use these details' })}
        </button>
      </div>
    </div>
  )
}
