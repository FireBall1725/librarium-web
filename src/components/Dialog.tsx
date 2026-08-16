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

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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
  onCancel: () => void
  onSubmit: (value: string) => void
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = input.current?.value.trim() ?? ''
    // An empty name is a cancel, not an error to scold the reader about.
    if (!value) { onCancel(); return }
    onSubmit(value)
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
          autoComplete="off"
          // Password managers offer to fill any lone text input in a dialog.
          // autoComplete="off" does not stop them; these vendor attributes do,
          // and a view name is not a credential.
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
        />
      </form>
    </Dialog>
  )
}
