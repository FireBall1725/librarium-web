// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import PageHeader from '../../../components/PageHeader'
import { usePageTitle } from '../../../hooks/usePageTitle'

interface InstanceConfig {
  cover_storage_path: string
  ebook_storage_path: string
  audiobook_storage_path: string
  ebook_path_template: string
  audiobook_path_template: string
  registration_enabled: boolean
}

const PATH_TOKENS = [
  { token: '{author}', desc: 'First author name' },
  { token: '{title}',  desc: 'Book title' },
  { token: '{year}',   desc: 'Publication year' },
  { token: '{isbn13}', desc: 'ISBN-13' },
  { token: '{isbn10}', desc: 'ISBN-10' },
  { token: '{edition}', desc: 'Edition name' },
]

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function PlannedItem({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="mt-0.5 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
    </div>
  )
}

export default function MediaManagementPage() {
  usePageTitle('Media Management')
  const { callApi } = useAuth()
  const [config, setConfig] = useState<InstanceConfig | null>(null)

  useEffect(() => {
    callApi<InstanceConfig>('/api/v1/admin/config')
      .then(r => setConfig(r ?? null))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <PageHeader
        title="Media Management"
        description="Control how books, covers, and attachments are organised and stored."
        breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Media Management' }]}
      />
      <div className="max-w-3xl px-8 py-8 space-y-8">

        {/* Cover Images — active */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Cover Images</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Storage path</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Directory where cover images are stored on disk. Set via the COVER_STORAGE_PATH environment variable.
              </p>
              <code className="mt-2 inline-block text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                {config ? config.cover_storage_path : '…'}
              </code>
            </div>
            <SettingRow
              label="Auto-fetch on metadata apply"
              description="When applying metadata from a provider, cover images are automatically downloaded and stored if selected."
            >
              <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800">
                Enabled
              </span>
            </SettingRow>
            <SettingRow
              label="Manual upload"
              description="Cover images can be uploaded directly from the book detail page."
            >
              <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800">
                Enabled
              </span>
            </SettingRow>
          </div>
        </div>

        {/* Edition files */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Edition Files</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">

            {/* Ebook */}
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Ebook storage path</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Root directory for uploaded ebook files (EPUB, PDF, etc.). Set via <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">EBOOK_STORAGE_PATH</code>.
              </p>
              <code className="mt-2 inline-block text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                {config ? config.ebook_storage_path : '…'}
              </code>
            </div>
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Ebook path template</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Subdirectory structure within the ebook storage path. Uploaded files are saved to <span className="font-mono">{config ? `${config.ebook_storage_path}/` : '…/'}<span className="text-blue-600 dark:text-blue-400">{config?.ebook_path_template ?? '{author}/{title}'}</span>/filename.epub</span>. Set via <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">EBOOK_PATH_TEMPLATE</code>.
              </p>
              <code className="mt-2 inline-block text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                {config ? config.ebook_path_template : '…'}
              </code>
            </div>

            {/* Audiobook */}
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Audiobook storage path</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Root directory for uploaded audiobook files (MP3, M4B, etc.). Set via <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">AUDIOBOOK_STORAGE_PATH</code>.
              </p>
              <code className="mt-2 inline-block text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                {config ? config.audiobook_storage_path : '…'}
              </code>
            </div>
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Audiobook path template</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Subdirectory structure within the audiobook storage path. Uploaded files are saved to <span className="font-mono">{config ? `${config.audiobook_storage_path}/` : '…/'}<span className="text-blue-600 dark:text-blue-400">{config?.audiobook_path_template ?? '{title}'}</span>/filename.m4b</span>. Set via <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">AUDIOBOOK_PATH_TEMPLATE</code>.
              </p>
              <code className="mt-2 inline-block text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                {config ? config.audiobook_path_template : '…'}
              </code>
            </div>

            {/* Token reference */}
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Available tokens</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {PATH_TOKENS.map(({ token, desc }) => (
                  <div key={token} className="flex items-center gap-2">
                    <code className="text-xs bg-gray-100 dark:bg-gray-800 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded flex-shrink-0">{token}</code>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{desc}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Example: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{title} ({year})'}</code> → <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">Project Hail Mary (2021)/project-hail-mary.epub</code>
              </p>
            </div>

            <SettingRow
              label="File upload"
              description="Upload EPUB, PDF, MP3, M4B, and other formats directly to a digital edition from the book detail page. Files are organised using the path template above."
            >
              <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800">
                Enabled
              </span>
            </SettingRow>
            <SettingRow
              label="Storage location scan"
              description="Configure server-side directories and scan them to auto-link files to editions by ISBN. Managed per library under Library → Settings → Media Files."
            >
              <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800">
                Enabled
              </span>
            </SettingRow>
          </div>
        </div>

        {/* Planned items */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">Planned</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Coming in a future release</p>
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <PlannedItem label="Duplicate Detection" description="Automatically flag duplicate ISBNs across libraries." />
            <PlannedItem label="Bulk Editing" description="Apply changes to multiple books or editions at once." />
          </div>
        </div>

      </div>
    </>
  )
}
