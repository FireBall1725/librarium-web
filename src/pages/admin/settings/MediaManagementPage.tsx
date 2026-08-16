// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Media Management: where files land and how they are named.
//
// Everything here is set by environment variable on the server, so the page
// reports rather than edits. That is worth saying once at the top instead of
// repeating "Set via SOME_VARIABLE" on eight separate rows, which is what the
// page used to do and what buried the paths themselves.

import { useEffect, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import PageHeader from '../../../components/PageHeader'
import { SettingRow, SettingSection, SettingsBody } from '../../../components/settings/SettingRow'
import { usePageTitle } from '../../../hooks/usePageTitle'

interface InstanceConfig {
  cover_storage_path: string
  ebook_storage_path: string
  audiobook_storage_path: string
  ebook_path_template: string
  audiobook_path_template: string
  registration_enabled: boolean
}

const PATH_TOKENS: Array<[token: string, meaning: string]> = [
  ['{author}', 'First author name'],
  ['{title}', 'Book title'],
  ['{year}', 'Publication year'],
  ['{isbn13}', 'ISBN-13'],
  ['{isbn10}', 'ISBN-10'],
  ['{edition}', 'Edition name'],
]

/** A value that came from the server's configuration, shown as code. */
function ConfigValue({ value, variable }: { value: string | undefined; variable: string }) {
  return (
    <span className="flex flex-col items-end gap-1">
      <code className="lb-lictag">{value || '…'}</code>
      <code className="text-[10px] text-content-faint">{variable}</code>
    </span>
  )
}

const ENABLED = <span className="lb-chip good">Enabled</span>

export default function MediaManagementPage() {
  usePageTitle('Media Management')
  const { callApi } = useAuth()
  const [config, setConfig] = useState<InstanceConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    callApi<InstanceConfig>('/api/v1/admin/config')
      .then(r => { if (!cancelled) setConfig(r ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [callApi])

  return (
    <>
      <PageHeader
        title="Media Management"
        description="Where covers and edition files are written, and how their paths are built."
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Media Management' }]}
      />

      <SettingsBody>
        <p className="lb-read mb-6 text-[13.5px] text-content-tertiary">
          These are set on the server through environment variables, named
          beneath each value. This page reports what the running instance is
          using; changing any of it means restarting with a different value.
        </p>

        <SettingSection title="Covers">
          <SettingRow label="Storage path" description="Where cover images are written on disk.">
            <ConfigValue value={config?.cover_storage_path} variable="COVER_STORAGE_PATH" />
          </SettingRow>
          <SettingRow
            label="Fetch on metadata apply"
            description="Applying metadata from a provider downloads the selected cover."
          >
            {ENABLED}
          </SettingRow>
          <SettingRow
            label="Manual upload"
            description="A cover can be uploaded directly from the book page."
          >
            {ENABLED}
          </SettingRow>
        </SettingSection>

        <SettingSection title="Ebooks">
          <SettingRow label="Storage path" description="Root directory for uploaded EPUB and PDF files.">
            <ConfigValue value={config?.ebook_storage_path} variable="EBOOK_STORAGE_PATH" />
          </SettingRow>
          <SettingRow
            label="Path template"
            description={
              <>
                Subdirectories inside the storage path. Files land at{' '}
                <span className="font-mono">
                  {config?.ebook_storage_path ?? '…'}/
                  <span className="text-accent">{config?.ebook_path_template ?? '{author}/{title}'}</span>
                  /filename.epub
                </span>
              </>
            }
          >
            <ConfigValue value={config?.ebook_path_template} variable="EBOOK_PATH_TEMPLATE" />
          </SettingRow>
        </SettingSection>

        <SettingSection title="Audiobooks">
          <SettingRow label="Storage path" description="Root directory for uploaded MP3 and M4B files.">
            <ConfigValue value={config?.audiobook_storage_path} variable="AUDIOBOOK_STORAGE_PATH" />
          </SettingRow>
          <SettingRow
            label="Path template"
            description={
              <>
                Files land at{' '}
                <span className="font-mono">
                  {config?.audiobook_storage_path ?? '…'}/
                  <span className="text-accent">{config?.audiobook_path_template ?? '{title}'}</span>
                  /filename.m4b
                </span>
              </>
            }
          >
            <ConfigValue value={config?.audiobook_path_template} variable="AUDIOBOOK_PATH_TEMPLATE" />
          </SettingRow>
        </SettingSection>

        <SettingSection
          title="Template tokens"
          description="What a path template can contain. Anything else is used literally."
        >
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-x-6 gap-y-2 pt-1">
            {PATH_TOKENS.map(([token, meaning]) => (
              <div key={token} className="flex items-center gap-2">
                <code className="lb-lictag flex-none">{token}</code>
                <span className="text-xs text-content-tertiary">{meaning}</span>
              </div>
            ))}
          </div>
          <p className="lb-read mt-3 text-[13px] text-content-tertiary">
            <code className="lb-lictag">{'{title} ({year})'}</code> gives{' '}
            <code className="lb-lictag">Project Hail Mary (2021)/project-hail-mary.epub</code>
          </p>
        </SettingSection>

        <SettingSection title="Files">
          <SettingRow
            label="Upload"
            description="Files attach to a digital edition from the book page and are filed using the template above."
          >
            {ENABLED}
          </SettingRow>
          <SettingRow
            label="Storage location scan"
            description="Server-side directories scanned to link files to editions by ISBN. Configured per library."
          >
            {ENABLED}
          </SettingRow>
        </SettingSection>

        <SettingSection
          title="Planned"
          description="Not built yet."
        >
          <SettingRow
            label="Duplicate detection"
            description="Flag repeated ISBNs across libraries."
          >
            <span className="lb-chip">Planned</span>
          </SettingRow>
          <SettingRow
            label="Bulk editing"
            description="Apply a change to many books or editions at once."
          >
            <span className="lb-chip">Planned</span>
          </SettingRow>
        </SettingSection>
      </SettingsBody>
    </>
  )
}
