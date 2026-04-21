import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useAuth, ApiError } from '../auth/AuthContext'
import type {
  Library,
  DashboardBook,
  DashboardStats,
  FinishedBook,
  ContinueSeriesItem,
} from '../types'
import PageHeader from '../components/PageHeader'
import BookCover from '../components/BookCover'
import SuggestionsWidget from '../components/SuggestionsWidget'
import { usePageTitle } from '../hooks/usePageTitle'

// ─── Utilities ───────────────────────────────────────────────────────────────

function showReadBadges(): boolean {
  return localStorage.getItem('librarium:show_read_badges') !== 'false'
}

function relativeTime(iso: string | null | undefined, t: TFunction): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0) return t('relative_time.just_now')
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return t('relative_time.just_now')
  if (minutes < 60) return t('relative_time.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('relative_time.hours', { count: hours })
  const days = Math.floor(hours / 24)
  if (days === 1) return t('relative_time.yesterday')
  if (days < 7) return t('relative_time.days', { count: days })
  if (days < 30) return t('relative_time.weeks', { count: Math.floor(days / 7) })
  if (days < 365) return t('relative_time.months', { count: Math.floor(days / 30) })
  return t('relative_time.years', { count: Math.floor(days / 365) })
}

// ─── Shared shells ───────────────────────────────────────────────────────────

