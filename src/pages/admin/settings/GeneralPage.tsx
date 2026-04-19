// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import PageHeader from '../../../components/PageHeader'
import { usePageTitle } from '../../../hooks/usePageTitle'

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

export default function GeneralPage() {
  usePageTitle('General')
  return (
    <>
      <PageHeader
        title="General"
        description="Instance-wide settings for your Librarium installation."
        breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'General' }]}
      />
      <div className="max-w-3xl px-8 py-8 space-y-8">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">Coming soon</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Planned for a future release</p>
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <PlannedItem label="Instance Name" description="Displayed in the browser tab and on the login page." />
            <PlannedItem label="Registration" description="Allow or restrict new user sign-ups." />
            <PlannedItem label="Authentication" description="Configure OIDC / LDAP external login providers." />
            <PlannedItem label="Backups" description="Schedule automated database backups." />
          </div>
        </div>
      </div>
    </>
  )
}
