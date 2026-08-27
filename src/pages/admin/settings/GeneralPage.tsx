// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// General: what this instance is and where it keeps things.
//
// It used to be a single "Coming soon" card listing four settings that do not
// exist. The facts below are real and already served, and a page that answers
// "which version am I on" and "where are my covers written" earns its place
// even while the settings themselves are still to come. The planned items stay,
// but as rows marked planned rather than as the whole page.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../auth/AuthContext'
import PageHeader from '../../../components/PageHeader'
import { KeyValue, SettingRow, SettingSection, SettingsBody } from '../../../components/settings/SettingRow'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { withBase } from '../../../lib/basePath'

interface AdminConfig {
  cover_storage_path: string
  ebook_storage_path: string
  audiobook_storage_path: string
  ebook_path_template: string
  audiobook_path_template: string
  registration_enabled: boolean
}

const PLANNED = [
  ['Instance name', 'Shown in the browser tab and on the sign-in page.'],
  ['Authentication', 'OIDC and LDAP as external sign-in providers.'],
  ['Backups', 'Scheduled database backups.'],
] as const

export default function GeneralPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('settings_nav.general', { defaultValue: 'General' }))

  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [apiVersion, setApiVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // callApi unwraps the response envelope, so this is the config itself and
    // not { data }. Reading r.data here set config to undefined, which slipped
    // past a === null guard and took the page down.
    callApi<AdminConfig>('/api/v1/admin/config')
      .then(r => { if (!cancelled) setConfig(r ?? null) })
      .catch(() => {})
    // The same endpoint the footer reads. Unauthenticated on purpose, so it
    // answers even when the token has expired.
    fetch(withBase('/health'))
      .then(r => r.json())
      .then(d => { if (!cancelled) setApiVersion(d.version ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [callApi])

  const unknown = t('common.unknown', { defaultValue: 'Unknown' })

  return (
    <>
      <PageHeader
        title={t('settings_nav.general', { defaultValue: 'General' })}
        description={t('settings_general.description', {
          defaultValue: 'What this instance is running and where it keeps things.',
        })}
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'General' }]}
      />

      <SettingsBody>
        <SettingSection title={t('settings_general.version', { defaultValue: 'Version' })}>
          <KeyValue
            rows={[
              [t('footer.web', { defaultValue: 'Web' }), `v${__APP_VERSION__}`],
              [t('footer.api', { defaultValue: 'API' }), apiVersion ? `v${apiVersion}` : unknown],
              [t('settings_general.licence', { defaultValue: 'Licence' }), 'AGPL-3.0-only'],
            ]}
          />
        </SettingSection>

        <SettingSection
          title={t('settings_general.storage', { defaultValue: 'Storage' })}
          description={t('settings_general.storage_note', {
            defaultValue:
              'Set on the server, not here. These are the paths the running instance is using.',
          })}
        >
          <KeyValue
            rows={[
              [t('settings_general.covers', { defaultValue: 'Covers' }), config?.cover_storage_path || unknown],
              [t('settings_general.ebooks', { defaultValue: 'Ebooks' }), config?.ebook_storage_path || unknown],
              [t('settings_general.audiobooks', { defaultValue: 'Audiobooks' }), config?.audiobook_storage_path || unknown],
            ]}
          />
        </SettingSection>

        <SettingSection title={t('settings_general.access', { defaultValue: 'Access' })}>
          <SettingRow
            label={t('settings_general.registration', { defaultValue: 'Registration' })}
            description={t('settings_general.registration_note', {
              defaultValue: 'Whether anyone can create an account on this instance.',
            })}
          >
            <span className={`lb-chip ${config?.registration_enabled ? 'good' : ''}`}>
              {!config
                ? unknown
                : config.registration_enabled
                  ? t('common.open', { defaultValue: 'Open' })
                  : t('common.closed', { defaultValue: 'Closed' })}
            </span>
          </SettingRow>
        </SettingSection>

        <SettingSection
          title={t('settings_general.planned', { defaultValue: 'Planned' })}
          description={t('settings_general.planned_note', {
            defaultValue: 'Not built yet. Listed so it is clear what this page will grow into.',
          })}
        >
          {PLANNED.map(([label, description]) => (
            <SettingRow key={label} label={label} description={description}>
              <span className="lb-chip">
                {t('common.planned', { defaultValue: 'Planned' })}
              </span>
            </SettingRow>
          ))}
        </SettingSection>
      </SettingsBody>
    </>
  )
}
