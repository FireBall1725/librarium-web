// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'
import TasteProfileForm from '../../components/TasteProfileForm'
import type { UserAIPrefs } from '../../types'
import { SectionHeading, cardClass } from './shared'

// AITab hosts the AI opt-in toggle and the taste profile — both relate to
// how the suggestions feature uses the user's data.
export default function AITab() {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()

  const [aiOptIn, setAiOptIn] = useState(false)
  const [aiPrefsLoading, setAiPrefsLoading] = useState(true)
  const [aiOptInSaving, setAiOptInSaving] = useState(false)

  useEffect(() => {
    callApi<UserAIPrefs>('/api/v1/me/ai-prefs')
      .then(p => setAiOptIn(Boolean(p?.opt_in)))
      .catch(() => {})
      .finally(() => setAiPrefsLoading(false))
  }, [callApi])

  const handleAiOptInToggle = async (next: boolean) => {
    setAiOptInSaving(true)
    try {
      await callApi('/api/v1/me/ai-prefs', {
        method: 'PUT',
        body: JSON.stringify({ opt_in: next }),
      })
      setAiOptIn(next)
      // Notify the sidebar so the Suggestions link shows/hides without reload.
      window.dispatchEvent(new Event('librarium:ai-prefs-changed'))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update AI preferences', { variant: 'error' })
    } finally {
      setAiOptInSaving(false)
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading label="AI privacy" />
        <div className={cardClass}>
          <div className="flex items-center justify-between px-6 py-4">
            <div className="min-w-0 mr-6">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Allow AI features to use my data</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                When on, AI-powered suggestions may read categories the admin has allowed
                (reading history, ratings, favourites, full library, and your taste profile
                below). Turning this off disables AI suggestions for you entirely.
              </p>
            </div>
            {aiPrefsLoading ? (
              <div className="h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
            ) : (
              <button
                type="button"
                onClick={() => handleAiOptInToggle(!aiOptIn)}
                disabled={aiOptInSaving}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                  aiOptIn ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                } disabled:opacity-60`}
                role="switch"
                aria-checked={aiOptIn}
                aria-label="Allow AI features"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    aiOptIn ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionHeading label="Taste profile" />
        <p className="mb-3 -mt-2 text-xs text-gray-500 dark:text-gray-400">
          Optional. Helps the AI generate more personal suggestions. All fields are optional;
          empty categories aren't sent.
          {!aiOptIn && !aiPrefsLoading && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              You haven't opted in to AI features, so this profile won't be used.
            </span>
          )}
        </p>
        <TasteProfileForm />
      </section>
    </div>
  )
}
