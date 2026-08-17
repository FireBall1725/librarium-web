// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Who has your books.
//
// A loan is a book, a person and some dates. The library is where the book
// happens to live, which is why the old per-library page never showed it in a
// row: it was the one column that told you nothing. Nobody asks "who has my
// stuff" one library at a time, so this is the whole set.
//
// Deliberately not a view on Books, which the redesign doc originally proposed.
// A view on Books lists books, and the useful list here has a row per loan:
// a book lent to two people over a year is one book and two loans, and the
// borrower and the due date are what the row is for.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import LoanFormModal from '../components/LoanFormModal'
import LibraryPickerDialog from '../components/LibraryPickerDialog'
import { ConfirmDialog } from '../components/Dialog'
import { usePageTitle } from '../hooks/usePageTitle'
import { libraryColour } from '../lib/libraryColour'
import { NO_AUTOFILL } from '../lib/formHints'
import type { Library, Loan } from '../types'

type Status = 'active' | 'returned' | 'all'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The date part of whatever the API sent.
 *
 * due_date and returned_at are DATE columns, but they arrive as full RFC3339
 * timestamps because Go marshals time.Time that way. Comparing or printing the
 * raw string gets you "2026-08-07T00:00:00Z" in the middle of a sentence.
 */
const dayOnly = (iso: string) => iso.slice(0, 10)

/** For display. Parsed as local noon so a timezone west of UTC cannot shift the
 *  date back a day, which is the classic off-by-one on a date-only value. */
