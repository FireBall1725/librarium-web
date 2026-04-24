// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useState } from 'react'
import AccountTab from './profile/AccountTab'
import PreferencesTab from './profile/PreferencesTab'
import AITab from './profile/AITab'
import ApiTokensTab from './profile/ApiTokensTab'

type Tab = 'account' | 'preferences' | 'ai' | 'api-tokens'

const TABS: { id: Tab; label: string }[] = [
  { id: 'account',     label: 'Account' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'ai',          label: 'AI' },
  { id: 'api-tokens',  label: 'API tokens' },
]

export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>('account')

  return (
    <div className="px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Profile &amp; Preferences</h1>

        <div className="border-b border-gray-200 dark:border-gray-800 mb-8">
          <nav className="flex gap-6 -mb-px">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap pb-3 text-sm font-medium transition-colors border-b-2 ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {tab === 'account'     && <AccountTab />}
        {tab === 'preferences' && <PreferencesTab />}
        {tab === 'ai'          && <AITab />}
        {tab === 'api-tokens'  && <ApiTokensTab />}
      </div>
    </div>
  )
}
