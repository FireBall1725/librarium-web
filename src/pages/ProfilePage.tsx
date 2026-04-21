// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import TasteProfileForm from '../components/TasteProfileForm'
import type { User, UserAIPrefs } from '../types'
import { LOCALE_FLAGS, LOCALE_LABELS, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type SupportedLocale } from '../i18n'

// ─── Reusable field row ───────────────────────────────────────────────────────

function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      <label
        className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, callApi, updateUser } = useAuth()
  const { show: showToast } = useToast()
  const { i18n } = useTranslation()

  const currentLocale: SupportedLocale = (SUPPORTED_LOCALES as readonly string[]).includes(i18n.resolvedLanguage ?? '')
    ? (i18n.resolvedLanguage as SupportedLocale)
    : 'en-CA'

  const handleLocaleChange = async (locale: SupportedLocale) => {
    await i18n.changeLanguage(locale)
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }

  // ── Profile section ─────────────────────────────────────────────────────────

  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [profileSaving, setProfileSaving] = useState(false)

  // Sync if the user object updates externally (e.g. token refresh)
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name)
      setEmail(user.email)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedName = displayName.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName || !trimmedEmail) return
    setProfileSaving(true)
    try {
      const updated = await callApi<User>('/api/v1/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ display_name: trimmedName, email: trimmedEmail }),
      })
      updateUser(updated)
      showToast('Profile updated', { variant: 'success' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile', { variant: 'error' })
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Password section ────────────────────────────────────────────────────────

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', { variant: 'error' })
      return
    }
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', { variant: 'error' })
      return
    }
    setPasswordSaving(true)
    try {
      await callApi('/api/v1/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      showToast('Password changed', { variant: 'success' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to change password', { variant: 'error' })
    } finally {
      setPasswordSaving(false)
    }
  }

  // ── Preferences section ─────────────────────────────────────────────────────

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

  // ── AI preferences section ─────────────────────────────────────────────────

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
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update AI preferences', { variant: 'error' })
    } finally {
      setAiOptInSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const cardClass =
    'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800'

  const sectionHeading = (label: string) => (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
      {label}
    </h2>
  )

  return (
    <div className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-10">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile &amp; Preferences</h1>

        {/* ── Profile ── */}
        <section>
          {sectionHeading('Profile')}
          <form onSubmit={handleProfileSave} className={cardClass}>
            <FieldRow label="Username">
              <p className="text-sm text-gray-700 dark:text-gray-300">{user?.username}</p>
            </FieldRow>

            <FieldRow label="Display name" htmlFor="display-name">
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoComplete="name"
                className={inputClass}
              />
            </FieldRow>

            <FieldRow label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                className={inputClass}
              />
            </FieldRow>

            <div className="px-6 py-4 flex justify-end">
              <button
                type="submit"
                disabled={profileSaving || !displayName.trim() || !email.trim()}
                className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {profileSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>

        {/* ── Security ── */}
        <section>
          {sectionHeading('Security')}
          <form onSubmit={handlePasswordChange} className={cardClass}>
            <FieldRow label="Current password" htmlFor="current-password">
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className={inputClass}
              />
            </FieldRow>

            <FieldRow label="New password" htmlFor="new-password">
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </FieldRow>

            <FieldRow label="Confirm new password" htmlFor="confirm-password">
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </FieldRow>

            <div className="px-6 py-4 flex justify-end">
              <button
                type="submit"
                disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {passwordSaving ? 'Updating…' : 'Change password'}
              </button>
            </div>
          </form>
        </section>

        {/* ── Language ── */}
        <section>
          {sectionHeading('Language')}
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

        {/* ── AI Privacy ── */}
        <section>
          {sectionHeading('AI Privacy')}
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

        {/* ── Taste profile ── */}
        <section>
          {sectionHeading('Taste profile')}
          <p className="mb-3 -mt-2 text-xs text-gray-500 dark:text-gray-400">
            Optional. Helps the AI generate more personal suggestions. All fields are optional — empty
            categories aren't sent.
            {!aiOptIn && !aiPrefsLoading && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                You haven't opted in to AI features, so this profile won't be used.
              </span>
            )}
          </p>
          <TasteProfileForm />
        </section>

        {/* ── Display preferences ── */}
        <section>
          {sectionHeading('Display')}
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
    </div>
  )
}
