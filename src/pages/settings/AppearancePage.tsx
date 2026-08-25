// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Appearance: theme, language, and how books are shown.
//
// The settings tree has linked here since the tree was written, but the page
// did not exist, so the link fell through the catch-all route and dropped the
// reader on the Dashboard.
//
// It absorbs PreferencesPage, which was a real page against a real preferences
// endpoint that nothing routed to. Read badges belong with the rest of what a
// reader controls about how the client looks, not on a page with no way in.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import { SettingRow, SettingSection, SettingsBody, Switch } from '../../components/settings/SettingRow'
import { usePageTitle } from '../../hooks/usePageTitle'
import { LOCALE_FLAGS, LOCALE_LABELS, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type SupportedLocale } from '../../i18n'
import { THEMES, applyTheme, readStoredTheme, storeTheme, type ThemeId } from '../../lib/theme'
import {
  READING_FONTS, applyReadingFont, readStoredReadingFont, storeReadingFont,
  type ReadingFontId,
} from '../../lib/readingFont'

export default function AppearancePage() {
  const { t, i18n } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('settings_nav.appearance', { defaultValue: 'Appearance' }))

  const [theme, setTheme] = useState<ThemeId>(readStoredTheme)
  const [readingFont, setReadingFont] = useState<ReadingFontId>(readStoredReadingFont)
  const [readBadges, setReadBadges] = useState(true)

  useEffect(() => {
    let cancelled = false
    callApi<{ prefs: Record<string, unknown> }>('/api/v1/auth/me/preferences')
      .then(({ prefs }) => {
        const value = prefs?.['show_read_badges']
        if (!cancelled && typeof value === 'boolean') setReadBadges(value)
      })
      .catch(() => { /* The default is on; a failed read should not flip it. */ })
    return () => { cancelled = true }
  }, [callApi])

  const chooseReadingFont = (id: ReadingFontId) => {
    setReadingFont(id)
    // Applied before it is stored, so the page changes under the click rather
    // than on the next load: a typeface is judged by looking at it.
    applyReadingFont(id)
    storeReadingFont(id)
  }

  const chooseTheme = (id: ThemeId) => {
    setTheme(id)
    applyTheme(id)
    storeTheme(id)
  }

  const chooseLocale = (locale: SupportedLocale) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    void i18n.changeLanguage(locale)
  }

  const toggleReadBadges = (next: boolean) => {
    // Optimistic: the switch is the reader's own preference and the server is
    // not going to disagree about it. A revert on failure would be a flicker
    // for something they can simply set again.
    setReadBadges(next)
    localStorage.setItem('librarium:show_read_badges', String(next))
    callApi('/api/v1/auth/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ show_read_badges: next }),
    }).catch(() => {})
  }

  return (
    <>
      <PageHeader
        title={t('settings_nav.appearance', { defaultValue: 'Appearance' })}
        description={t('settings_appearance.description', {
          defaultValue: 'This browser only. Nothing here changes what anyone else sees.',
        })}
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Appearance' }]}
      />

      <SettingsBody>
        <SettingSection title={t('settings_appearance.theme', { defaultValue: 'Theme' })}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 pt-1">
            {THEMES.map(meta => (
              <button
                key={meta.id}
                type="button"
                aria-pressed={theme === meta.id}
                onClick={() => chooseTheme(meta.id)}
                className={`rounded-xl bg-surface-muted p-3 text-left transition-colors ${
                  theme === meta.id
                    ? 'border-2 border-accent'
                    : 'border border-line-strong hover:border-content-faint'
                }`}
                // The swatch is painted with the theme's own tokens by scoping
                // data-theme to the card, so each one previews itself rather
                // than showing three copies of whatever is currently active.
                data-theme={meta.id === 'system' ? undefined : meta.id}
              >
                <span className="mb-2 flex gap-1.5">
                  <span className="size-3.5 rounded-full bg-accent" />
                  <span className="size-3.5 rounded-full bg-warning" />
                  <span className="size-3.5 rounded-full bg-success" />
                </span>
                <span className="lb-display block text-base text-content">{meta.label}</span>
                <span className="block text-[11px] text-content-tertiary">{meta.hint}</span>
              </button>
            ))}
          </div>
        </SettingSection>

        <SettingSection title={t('settings_appearance.typeface', { defaultValue: 'Typeface' })}>
          <p className="pb-1 text-[13px] text-content-tertiary">
            {t('settings_appearance.typeface_note', {
              defaultValue: 'OpenDyslexic weights the bottom of each letter and gives similar characters distinct shapes, which some readers with dyslexia find easier. It does not suit everyone, so it is offered rather than assumed.',
            })}
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 pt-1">
            {READING_FONTS.map(meta => (
              <button
                key={meta.id}
                type="button"
                aria-pressed={readingFont === meta.id}
                onClick={() => chooseReadingFont(meta.id)}
                className={`rounded-xl bg-surface-muted p-3 text-left transition-colors ${
                  readingFont === meta.id
                    ? 'border-2 border-accent'
                    : 'border border-line-strong hover:border-content-faint'
                }`}
              >
                {/* Set in the face it offers, so the choice is made by reading
                    it rather than by reading its name.

                    Both cards name their family, not just the dyslexic one.
                    The override that applies the choice is deliberately broad
                    enough to beat the nineteen places reference.css names a
                    family, which means it also reaches into this card: with
                    OpenDyslexic on, the Default sample rendered in
                    OpenDyslexic and the picker showed the same face twice. An
                    inline style outranks it. */}
                <span
                  className="block text-lg text-content"
                  style={{
                    fontFamily: meta.id === 'dyslexic'
                      ? '"OpenDyslexic", sans-serif'
                      : '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  {t('settings_appearance.typeface_sample', { defaultValue: 'Handful of books' })}
                </span>
                <span className="mt-1 block text-[13px] font-medium text-content">{meta.label}</span>
                <span className="block text-[11px] text-content-tertiary">{meta.hint}</span>
              </button>
            ))}
          </div>
        </SettingSection>

        <SettingSection title={t('settings_appearance.reading', { defaultValue: 'Reading' })}>
          <SettingRow
            label={t('settings_appearance.language', { defaultValue: 'Interface language' })}
            description={t('settings_appearance.language_note', {
              defaultValue: 'Switches the language throughout the web interface.',
            })}
          >
            <select
              className="lb-field w-[190px]"
              value={SUPPORTED_LOCALES.includes(i18n.language as SupportedLocale)
                ? i18n.language
                : 'en-CA'}
              onChange={e => chooseLocale(e.target.value as SupportedLocale)}
              aria-label={t('settings_appearance.language', { defaultValue: 'Interface language' })}
            >
              {SUPPORTED_LOCALES.map(locale => (
                <option key={locale} value={locale}>
                  {LOCALE_FLAGS[locale]} {LOCALE_LABELS[locale]}
                </option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            label={t('settings_appearance.read_badges', { defaultValue: 'Show read status badges' })}
            description={t('settings_appearance.read_badges_note', {
              defaultValue: 'A coloured corner on covers for read and in-progress books.',
            })}
          >
            <Switch
              checked={readBadges}
              label={t('settings_appearance.read_badges', { defaultValue: 'Show read status badges' })}
              onChange={toggleReadBadges}
            />
          </SettingRow>
        </SettingSection>
      </SettingsBody>
    </>
  )
}
