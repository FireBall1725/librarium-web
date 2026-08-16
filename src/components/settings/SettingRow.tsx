// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The building blocks every settings page is made of.
//
// The reference implementation renders all fifteen settings pages from four
// shapes: a labelled row with a control on the right, a section with an
// eyebrow, a key/value block, and a switch. Having them here means a settings
// page is a list of what it configures rather than a fresh layout each time,
// and it is why the pages can look alike without anyone maintaining that.

import type { ReactNode } from 'react'

/**
 * One setting: a label, an optional sentence of explanation, and its control.
 *
 * The explanation is set in the reading face rather than the interface face,
 * because it is a sentence to read and not a label to scan.
 */
export function SettingRow({
  label,
  description,
  children,
}: {
  label: ReactNode
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="lb-set">
      <div>
        <div className="lbl">{label}</div>
        {description && <div className="sub">{description}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

/** A titled group of rows. */
export function SettingSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="lb-sect">
      <div className="lb-eyebrow">{title}</div>
      {description && (
        <p className="lb-read mb-3 text-[13px] text-content-tertiary">{description}</p>
      )}
      {children}
    </section>
  )
}

/**
 * A toggle.
 *
 * A button with aria-pressed rather than a checkbox: the reference styles it as
 * a switch, and a switch that reports itself as a checkbox to a screen reader
 * describes a control that is not on screen.
 */
export function Switch({
  checked,
  label,
  onChange,
  disabled,
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`lb-sw ${checked ? 'on' : ''}`}
    />
  )
}

/**
 * Read-only facts, two columns.
 *
 * Values use tabular figures so a column of sizes, counts and versions lines
 * up on the decimal rather than drifting.
 */
export function KeyValue({ rows }: { rows: Array<[label: string, value: ReactNode]> }) {
  // .lb-kv is one row, not a container: it is the grid, and consecutive rows
  // draw the rule between them. Wrapping the set in a single .lb-kv would put
  // every label and value into one two-column row.
  return (
    <div>
      {rows.map(([label, value]) => (
        <div key={label} className="lb-kv">
          <span className="text-content-secondary">{label}</span>
          <span className="tabular-nums text-content">{value}</span>
        </div>
      ))}
    </div>
  )
}

/** The page's own body wrapper, so every settings page has the same measure. */
export function SettingsBody({ children }: { children: ReactNode }) {
  return (
    <div className="px-8 py-6">
      <div className="lb-wrap">{children}</div>
    </div>
  )
}
