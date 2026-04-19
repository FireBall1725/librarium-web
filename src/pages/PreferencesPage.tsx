// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'

export default function PreferencesPage() {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const [showReadBadges, setShowReadBadges] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    callApi<{ prefs: Record<string, unknown> }>('/api/v1/auth/me/preferences')
      .then(({ prefs }) => {
        const rb = prefs['show_read_badges']
        if (typeof rb === 'boolean') setShowReadBadges(rb)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [callApi])

  const handleToggle = async (key: string, value: boolean) => {
    // optimistic update
    if (key === 'show_read_badges') setShowReadBadges(value)
    localStorage.setItem(`librarium:${key}`, String(value))
    try {
      await callApi('/api/v1/auth/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      })
    } catch {
      showToast('Failed to save preference', { variant: 'error' })
      // revert on error
      if (key === 'show_read_badges') setShowReadBadges(!value)
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Preferences</h1>

        {/* Display section */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
            Display
          </h2>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {/* Show read status badges */}
            <div className="flex items-center justify-between px-6 py-4">
              <div className="min-w-0 mr-6">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Show read status badges
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Show a corner badge on book covers indicating your read status (read, reading, did not finish)
                </p>
              </div>
              {loading ? (
                <div className="h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggle('show_read_badges', !showReadBadges)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                    showReadBadges ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                  role="switch"
                  aria-checked={showReadBadges}
                  aria-label="Show read status badges"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      showReadBadges ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
