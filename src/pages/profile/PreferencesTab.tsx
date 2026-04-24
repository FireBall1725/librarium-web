// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'
import { LOCALE_FLAGS, LOCALE_LABELS, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type SupportedLocale } from '../../i18n'
import { SectionHeading, cardClass } from './shared'

// PreferencesTab hosts language + display preferences — the settings that
// don't involve identity or AI. Stays intentionally small; this is where new
// "how the app looks or behaves" toggles will land.
export default function PreferencesTab() {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const { i18n } = useTranslation()

  const currentLocale: SupportedLocale = (SUPPORTED_LOCALES as readonly string[]).includes(i18n.resolvedLanguage ?? '')
    ? (i18n.resolvedLanguage as SupportedLocale)
    : 'en-CA'

  const handleLocaleChange = async (locale: SupportedLocale) => {
    await i18n.changeLanguage(locale)
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }

  const [showReadBadges, setShowReadBadges] = useState(true)
  const [prefsLoading, setPrefsLoading] = useState(true)

  useEffect(() => {
    callApi<{ prefs: Record<string, unknown> }>('/api/v1/auth/me/preferences')
      .then(({ prefs }) => {
        const rb = prefs['show_read_badges']
        if (typeof rb === 'boolean') setShowReadBadges(rb)
      })
      .catch(() => {})
      .finally(() => setPrefsLoading(false))
  }, [callApi])

  const handleToggle = async (key: string, value: boolean) => {
    if (key === 'show_read_badges') setShowReadBadges(value)
    localStorage.setItem(`librarium:${key}`, String(value))
    try {
      await callApi('/api/v1/auth/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      })
    } catch {
      showToast('Failed to save preference', { variant: 'error' })
      if (key === 'show_read_badges') setShowReadBadges(!value)
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading label="Language" />
        <div className={cardClass}>
          <div className="flex items-center justify-between px-6 py-4 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Interface language</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Switches the language used throughout the web interface.
              </p>
            </div>
            <select
              value={currentLocale}
              onChange={e => handleLocaleChange(e.target.value as SupportedLocale)}
              className="flex-shrink-0 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SUPPORTED_LOCALES.map(locale => (
                <option key={locale} value={locale}>
                  {LOCALE_FLAGS[locale]}  {LOCALE_LABELS[locale]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading label="Display" />
        <div className={cardClass}>
          <div className="flex items-center justify-between px-6 py-4">
            <div className="min-w-0 mr-6">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Show read status badges</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Show a coloured corner badge on book covers indicating your read status
                (read, reading, did not finish)
              </p>
            </div>
            {prefsLoading ? (
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
  )
}
