import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import type { Library, Shelf, SuggestionQuotaView } from '../types'
import { applyTheme, readStoredTheme, storeTheme } from '../lib/theme'
// Params are compared normalised, not by substring: "status=read" is a prefix
// of "status=reading", so a substring test lights up Finished while the reader
// is looking at Reading now.
import { VIEWS_CHANGED, announceViewsChanged, defaultViewHref, loadViews, newViewId, normaliseParams, saveView, viewCount, visibleViews, type SavedView } from '../lib/views'
import { SETTINGS_TREE } from '../lib/settingsTree'
import { ambiguousShelfNames, shelfNameKey } from '../lib/shelves'
import { attentionRoutes, useSettingsAttention } from '../lib/settingsAttention'
import { DEFAULT_OWNERSHIP, PARAM, type BookFacets, type FacetValue } from '../lib/bookBrowse'
import { Icon, type IconName } from '../lib/icons'
import { shelfIcon } from '../lib/shelfIcons'
import { VIEW_ICONS, viewIcon } from '../lib/viewIcons'
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
  // Shelves in the rail for the same reason views are: a shelf is a named set
  // of books you go to, and the only thing separating it from a view is that
  // its membership is picked by hand rather than by rule.
  const [shelves, setShelves] = useState<Shelf[]>([])
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

  // Views are read from storage on every render rather than held in state,
  // which is what makes one saved on Books appear here without a reload.
  //
  // The counter's value is never read: setting it is the whole point, because
  // saving a view from this component has to make it render again to re-read
  // storage. A memo keyed on it would list dependencies its callback never
  // touches, which is the thing the exhaustive-deps rule exists to catch.
  const [, setViewsTick] = useState(0)
  const [namingView, setNamingView] = useState(false)
  // Fetched for admins everywhere, not only inside settings: the dot on the
  // Settings row exists to tell someone who is NOT in settings that something
  // in there is broken, so gating it on being in settings defeats it. The
  // endpoint is admin-only, hence the check rather than a swallowed 403.
  const attention = useSettingsAttention(callApi, user?.is_instance_admin === true)
  const needsAttention = attentionRoutes(attention)
  const views: SavedView[] = loadViews()

  // Views and the default live in storage and are read on render, so the rail
  // needs a reason to render again when another page edits them.
  useEffect(() => {
    const bump = () => setViewsTick(n => n + 1)
    window.addEventListener(VIEWS_CHANGED, bump)
    return () => window.removeEventListener(VIEWS_CHANGED, bump)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      callApi<Library[]>('/api/v1/libraries')
        .then(l => { if (!cancelled) setLibraries(l ?? []) })
        .catch(() => { /* The rail works without them. */ })
      callApi<{ items: Shelf[] }>('/api/v1/me/shelves')
        .then(r => { if (!cancelled) setShelves(r.items ?? []) })
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
    window.addEventListener('librarium:collection-changed', load)
    return () => {
      cancelled = true
      window.removeEventListener('librarium:collection-changed', load)
    }
  }, [callApi])

  /** Library id to name, for qualifying a shelf whose name is not unique. */
  const libraryNames = useMemo(
    () => new Map(libraries.map(l => [l.id, l.name])),
    [libraries])

  const ambiguous = useMemo(() => ambiguousShelfNames(shelves), [shelves])

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

  const newView = () => {
    if (location.pathname !== '/books' || !normaliseParams(location.search)) {
      navigate('/books')
      return
    }
    setNamingView(true)
  }

  const saveNewView = (name: string, icon?: IconName) => {
    setNamingView(false)
    const params = normaliseParams(location.search)
    saveView({ id: newViewId(), name, icon, params, layout: 'rows' })
    announceViewsChanged()
    // Views are read from storage on every render rather than held in state, so
    // the rail needs a reason to render again. A counter, not setRailQuery with
    // its own value: React bails out when the value is unchanged.
    setViewsTick(n => n + 1)
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
    window.addEventListener('librarium:collection-changed', load)
    return () => {
      cancelled = true
      window.removeEventListener('librarium:collection-changed', load)
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
          <NavRow to={defaultViewHref(views)} icon="books" label={t('nav.books')} count={counts?.books} end />
          <NavRow to="/series" icon="series" label={t('nav.series')} count={counts?.series} />
          <NavRow to="/authors" icon="authors" label={t('nav.authors')} count={counts?.authors} />
          {/* Books still out, tinted when any of them are late. The count is
              what is outstanding rather than every loan ever recorded, which
              would climb forever and never mean anything. */}
          <NavRow to="/loans" icon="lent" label={t('nav.loans', { defaultValue: 'Loans' })}
            count={counts?.loans} countWarn={(counts?.loans_overdue ?? 0) > 0} />

          {/* Beside the other collection surfaces rather than below the shelves.
              A suggestion is something to act on, and at the bottom of the rail
              it sat under the reader's own views and shelves, which is where
              you look for what you already have, not for what to do next.

              The count is every undismissed suggestion, so it agrees with the
              page it opens. The ownership facet's "suggested" tally is a
              different, smaller number: a suggestion for a book already on the
              shelf ranks as shelf and drops out of it. */}
          {suggestionsAvailable && (
            <NavRow to="/suggestions" icon="suggested" label={t('nav.suggestions')}
              count={counts?.suggestions} />
          )}

          {visibleViews(views).length > 0 && (
            <>
              <div className="lb-eyebrow px-2 pb-1.5 pt-4">
                {t('nav.your_views', { defaultValue: 'Your views' })}
              </div>
              {visibleViews(views).map(v => (
                <NavLink
                  key={v.id}
                  to={`/books?${v.params}`}
                  className={() =>
                    `lb-navrow ${
                      normaliseParams(location.search) === normaliseParams(v.params) &&
                      location.pathname === '/books'
                        ? 'on'
                        : ''
                    }`
                  }
                >
                  <Icon name={viewIcon(v)} />
                  {v.name}
                  <ViewCount value={viewCount(v, facets)} />
                </NavLink>
              ))}
              <NavRow icon="newview" label={t('views.new', { defaultValue: 'New view' })} onClick={newView} />
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
          {shelves.length > 0 && (
            <>
              <div className="lb-eyebrow px-2 pb-1.5 pt-4">
                {t('nav.shelves', { defaultValue: 'Shelves' })}
              </div>
              {shelves.map(sh => (
                <NavLink
                  key={sh.id}
                  to={`/books?shelf=${sh.id}`}
                  className={() =>
                    `lb-navrow ${
                      location.pathname === '/books' && params.get('shelf') === sh.id ? 'on' : ''
                    }`
                  }
                  title={[sh.name, libraryNames.get(sh.library_id), sh.description]
                    .filter(Boolean).join(' · ') || undefined}
                >
                  {/* The app's own icon set, tinted with the shelf's colour.
                      Emoji here made shelves the one thing in the rail not
                      drawn from the same set as everything above it. */}
                  <Icon name={shelfIcon(sh.icon)}
                    style={sh.color ? { color: sh.color } : undefined} />
                  <span className="min-w-0 flex-1 truncate">
                    {sh.name}
                    {/* Which library, but only when the name alone does not
                        say. A shelf belongs to one library, so two called
                        Favourites are two different shelves and the rail
                        listed them as the same row twice. Qualifying every
                        shelf would be noise for the usual case where the name
                        is already unique. */}
                    {ambiguous.has(shelfNameKey(sh.name)) && (
                      <span className="ml-1.5 text-[11px] text-content-faint">
                        {libraryNames.get(sh.library_id)}
                      </span>
                    )}
                  </span>
                  <ViewCount value={facetCount(facets?.shelf, sh.id)} />
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
        open={namingView}
        title={t('views.new', { defaultValue: 'New view' })}
        description={t('views.new_description', {
          defaultValue: 'Saves the filter you have on Books right now. You can change it later.',
        })}
        label={t('views.name_label', { defaultValue: 'Name' })}
        placeholder={t('views.name_placeholder', { defaultValue: 'Signed first editions' })}
        icons={VIEW_ICONS}
        initialIcon="newview"
        iconLabel={t('common.icon', { defaultValue: 'Icon' })}
        onCancel={() => setNamingView(false)}
        onSubmit={saveNewView}
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
