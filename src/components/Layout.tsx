import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'

type Theme = 'light' | 'dark' | 'system'

function applyTheme(theme: Theme) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  localStorage.setItem('theme', theme)
}

const NEXT_THEME: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }

const SETTINGS_ITEMS: Array<{ to: string; labelKey: string }> = [
  { to: '/admin/settings/media-management', labelKey: 'settings_nav.media_management' },
  { to: '/admin/settings/metadata',         labelKey: 'settings_nav.metadata' },
  { to: '/admin/settings/tags',             labelKey: 'settings_nav.tags' },
  { to: '/admin/settings/genres',           labelKey: 'settings_nav.genres' },
  { to: '/admin/settings/media-types',      labelKey: 'settings_nav.media_types' },
  { to: '/admin/settings/profiles',         labelKey: 'settings_nav.profiles' },
  { to: '/admin/settings/general',          labelKey: 'settings_nav.general' },
  { to: '/admin/settings/jobs',             labelKey: 'settings_nav.jobs' },
]

const CONNECTIONS_ITEMS: Array<{ to: string; labelKey: string }> = [
  { to: '/admin/connections/ai', labelKey: 'connections_nav.ai' },
]

const LIBRARY_SECTIONS: Array<{ section: string; labelKey: string }> = [
  { section: 'books',        labelKey: 'library_nav.books' },
  { section: 'contributors', labelKey: 'library_nav.contributors' },
  { section: 'shelves',      labelKey: 'library_nav.shelves' },
  { section: 'series',       labelKey: 'library_nav.series' },
  { section: 'loans',        labelKey: 'library_nav.loans' },
  { section: 'members',      labelKey: 'library_nav.members' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const inSettings = location.pathname.startsWith('/admin/settings')
  const inConnections = location.pathname.startsWith('/admin/connections')
  const libraryMatch = location.pathname.match(/^\/libraries\/([^/]+)(?:\/|$)/)
  const currentLibraryId = libraryMatch?.[1]
  const themeLabels: Record<Theme, string> = {
    light: t('theme.light'),
    dark: t('theme.dark'),
    system: t('theme.auto'),
  }
  const [apiVersion, setApiVersion] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('theme') as Theme) ?? 'system'
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    applyTheme(theme)
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

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
     <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      {/* Mobile top bar */}
      <div className="lg:hidden flex-shrink-0 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 h-14">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label={t('nav.open_menu')}
          className="p-1.5 -ml-1.5 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <img src="/logo.png" alt="" className="w-6 h-6 flex-shrink-0" />
        <span className="text-base font-semibold text-gray-900 dark:text-white">{t('app.name')}</span>
      </div>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col transform transition-transform duration-200 ease-out lg:static lg:w-56 lg:translate-x-0 lg:transition-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="w-7 h-7 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{t('app.name')}</div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label={t('nav.close_menu')}
            className="lg:hidden p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          <NavLink to="/dashboard" className={navClass}>{t('nav.dashboard')}</NavLink>
          <NavLink
            to="/libraries"
            end
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive || currentLibraryId
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`
            }
          >
            {t('nav.libraries')}
          </NavLink>
          {currentLibraryId && (
            <div className="mt-1 ml-3 border-l border-gray-200 dark:border-gray-700 pl-3 space-y-0.5">
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

          <div className="pt-4">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {t('nav.tools')}
            </p>
            <NavLink to="/import" className={navClass}>{t('nav.import')}</NavLink>
          </div>

          {user?.is_instance_admin && (
            <div className="pt-4">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {t('nav.admin')}
              </p>
              <NavLink to="/admin/users" className={navClass}>{t('nav.users')}</NavLink>
              <NavLink
                to="/admin/connections"
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive || inConnections
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`
                }
              >
                {t('nav.connections')}
              </NavLink>
              {inConnections && (
                <div className="mt-1 ml-3 border-l border-gray-200 dark:border-gray-700 pl-3 space-y-0.5">
                  {CONNECTIONS_ITEMS.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
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
              <NavLink
                to="/admin/settings"
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive || inSettings
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`
                }
              >
                {t('nav.settings')}
              </NavLink>
              {inSettings && (
                <div className="mt-1 ml-3 border-l border-gray-200 dark:border-gray-700 pl-3 space-y-0.5">
                  {SETTINGS_ITEMS.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
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
            </div>
          )}
        </nav>

        {/* User footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.display_name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              {t('nav.sign_out')}
            </button>
            <div className="flex items-center gap-2">
              <Link
                to="/profile"
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                {t('nav.profile')}
              </Link>
              <button
                onClick={() => setTheme(prev => NEXT_THEME[prev])}
                title={t('theme.cycle_tooltip')}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                {themeLabels[theme]}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
     </div>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-medium text-gray-600 dark:text-gray-300">{t('app.name')}</span>
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
            <a
              href="https://github.com/FireBall1725/librarium-web/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              {t('footer.license')}
            </a>
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
