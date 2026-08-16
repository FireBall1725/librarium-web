// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

// Shared styling constants for the profile-page tabs. Kept in one file so
// individual tab components stay focused on their own behaviour.

export const inputClass =
  'w-full rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 text-sm text-content placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60'

export const cardClass =
  'rounded-xl border border-line bg-surface divide-y divide-line-subtle '

export const buttonPrimaryClass =
  'px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors'

export const buttonSecondaryClass =
  'px-4 py-1.5 text-sm font-medium rounded-md border border-line-strong text-content-secondary hover:bg-surface-muted disabled:opacity-50 transition-colors'

export function SectionHeading({ label }: { label: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-content-subtle mb-3">
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
        className="block text-xs font-medium text-content-muted mb-1"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
    </div>
  )
}
