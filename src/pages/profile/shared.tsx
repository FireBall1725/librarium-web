// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Shared pieces for the account pages.
//
// These were four hand-written class strings describing a field, a card and
// two buttons. They now point at the reference components, so every tab that
// imports them moved onto the design without being edited: one file, four
// pages. `SectionHeading` and `FieldRow` keep their names for the same reason.

export const inputClass = 'lb-field'

export const cardClass = 'lb-card divide-y divide-line-subtle p-0'

export const buttonPrimaryClass = 'lb-btn whitespace-nowrap'

export const buttonSecondaryClass = 'lb-btn ghost whitespace-nowrap'

export function SectionHeading({ label }: { label: string }) {
  return <h2 className="lb-eyebrow mb-3">{label}</h2>
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
    <div className="px-5 py-4">
      <label className="lb-eyebrow mb-1.5 block" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}
