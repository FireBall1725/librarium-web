// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// A dialog in the product's own skin, replacing window.prompt and window.confirm.
//
// The browser's dialogs are the wrong thing twice over: they are chrome rather
// than product, so they arrive unstyled and unthemed, and they block the main
// thread, which stalls every render and fetch behind them until dismissed.
//
// The reference implementation has no dialog of its own, only a context menu
// and a toast, so this is built from its existing pieces: a .lb-card panel with
// .lb-field inputs and .lb-btn actions. Nothing new is invented for it.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../lib/icons'
import { NO_AUTOFILL } from '../lib/formHints'

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children?: ReactNode
  footer: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    // Escape closes, which is what every dialog on the platform does and what
    // the browser prompt this replaces did for free.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // Focus moves into the panel so the keyboard lands somewhere useful, and
    // so a screen reader announces the dialog rather than leaving the reader
    // on whatever was behind it.
    const first = panel.current?.querySelector<HTMLElement>(
      'input, textarea, select, button'
    )
    first?.focus()

    // The page behind must not scroll under an open dialog.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.5)' }}
      // Clicking the backdrop closes, but only the backdrop: without the target
      // check, a click that starts inside the panel and drifts out closes the
      // dialog and loses what was typed.
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="lb-card w-full max-w-sm"
        style={{ boxShadow: '0 20px 44px -14px var(--shadow), 0 3px 10px -5px var(--shadow)' }}
      >
        <h2 id={titleId} className="lb-display text-[19px] text-content">{title}</h2>
        {description && (
          <p className="lb-read mt-1 text-[13px] text-content-tertiary">{description}</p>
        )}
        {children && <div className="mt-3.5">{children}</div>}
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  )
}

/**
 * Confirm before doing something that cannot be undone.
 *
 * The destructive action is styled as such and is NOT the initially focused
 * control: focus lands on Cancel, so a reflexive Enter or Space on an
 * unexpected dialog does not delete anything.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="lb-btn ghost" onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            className="lb-btn"
            style={destructive ? { background: 'var(--color-danger)' } : undefined}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('common.confirm', { defaultValue: 'Confirm' })}
          </button>
        </>
      }
    />
  )
}

/**
 * Ask for one line of text.
 *
 * A form rather than a pair of buttons, so Enter submits and Escape cancels the
 * way a reader expects, without either being wired by hand.
 */
export function PromptDialog({
  open,
  title,
  description,
  label,
  placeholder,
  initialValue = '',
  confirmLabel,
  icons,
  initialIcon,
  iconLabel,
  onCancel,
  onSubmit,
}: {
  open: boolean
  title: string
  description?: string
  label: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  /**
   * Offer an icon alongside the name. Naming a thing and choosing how it looks
   * is one act from the reader's side, so it is one dialog rather than a second
   * step they have to discover.
   */
  icons?: IconName[]
  initialIcon?: IconName
  iconLabel?: string
  onCancel: () => void
  onSubmit: (value: string, icon?: IconName) => void
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [icon, setIcon] = useState<IconName | undefined>(initialIcon)

  // The dialog is not unmounted between opens, so without this the second
  // thing you name arrives wearing the first one's icon.
  const [syncedInitial, setSyncedInitial] = useState(initialIcon)
  if (initialIcon !== syncedInitial) {
    setSyncedInitial(initialIcon)
    setIcon(initialIcon)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = input.current?.value.trim() ?? ''
    // An empty name is a cancel, not an error to scold the reader about.
    if (!value) { onCancel(); return }
    onSubmit(value, icon)
  }

  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="lb-btn ghost" onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="submit" form={inputId} className="lb-btn">
            {confirmLabel ?? t('common.save', { defaultValue: 'Save' })}
          </button>
        </>
      }
    >
      <form id={inputId} onSubmit={submit}>
        <label htmlFor={`${inputId}-input`} className="lb-eyebrow mb-1.5 block">
          {label}
        </label>
        <input
          id={`${inputId}-input`}
          ref={input}
          className="lb-field"
          defaultValue={initialValue}
          placeholder={placeholder}
          {...NO_AUTOFILL}
        />

        {icons && icons.length > 0 && (
          <>
            <span className="lb-eyebrow mb-1.5 mt-4 block">
              {iconLabel ?? t('common.icon', { defaultValue: 'Icon' })}
            </span>
            <div className="flex flex-wrap gap-1">
              {icons.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setIcon(name)}
                  aria-label={name}
                  aria-pressed={icon === name}
                  className={`rounded-md border p-1.5 transition-colors ${
                    icon === name
                      ? 'border-accent bg-accent-surface text-accent'
                      : 'border-line-strong text-content-tertiary hover:bg-surface-inset'
                  }`}
                >
                  <Icon name={name} size={16} className="" />
                </button>
              ))}
            </div>
          </>
        )}
      </form>
    </Dialog>
  )
}
