// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Authors: everyone with books in the libraries the caller can read.
//
// A fluid index rather than a list. The old per-library authors view was a
// fixed-width column stranded on the left of a wide window; this keeps filling
// the row as the window grows, which is what makes a large collection feel
// browsable rather than scrolled.

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import AlphabetBar from '../components/AlphabetBar'
import AuthorAvatar from '../components/AuthorAvatar'
import BookCover from '../components/BookCover'
import { usePageTitle } from '../hooks/usePageTitle'
import type { AuthorIndexEntry } from '../types'

type SortMode = 'name' | 'count'

export default function AuthorsPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('nav.authors', { defaultValue: 'Authors' }))

  const [params, setParams] = useSearchParams()
  const letter = params.get('letter')
  const sort: SortMode = params.get('sort') === 'count' ? 'count' : 'name'
  // Carried from the retired per-library Contributors page. The server does the
  // narrowing, because filtering here would print a count for authors the
  // caller was never sent.
  const lib = params.get('lib')

  const [authors, setAuthors] = useState<AuthorIndexEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const query = lib ? `?lib=${encodeURIComponent(lib)}` : ''
    callApi<{ items: AuthorIndexEntry[] }>(`/api/v1/me/authors/index${query}`)
      .then(res => { if (!cancelled) setAuthors(res.items ?? []) })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setAuthors([]) } })
    return () => { cancelled = true }
  }, [callApi, lib])

  // Derived, not stored. The letters the bar can offer are a property of the
  // data, so recomputing them beats holding a second copy that can go stale.
  const available = useMemo(
    () => new Set((authors ?? []).map(a => a.letter)),
    [authors]
  )

  const shown = useMemo(() => {
    const list = (authors ?? []).filter(a => !letter || a.letter === letter)
    if (sort === 'count') {
      // Ties break on the sort name, so equal-sized authors keep a stable and
      // meaningful order rather than whatever the server happened to return.
      return [...list].sort(
        (x, y) => y.book_count - x.book_count || x.sort_name.localeCompare(y.sort_name)
      )
    }
    return list
  }, [authors, letter, sort])

  // The library's own name, taken from the rows already on screen rather than
  // fetched: every author in a scoped result carries it. Undefined only when
  // the scope matched nothing, which is the one case with no row to read.
  const scopeName = useMemo(() => {
    if (!lib) return null
    for (const a of authors ?? []) {
      const found = a.libraries?.find(l => l.id === lib)
      if (found) return found.name
    }
    return null
  }, [authors, lib])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  // The library scope rides along, so following an author out of a scoped
  // Authors page does not quietly widen back to every library.
  const booksHref = (a: AuthorIndexEntry) =>
    lib
      ? `/books?lib=${encodeURIComponent(lib)}&q=${encodeURIComponent(a.name)}`
      : `/books?q=${encodeURIComponent(a.name)}`

  return (
    <>
      <PageHeader
        title={t('nav.authors', { defaultValue: 'Authors' })}
        description={
          authors === null
            ? undefined
            : t('authors.count', {
                count: authors.length,
                defaultValue: '{{count}} on your shelves',
              })
        }
      />

      <div className="px-8 py-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* A scoped page that looks unscoped is the bug worth avoiding here:
            arriving from the retired per-library page shows 33 where the rail
            says 55, and without this there is nothing to explain the gap or
            any way back. */}
        {lib && (
          <button type="button" className="lb-chip on"
            onClick={() => setParam('lib', null)}
            title={t('authors.clear_library', { defaultValue: 'Show every library' })}>
            {scopeName ?? t('authors.one_library', { defaultValue: 'One library' })} ×
          </button>
        )}
        <AlphabetBar available={available} active={letter} onSelect={v => setParam('letter', v)} />
        <span className="flex-1" />
        <div className="flex gap-1.5">
          {(['name', 'count'] as SortMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              aria-pressed={sort === mode}
              onClick={() => setParam('sort', mode === 'name' ? null : mode)}
              className={`rounded-full border px-2.5 py-[3px] text-[11px] transition-colors ${
                sort === mode
                  ? 'border-accent-line bg-accent-surface text-accent'
                  : 'border-line-strong text-content-tertiary hover:bg-surface-inset'
              }`}
            >
              {mode === 'name'
                ? t('authors.sort_name', { defaultValue: 'A–Z' })
                : t('authors.sort_count', { defaultValue: 'Most books' })}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-6 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {authors === null && (
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-3.5">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl border border-line bg-surface-inset" />
          ))}
        </div>
      )}

      {authors !== null && shown.length === 0 && !error && (
        <p className="font-display mt-12 text-center text-xl text-content-secondary">
          {letter
            ? t('authors.none_under', { letter, defaultValue: 'No authors under {{letter}}' })
            : t('authors.none', { defaultValue: 'No authors yet' })}
        </p>
      )}

      {authors !== null && shown.length > 0 && (
        <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-3.5">
          {shown.map(a => (
            <li key={a.id}
              className="rounded-xl border border-line bg-surface-raised p-4 pb-3.5 text-center transition-colors hover:border-line-strong">
              <Link to={booksHref(a)} className="group block">
                <AuthorAvatar name={a.name} photoUrl={a.photo_url} />
                <span className="font-display mt-2.5 block text-[19px] font-semibold leading-tight text-balance text-content group-hover:text-accent">
                  {a.name}
                </span>
                <span className="mt-0.5 block text-[11.5px] tabular-nums text-content-muted">
                  {t('authors.books_count', { count: a.book_count, defaultValue: '{{count}} books' })}
                  {' · '}
                  {t('authors.read_count', { count: a.read_count, defaultValue: '{{count}} read' })}
                </span>
                {/* Progress through an author, which is the question an author
                    card is actually asked: how much of them have I read. */}
                <span className="mx-auto mt-2.5 block h-[3px] max-w-[130px] overflow-hidden rounded-full bg-surface-strong">
                  <span className="block h-full bg-accent"
                    style={{ width: `${a.book_count ? (a.read_count / a.book_count) * 100 : 0}%` }} />
                </span>
                <span className="mt-3 flex justify-center gap-1.5">
                  {a.spines.map(s => (
                    <BookCover
                      key={s.book_id}
                      title={s.title}
                      coverUrl={s.cover_url}
                      seed={a.name}
                      hideLabel
                      className="w-[30px]"
                      innerClassName="shadow-none"
                    />
                  ))}
                </span>
              </Link>
              {a.libraries.length > 0 && (
                <span className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {a.libraries.map(l => (
                    <Link
                      key={l.id}
                      to={`/books?lib=${l.id}&q=${encodeURIComponent(a.name)}`}
                      className="rounded-full border border-line-strong px-2.5 py-[3px] text-[11px] text-content-tertiary transition-colors hover:bg-surface-inset hover:text-content"
                    >
                      {l.name}
                    </Link>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
    </>
  )
}
