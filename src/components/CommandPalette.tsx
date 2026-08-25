// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Command bar. Cmd-K, or the search box in the rail.
//
// Two jobs in one surface. It searches the collection and everything you have
// named yourself, and it runs the handful of commands worth reaching without
// navigating somewhere first. Actions sit above results because a command bar
// that buries its commands under search hits is just a search box with a
// shortcut.
//
// The results box is grouped, and the groups are derived from the results
// rather than walked from a fixed list of sections. That is deliberate: a fixed
// list has to be extended whenever a source is added, and forgetting leaves
// rows that count as "we found something" while rendering nowhere, so the
// palette looks broken rather than empty.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Icon } from '../lib/icons'
import { libraryColour } from '../lib/libraryColour'
import { NO_AUTOFILL } from '../lib/formHints'
import {
  KIND_LABEL,
  KIND_ORDER,
  matches,
  pageItems,
  rank,
  viewItems,
  type CommandItem,
  type ItemKind,
} from '../lib/commandPalette'
import { fetchLists, type SavedList } from '../lib/lists'
import type { Book, Library, Loan, MeSeriesResult } from '../types'

/** How many rows a single remote source may contribute. */
const PER_SOURCE = 5

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Cheap sources, held while the palette is open and filtered locally.
  const [libraries, setLibraries] = useState<Library[]>([])
  const [lists, setLists] = useState<SavedList[]>([])

  // Searched server-side on a debounce.
  const [books, setBooks] = useState<Book[]>([])
  const [series, setSeries] = useState<MeSeriesResult[]>([])
  const [authors, setAuthors] = useState<Array<{ id: string; name: string }>>([])
  const [loans, setLoans] = useState<Loan[]>([])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    input.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    callApi<Library[]>('/api/v1/libraries')
      .then(r => { if (!cancelled) setLibraries(r ?? []) }).catch(() => {})
    fetchLists(callApi)
      .then(r => { if (!cancelled) setLists(r) }).catch(() => {})
    return () => { cancelled = true }
  }, [open, callApi])

  // Remote search. One guard for all four so a slow reply from an earlier
  // keystroke cannot overwrite a newer one, which is what makes results appear
  // to flicker back to a previous query.
  const seq = useRef(0)
  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) {
      setBooks([]); setSeries([]); setAuthors([]); setLoans([])
      return
    }
    const mine = ++seq.current
    const handle = setTimeout(() => {
      const enc = encodeURIComponent(q)
      void Promise.allSettled([
        callApi<{ items: Book[] }>(`/api/v1/me/books?q=${enc}&per_page=${PER_SOURCE}`),
        callApi<MeSeriesResult[]>(`/api/v1/me/series?q=${enc}`),
        callApi<Array<{ id: string; name: string }>>(`/api/v1/contributors?q=${enc}`),
        callApi<{ items: Loan[] }>(`/api/v1/me/loans?q=${enc}&include_returned=true`),
      ]).then(([b, s, a, l]) => {
        if (mine !== seq.current) return
        setBooks(b.status === 'fulfilled' ? (b.value.items ?? []) : [])
        setSeries(s.status === 'fulfilled' ? (s.value ?? []).slice(0, PER_SOURCE) : [])
        setAuthors(a.status === 'fulfilled' ? (a.value ?? []).slice(0, PER_SOURCE) : [])
        setLoans(l.status === 'fulfilled' ? (l.value.items ?? []).slice(0, PER_SOURCE) : [])
      })
    }, 200)
    return () => clearTimeout(handle)
  }, [query, open, callApi])

  const go = useCallback((to: string) => { onClose(); navigate(to) }, [navigate, onClose])

  /**
   * Commands, as opposed to things to find.
   *
   * Each one is a place that already exists plus the state that opens its
   * dialog, carried in the URL so the palette does not need a channel into
   * whatever page it lands on.
   */
  const actions = useMemo<CommandItem[]>(() => [
    { kind: 'action', id: 'act:add-book', icon: 'newview', to: '/books?add=1',
      label: t('palette.add_book', { defaultValue: 'Add a book' }) },
    { kind: 'action', id: 'act:new-loan', icon: 'lent', to: '/loans',
      label: t('palette.new_loan', { defaultValue: 'Record a loan' }) },
    { kind: 'action', id: 'act:new-view', icon: 'newview', to: '/books?new=view',
      label: t('palette.new_view', { defaultValue: 'New view' }) },
    { kind: 'action', id: 'act:import', icon: 'import', to: '/import',
      label: t('palette.import', { defaultValue: 'Import books' }) },
  ], [t])

  const items = useMemo<CommandItem[]>(() => {
    const q = query.trim()

    const local: CommandItem[] = [
      ...actions,
      ...viewItems(lists),
      ...libraries.map<CommandItem>(l => ({
        kind: 'library', id: `lib:${l.id}`, label: l.name, icon: 'libraries',
        tint: libraryColour(l.id), to: `/books?lib=${l.id}`,
      })),
      ...pageItems(t),
    ].filter(i => !q || matches(i.label, q) || (i.sublabel ? matches(i.sublabel, q) : false))

    const remote: CommandItem[] = [
      ...books.map<CommandItem>(b => ({
        kind: 'book', id: `book:${b.id}`, label: b.title,
        sublabel: b.contributors?.[0]?.name,
        icon: 'books',
        to: b.library_id ? `/libraries/${b.library_id}/books/${b.id}` : `/books?q=${encodeURIComponent(b.title)}`,
      })),
      ...series.map<CommandItem>(s => ({
        kind: 'series', id: `series:${s.id}`, label: s.name, sublabel: s.library_name,
        icon: 'series', to: `/books?series=${s.id}`,
      })),
      ...authors.map<CommandItem>(a => ({
        kind: 'author', id: `author:${a.id}`, label: a.name, icon: 'authors',
        to: `/books?q=${encodeURIComponent(a.name)}`,
      })),
      ...loans.map<CommandItem>(l => ({
        kind: 'loan', id: `loan:${l.id}`, label: l.book_title,
        sublabel: t('loans.to', { name: l.loaned_to, defaultValue: `Lent to ${l.loaned_to}` }),
        icon: 'lent', to: '/loans',
      })),
    ]

    return rank([...local, ...remote], q)
    // books/series/authors/loans are set asynchronously and MUST be listed:
    // omitting them computes the rows once against empty arrays and never
    // again, which reads as "the API returned nothing" rather than as a bug.
  }, [query, actions, libraries, lists, books, series, authors, loans, t])

  /** Grouped for rendering, in section order, from whatever is present. */
  const groups = useMemo(() => {
    const byKind = new Map<ItemKind, CommandItem[]>()
    for (const item of items) {
      const list = byKind.get(item.kind)
      if (list) list.push(item)
      else byKind.set(item.kind, [item])
    }
    return KIND_ORDER.filter(k => byKind.has(k)).map(k => ({ kind: k, items: byKind.get(k)! }))
  }, [items])

  /** Flat, in render order, so the arrow keys and the rows agree. */
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups])

  useEffect(() => { setActive(0) }, [query])

  const activate = useCallback((item: CommandItem) => {
    if (item.run) { onClose(); item.run(); return }
    if (item.to) go(item.to)
  }, [go, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(i => (flat.length ? (i + 1) % flat.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(i => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = flat[active]
        if (item) activate(item)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, flat, active, activate, onClose])

  // Keep the highlighted row on screen when the arrows walk past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  let index = -1

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title', { defaultValue: 'Search everything' })}
      >
        <input
          ref={input}
          className="w-full border-0 bg-transparent px-4 py-3.5 text-[15px] text-content outline-none placeholder:text-content-subtle"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('palette.placeholder', {
            defaultValue: 'Search books, series, people, pages…',
          })}
          aria-label={t('palette.title', { defaultValue: 'Search everything' })}
          {...NO_AUTOFILL}
        />

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto border-t border-line">
          {flat.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-content-muted">
              {query.trim().length === 1
                // Two characters before the remote sources run, so say so
                // rather than claiming there is nothing.
                ? t('palette.keep_typing', { defaultValue: 'Keep typing…' })
                : t('palette.empty', { defaultValue: 'Nothing matches' })}
            </p>
          ) : (
            groups.map(group => (
              <div key={group.kind} className="py-1">
                <div className="lb-eyebrow px-4 pb-1 pt-2">
                  {t(KIND_LABEL[group.kind], { defaultValue: group.kind })}
                </div>
                {group.items.map(item => {
                  index += 1
                  const isActive = index === active
                  const at = index
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-active={isActive}
                      onMouseMove={() => setActive(at)}
                      onClick={() => activate(item)}
                      className={`flex w-full items-center gap-2.5 px-4 py-2 text-left ${
                        isActive ? 'bg-accent-surface' : ''
                      }`}
                    >
                      <Icon name={item.icon} size={16} className="flex-none"
                        style={item.tint ? { color: item.tint } : undefined} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13.5px] ${
                          isActive ? 'text-accent-strong' : 'text-content'
                        }`}>
                          {item.label}
                        </span>
                        {item.sublabel && (
                          <span className="block truncate text-[11px] text-content-tertiary">
                            {item.sublabel}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
