// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

// Shared styling constants for the profile-page tabs. Kept in one file so
// individual tab components stay focused on their own behaviour.

export const inputClass =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60'

export const cardClass =
  'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800'

export const buttonPrimaryClass =
  'px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors'

export const buttonSecondaryClass =
  'px-4 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors'

export function SectionHeading({ label }: { label: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
      {label}
    </h2>
  )
}

export function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
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