const formatDay = (iso: string) =>
  new Date(`${dayOnly(iso)}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

/** Past its due date and not back yet. Returned loans are never overdue. */
const isOverdue = (l: Loan) =>
  !l.returned_at && !!l.due_date && dayOnly(l.due_date) < today()

/**
 * How long a loan has left, or how late it is.
 *
 * Days rather than a date, because the question a loans list answers is "which
 * of these needs chasing", and "11 days over" answers it where "due 6 August"
 * makes the reader do the arithmetic.
 */
function dueLabel(l: Loan, t: (k: string, o?: Record<string, unknown>) => string): string | null {
  if (l.returned_at) return null
  if (!l.due_date) return null
  const days = Math.round(
    (new Date(`${dayOnly(l.due_date)}T12:00:00`).getTime() -
      new Date(`${today()}T12:00:00`).getTime()) / 86_400_000
  )
  if (days < 0) return t('loans.overdue_by', { count: -days, defaultValue: `${-days} days over` })
  if (days === 0) return t('loans.due_today', { defaultValue: 'Due today' })
  return t('loans.due_in', { count: days, defaultValue: `Due in ${days} days` })
}

export default function LoansPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('nav.loans', { defaultValue: 'Loans' }))

  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as Status) || 'active'
  const overdueOnly = params.get('overdue') === '1'
  const query = params.get('q') ?? ''
  const libFilter = params.get('lib') ?? ''

  const [loans, setLoans] = useState<Loan[] | null>(null)
  const [libraries, setLibraries] = useState<Library[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Loan | null>(null)
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [pickingLibrary, setPickingLibrary] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Loan | null>(null)

  /**
   * Start a loan, asking which library only when the answer isn't already known.
   *
   * One library, or the list filtered to one, means the reader has already said
   * where the book is; asking again would be a dialog whose only option is the
   * one they picked. Otherwise the picker runs, and it is the same dialog the
   * book page uses for the same question.
   */
  const startLoan = useCallback(() => {
    if (libFilter) { setCreatingIn(libFilter); return }
    if (libraries.length === 1) { setCreatingIn(libraries[0].id); return }
    setPickingLibrary(true)
  }, [libFilter, libraries])

  useEffect(() => {
    let cancelled = false
    callApi<Library[]>('/api/v1/libraries')
      .then(l => { if (!cancelled) setLibraries(l ?? []) })
      .catch(() => { if (!cancelled) setLibraries([]) })
    return () => { cancelled = true }
  }, [callApi])

  const load = useCallback(async () => {
    const q = new URLSearchParams()
    if (status !== 'active') q.set('include_returned', 'true')
    if (overdueOnly) q.set('overdue', 'true')
    if (query) q.set('q', query)
    if (libFilter) q.set('lib', libFilter)
    try {
      const res = await callApi<{ items: Loan[] }>(`/api/v1/me/loans?${q}`)
      // The endpoint has no "returned only" mode: it either excludes returned
      // loans or includes them. Narrowing here keeps that one parameter honest
      // instead of adding a second that means almost the same thing.
      const items = res.items ?? []
      setLoans(status === 'returned' ? items.filter(l => l.returned_at) : items)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      setLoans([])
    }
  }, [callApi, status, overdueOnly, query, libFilter])

  useEffect(() => { void load() }, [load])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const markReturned = async (l: Loan) => {
    try {
      await callApi(`/api/v1/libraries/${l.library_id}/loans/${l.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          loaned_to: l.loaned_to,
          // The date part, not the timestamp the API sent. The API now accepts
          // both, but sending back what it documents means this does not depend
          // on that tolerance.
          due_date: l.due_date ? dayOnly(l.due_date) : null,
          returned_at: today(),
          notes: l.notes,
        }),
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  const remove = async (l: Loan) => {
    try {
      await callApi(`/api/v1/libraries/${l.library_id}/loans/${l.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  const outstanding = (loans ?? []).filter(l => !l.returned_at).length
  const overdue = (loans ?? []).filter(isOverdue).length

  return (
    <>
      <PageHeader
        title={t('nav.loans', { defaultValue: 'Loans' })}
        description={t('loans.description', {
          defaultValue: 'Books that are out of the house, across every library.',
        })}
      />

      <div className="px-8 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-content-muted">
          <span className="tabular-nums">
            {loans === null
              ? t('common.loading', { defaultValue: 'Loading…' })
              : overdue > 0
                // The overdue count leads when there is one. It is the only
                // number on this page that asks the reader to do something.
                ? t('loans.count_overdue', {
                    count: outstanding, overdue,
                    defaultValue: `${outstanding} out, ${overdue} overdue`,
                  })
                : t('loans.count', {
                    count: outstanding,
                    defaultValue: `${outstanding} out`,
                  })}
          </span>

          <input
            className="lb-field"
            style={{ width: '16rem' }}
            defaultValue={query}
            onChange={e => setParam('q', e.target.value)}
            placeholder={t('loans.search', { defaultValue: 'Borrower or title…' })}
            aria-label={t('loans.search', { defaultValue: 'Borrower or title…' })}
            {...NO_AUTOFILL}
          />

          <div className="flex gap-1">
            {(['active', 'returned', 'all'] as Status[]).map(s => (
              <button key={s} type="button"
                className={`lb-chip ${status === s ? 'on' : ''}`}
                onClick={() => setParam('status', s === 'active' ? null : s)}>
                {t(`loans.status_${s}`, { defaultValue: s })}
              </button>
            ))}
          </div>

          <button type="button"
            className={`lb-chip ${overdueOnly ? 'on' : ''}`}
            onClick={() => setParam('overdue', overdueOnly ? null : '1')}>
            {t('loans.overdue_only', { defaultValue: 'Overdue' })}
          </button>

          {libraries.length > 1 && (
            <select className="lb-field" style={{ width: 'auto' }}
              value={libFilter}
              onChange={e => setParam('lib', e.target.value)}
              aria-label={t('facets.library', { defaultValue: 'Library' })}>
              <option value="">{t('loans.all_libraries', { defaultValue: 'All libraries' })}</option>
              {libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}

          <span className="flex-1" />

          {/* A loan is recorded against one library, because that is where the
              book is. With several, the reader says which before the book
              search can mean anything — but that question belongs in the flow,
              not in the control. This was a select whose first option was its
              own label, which put the page's primary action in the same shape,
              size and place as the library filter three controls to its left:
              two identical dropdowns, one of which quietly created something. */}
          {libraries.length > 0 && (
            <button type="button" className="lb-btn sm" onClick={startLoan}>
              {t('loans.new', { defaultValue: 'New loan' })}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger-strong">
            {error}
          </div>
        )}

        {loans !== null && loans.length === 0 && (
          <div className="py-16 text-center">
            <p className="font-display text-2xl text-content-secondary">
              {t('loans.empty', { defaultValue: 'Nothing is out' })}
            </p>
          </div>
        )}

        {loans !== null && loans.length > 0 && (
          <ul>
            {loans.map(l => (
              <li key={l.id} className="lb-rowitem flex-wrap">
                {/* basis-full below sm: the row carries a chip and three
                    buttons, which on a phone left the title 35px of a 376px
                    row and truncated it to "Im…". Its own line instead, with
                    the actions wrapping beneath. */}
                <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <Link to={`/libraries/${l.library_id}/books/${l.book_id}`}
                    className="lb-display block truncate text-[16.5px] leading-tight text-content hover:text-accent">
                    {l.book_title}
                  </Link>
                  <span className="block truncate text-[11px] text-content-tertiary">
                    {t('loans.to', { name: l.loaned_to, defaultValue: `Lent to ${l.loaned_to}` })}
                    {l.library_name && (
                      <>
                        {' · '}
                        <span className="inline-block h-[7px] w-[7px] rounded-[2px] align-middle"
                          style={{ background: libraryColour(l.library_id) }} />
                        {' '}{l.library_name}
                      </>
                    )}
                    {l.notes && ` · ${l.notes}`}
                  </span>
                </span>

                {l.returned_at ? (
                  <span className="lb-chip good flex-none">
                    {t('loans.returned_on', {
                      date: formatDay(l.returned_at),
                      defaultValue: `Back ${formatDay(l.returned_at)}`,
                    })}
                  </span>
                ) : (
                  <>
                    {dueLabel(l, t) && (
                      <span className={`lb-chip flex-none ${isOverdue(l) ? 'warn' : ''}`}>
                        {dueLabel(l, t)}
                      </span>
                    )}
                    <button type="button" className="lb-btn ghost sm flex-none"
                      onClick={() => void markReturned(l)}>
                      {t('loans.mark_returned', { defaultValue: 'Returned' })}
                    </button>
                  </>
                )}

                <button type="button" className="lb-btn ghost sm flex-none"
                  onClick={() => setEditing(l)}>
                  {t('common.edit', { defaultValue: 'Edit' })}
                </button>
                <button type="button" className="lb-btn ghost sm flex-none"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => setConfirmDelete(l)}>
                  {t('common.delete', { defaultValue: 'Delete' })}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LibraryPickerDialog
        open={pickingLibrary}
        libraries={libraries}
        title={t('loans.pick_library_title', { defaultValue: 'Lend from which library?' })}
        description={t('loans.pick_library_description', {
          defaultValue: 'A loan is recorded against the library holding the book.',
        })}
        onPick={id => { setPickingLibrary(false); setCreatingIn(id) }}
        onCancel={() => setPickingLibrary(false)}
      />

      {(editing || creatingIn) && (
        <LoanFormModal
          libraryId={editing ? editing.library_id : creatingIn!}
          loan={editing}
          onClose={() => { setEditing(null); setCreatingIn(null) }}
          onSaved={() => { setEditing(null); setCreatingIn(null); void load() }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('loans.delete_title', {
          title: confirmDelete?.book_title ?? '',
          defaultValue: `Delete this loan?`,
        })}
        description={t('loans.delete_note', {
          defaultValue: 'The record goes. The book is not affected.',
        })}
        confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const l = confirmDelete
          setConfirmDelete(null)
          if (l) void remove(l)
        }}
      />
    </>
  )
}
