// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Profiles: nothing built yet, said plainly.
//
// This is the one settings page with no real facts behind it, so it stays a
// list of what is coming. What changes is that it says so in one line and
// then lists the three, rather than dressing the same statement up as a card
// with a clock icon that looks like a feature until you read it.

import { useTranslation } from 'react-i18next'
import PageHeader from '../../../components/PageHeader'
import { SettingRow, SettingsBody } from '../../../components/settings/SettingRow'
import { usePageTitle } from '../../../hooks/usePageTitle'

const PLANNED = [
  ['Reading profiles', 'Preferred formats, languages and edition preferences, per library.'],
  ['Quality profiles', 'Which media types and formats are acceptable for a collection.'],
  ['Notification profiles', 'Per-user alerts for new releases and overdue loans.'],
] as const

export default function ProfilesPage() {
  const { t } = useTranslation()
  usePageTitle(t('settings_nav.profiles', { defaultValue: 'Profiles' }))

  return (
    <>
      <PageHeader
        title={t('settings_nav.profiles', { defaultValue: 'Profiles' })}
        description="Reusable reading and quality profiles that can be applied to libraries."
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Profiles' }]}
      />

      <SettingsBody>
        <p className="lb-read mb-4 text-[13.5px] text-content-tertiary">
          None of this is built yet. It is listed so the shape of the page is
          clear before there is anything on it.
        </p>
        {PLANNED.map(([label, description]) => (
          <SettingRow key={label} label={label} description={description}>
            <span className="lb-chip">{t('common.planned', { defaultValue: 'Planned' })}</span>
          </SettingRow>
        ))}
      </SettingsBody>
    </>
  )
}
