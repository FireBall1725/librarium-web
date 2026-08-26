// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { announceListsChanged, fetchLists, listHref, type SavedList } from '../lib/lists'

/**
 * The lists a book is on, and the controls to change that.
 *
 * The page used to render this read-only, and hide the section entirely when
 * the book was on nothing, so the first list could never be added from the page
 * for the book it is about. Filing one book is the common case; the bulk bar
 * covers a selection.
 */
export default function BookLists({
  bookId, lists, onChanged,
}: {
  bookId: string
  /** The lists this book is already on. */
  lists: SavedList[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const [all, setAll] = useState<SavedList[]>([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // Every manual list this person can see, so the picker can offer the ones
  // this book is not on yet.
  useEffect(() => {
    let cancelled = false
    void fetchLists(callApi)
      .then(rows => { if (!cancelled) setAll(rows.filter(l => l.kind === 'manual')) })
      .catch(() => { /* The pills still render; only the picker is lost. */ })
    return () => { cancelled = true }
  }, [callApi])

  useEffect(() => { if (adding) input.current?.focus() }, [adding])

  const on = new Set(lists.map(l => l.id))
  const available = all.filter(l => !on.has(l.id))

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      onChanged()
      announceListsChanged()
    } catch {
      // Said out loud rather than swallowed. A pill that quietly fails to
      // appear reads as the click not registering.
      setError(t('book_lists.failed', { defaultValue: 'That did not save' }))
    } finally {
      setBusy(false)
    }
  }

  const add = (listId: string) =>
    run(() => callApi(`/api/v1/me/lists/${listId}/books/${bookId}`, { method: 'POST' }))

  const remove = (listId: string) =>
    run(() => callApi(`/api/v1/me/lists/${listId}/books/${bookId}`, { method: 'DELETE' }))

  /**
   * Make a list and put this book on it.
   *
   * One step, because an empty list is not something anyone wants: the facet
   * only shows lists that have books, so a list created and left empty is
   * invisible everywhere except Settings.
   */
  const createAndAdd = async () => {
    const name = draft.trim()
    if (!name) { setAdding(false); return }
    setDraft('')
    setAdding(false)
    await run(async () => {
      const made = await callApi<SavedList>('/api/v1/me/lists', {
        method: 'POST',
        body: JSON.stringify({ name, kind: 'manual', visibility: 'private' }),
      })
      if (!made?.id) throw new Error('no list came back')
      await callApi(`/api/v1/me/lists/${made.id}/books/${bookId}`, { method: 'POST' })
      setAll(prev => [...prev, made])
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {lists.map(l => (
        <span key={l.id}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-3 pr-1.5 text-sm text-content-secondary">
          <Link to={listHref(l)} className="hover:text-content">{l.name}</Link>
          <button type="button" disabled={busy} onClick={() => void remove(l.id)}
            title={t('book_lists.remove', { defaultValue: 'Take off this list' })}
            aria-label={t('book_lists.remove_named', {
              name: l.name, defaultValue: `Take off ${l.name}`,
            })}
            className="rounded px-1 text-content-faint hover:bg-surface-inset hover:text-danger">
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <input
          ref={input}
          value={draft}
          disabled={busy}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => void createAndAdd()}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); void createAndAdd() }
            if (e.key === 'Escape') { setDraft(''); setAdding(false) }
          }}
          placeholder={t('book_lists.new_placeholder', { defaultValue: 'Name a new list…' })}
          aria-label={t('book_lists.new', { defaultValue: 'New list' })}
          className="rounded-lg border border-accent bg-surface px-3 py-1.5 text-sm text-content placeholder:text-content-muted focus:outline-none"
        />
      ) : (
        // A select rather than a menu, so the keyboard reaches it and typing
        // jumps to a name. The last option makes a list instead of choosing
        // one, which is the same act from the reader's side.
        <select
          disabled={busy}
          value=""
          onChange={e => {
            const v = e.target.value
            e.target.value = ''
            if (v === '__new__') { setAdding(true); return }
            if (v) void add(v)
          }}
          className="rounded-lg border border-dashed border-line-strong bg-transparent px-3 py-1.5 text-sm text-content-tertiary hover:bg-surface-inset"
        >
          <option value="">{t('book_lists.add', { defaultValue: '+ Add to list' })}</option>
          {available.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          <option value="__new__">{t('book_lists.new', { defaultValue: 'New list…' })}</option>
        </select>
      )}

      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
