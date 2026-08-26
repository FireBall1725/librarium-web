// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { Stars } from './StarRating'
import type { BookReader } from '../types'

/**
 * What everyone else has recorded about this book.
 *
 * The review field has always been labelled "visible to members" and was then
 * shown to nobody, so the one thing a household could write for each other went
 * nowhere. Averaging the rating made the gap plain: a book reads as five stars
 * on the shelf while its own page says nothing about who thought so.
 *
 * The caller's own row is left out. It is already on the page, above, in a form
 * they can edit.
 */
export default function BookReaders({ bookId }: { bookId: string }) {
  const { t } = useTranslation()
  const { callApi, user } = useAuth()
  const [readers, setReaders] = useState<BookReader[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void callApi<{ items: BookReader[] }>(`/api/v1/books/${bookId}/readers`)
      .then(r => { if (!cancelled) setReaders(r?.items ?? []) })
      .catch(() => { if (!cancelled) setReaders([]) })
    return () => { cancelled = true }
  }, [callApi, bookId])

  const others = (readers ?? []).filter(r => r.user_id !== user?.id)
  // Nothing to say rather than an empty heading. On a one-person library this
  // is always the case, and a section promising other people's opinions is
  // noise when there is nobody else.
  if (others.length === 0) return null

  const when = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null

  return (
    // Matching the page's own Section spacing rather than lb-eyebrow's, so this
    // sits in the rhythm of the headings around it. It cannot use Section
    // itself: the heading has to disappear with the content when there is
    // nobody else, and a wrapper renders whatever it is given.
    <section className="pt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
        {t('readers.title', { defaultValue: 'Reading activity' })}
      </h2>
      <ul className="divide-y divide-line">
      {others.map(r => (
        <li key={r.user_id} className="flex gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-content">
                {r.display_name || r.username}
              </span>
              {r.rating != null && <Stars rating={r.rating} size={13} />}
              <span className="text-xs text-content-tertiary">
                {t(`read_status.${r.read_status}`, { defaultValue: r.read_status })}
                {when(r.finished_at) && ` · ${t('readers.finished', {
                  date: when(r.finished_at), defaultValue: `finished ${when(r.finished_at)}`,
                })}`}
              </span>
            </div>
            {/* Quoted, because it is somebody else's words on a page otherwise
                full of the reader's own. */}
            {r.review && (
              <blockquote className="font-read mt-1.5 border-l-2 border-line pl-3 text-sm text-content-secondary">
                {r.review}
              </blockquote>
            )}
          </div>
        </li>
        ))}
      </ul>
    </section>
  )
}
