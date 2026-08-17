// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { Fragment, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { LIBRARY_SECTIONS } from '../lib/librarySections'
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

  /**
   * Split the crumbs into the trail you can go back along and the one name the
   * heading carries.
   *
   * The library itself is the first crumb, so a page that sets no crumbs of its
   * own is the library overview: nothing to walk back through, and the library
   * name is the heading. Otherwise the deepest crumb is the current page, which
   * the heading takes, and everything above it stays walkable.
   */
  const crumbs: Crumb[] = library
    ? [{ label: library.name, to: `/libraries/${libraryId}` }, ...extraCrumbs]
    : []
  const trail = crumbs.slice(0, -1)
  const heading = crumbs.length > 0 ? crumbs[crumbs.length - 1].label : null

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
      isActive
        ? 'border-accent text-accent-strong dark:text-accent'
        : 'border-transparent text-content-muted hover:text-content-secondary'
    }`

  return (
    <div className="flex flex-col h-full">
      {/* Sticky breadcrumb + library title + section tabs */}
      <div className="flex-shrink-0 sticky top-0 z-20 border-b border-line bg-surface px-8 pt-4">
        <nav className="flex items-center gap-2 text-sm flex-wrap mb-1" aria-label="Breadcrumb">
          <Link to="/libraries" className="text-content-muted hover:text-content-secondary transition-colors">
            {t('nav.libraries')}
          </Link>
          {/* The trail stops one short of the heading below it.
              It used to run all the way to the current page, and the h1 then
              rendered that same last crumb verbatim, so every library page
              printed its own name twice, stacked twenty pixels apart: a book
              read "… / Books / Dune 1" above "Dune 1", and a library overview
              read "Libraries / Fiction" above "Fiction". Saying what you can go
              back to is the trail's job; naming where you already are is the
              heading's. */}
          {trail.map((crumb, i) => (
            <Fragment key={i}>
              <span className="text-content-faint">/</span>
              {crumb.to ? (
                <Link to={crumb.to} className="text-content-muted hover:text-content-secondary transition-colors truncate max-w-xs">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-content-muted truncate max-w-xs">{crumb.label}</span>
              )}
            </Fragment>
          ))}
        </nav>
        {heading && <h1 className="text-xl font-bold text-content">{heading}</h1>}

        {/* The way between a library's own pages.
            Was `=== 0`, which meant never: every section sets a crumb for
            itself, so the tabs were dead code the whole time. They matter now
            that the sidebar no longer carries this list, since otherwise
            reaching Loans from Series means going back out to Libraries.
            Still hidden one level deeper, where the crumb trail is what
            navigates. */}
        {library && extraCrumbs.length <= 1 && (
          <div className="mt-3 -mx-1 flex items-center gap-1 overflow-x-auto scrollbar-thin">
            {LIBRARY_SECTIONS.map(({ section, labelKey }) => (
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
