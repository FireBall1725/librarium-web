// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { COLLECTION_CHANGED } from '../lib/collectionEvents'
import { formatStars, starsOf } from '../lib/rating'
import { Stars } from './StarRating'
import type { BookReader } from '../types'

/**
 * What everyone has recorded about this book, and what they make of it together.
 *
 * The review field has always been labelled "visible to members" and was then
 * shown to nobody, so the one thing a household could write for each other went
 * nowhere. Averaging the rating made the gap plain: a book reads as five stars
 * on the shelf while its own page says nothing about who thought so.
 *
 * The reader's own row is listed alongside the rest. Leaving it out meant a
 * household of two showed one opinion beside an average computed from something
 * invisible, which reads as the number being wrong.
 */
export default function BookReaders({ bookId }: { bookId: string }) {
  const { t } = useTranslation()
  const { callApi, user } = useAuth()
  const [readers, setReaders] = useState<BookReader[]>([])

  const load = useCallback(() => {
    let cancelled = false
    void callApi<{ items: BookReader[] }>(`/api/v1/books/${bookId}/readers`)
      .then(r => { if (!cancelled) setReaders(r?.items ?? []) })
      .catch(() => { if (!cancelled) setReaders([]) })
    return () => { cancelled = true }
  }, [callApi, bookId])

  useEffect(() => load(), [load])

  // Saving a rating in the panel above changes what this section says, and that
  // panel already announces it changed something. Without this the list kept
  // whatever it fetched on mount, so rating a book and pressing Save left the
  // page contradicting itself until a reload.
  useEffect(() => {
    const again = () => load()
    window.addEventListener(COLLECTION_CHANGED, again)
    return () => window.removeEventListener(COLLECTION_CHANGED, again)
  }, [load])

  if (readers.length === 0) return null

  const rated = readers.filter(r => r.rating != null)
  // The average the book is filtered by, over the same people the server
  // averages. Shown unrounded: the rail rounds because a facet needs discrete
  // buckets, not because the number is uncertain, and rounding here as well
  // would hide the difference between a book everyone likes and one nobody
  // agrees about.
  const average = rated.length > 0
    ? rated.reduce((n, r) => n + (r.rating ?? 0), 0) / rated.length
    : null

  const when = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null

  return (
    // Matching the page's own Section spacing rather than lb-eyebrow's, so this
    // sits in the rhythm of the headings around it. It cannot use Section
    // itself: the heading has to disappear with the content when nobody has
    // recorded anything, and a wrapper renders whatever it is given.
    <section className="pt-6">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
          {t('readers.title', { defaultValue: 'Reading activity' })}
        </h2>
        {average !== null && (
          <span className="flex items-center gap-1.5">
            <Stars rating={Math.round(average)} size={14} />
            <span className="text-xs tabular-nums text-content-tertiary">
              {starsOf(average).toFixed(1)}
              <span className="ml-1 text-content-faint">
                {t('readers.from', {
                  count: rated.length,
                  defaultValue: 'from 1 rating',
                  defaultValue_other: `from ${rated.length} ratings`,
                })}
              </span>
            </span>
          </span>
        )}
      </div>

      <ul className="divide-y divide-line">
        {readers.map(r => {
          const isMe = r.user_id === user?.id
          const finished = when(r.finished_at)
          return (
            <li key={r.user_id} className="py-3">
              {/* Stacked rather than crammed onto one line: name, then what
                  they did with it, then what they said. A review is prose and
                  wants a line of its own to be read as prose. */}
              <div className="text-sm font-medium text-content">
                {isMe ? t('readers.you', { defaultValue: 'You' }) : (r.display_name || r.username)}
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-tertiary">
                <span>
                  {finished
                    ? t('readers.finished', {
                        date: finished, defaultValue: `Finished ${finished}`,
                      })
                    : t(`read_status.${r.read_status}`, { defaultValue: r.read_status })}
                </span>
                {r.rating != null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1.5">
                      <Stars rating={r.rating} size={13} />
                      <span className="tabular-nums text-content-faint">{formatStars(r.rating)}</span>
                    </span>
                  </>
                )}
                {r.is_favorite && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-warning">
                      {t('readers.favourite', { defaultValue: 'Favourite' })}
                    </span>
                  </>
                )}
              </div>

              {r.review && (
                <blockquote className="font-read mt-2 border-l-2 border-line py-0.5 pl-3 text-sm leading-relaxed text-content-secondary">
                  {r.review}
                </blockquote>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
