// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Which library did you mean?
//
// A book can be held by several libraries, and most of what the book page
// shows is the same whichever one you arrive through: editions, contributors,
// genres, series and your own reading state all live on the work. Three things
// do not. Shelves, loans and storage locations belong to one library, and the
// tag vocabulary is per-library too, so entering through the wrong one hides
// them without saying so.
//
// Until the book page stops needing a library in its URL, that choice has to
// come from the reader rather than from whichever library happened to sort
// first, which is what the legacy `library_id` field gives you.

import { useTranslation } from 'react-i18next'
import type { BookLibraryRef } from '../types'
import { Dialog } from './Dialog'
import { libraryColour } from '../lib/libraryColour'

export default function LibraryPickerDialog({
  open,
  libraries,
  title,
  description,
  onPick,
  onCancel,
}: {
  open: boolean
  libraries: BookLibraryRef[]
  title?: string
  description?: string
  onPick: (libraryId: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={open}
      title={title ?? t('library_picker.title', {
        count: libraries.length,
        defaultValue: `In ${libraries.length} libraries`,
      })}
      description={description ?? t('library_picker.description', {
        defaultValue: 'Which one do you want to see?',
      })}
      onClose={onCancel}
      // No confirm button: picking a library is the action, so a second click
      // to agree with the first would be ceremony.
      footer={
        <button type="button" className="lb-btn ghost" onClick={onCancel}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </button>
      }
    >
      <ul className="flex flex-col gap-1">
        {libraries.map(l => (
          <li key={l.id}>
            <button
              type="button"
              className="lb-navrow w-full"
              onClick={() => onPick(l.id)}
            >
              <span className="swatchdot" style={{ background: libraryColour(l.id) }} />
              {l.name}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

