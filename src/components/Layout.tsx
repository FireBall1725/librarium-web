import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import type { Library, SuggestionQuotaView } from '../types'
import { applyTheme, readStoredTheme, storeTheme } from '../lib/theme'
import { applyReadingFont, readStoredReadingFont } from '../lib/readingFont'
// Params are compared normalised, not by substring: "status=read" is a prefix
// of "status=reading", so a substring test lights up Finished while the reader
// is looking at Reading now.
import { LISTS_CHANGED, announceListsChanged, ambiguousListNames, defaultListHref, fetchMissingCounts, importLegacyViews, listCount, listHref, listIcon, listNameKey, matchList, normaliseParams, deleteList, reorderLists, saveListOrder, visibleLists, type SavedList } from '../lib/lists'
import { SETTINGS_TREE } from '../lib/settingsTree'
import { COLLECTION_CHANGED } from '../lib/collectionEvents'
import { attentionRoutes, useSettingsAttention } from '../lib/settingsAttention'
import { DEFAULT_OWNERSHIP, PARAM, type BookFacets, type FacetValue } from '../lib/bookBrowse'
import { Icon, type IconName } from '../lib/icons'
import { LIST_ICONS } from '../lib/listIcons'
import AuthorAvatar from './AuthorAvatar'
import { PromptDialog } from './Dialog'
import CommandPalette from './CommandPalette'
import { libraryColour } from '../lib/libraryColour'

interface CollectionCounts {
  books: number
  series: number
  authors: number
  loans: number
  loans_overdue: number
  /** Undismissed suggestions. Absent from servers older than 26.8.1. */
  suggestions?: number
}

/**
 * One row in the sidebar: icon, label, and a count or a warning dot.
 *
 * The classes come from the ported reference stylesheet rather than being
 * rebuilt as utilities, so the rail matches the design without a second
 * description of it living here.
 */
function NavRow({
  to,
  icon,
  label,
  count,
  countWarn,
  warn,
  dot,
  end,
  onClick,
}: {
  to?: string
  icon?: IconName
  label: string
  count?: number
  /**
   * Draw the count as something to react to rather than replacing it with a
   * dot. `warn` answers "is anything wrong"; this answers "how many", which is
   * the more useful question when the number is already there.
   */
  countWarn?: boolean
  warn?: boolean
  /** Colour swatch instead of an icon, for a library. */
  dot?: string
  end?: boolean
  onClick?: () => void
}) {
  const inner = (
    <>
      {dot ? <span className="swatchdot" style={{ background: dot }} /> : icon && <Icon name={icon} />}
      {label}
      {warn
        ? <span className="warn" />
        : count !== undefined && (
            <span className="count"
              style={countWarn ? { color: 'var(--color-warning)' } : undefined}>
              {count.toLocaleString()}
            </span>
          )}
    </>
  )

  if (!to) {
    return (
      <button type="button" className="lb-navrow" onClick={onClick}>
        {inner}
      </button>
    )
  }
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `lb-navrow ${isActive ? 'on' : ''}`}>
      {inner}
    </NavLink>
  )
}

/**
 * A count on a view or library row.
 *
 * Nothing at all when the number is unknown, which happens before the facets
 * land and for any view combining two facets. A zero would claim the shelf is
 * empty, which is a different and wrong statement.
 */
/**
 * A count for one value of a loaded facet dimension.
 *
 * Absent from a loaded dimension means none, not unknown: the block only lists
 * values something matched, so an empty library or shelf had no row and showed
 * no number rather than a nought.
 */
function facetCount(values: FacetValue[] | undefined, value: string): number | undefined {
  if (!values) return undefined
  return values.find(v => v.value === value)?.count ?? 0
}

