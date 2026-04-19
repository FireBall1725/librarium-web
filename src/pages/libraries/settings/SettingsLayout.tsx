// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect } from 'react'
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import type { LibraryOutletContext } from '../../../components/LibraryOutlet'

const TABS = [
  { path: 'media-files', label: 'Media Files' },
  { path: 'import',      label: 'Import' },
  { path: 'jobs',        label: 'Import Jobs' },
] as const

export default function SettingsLayout() {
  const { libraryId } = useParams<{ libraryId: string }>()
  const { setExtraCrumbs } = useOutletContext<LibraryOutletContext>()

  useEffect(() => {
    setExtraCrumbs([{ label: 'Settings' }])
    return () => setExtraCrumbs([])
  }, [setExtraCrumbs])

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      isActive
        ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
    }`

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-8 sticky top-0 z-10">
        <nav className="flex gap-1 -mb-px" aria-label="Settings sections">
          {TABS.map(tab => (
            <NavLink
              key={tab.path}
              to={`/libraries/${libraryId}/settings/${tab.path}`}
              className={tabClass}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Sub-page content */}
      <Outlet />
    </div>
  )
}
