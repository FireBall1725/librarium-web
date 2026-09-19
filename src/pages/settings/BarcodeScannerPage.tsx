// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The hardware barcode scanner. Per browser, like Appearance, because it's
// about the scanner plugged into this computer rather than the account.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/PageHeader'
import { SettingRow, SettingSection, SettingsBody, Switch } from '../../components/settings/SettingRow'
import { usePageTitle } from '../../hooks/usePageTitle'
import { readScannerEnabled, storeScannerEnabled } from '../../lib/barcodeScanner'

export default function BarcodeScannerPage() {
  const { t } = useTranslation()
  const title = t('settings_nav.barcode_scanner', { defaultValue: 'Barcode scanner' })
  usePageTitle(title)
  const [scanner, setScanner] = useState(readScannerEnabled)
  const toggle = (on: boolean) => { storeScannerEnabled(on); setScanner(on) }

  return (
    <>
      <PageHeader
        title={title}
        description={t('barcode_scanner.description', {
          defaultValue: 'A Bluetooth or USB scanner in keyboard mode. This browser only.',
        })}
        breadcrumbs={[{ label: t('settings.title', { defaultValue: 'Settings' }), to: '/settings' }, { label: title }]}
      />
      <SettingsBody>
        <SettingSection title={t('barcode_scanner.scanning', { defaultValue: 'Scanning' })}>
          <SettingRow
            label={t('barcode_scanner.toggle', { defaultValue: 'Use a Bluetooth or USB scanner' })}
            description={t('barcode_scanner.note', {
              defaultValue: "Scan a book's barcode on any page: a book you have opens, a new one starts Add Book. Turn this off if a scanner ever gets in the way of typing.",
            })}
          >
            <Switch
              checked={scanner}
              label={t('barcode_scanner.toggle', { defaultValue: 'Use a Bluetooth or USB scanner' })}
              onChange={toggle}
            />
          </SettingRow>
        </SettingSection>
      </SettingsBody>
    </>
  )
}
