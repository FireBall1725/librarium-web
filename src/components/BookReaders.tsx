// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { COLLECTION_CHANGED } from '../lib/collectionEvents'
import { formatStars, starsOf } from '../lib/rating'
import AuthorAvatar from './AuthorAvatar'
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
    <section className="pt-6">
      {/* A card, matching the mockup on librarium-web#41 and the cards this
          page already uses for editions and copies. The section it replaced
          was flat text against the page, which read as a footnote rather than
          as the other half of the reading panel above. */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-content">
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
            // Who they are, and what to call them. The avatar keys on the
            // former so it matches the one in the rail; the row says the
            // latter, because "You" reads better than your own name on a page
            // you are already looking at.
            const who = r.display_name || r.username
            const label = isMe ? t('readers.you', { defaultValue: 'You' }) : who
            const finished = when(r.finished_at)
            return (
              <li
                key={r.user_id}
                // Columns on a wide screen, stacked on a narrow one. The rating
                // column is fixed so the numbers line up down the card, which
                // is the point of giving it a column at all.
                className="grid grid-cols-1 gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(0,14rem)_7rem_minmax(0,1fr)]"
              >
                <div className="flex items-center gap-2.5">
                  {/* The same avatar the rail draws for the signed-in account.
                      Keyed on the person's name, not on the word beside it, or
                      the reader's own row shows a Y for "You" in a colour their
                      avatar never uses anywhere else. */}
                  {/* Wrapped, because AuthorAvatar carries mx-auto for the
                      places that centre it in a column. As a flex item that
                      auto margin eats the row's free space, so the avatar drank
                      whatever the name beside it left over and every row landed
                      at a different x. A shrink-to-fit box leaves it none. */}
                  <span className="flex-none">
                    <AuthorAvatar name={who} size={32} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-content">{label}</span>
                    <span className="block text-xs text-content-tertiary">
                      {finished
                        ? t('readers.finished', { date: finished, defaultValue: `Finished ${finished}` })
                        : t(`read_status.${r.read_status}`, { defaultValue: r.read_status })}
                    </span>
                  </span>
                </div>

                <div className="min-w-0">
                  {r.rating != null ? (
                    <>
                      <span className="block text-xs text-content-tertiary">
                        {t('readers.rating', { defaultValue: 'Rating' })}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Stars rating={r.rating} size={12} />
                        <span className="text-xs tabular-nums text-content-secondary">
                          {formatStars(r.rating)}
                        </span>
                      </span>
                    </>
                  ) : (
                    r.is_favorite && (
                      <span className="text-xs text-warning">
                        {t('readers.favourite', { defaultValue: 'Favourite' })}
                      </span>
                    )
                  )}
                </div>

                {r.review && (
                  <div className="flex min-w-0 gap-2">
                    {/* The quote mark from the mockup. Decorative, so it is
                        hidden from a screen reader, which gets the blockquote
                        instead. */}
                    <span
                      aria-hidden="true"
                      className="flex-none font-serif text-2xl leading-none text-content-faint"
                      // Nudged down so it sits beside the first line rather
                      // than floating above it: a quote mark's glyph hangs from
                      // the cap height, which puts it a third of a line high.
                      style={{ marginTop: '0.15rem' }}
                    >
                      &ldquo;
                    </span>
                    <blockquote className="font-read min-w-0 text-sm leading-relaxed text-content-secondary">
                      {r.review}
                    </blockquote>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
