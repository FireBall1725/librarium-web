// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { COLLECTION_CHANGED } from '../lib/collectionEvents'
import type { Book, BookContent, PagedBooks } from '../types'

/**
 * What this book contains, and what contains it.
 *
 * A three-in-one is a book like any other, so it sat at the position of the
 * first volume it held, beside the single volume of the same number, and
 * nothing said it contained anything. Owning it did not count as owning volumes
 * one to three, so the rail offered to find someone books already on their
 * shelf and a complete run reported holes.
 *
 * The server has understood containment since migration 25 and has had routes
 * for it just as long. Nothing wrote a row, so the rule had nothing to walk.
 * This is the surface that fills the table.
 */
export default function BookContents({ bookId, libraryId }: { bookId: string; libraryId: string }) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const [contents, setContents] = useState<BookContent[]>([])
  const [containers, setContainers] = useState<BookContent[]>([])
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Book[]>([])
  const [picked, setPicked] = useState<Book | null>(null)
  const [position, setPosition] = useState('')

  const load = useCallback(() => {
    let cancelled = false
    const both = [
      callApi<{ items: BookContent[] }>(`/api/v1/books/${bookId}/contents`),
      callApi<{ items: BookContent[] }>(`/api/v1/books/${bookId}/containers`),
    ]
    void Promise.all(both)
      .then(([inside, outside]) => {
        if (cancelled) return
        setContents(inside?.items ?? [])
        setContainers(outside?.items ?? [])
      })
      // A server older than these routes 404s. Say nothing rather than putting
      // an error on a page whose every other section loaded.
      .catch(() => { if (!cancelled) { setContents([]); setContainers([]) } })
    return () => { cancelled = true }
  }, [callApi, bookId])

  useEffect(() => load(), [load])

  // Debounced, and skipped once something is picked so the list does not
  // reappear over the choice. The same shape LoanFormModal uses.
  useEffect(() => {
    if (picked || !query.trim()) { setResults([]); return }
    const timer = setTimeout(() => {
      void callApi<PagedBooks>(
        `/api/v1/libraries/${libraryId}/books?q=${encodeURIComponent(query)}&per_page=10`,
      )
        .then(r => setResults((r?.items ?? []).filter(b => b.id !== bookId)))
        .catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, picked, callApi, libraryId, bookId])

  const reset = () => { setAdding(false); setQuery(''); setResults([]); setPicked(null); setPosition('') }

  const add = async () => {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      await callApi(`/api/v1/books/${bookId}/contents`, {
        method: 'POST',
        body: JSON.stringify({
          contained_id: picked.id,
          position: position.trim() !== '' ? Number(position) : contents.length + 1,
        }),
      })
      reset()
      load()
      // Ownership resolves through containment, so a new link changes what the
      // rail counts and what a series calls missing. Anything listening for a
      // collection change has to hear about it.
      window.dispatchEvent(new Event(COLLECTION_CHANGED))
    } catch (e) {
      // A cycle comes back as a 409 with prose that reads as a sentence, so
      // show what the server said rather than a house error.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (containedID: string) => {
    setBusy(true)
    setError(null)
    try {
      await callApi(`/api/v1/books/${bookId}/contents/${containedID}`, { method: 'DELETE' })
      load()
      window.dispatchEvent(new Event(COLLECTION_CHANGED))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {contents.length > 0 && (
        <ol className="space-y-1">
          {contents.map(c => (
            <li key={c.contained_id}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="w-8 flex-none text-xs tabular-nums text-content-faint">
                {formatPosition(c.position)}
              </span>
              <Link to={`/libraries/${libraryId}/books/${c.contained_id}`}
                className="min-w-0 flex-1 truncate text-sm text-content hover:text-accent">
                {c.title}
              </Link>
              <button type="button" disabled={busy} onClick={() => void remove(c.contained_id)}
                aria-label={t('book_contents.remove', {
                  title: c.title, defaultValue: `Remove ${c.title}`,
                })}
                className="flex-none rounded px-2 py-0.5 text-sm text-content-faint hover:bg-surface-inset hover:text-danger">
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      {adding ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              className="lb-field flex-1"
              style={{ minWidth: '12rem' }}
              value={picked ? picked.title : query}
              disabled={busy}
              onChange={e => { setPicked(null); setQuery(e.target.value) }}
              onKeyDown={e => { if (e.key === 'Escape') reset() }}
              placeholder={t('book_contents.find', { defaultValue: 'Which volume is inside?' })}
              aria-label={t('book_contents.find', { defaultValue: 'Which volume is inside?' })}
            />
            <input
              type="number"
              step="0.5"
              min="0"
              className="lb-field"
              style={{ width: '6rem' }}
              value={position}
              disabled={busy}
              onChange={e => setPosition(e.target.value)}
              placeholder={t('book_contents.position', { defaultValue: 'Order' })}
              aria-label={t('book_contents.position', { defaultValue: 'Order' })}
            />
            <button type="button" className="lb-btn sm" disabled={busy || !picked}
              onClick={() => void add()}>
              {t('common.save', { defaultValue: 'Save' })}
            </button>
            <button type="button" className="lb-btn ghost sm" onClick={reset}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>

          {results.length > 0 && (
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-line bg-surface">
              {results.map(b => (
                <li key={b.id}>
                  <button type="button"
                    onClick={() => { setPicked(b); setResults([]) }}
                    className="block w-full truncate px-3 py-2 text-left text-sm text-content hover:bg-surface-inset">
                    {b.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setAdding(true)}
          className="rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-sm text-content-tertiary hover:bg-surface-inset"
        >
          {t('book_contents.add', { defaultValue: '+ Record what this contains' })}
        </button>
      )}

      {/* The other direction, last, because the section is headed for this
          book's own contents and reading "also in" first under that heading
          says the opposite of what it means. */}
      {containers.length > 0 && (
        <p className="text-sm text-content-tertiary">
          {t('book_contents.inside', { defaultValue: 'Also in:' })}{' '}
          {containers.map((c, i) => (
            <span key={c.container_id}>
              {i > 0 && ', '}
              <Link to={`/libraries/${libraryId}/books/${c.container_id}`}
                className="text-accent hover:underline">
                {c.title}
              </Link>
            </span>
          ))}
        </p>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

/** 3 rather than 3.0, and 4.5 kept. The rule the series section already uses. */
const formatPosition = (pos: number) => (pos % 1 === 0 ? pos.toFixed(0) : pos.toFixed(1))
