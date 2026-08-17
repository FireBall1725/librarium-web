// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The Account section: Profile, API tokens, and AI and privacy.
//
// These were tabs on one page. The reference lists them as three separate
// entries under Account, which is also what makes them addressable: a tab is
// not a URL, so "your API tokens" could not be linked to, appear in the
// settings tree, or be found by anyone who did not already know the tab bar
// existed.
//
// Each page is a header plus the tab component it always was. The tabs already
// hold their own state and fetching; splitting them is a routing change, not a
// rewrite, and the shared styles they import moved to the reference components
// in one edit.

import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/PageHeader'
import { SettingsBody } from '../../components/settings/SettingRow'
import { usePageTitle } from '../../hooks/usePageTitle'
import AccountTab from '../profile/AccountTab'
import AITab from '../profile/AITab'
import ApiTokensTab from '../profile/ApiTokensTab'

export function ProfilePage() {
  const { t } = useTranslation()
  usePageTitle(t('settings_nav.profile', { defaultValue: 'Profile' }))
  return (
    <>
      <PageHeader
        title={t('settings_nav.profile', { defaultValue: 'Profile' })}
        description={t('settings_account.profile_description', {
          defaultValue: 'Your account on this instance.',
        })}
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Profile' }]}
      />
      <SettingsBody>
        <AccountTab />
      </SettingsBody>
    </>
  )
}

export function ApiTokensPage() {
  const { t } = useTranslation()
  usePageTitle(t('settings_nav.tokens', { defaultValue: 'API tokens' }))
  return (
    <>
      <PageHeader
        title={t('settings_nav.tokens', { defaultValue: 'API tokens' })}
        description={t('settings_account.tokens_description', {
          defaultValue:
            'Tokens act as you, limited to the scopes you give them. Anything holding one can do what it allows until you revoke it.',
        })}
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'API tokens' }]}
      />
      <SettingsBody>
        <ApiTokensTab />
      </SettingsBody>
    </>
  )
}

export function AiPrivacyPage() {
  const { t } = useTranslation()
  usePageTitle(t('settings_nav.ai_privacy', { defaultValue: 'AI and privacy' }))
  return (
    <>
      <PageHeader
        title={t('settings_nav.ai_privacy', { defaultValue: 'AI and privacy' })}
        description={t('settings_account.ai_description', {
          defaultValue:
            'What an AI provider is allowed to see about your reading. Off unless you turn it on.',
        })}
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'AI and privacy' }]}
      />
      <SettingsBody>
        <AITab />
      </SettingsBody>
    </>
  )
}
