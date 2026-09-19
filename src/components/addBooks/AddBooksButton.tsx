// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// An Add book button that brings its own dialog, for pages that don't
// otherwise need media types: the Dashboard. They're fetched on click, so a
// visit that never adds a book never pays for them.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import type { MediaType } from '../../types'
import { announceCollectionChanged } from '../../lib/collectionEvents'
import AddBooksDialog from './AddBooksDialog'

export default function AddBooksButton({ libraryId, className = 'lb-btn sm' }: {
  libraryId?: string
  className?: string
}) {
  const { callApi } = useAuth()
  const { t } = useTranslation()
  const [mediaTypes, setMediaTypes] = useState<MediaType[] | null>(null)
  const [opening, setOpening] = useState(false)

  const open = async () => {
    setOpening(true)
    const types = await callApi<MediaType[]>('/api/v1/media-types').then(m => m ?? []).catch((): MediaType[] => [])
    setOpening(false)
    setMediaTypes(types)
  }

  return (
    <>
      <button type="button" className={className} disabled={opening} onClick={() => void open()}>
        {t('books.add', { defaultValue: 'Add book' })}
      </button>
      {mediaTypes && (
        <AddBooksDialog
          libraryId={libraryId}
          mediaTypes={mediaTypes}
          onClose={() => setMediaTypes(null)}
          onSaved={() => { setMediaTypes(null); announceCollectionChanged() }}
        />
      )}
    </>
  )
}