function Module({
  title,
  action,
  children,
  className = '',
  headerClassName = '',
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  headerClassName?: string
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 ${className}`}
    >
      {title && (
        <div className={`flex items-center justify-between px-5 pt-4 pb-2 ${headerClassName}`}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  const { t } = useTranslation('dashboard')
  const max = Math.max(...data, 1)
  const width = 200
  const height = 44
  const barGap = 2
  const barWidth = (width - barGap * (data.length - 1)) / data.length

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-10"
      preserveAspectRatio="none"
      role="img"
      aria-label={t('stats.sparkline_aria')}
    >
      {data.map((v, i) => {
        const h = v === 0 ? 1.5 : Math.max(2, (v / max) * (height - 4))
        return (
          <rect
            key={i}
            x={i * (barWidth + barGap)}
            y={height - h}
            width={barWidth}
            height={h}
            rx={1}
            className={v === 0 ? 'fill-gray-200 dark:fill-gray-700' : 'fill-blue-500 dark:fill-blue-400'}
          />
        )
      })}
    </svg>
  )
}

// ─── Hero: Continue Reading ─────────────────────────────────────────────────

function ContinueReadingHero() {
  const { callApi } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [books, setBooks] = useState<DashboardBook[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    callApi<DashboardBook[]>('/api/v1/dashboard/currently-reading')
      .then(data => setBooks(data ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t])

  if (error) {
    return (
      <Module className="min-h-[14rem]">
        <div className="p-5 text-sm text-red-500 dark:text-red-400">{error}</div>
      </Module>
    )
  }

  if (books === null) {
    return (
      <Module className="min-h-[14rem]">
        <div className="flex flex-col sm:flex-row gap-5 p-5">
          <div className="w-28 sm:w-36 aspect-[2/3] rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-3 pt-2">
            <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
            <div className="h-6 w-2/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
          </div>
        </div>
      </Module>
    )
  }

  if (books.length === 0) {
    return (
      <Module className="min-h-[14rem]">
        <div className="flex flex-col items-center justify-center text-center gap-2 h-full p-8 min-h-[14rem]">
          <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C20.168 18.477 18.254 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('no_books_in_progress.title')}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('no_books_in_progress.hint')}
          </p>
        </div>
      </Module>
    )
  }

  const [featured, ...others] = books
  const badges = showReadBadges()

  return (
    <div className="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Soft gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/60 via-white to-white dark:from-blue-950/30 dark:via-gray-900 dark:to-gray-900 pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row gap-5 p-5 sm:p-6">
        <Link
          to={`/libraries/${featured.library_id}/books/${featured.book_id}`}
          className="flex-shrink-0 block group"
        >
          <BookCover
            title={featured.title}
            coverUrl={featured.cover_url}
            className="w-32 sm:w-40 transition-transform group-hover:scale-[1.02]"
            readStatus={badges ? 'reading' : undefined}
          />
        </Link>

        <div className="flex-1 min-w-0 flex flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            {t('continue_reading_eyebrow')}
          </p>
          <Link
            to={`/libraries/${featured.library_id}/books/${featured.book_id}`}
            className="mt-1 block hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight">
              {featured.title}
            </h2>
          </Link>
          {featured.authors && (
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
              {featured.authors}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Link
              to={`/libraries/${featured.library_id}`}
              className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {featured.library_name}
            </Link>
            {featured.updated_at && (
              <span className="text-gray-500 dark:text-gray-400">
                {t('last_opened', { relative: relativeTime(featured.updated_at, t) })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Secondary: other in-progress books */}
      {others.length > 0 && (
        <div className="relative border-t border-gray-200 dark:border-gray-700 px-5 py-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('also_in_progress')}
          </p>
          <div className="flex gap-3 overflow-x-auto scrollbar-thin -mx-1 px-1">
            {others.slice(0, 6).map(b => (
              <Link
                key={b.book_id}
                to={`/libraries/${b.library_id}/books/${b.book_id}`}
                className="group flex-shrink-0 flex items-start gap-3 w-56 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={b.title}
              >
                <BookCover
                  title={b.title}
                  coverUrl={b.cover_url}
                  className="w-12 flex-shrink-0"
                  readStatus={badges ? 'reading' : undefined}
                />
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {b.title}
                  </p>
                  {b.authors && (
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {b.authors}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stats rail ─────────────────────────────────────────────────────────────

function StatsRail() {
  const { callApi } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    callApi<DashboardStats>('/api/v1/dashboard/stats')
      .then(data => setStats(data ?? null))
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t])

  if (error) {
    return (
      <Module>
        <div className="p-5 text-sm text-red-500 dark:text-red-400">{error}</div>
      </Module>
    )
  }

  const year = new Date().getFullYear()
  const monthly = stats?.monthly_reads ?? []
  const counts = monthly.map(m => m.count)
  const hasExtraAllTime = stats !== null && stats.books_read > stats.books_read_this_year
  const unread =
    stats === null
      ? null
      : Math.max(0, stats.total_books - stats.books_read - stats.books_reading)

  return (
    <div className="flex flex-col gap-3">
      {/* Hero stat: this year's reads + sparkline */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('stats.read_in_year', { year })}
            </p>
            <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {stats === null ? (
                <span className="inline-block w-10 h-8 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
              ) : (
                stats.books_read_this_year.toLocaleString()
              )}
            </p>
          </div>
          {hasExtraAllTime && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('stats.all_time', { count: stats!.books_read })}
            </p>
          )}
        </div>
        <div className="mt-3">
          {stats === null ? (
            <div className="h-10 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ) : (
            <>
              <Sparkline data={counts} />
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">
                {t('stats.last_12_months')}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 2x2 stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t('stats.reading')}
          value={stats?.books_reading ?? null}
          accent="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label={t('stats.favourites')}
          value={stats?.favorites_count ?? null}
          accent="text-rose-600 dark:text-rose-400"
        />
        <StatCard label={t('stats.total_books')} value={stats?.total_books ?? null} />
        <StatCard label={t('stats.unread')} value={unread} />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent = 'text-gray-900 dark:text-white',
}: {
  label: string
  value: number | null
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
      <p className={`text-2xl font-bold tabular-nums ${accent}`}>
        {value === null ? (
          <span className="inline-block w-8 h-6 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        ) : (
          value.toLocaleString()
        )}
      </p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )
}

// ─── Continue Series ────────────────────────────────────────────────────────

function ContinueSeriesModule() {
  const { callApi } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [items, setItems] = useState<ContinueSeriesItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    callApi<ContinueSeriesItem[]>('/api/v1/dashboard/continue-series')
      .then(data => setItems(data ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t])

  return (
    <Module title={t('continue_series.title')} className="flex flex-col">
      <div className="px-5 pb-5 flex-1">
        {error ? (
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        ) : items === null ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3 items-center">
                <div className="w-10 aspect-[2/3] rounded bg-gray-100 dark:bg-gray-800 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  <div className="h-2 w-1/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
            {t('continue_series.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 -mx-5">
            {items.slice(0, 6).map(item => (
              <li key={`${item.series_id}:${item.book_id}`}>
                <Link
                  to={`/libraries/${item.library_id}/books/${item.book_id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <BookCover
                    title={item.title}
                    coverUrl={item.cover_url}
                    className="w-10"
                    readStatus={showReadBadges() && item.read_status ? item.read_status : undefined}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 truncate">
                      {item.series_name}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {item.title}
                    </p>
                    {item.authors && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {item.authors}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono tabular-nums">
                      #{formatPosition(item.last_read_position)} → #{formatPosition(item.position)}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[9rem]">
                      {item.library_name}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Module>
  )
}

function formatPosition(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// ─── Recently Finished ──────────────────────────────────────────────────────

function RecentlyFinishedModule() {
  const { callApi } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [books, setBooks] = useState<FinishedBook[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    callApi<FinishedBook[]>('/api/v1/dashboard/recently-finished')
      .then(data => setBooks(data ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t])

  const favouriteLabel = t('badges.favourite', { ns: 'common' })

  return (
    <Module title={t('recently_finished.title')}>
      <div className="px-5 pb-5">
        {error ? (
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        ) : books === null ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-10 aspect-[2/3] rounded bg-gray-100 dark:bg-gray-800 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  <div className="h-2 w-1/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : books.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
            {t('recently_finished.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 -mx-5">
            {books.slice(0, 6).map(b => (
              <li key={b.book_id}>
                <Link
                  to={`/libraries/${b.library_id}/books/${b.book_id}`}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <BookCover
                    title={b.title}
                    coverUrl={b.cover_url}
                    className="w-10"
                    readStatus={showReadBadges() ? 'read' : undefined}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                      {b.title}
                      {b.is_favorite && (
                        <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" role="img" aria-label={favouriteLabel}>
                          <title>{favouriteLabel}</title>
                          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                        </svg>
                      )}
                    </p>
                    {b.authors && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{b.authors}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {b.rating != null && (
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                        {t('recently_finished.rating', { rating: b.rating })}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {relativeTime(b.finished_at, t)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Module>
  )
}

// ─── Recently Added (horizontal scroll) ─────────────────────────────────────

function RecentlyAddedModule() {
  const { callApi } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [books, setBooks] = useState<DashboardBook[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    callApi<DashboardBook[]>('/api/v1/dashboard/recently-added')
      .then(data => setBooks(data ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t])

  const badges = showReadBadges()

  return (
    <Module title={t('recently_added.title')}>
      {error ? (
        <p className="px-5 pb-5 text-sm text-red-500 dark:text-red-400">{error}</p>
      ) : books === null ? (
        <div className="px-5 pb-5 flex gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="w-36 sm:w-40 flex-shrink-0">
              <div className="aspect-[2/3] rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
              <div className="mt-1.5 h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : books.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-gray-500 dark:text-gray-400">
          {t('recently_added.empty')}
        </p>
      ) : (
        <div className="px-5 pb-5 flex gap-3 overflow-x-auto scrollbar-thin">
          {books.map(b => (
            <Link
              key={b.book_id}
              to={`/libraries/${b.library_id}/books/${b.book_id}`}
              className="flex-shrink-0 w-36 sm:w-40 group"
              title={b.title}
            >
              <BookCover
                title={b.title}
                coverUrl={b.cover_url}
                className="w-36 sm:w-40"
                readStatus={badges && b.read_status ? b.read_status : undefined}
              />
              <p className="mt-1.5 text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                {b.title}
              </p>
              {b.authors && (
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 truncate">
                  {b.authors}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </Module>
  )
}

// ─── Picks of the day ───────────────────────────────────────────────────────

function PicksOfTheDayModule() {
  const { callApi } = useAuth()
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const [books, setBooks] = useState<DashboardBook[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    callApi<DashboardBook[]>('/api/v1/dashboard/picks-of-the-day')
      .then(data => setBooks(data ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load', { ns: 'common' })))
  }, [callApi, t])

  const today = new Date().toLocaleDateString(i18n.language, { month: 'long', day: 'numeric' })

  return (
    <Module
      title={t('picks_of_the_day.title')}
      action={
        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
          {today}
        </span>
      }
    >
      {error ? (
        <p className="px-5 pb-5 text-sm text-red-500 dark:text-red-400">{error}</p>
      ) : books === null ? (
        <div className="px-5 pb-5 flex gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="w-36 sm:w-40 flex-shrink-0">
              <div className="aspect-[2/3] rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
              <div className="mt-1.5 h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : books.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-gray-500 dark:text-gray-400">
          {t('picks_of_the_day.empty')}
        </p>
      ) : (
        <div className="px-5 pb-5 flex gap-3 overflow-x-auto scrollbar-thin">
          {books.map(b => (
            <Link
              key={b.book_id}
              to={`/libraries/${b.library_id}/books/${b.book_id}`}
              className="flex-shrink-0 w-36 sm:w-40 group"
              title={b.title}
            >
              <BookCover title={b.title} coverUrl={b.cover_url} className="w-36 sm:w-40" />
              <p className="mt-1.5 text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                {b.title}
              </p>
              {b.authors && (
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 truncate">
                  {b.authors}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </Module>
  )
}

// ─── Library chips (horizontal, header strip) ──────────────────────────────

function LibraryChips() {
  const { callApi } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [libraries, setLibraries] = useState<Library[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    callApi<Library[]>('/api/v1/libraries')
      .then(data => setLibraries(data ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : t('errors.failed_to_load_libraries', { ns: 'common' })))
  }, [callApi, t])

  if (error) {
    return (
      <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
    )
  }

  if (libraries === null) {
    return (
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-7 w-32 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (libraries.length === 0) {
    return (
      <Link
        to="/libraries"
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        {t('library_chips.create_first')}
      </Link>
    )
  }

  const publicLabel = t('badges.public', { ns: 'common' })

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin -mx-1 px-1">
      {libraries.map(lib => (
        <Link
          key={lib.id}
          to={`/libraries/${lib.id}`}
          className="group flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <span className="truncate max-w-[12rem]">{lib.name}</span>
          {lib.is_public && (
            <span
              className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-green-500"
              title={publicLabel}
              aria-label={publicLabel}
            />
          )}
        </Link>
      ))}
      <Link
        to="/libraries"
        className="flex-shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline pl-1"
      >
        {t('library_chips.view_all')}
      </Link>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()
  const { t } = useTranslation('dashboard')
  usePageTitle(t('page_title'))

  return (
    <>
      <PageHeader title={t('welcome_back', { name: user?.display_name ?? '' })} />
      <div className="p-4 sm:p-6 space-y-4 max-w-screen-2xl mx-auto">
        {/* Library chip strip */}
        <LibraryChips />

        {/* Row 1: Hero + Stats rail */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 min-w-0">
            <ContinueReadingHero />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <StatsRail />
          </div>
        </div>

        {/* Row 2: Continue Series + Recently Finished */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 min-w-0">
            <ContinueSeriesModule />
          </div>
          <div className="lg:col-span-7 min-w-0">
            <RecentlyFinishedModule />
          </div>
        </div>

        {/* Row 3: Picks of the day */}
        <PicksOfTheDayModule />

        {/* Row 4: AI suggestions — hidden entirely when empty */}
        <SuggestionsWidget type="read_next" />
        <SuggestionsWidget type="buy" />

        {/* Row 5: Recently Added (horizontal scroll) */}
        <RecentlyAddedModule />
      </div>
    </>
  )
}
