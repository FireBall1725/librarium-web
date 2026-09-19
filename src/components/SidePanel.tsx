// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// A panel that slides in from the right over a scrim, for work that needs more
// room than a Dialog but belongs to the page underneath: browsing the lookup
// catalogue, or one provider's settings. Built the same way as Dialog: Escape
// and the scrim close it, focus moves in, and the page behind stops scrolling.

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Open panels, newest last. A settings panel can open over the catalogue, and
// Escape should close only the one on top.
const openPanels: symbol[] = []

export default function SidePanel({
  open,
  title,
  onClose,
  header,
  footer,
  width = 'wide',
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  // Controls that stay put above the scrolling body, such as search and tabs.
  header?: ReactNode
  footer?: ReactNode
  width?: 'wide' | 'narrow'
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const me = Symbol('panel')
    openPanels.push(me)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openPanels[openPanels.length - 1] === me) onClose()
    }
    document.addEventListener('keydown', onKey)
    const returnTo = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      openPanels.splice(openPanels.indexOf(me), 1)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
      returnTo?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[250]"
      style={{ background: 'rgb(0 0 0 / 0.4)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface ${width === 'wide' ? 'max-w-[920px]' : 'max-w-[460px]'}`}
        style={{ boxShadow: '-20px 0 40px -10px var(--shadow)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex flex-col gap-3 border-b border-line px-5 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="lb-display text-[26px] leading-none text-content">{title}</h2>
            <button type="button" data-close onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })}
              className="grid h-8 w-8 place-items-center rounded-md text-content-muted hover:bg-surface-inset hover:text-content">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          {header}
        </div>
        <div className="flex-1 overflow-auto px-5 pb-8 pt-4">{children}</div>
        {footer && (
          <div className="flex justify-between gap-2 border-t border-line px-5 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