function ViewCount({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  return <span className="count">{value.toLocaleString()}</span>
}


export default function Layout() {
  const { user, logout, callApi } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { t } = useTranslation()
  // Settings covers more than the /settings prefix: People and the connection
  // pages live elsewhere in the route table but belong to the tree.
  const inSettings =
    location.pathname.startsWith('/settings') ||
    SETTINGS_TREE.some(s2 => s2.pages.some(p =>
      location.pathname === p.to || location.pathname.startsWith(p.to + '/')))
  const [apiVersion, setApiVersion] = useState<string | null>(null)
  // Read once on mount and applied by the effect below. Appearance is what
  // changes it; this only has to put the stored choice on screen at startup
  // and keep the system option following the OS.
  const [theme] = useState(readStoredTheme)
  const [readingFont] = useState(readStoredReadingFont)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Views live in the sidebar because they are how you actually get to a
  // shelf: "what am I reading" is a more common intent than "show me every
  // book".
  //
  // Read on every render rather than cached in state and synced by an effect.
  // That is what makes a view saved on Books appear here without a reload, and
  // Layout renders rarely enough that a localStorage read and a small JSON
  // parse cost less than the extra render an effect would trigger.
  // Hide the Suggestions nav entry when AI is unavailable for this user
  // (job disabled, no active provider, or not opted in). Start undefined so
  // we don't flash the link before we know — the nav just omits it for the
  // first render tick either way. Re-fetch when the user flips opt-in on
  // the profile page by listening to a custom event.
  const [suggestionsAvailable, setSuggestionsAvailable] = useState<boolean | undefined>(undefined)

  // Collection totals for the nav. Undefined until they arrive, which renders
  // no number rather than a zero: "Books 0" beside a full library is worse than
  // a count that shows up a moment later.
  const [counts, setCounts] = useState<CollectionCounts | null>(null)

  // Libraries in the rail, so a library is one click away as a filter rather
  // than a folder you navigate into first.
  const [libraries, setLibraries] = useState<Library[]>([])
  // Lists in the rail: a named set of books you go to. Shelves and saved views
  // were two sections here, which asked the reader to know which of two
  // features a name had been filed under before they could find it. The only
  // difference is how membership is settled, and that is a badge on a row
  // rather than a second heading.
  const [lists, setLists] = useState<SavedList[]>([])
  // Counts for the lists the facet block cannot answer: a search, or two
  // filters at once. Those showed no number at all, which reads as broken
  // rather than as unknown.
  const [listCounts, setListCounts] = useState<Record<string, number>>({})
  /** The row being dragged, and the one it is currently over. */
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  /** Announced to a screen reader after a keyboard move, which has no visual
   *  equivalent of watching a row slide. */
  const [orderSaid, setOrderSaid] = useState('')
  // The rail's search box opens the palette rather than holding text of its
  // own: it said "Search everything" while submitting to /books?q=, which
  // searched titles. Now it is a button that looks like the field it replaced.
  const [paletteOpen, setPaletteOpen] = useState(false)

  // navigator.platform is deprecated but is the only thing that still reports
  // the platform without a permissions-gated async call, and getting this wrong
  // only mislabels a key hint.
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  // One unfiltered facet block answers the count for every view and every
  // library in the rail. Eight views would otherwise be eight requests per
  // page load, for numbers nobody waits on.
  const [facets, setFacets] = useState<BookFacets | null>(null)

  const [namingList, setNamingList] = useState(false)
  // Fetched for admins everywhere, not only inside settings: the dot on the
  // Settings row exists to tell someone who is NOT in settings that something
  // in there is broken, so gating it on being in settings defeats it. The
  // endpoint is admin-only, hence the check rather than a swallowed 403.
  const attention = useSettingsAttention(callApi, user?.is_instance_admin === true)
  const needsAttention = attentionRoutes(attention)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      callApi<Library[]>('/api/v1/libraries')
        .then(l => { if (!cancelled) setLibraries(l ?? []) })
        .catch(() => { /* The rail works without them. */ })
      callApi<{ items: SavedList[] }>('/api/v1/me/lists')
        .then(r => { if (!cancelled) setLists(r.items ?? []) })
        .catch(() => { /* Same: the rail works without them. */ })
      // Counted in the scope the rows open in.
      //
      // This asked for facets unfiltered, while every row it labels lands on
      // Books, which opens on DEFAULT_OWNERSHIP. So the rail promised more
      // than the page delivered: Up next read 1,455 against a collection of
      // 1,425, the extra thirty being suggestions the reader does not own and
      // would never see on the page they had just clicked.
      //
      // The ownership facet itself stays whole, because each dimension is
      // counted with its own selection excluded — so this narrows the other
      // dimensions without collapsing the one it sets.
      callApi<{ data: BookFacets }>(
        `/api/v1/me/books/facets?${PARAM.ownership}=${DEFAULT_OWNERSHIP.join(',')}`)
        .then(r => { if (!cancelled) setFacets(r.data ?? null) })
        .catch(() => { /* Counts are an enhancement, not the nav. */ })
    }
    load()
    window.addEventListener(COLLECTION_CHANGED, load)
    window.addEventListener(LISTS_CHANGED, load)
    return () => {
      cancelled = true
      window.removeEventListener(COLLECTION_CHANGED, load)
      window.removeEventListener(LISTS_CHANGED, load)
    }
  }, [callApi])

  // Asked once the lists and the facets are both in hand, since which lists
  // need asking about depends on what the facets already answered.
  useEffect(() => {
    if (lists.length === 0) return
    let cancelled = false
    void fetchMissingCounts(callApi, lists, facets,
      `${PARAM.ownership}=${DEFAULT_OWNERSHIP.join(',')}`)
      .then(c => { if (!cancelled) setListCounts(c) })
    return () => { cancelled = true }
  }, [callApi, lists, facets])

  // Views used to live in this browser's localStorage, so they exist nowhere
  // else and cannot be left behind. Runs once per browser and skips the
  // built-ins, which the server seeds itself.
  useEffect(() => {
    void importLegacyViews(list =>
      callApi('/api/v1/me/lists', { method: 'POST', body: JSON.stringify(list) }),
    ).then(n => { if (n > 0) announceListsChanged() })
  }, [callApi])

  /** Library id to name, for qualifying a shelf whose name is not unique. */
  const libraryNames = useMemo(
    () => new Map(libraries.map(l => [l.id, l.name])),
    [libraries])

  const ambiguous = useMemo(() => ambiguousListNames(lists), [lists])

  /** Save the filter on screen as a new view, or go to Books to build one. */
  // Cmd-K anywhere, Ctrl-K off the Mac. Ignored while typing, so the shortcut
  // cannot steal a keystroke from a field the reader is already in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      const el = document.activeElement
      const typing = el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing) return
      e.preventDefault()
      setPaletteOpen(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  /**
   * Move a row and persist it.
   *
   * The rail shows the new order immediately and the writes follow, because a
   * list that snaps back while the server thinks about it reads as a failed
   * drag. Only the rows whose position changed are written.
   */
  const moveList = useCallback((fromId: string, toId: string) => {
    setLists(before => {
      const after = reorderLists(before, fromId, toId)
      if (after === before) return before
      void saveListOrder(callApi, before, after).then(() => announceListsChanged())
      return after
    })
  }, [callApi])

  /**
   * Reorder from the keyboard.
   *
   * A drag-only control cannot be reached without a mouse, which would make
   * this the one part of the rail some readers could not use. Alt with an arrow
   * moves the focused row; the arrows alone still walk the list.
   */
  const nudgeList = useCallback((id: string, delta: -1 | 1) => {
    const shown = visibleLists(lists)
    const at = shown.findIndex(l => l.id === id)
    const to = at + delta
    if (at < 0 || to < 0 || to >= shown.length) return
    moveList(id, shown[to].id)
    setOrderSaid(t('lists.moved', {
      name: shown[at].name,
      position: to + 1,
      total: shown.length,
      defaultValue: `${shown[at].name} moved to position ${to + 1} of ${shown.length}`,
    }))
  }, [lists, moveList, t])

  /**
   * Drop a list here to delete it.
   *
   * Sits below "New list" so the thing you reach for often is never the thing
   * one slip past a destructive target.
   *
   * A list the product ships is refused rather than deleted. Built-ins are
   * re-seeded on the next read, so deleting one would remove it and put it
   * straight back, which reads as the drop having failed.
   */
  const dropDelete = useCallback(async (id: string) => {
    const l = lists.find(x => x.id === id)
    if (!l) return
    // Asked only where something would actually be lost. A smart list is a
    // saved filter and costs a moment to rebuild; a manual one holds books
    // somebody put there by hand.
    if (l.kind === 'manual' && l.book_count > 0 &&
        !confirm(t('lists.delete_confirm', {
          name: l.name, count: l.book_count,
          defaultValue: `Delete ${l.name}? The ${l.book_count} books on it stay in your library.`,
        }))) return

    await deleteList(callApi, id).catch(() => null)
    setLists(prev => prev.filter(x => x.id !== id))
    announceListsChanged()
    setOrderSaid(t('lists.deleted', { name: l.name, defaultValue: `${l.name} deleted` }))
  }, [lists, callApi, t])

  const newList = () => {
    if (location.pathname !== '/books' || !normaliseParams(location.search)) {
      navigate('/books')
      return
    }
    setNamingList(true)
  }

  const saveNewList = async (name: string, icon?: IconName) => {
    setNamingList(false)
    const params = normaliseParams(location.search)
    // Smart, because this saves the filter on screen. A list filled by hand is
    // made from the books page by selecting some, which is the other kind.
    await callApi('/api/v1/me/lists', {
      method: 'POST',
      body: JSON.stringify({
        name, icon: icon ?? '', kind: 'smart',
        filter: { query: params }, visibility: 'private',
      }),
    }).catch(() => { /* Reported by the rail simply not gaining a row. */ })
    announceListsChanged()
    navigate(`/books?${params}`)
  }

  useEffect(() => {
    let cancelled = false
    const load = () => {
      callApi<CollectionCounts>('/api/v1/me/counts')
        .then(c => { if (!cancelled) setCounts(c) })
        .catch(() => { /* The nav works without numbers; do not break it. */ })
    }
    load()
    // Adding or importing books changes the totals, and the nav is on screen
    // the whole time, so it listens rather than going stale until a reload.
    window.addEventListener(COLLECTION_CHANGED, load)
    return () => {
      cancelled = true
      window.removeEventListener(COLLECTION_CHANGED, load)
    }
  }, [callApi])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      callApi<SuggestionQuotaView>('/api/v1/me/suggestions/quota')
        .then(q => {
          if (!cancelled) setSuggestionsAvailable(q?.available ?? false)
        })
        .catch(() => {
          if (!cancelled) setSuggestionsAvailable(false)
        })
    }
    load()
    const onRefresh = () => load()
    window.addEventListener('librarium:ai-prefs-changed', onRefresh)
    return () => {
      cancelled = true
      window.removeEventListener('librarium:ai-prefs-changed', onRefresh)
    }
  }, [callApi])

  // Applied on every mount, not only when it changes: a full page load starts
  // with a bare <html> and the choice lives in storage until something writes
  // it back onto the element.
  useEffect(() => { applyReadingFont(readingFont) }, [readingFont])

  useEffect(() => {
    applyTheme(theme)
    storeTheme(theme)
    // Only `system` needs to react to the OS flipping; a named theme is fixed.
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  useEffect(() => {
    fetch('/health')
      .then(r => r.json())
      .then(d => setApiVersion(d.version ?? null))
      .catch(() => {})
  }, [])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }


  return (
    <div className="app-shell h-screen flex flex-col bg-surface-muted">
     <div className="app-shell-body">
      {/* Mobile top bar */}
      <div className="app-topbar flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-4 h-14">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label={t('nav.open_menu')}
          className="p-1.5 -ml-1.5 rounded-md text-content-secondary hover:bg-surface-inset transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <img src="/logo.png" alt="" className="w-6 h-6 flex-shrink-0" />
        <span className="text-base font-semibold text-content">{t('app.name')}</span>
      </div>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="app-scrim fixed inset-0 bg-black/40 z-30"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        // px-2.5 pt-[13px] is the reference rail's own padding. Without it the
        // brand sat in the corner and its divider ran edge to edge, while the
        // search box below was inset by its own padding, so nothing in the rail
        // shared a left edge.
        className={`app-sidebar border-r border-line bg-surface flex flex-col px-2.5 pt-[13px] transform transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="lb-brand">
          <img src="/logo.png" alt="" className="h-[25px] w-[25px] flex-none" />
          <span className="nm min-w-0 flex-1">{t('app.name')}</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label={t('nav.close_menu')}
            className="app-topbar p-1 rounded-md text-content-muted hover:bg-surface-inset transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto pb-4">
          {/* Inside settings the rail becomes the settings tree, replacing the
              library nav rather than appending to it. One menu, not two: with
              both on screen the reader has to work out which half they are
              navigating, and the library nav is not what they came for.

              Every section and every page is listed, not just the section in
              use. The tree is the map of settings, and a map that only shows
              the room you are standing in is not a map. */}
          {inSettings ? (
            <>
              <NavLink to="/dashboard" className="lb-navrow back">
                <Icon name="back" />
                {t('nav.back_to_library', { defaultValue: 'Back to library' })}
              </NavLink>
              <NavRow
                to="/settings"
                icon="settings"
                label={t('settings.overview', { defaultValue: 'Overview' })}
                end
              />
              {SETTINGS_TREE.map(section => (
                <div key={section.id}>
                  <p className="lb-eyebrow px-2 pb-1 pt-3.5">
                    {t(section.labelKey, { defaultValue: section.labelFallback })}
                  </p>
                  <div className="lb-subnav">
                    {section.pages.map(page => (
                      <NavLink
                        key={page.id}
                        to={page.to}
                        end={page.to === '/settings/jobs'}
                        className={({ isActive }) => `lb-navrow ${isActive ? 'on' : ''}`}
                      >
                        {t(page.labelKey, { defaultValue: page.labelFallback })}
                        {needsAttention.has(page.to) && <span className="warn" />}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
          <>
          {/* Search sits at the top of the rail rather than on the Books page,
              because it searches everything and is reachable from everywhere. */}
          {/* .lb-railsearch is written for an input: fixed padding, and a
              magnifier as a background image. As a button it needs its own row
              layout, since a floated hint has nothing to centre against. The
              label is muted because it stands in for placeholder text. */}
          <button
            type="button"
            className="lb-railsearch flex items-center gap-2 text-left"
            onClick={() => setPaletteOpen(true)}
          >
            <span className="min-w-0 flex-1 truncate text-content-tertiary">
              {t('nav.search_everything', { defaultValue: 'Search everything…' })}
            </span>
            {/* Hidden on a phone: there is no keyboard to press it with, and a
                shortcut you cannot use is decoration taking up the row. */}
            <kbd className="hidden flex-none rounded border border-line-strong px-1 py-px text-[10px] leading-none text-content-subtle sm:inline-block">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>

          <NavRow to="/dashboard" icon="home" label={t('nav.dashboard')} />
          {/* Points at the default view when one is set, so Books opens on the
              shelf the reader actually wants. `end` still matches only /books
              itself, so the row highlights whatever the query string says. */}
          <NavRow to={defaultListHref(lists)} icon="books" label={t('nav.books')} count={counts?.books} end />
          <NavRow to="/series" icon="series" label={t('nav.series')} count={counts?.series} />
          <NavRow to="/authors" icon="authors" label={t('nav.authors')} count={counts?.authors} />
          {/* Books still out, tinted when any of them are late. The count is
              what is outstanding rather than every loan ever recorded, which
              would climb forever and never mean anything. */}
          <NavRow to="/loans" icon="lent" label={t('nav.loans', { defaultValue: 'Loans' })}
            count={counts?.loans} countWarn={(counts?.loans_overdue ?? 0) > 0} />

          {/* Beside the other collection surfaces rather than below the lists.
              A suggestion is something to act on, and at the bottom of the rail
              it sat under the reader's own lists, which is where
              you look for what you already have, not for what to do next.

              The count is every undismissed suggestion, so it agrees with the
              page it opens. The ownership facet's "suggested" tally is a
              different, smaller number: a suggestion for a book already on the
              shelf ranks as shelf and drops out of it. */}
          {suggestionsAvailable && (
            <NavRow to="/suggestions" icon="suggested" label={t('nav.suggestions')}
              count={counts?.suggestions} />
          )}

          {visibleLists(lists).length > 0 && (
            <>
              <div className="lb-eyebrow px-2 pb-1.5 pt-4">
                {t('nav.lists', { defaultValue: 'Lists' })}
              </div>
              {visibleLists(lists).map(l => (
                <NavLink
                  key={l.id}
                  to={listHref(l)}
                  draggable
                  onDragStart={e => {
                    setDragging(l.id)
                    e.dataTransfer.effectAllowed = 'move'
                    // Firefox starts no drag at all without payload.
                    e.dataTransfer.setData('text/plain', l.id)
                  }}
                  onDragEnd={() => { setDragging(null); setDragOver(null) }}
                  onDragOver={e => {
                    if (!dragging || dragging === l.id) return
                    // Without this the drop never fires: the default is to
                    // refuse.
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOver(l.id)
                  }}
                  onDragLeave={() => setDragOver(prev => (prev === l.id ? null : prev))}
                  onDrop={e => {
                    e.preventDefault()
                    const from = dragging ?? e.dataTransfer.getData('text/plain')
                    if (from && from !== l.id) moveList(from, l.id)
                    setDragging(null)
                    setDragOver(null)
                  }}
                  onKeyDown={e => {
                    // Alt, so the bare arrows still walk the rail.
                    if (!e.altKey) return
                    if (e.key === 'ArrowUp') { e.preventDefault(); nudgeList(l.id, -1) }
                    if (e.key === 'ArrowDown') { e.preventDefault(); nudgeList(l.id, 1) }
                  }}
                  className={() => {
                    // A smart list is its filter, so it is current when the
                    // filter on screen is the one it stands for. A manual list
                    // is addressed by id and has no filter to compare.
                    const on = l.kind === 'smart'
                      ? location.pathname === '/books' && matchList([l], location.search) !== null
                      : location.pathname === '/books' && params.get('shelf') === l.id
                    const dropping = dragOver === l.id && dragging !== l.id
                    // Which side of this row the line goes on: dragging
                    // downwards, the row lands after the one it is over.
                    const shown = visibleLists(lists)
                    const fromAt = shown.findIndex(x => x.id === dragging)
                    const overAt = shown.findIndex(x => x.id === l.id)
                    const after = fromAt >= 0 && overAt > fromAt
                    return [
                      'lb-navrow lb-draggable',
                      on ? 'on' : '',
                      dragging === l.id ? 'lb-dragging' : '',
                      // A line where the row would land, rather than moving
                      // everything under the cursor: the rail is short enough
                      // that a live reshuffle reads as flicker.
                      dropping ? `lb-drop-line ${after ? 'lb-drop-after' : 'lb-drop-before'}` : '',
                    ].filter(Boolean).join(' ')
                  }}
                  title={[l.name, l.shared_library_id ? libraryNames.get(l.shared_library_id) : null, l.description]
                    .filter(Boolean).join(' · ') || undefined}
                >
                  {/* Tinted with the list's own colour. The icon set is the
                      app's own: a shelf used to store an arbitrary emoji,
                      which made them the one thing in the rail not drawn from
                      the same set as everything above. */}
                  {/* The universal six-dot grip, so a row reads as grabbable
                      without having to be dragged to find out. Absolutely
                      positioned in the row's existing padding, so the icon
                      below stays in line with the nav icons above. */}
                  <span className="lb-drag-grip" aria-hidden="true">
                    <svg width="6" height="12" viewBox="0 0 6 12" fill="currentColor">
                      <circle cx="1.5" cy="2" r="1" /><circle cx="4.5" cy="2" r="1" />
                      <circle cx="1.5" cy="6" r="1" /><circle cx="4.5" cy="6" r="1" />
                      <circle cx="1.5" cy="10" r="1" /><circle cx="4.5" cy="10" r="1" />
                    </svg>
                  </span>
                  <Icon name={listIcon(l)} style={l.color ? { color: l.color } : undefined} />
                  <span className="min-w-0 flex-1 truncate">
                    {l.name}
                    {/* Which library, but only when the name alone does not
                        say. Two lists shared into different libraries and both
                        called Favourites read as one row listed twice.
                        Qualifying every list would be noise for the usual case
                        where the name is already unique. */}
                    {ambiguous.has(listNameKey(l.name)) && l.shared_library_id && (
                      <span className="ml-1.5 text-[11px] text-content-faint">
                        {libraryNames.get(l.shared_library_id)}
                      </span>
                    )}
                  </span>
                  <ViewCount value={listCount(l, facets, listCounts)} />
                </NavLink>
              ))}
              <NavRow icon="newview" label={t('lists.new', { defaultValue: 'New list' })} onClick={newList} />

              {/* Only while something is being dragged. A bin sitting there
                  permanently is a thing to hit by accident on a rail people
                  click through all day. */}
              {dragging && (
                <div
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver('__delete__') }}
                  onDragLeave={() => setDragOver(prev => (prev === '__delete__' ? null : prev))}
                  onDrop={e => {
                    e.preventDefault()
                    const from = dragging ?? e.dataTransfer.getData('text/plain')
                    setDragging(null)
                    setDragOver(null)
                    if (from) void dropDelete(from)
                  }}
                  className={`mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium transition-colors ${
                    dragOver === '__delete__'
                      ? 'bg-danger text-white'
                      : 'border border-dashed border-danger-line text-danger'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {t('lists.drop_to_delete', { defaultValue: 'Drop here to delete' })}
                </div>
              )}

              {/* A keyboard move has no equivalent of watching a row slide, so
                  the new position is said out loud instead. */}
              <span aria-live="polite" className="sr-only">{orderSaid}</span>
            </>
          )}

          {libraries.length > 0 && (
            <>
              <div className="lb-eyebrow px-2 pb-1.5 pt-4">
                {t('nav.libraries')}
              </div>
              {libraries.map(l => (
                <NavLink
                  key={l.id}
                  to={`/books?lib=${l.id}`}
                  className={() =>
                    `lb-navrow ${
                      location.pathname === '/books' && params.get('lib') === l.id ? 'on' : ''
                    }`
                  }
                >
                  <span className="swatchdot" style={{ background: libraryColour(l.id) }} />
                  {l.name}
                  <ViewCount value={facetCount(facets?.library, l.id)} />
                </NavLink>
              ))}
            </>
          )}
          </>
          )}
        </nav>

        {/* Settings sits above the account rather than in the nav above,
            because Import, Users and Connections are all settings: they were
            three separate destinations for what is one place to configure the
            instance. The account follows it, with the theme picker beside. */}
        <div className="lb-railfoot">
          {/* The dot is the only thing that tells a reader who is not in
              settings that something in there is broken. */}
          <NavRow
            to="/settings"
            icon="settings"
            label={t('nav.settings')}
            warn={attention.length > 0}
            end
          />
          <div className="lb-acct">
            <Link to="/profile" className="lb-acctmain">
              <AuthorAvatar name={user?.display_name || user?.username || '?'} size={28} />
              <span className="min-w-0">
                <span className="n1">{user?.display_name || user?.username}</span>
                <span className="n2">{user?.email}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="lb-signout"
              title={t('nav.sign_out')}
              aria-label={t('nav.sign_out')}
            >
              ⏻
            </button>
          </div>
          {/* The theme picker lives on Appearance, not here. Two controls for
              one setting is how the rail ended up still reading "Ink" after
              Appearance had switched to Sepia. */}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
     </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <PromptDialog
        open={namingList}
        title={t('lists.new', { defaultValue: 'New list' })}
        description={t('lists.new_description', {
          defaultValue: 'Saves the filter you have on Books right now. You can change it later.',
        })}
        label={t('lists.name_label', { defaultValue: 'Name' })}
        placeholder={t('lists.name_placeholder', { defaultValue: 'Signed first editions' })}
        icons={LIST_ICONS}
        initialIcon="newview"
        iconLabel={t('common.icon', { defaultValue: 'Icon' })}
        onCancel={() => setNamingList(false)}
        onSubmit={saveNewList}
      />

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-line bg-surface px-4 py-2.5 text-xs text-content-muted">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-medium text-content-tertiary">{t('app.name')}</span>
            <a
              href="https://fireball1725.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-content transition-colors"
            >
              {t('footer.credit', { defaultValue: 'Created by FireBall1725 in Ontario, Canada' })}
              {/* Drawn rather than typed: the flag emoji is a regional-indicator
                  pair and Segoe UI Emoji ships no flag glyphs, so Windows
                  renders a boxed "CA" instead. Geometry from the public-domain
                  Flag_of_Canada.svg on Wikimedia Commons. */}
              <svg width="18" height="9" viewBox="0 0 9600 4800" role="img"
                aria-label="Canada" className="flex-none rounded-[1px] border border-line-strong">
                <title>Canada</title>
                <path fill="#f00" d="m0 0h2400l99 99h4602l99-99h2400v4800h-2400l-99-99h-4602l-99 99H0z" />
                {/* One path, not two: the white field and the leaf share a
                    subpath, and the leaf winds the other way so it is cut out
                    of the field rather than drawn over it. Dropping this path
                    leaves the red base showing as a plain rectangle. */}
                <path fill="#fff" d="m2400 0h4800v4800h-4800zm2490 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z" />
              </svg>
            </a>
            <a
              href="https://github.com/FireBall1725/librarium-web/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-content transition-colors"
            >
              {t('footer.web')}: v{__APP_VERSION__}
            </a>
            {apiVersion && (
              <a
                href="https://github.com/FireBall1725/librarium-api/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-content transition-colors"
                title={apiVersion}
              >
                {t('footer.api')}: v{apiVersion}
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <a
              href="https://github.com/FireBall1725/librarium-web"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-content transition-colors"
            >
              {t('footer.source')}
            </a>
            {/* In-app now rather than off to GitHub: the notices belong with
                the running instance, and the page carries the bundled fonts,
                which the repository LICENSE file does not mention. */}
            <Link
              to="/settings/licences"
              className="hover:text-content transition-colors"
            >
              {t('footer.license')}
            </Link>
            <a
              href="https://github.com/FireBall1725/librarium-web/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-content transition-colors"
            >
              {t('footer.report_issue')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
