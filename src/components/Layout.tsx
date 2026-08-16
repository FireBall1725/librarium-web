import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import type { Library, SuggestionQuotaView } from '../types'
import { THEMES, applyTheme, readStoredTheme, storeTheme, type ThemeId } from '../lib/theme'
// Params are compared normalised, not by substring: "status=read" is a prefix
// of "status=reading", so a substring test lights up Finished while the reader
// is looking at Reading now.
import { loadViews, newViewId, normaliseParams, saveView, viewCount, type SavedView } from '../lib/views'
import { sectionForPath } from '../lib/settingsTree'
import type { BookFacets } from '../lib/bookBrowse'
import { Icon, type IconName } from '../lib/icons'
import AuthorAvatar from './AuthorAvatar'
import { PromptDialog } from './Dialog'

interface CollectionCounts {
  books: number
  series: number
  authors: number
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
  warn,
  dot,
  end,
  onClick,
}: {
  to?: string
  icon?: IconName
  label: string
  count?: number
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
        : count !== undefined && <span className="count">{count.toLocaleString()}</span>}
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
function ViewCount({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  return <span className="count">{value.toLocaleString()}</span>
}

/**
 * An icon per view, chosen from the built-in ids where they are known and
 * falling back to the generic one. Views are user data, so a view someone
 * created gets the neutral icon rather than a wrong guess from its name.
 */
function viewIcon(v: SavedView): IconName {
  switch (v.id) {
    case 'reading': return 'next'
    case 'unread': return 'books'
    case 'read': return 'gaps'
    case 'five-stars': return 'star'
    case 'signed': return 'wish'
    default: return 'newview'
  }
}

/** A stable colour per library, derived from its id since the schema has none. */
function libraryHue(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0
  return `oklch(0.68 0.15 ${h % 360})`
}

const LIBRARY_SECTIONS: Array<{ section: string; labelKey: string }> = [
  { section: 'books',        labelKey: 'library_nav.books' },
  { section: 'contributors', labelKey: 'library_nav.contributors' },
  { section: 'shelves',      labelKey: 'library_nav.shelves' },
  { section: 'series',       labelKey: 'library_nav.series' },
  { section: 'loans',        labelKey: 'library_nav.loans' },
  { section: 'members',      labelKey: 'library_nav.members' },
]

export default function Layout() {
  const { user, logout, callApi } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { t } = useTranslation()
  // Which settings section the reader is in, which is not the same as being
  // under /settings: People and the connection pages live elsewhere in the
  // route table but belong to a section, and the sidebar should say so.
  const settingsSection = sectionForPath(location.pathname)
  const inSettings = location.pathname.startsWith('/settings') || settingsSection !== null
  const libraryMatch = location.pathname.match(/^\/libraries\/([^/]+)(?:\/|$)/)
  const currentLibraryId = libraryMatch?.[1]
  const [apiVersion, setApiVersion] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeId>(readStoredTheme)
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
  const [railQuery, setRailQuery] = useState('')

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
  const views: SavedView[] = loadViews()

  useEffect(() => {
    let cancelled = false
    const load = () => {
      callApi<Library[]>('/api/v1/libraries')
        .then(l => { if (!cancelled) setLibraries(l ?? []) })
        .catch(() => { /* The rail works without them. */ })
      callApi<{ data: BookFacets }>('/api/v1/me/books/facets')
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

  /** Save the filter on screen as a new view, or go to Books to build one. */
  const newView = () => {
    if (location.pathname !== '/books' || !normaliseParams(location.search)) {
      navigate('/books')
      return
    }
    setNamingView(true)
  }

  const saveNewView = (name: string) => {
    setNamingView(false)
    const params = normaliseParams(location.search)
    saveView({ id: newViewId(), name, params, layout: 'rows' })
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
        className={`app-sidebar border-r border-line bg-surface flex flex-col transform transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="lb-brand px-2">
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

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {/* Search sits at the top of the rail rather than on the Books page,
              because it searches everything and is reachable from everywhere. */}
          <form
            onSubmit={e => {
              e.preventDefault()
              const q = railQuery.trim()
              navigate(q ? `/books?q=${encodeURIComponent(q)}` : '/books')
            }}
          >
            <input
              className="lb-railsearch"
              value={railQuery}
              onChange={e => setRailQuery(e.target.value)}
              placeholder={t('nav.search_everything', { defaultValue: 'Search everything…' })}
              aria-label={t('nav.search_everything', { defaultValue: 'Search everything…' })}
            />
          </form>

          <NavRow to="/dashboard" icon="home" label={t('nav.dashboard')} />
          <NavRow to="/books" icon="books" label={t('nav.books')} count={counts?.books} end />
          <NavRow to="/series" icon="series" label={t('nav.series')} count={counts?.series} />
          <NavRow to="/authors" icon="authors" label={t('nav.authors')} count={counts?.authors} />

          {views.length > 0 && (
            <>
              <div className="lb-eyebrow px-2 pb-1.5 pt-4">
                {t('nav.your_views', { defaultValue: 'Your views' })}
              </div>
              {views.map(v => (
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
                  <span className="swatchdot" style={{ background: libraryHue(l.id) }} />
                  {l.name}
                  <ViewCount value={facets?.library.find(f => f.value === l.id)?.count} />
                </NavLink>
              ))}
            </>
          )}
          {currentLibraryId && (
            <div className="mt-1 ml-3 border-l border-line pl-3 space-y-0.5">
              {LIBRARY_SECTIONS.map(item => (
                <NavLink
                  key={item.section}
                  to={`/libraries/${currentLibraryId}/${item.section}`}
                  className={({ isActive }) =>
                    `block px-2 py-1.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`
                  }
                >
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
          )}

          {suggestionsAvailable && (
            <NavRow to="/suggestions" icon="suggested" label={t('nav.suggestions')} />
          )}
        </nav>

        {/* Settings sits above the account rather than in the nav above,
            because Import, Users and Connections are all settings: they were
            three separate destinations for what is one place to configure the
            instance. The account follows it, with the theme picker beside. */}
        <div className="lb-railfoot px-2">
          <NavRow to="/settings" icon="settings" label={t('nav.settings')} end />
          {/* Contextual: the section you are in, not all fifteen pages. A flat
              list showed every settings page the same wall of links, so the
              rail never told you where you were. */}
          {inSettings && settingsSection && (
            <div className="lb-subnav">
              <p className="lb-eyebrow px-2 pb-0.5 pt-1">
                {t(settingsSection.labelKey, { defaultValue: settingsSection.labelFallback })}
              </p>
              {settingsSection.pages.map(page => (
                <NavLink
                  key={page.id}
                  to={page.to}
                  end={page.to === '/settings/jobs'}
                  className={({ isActive }) => `lb-navrow ${isActive ? 'on' : ''}`}
                >
                  {t(page.labelKey, { defaultValue: page.labelFallback })}
                </NavLink>
              ))}
            </div>
          )}
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
          <select
            value={theme}
            onChange={e => setTheme(e.target.value as ThemeId)}
            aria-label={t('theme.label')}
            className="mt-1.5 w-full cursor-pointer border-0 bg-transparent px-2 text-[11px] text-content-subtle transition-colors hover:text-content-secondary focus:outline-none"
          >
            {THEMES.map(th => (
              <option key={th.id} value={th.id} className="bg-surface text-content">
                {th.label}
              </option>
            ))}
          </select>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
     </div>

      <PromptDialog
        open={namingView}
        title={t('views.new', { defaultValue: 'New view' })}
        description={t('views.new_description', {
          defaultValue: 'Saves the filter you have on Books right now. You can change it later.',
        })}
        label={t('views.name_label', { defaultValue: 'Name' })}
        placeholder={t('views.name_placeholder', { defaultValue: 'Signed first editions' })}
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
              className="flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              {t('footer.credit', { defaultValue: 'Created by FireBall1725 in Ontario, Canada' })}
              {/* Drawn rather than typed: the flag emoji is a regional-indicator
                  pair and Segoe UI Emoji ships no flag glyphs, so Windows
                  renders a boxed "CA" instead. Geometry from the public-domain
                  Flag_of_Canada.svg on Wikimedia Commons. */}
              <svg width="17" height="9" viewBox="0 0 9600 4800" role="img"
                aria-label="Canada" className="flex-none rounded-[1px] border border-line-strong">
                <title>Canada</title>
                <path fill="#f00" d="m0 0h2400l99 99h4602l99-99h2400v4800h-2400l-99-99h-4602l-99 99H0z" />
              </svg>
            </a>
            <a
              href="https://github.com/FireBall1725/librarium-web/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              {t('footer.web')}: v{__APP_VERSION__}
            </a>
            {apiVersion && (
              <a
                href="https://github.com/FireBall1725/librarium-api/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
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
              className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              {t('footer.source')}
            </a>
            {/* In-app now rather than off to GitHub: the notices belong with
                the running instance, and the page carries the bundled fonts,
                which the repository LICENSE file does not mention. */}
            <Link
              to="/settings/licences"
              className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              {t('footer.license')}
            </Link>
            <a
              href="https://github.com/FireBall1725/librarium-web/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              {t('footer.report_issue')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
