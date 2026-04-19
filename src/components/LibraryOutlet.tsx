// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { Fragment, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../auth/AuthContext'
import type { Library, MediaType } from '../types'

export interface Crumb {
  label: string
  to?: string
}

export interface LibraryOutletContext {
  library: Library | null
  mediaTypes: MediaType[]
  setExtraCrumbs: (crumbs: Crumb[]) => void
}

const NAV_SECTIONS: Array<{ section: string; labelKey: string }> = [
  { section: 'books',        labelKey: 'library_nav.books' },
  { section: 'contributors', labelKey: 'library_nav.contributors' },
  { section: 'shelves',      labelKey: 'library_nav.shelves' },
  { section: 'series',       labelKey: 'library_nav.series' },
  { section: 'loans',        labelKey: 'library_nav.loans' },
  { section: 'members',      labelKey: 'library_nav.members' },
]

export default function LibraryOutlet() {
  const { libraryId } = useParams<{ libraryId: string }>()
  const { callApi } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [library, setLibrary] = useState<Library | null>(null)
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])
  const [extraCrumbs, setExtraCrumbs] = useState<Crumb[]>([])

  // Update document.title based on current breadcrumb context
  useEffect(() => {
    const parts: string[] = []
    if (extraCrumbs.length > 0) parts.push(extraCrumbs[extraCrumbs.length - 1].label)
    if (library) parts.push(library.name)
    parts.push('Librarium')
    document.title = parts.join(' — ')
    return () => { document.title = 'Librarium' }
  }, [library, extraCrumbs])

  // Fetch library + media types together whenever the library changes.
  // callApi is stable (ref-based) so it is intentionally omitted from deps.
  useEffect(() => {
    if (!libraryId) return
    let cancelled = false
    Promise.all([
      callApi<Library>(`/api/v1/libraries/${libraryId}`),
      callApi<MediaType[]>('/api/v1/media-types'),
    ]).then(([lib, mts]) => {
      if (cancelled) return
      setLibrary(lib)
      setMediaTypes(mts ?? [])
    }).catch(err => {
      if (cancelled) return
      if (err instanceof ApiError && err.status === 404) navigate('/libraries', { replace: true })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId])

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
      isActive
        ? 'border-blue-500 text-blue-700 dark:text-blue-400'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`

  return (
    <div className="flex flex-col h-full">
      {/* Sticky breadcrumb + library title + section tabs */}
      <div className="flex-shrink-0 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-8 pt-4">
        <nav className="flex items-center gap-2 text-sm flex-wrap mb-1" aria-label="Breadcrumb">
          <Link to="/libraries" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            {t('nav.libraries')}
          </Link>
          {library && (
            <>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <span className="text-gray-500 dark:text-gray-400 truncate max-w-xs">{library.name}</span>
            </>
          )}
          {extraCrumbs.map((crumb, i) => (
            <Fragment key={i}>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              {crumb.to ? (
                <Link to={crumb.to} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors truncate max-w-xs">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-500 dark:text-gray-400 truncate max-w-xs">{crumb.label}</span>
              )}
            </Fragment>
          ))}
        </nav>
        {extraCrumbs.length > 0 ? (
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {extraCrumbs[extraCrumbs.length - 1].label}
          </h1>
        ) : (
          library && <h1 className="text-xl font-bold text-gray-900 dark:text-white">{library.name}</h1>
        )}

        {/* Library section tabs (hidden when rendering deeper views with their own crumbs) */}
        {library && extraCrumbs.length === 0 && (
          <div className="mt-3 -mx-1 flex items-center gap-1 overflow-x-auto scrollbar-thin">
            {NAV_SECTIONS.map(({ section, labelKey }) => (
              <NavLink
                key={section}
                to={`/libraries/${libraryId}/${section}`}
                className={tabClass}
              >
                {t(labelKey)}
              </NavLink>
            ))}
          </div>
        )}
      </div>

      {/* Page content */}
      <Outlet context={{ library, mediaTypes, setExtraCrumbs } satisfies LibraryOutletContext} />
    </div>
  )
}
