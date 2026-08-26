// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Which view is open, and what can be done to it.
//
// Lifted out of BooksPage so Series can have the same thing rather than a
// near-copy that drifts. The chip and its menu are one object: the ⋯ acts on
// the view named beside it, so splitting them would mean two components that
// only work together.
//
// Rename and Delete are real but rare, so they sit behind the ⋯ rather than as
// two more buttons in the reader's way, and the ⋯ sits beside the chip rather
// than out with the page's own controls: at the far end of the row it reads as
// something that acts on the results.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../lib/icons'
import { listIcon, type SavedList } from '../lib/lists'

export default function ViewChip({
  view, dirty, isDefault, defaultHint, onLeave, onRename, onSaveAsNew, onDelete,
}: {
  view: SavedList
  /** The filter on screen differs from what the view stores. */
  dirty: boolean
  isDefault: boolean
  /** What this surface's Default is for, e.g. "what Series opens on". */
  defaultHint: string
  onLeave: () => void
  onRename: () => void
  onSaveAsNew: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  // Fixed-positioned, so the menu is placed from the trigger's rect rather than
  // by an ancestor that might be scrolling or clipping.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        {/* The unmodified Default is not somewhere you can leave: it is where
            leaving goes. So it is a label rather than a chip with an ×.

            warn instead of on when modified, not alongside it: .on paints an
            accent fill that .warn does not override, which would put amber text
            on an indigo chip. */}
        {isDefault && !dirty ? (
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-content-tertiary">
            <Icon name={listIcon(view)} size={13} className="flex-none" />
            {t('views.default_name', { defaultValue: 'Default view' })}
          </span>
        ) : (
          <button type="button"
            className={`inline-flex items-center gap-1.5 ${dirty ? 'lb-chip warn' : 'lb-chip on'}`}
            onClick={onLeave}
            title={t('views.leave', { defaultValue: 'Leave view' })}>
            <Icon name={listIcon(view)} size={13} className="flex-none" />
            {/* "Default" on its own names a state rather than a thing, and
                reads oddly beside Up next or Favourites. */}
            {isDefault
              ? t('views.default_name', { defaultValue: 'Default view' })
              : view.name} ×
          </button>
        )}

        {dirty && (
          <span className="text-xs text-warning-strong">
            {t('views.modified', { defaultValue: 'modified' })}
          </span>
        )}

        <button type="button"
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect()
            setAt(m => m ? null : { x: r.left, y: r.bottom + 6 })
          }}
          aria-haspopup="menu" aria-expanded={at !== null}
          className="rounded-md px-1.5 py-0.5 text-content-tertiary hover:bg-surface-inset hover:text-content"
          title={t('views.more', { defaultValue: 'View options' })}>
          ⋯
        </button>
      </span>

      {at && (
        <>
          {/* Catches the click that dismisses, so the menu closes the way every
              menu does rather than only via its own items. */}
          <div className="fixed inset-0 z-[190]" onClick={() => setAt(null)} />
          <div className="lb-menu open" style={{ left: at.x, top: at.y }} role="menu">
            <div className="hd">
              {view.name}
              {isDefault && ` · ${defaultHint}`}
            </div>
            <button type="button" role="menuitem"
              onClick={() => { setAt(null); onRename() }}>
              {t('views.rename', { defaultValue: 'Rename' })}
            </button>
            <button type="button" role="menuitem"
              onClick={() => { setAt(null); onSaveAsNew() }}>
              {t('views.save_as_new', { defaultValue: 'Save as new' })}
            </button>
            {/* The Default cannot go: the page has to open on something. */}
            {!view.permanent && (
              <>
                <div className="sep" />
                <button type="button" role="menuitem" className="danger"
                  onClick={() => { setAt(null); onDelete() }}>
                  {t('views.delete', { defaultValue: 'Delete view' })}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
