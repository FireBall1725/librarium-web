// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, ApiError } from '../auth/AuthContext'
import { useToast } from './Toast'
import BookCover from './BookCover'
import type { SuggestionView } from '../types'

interface SuggestionCardProps {
  suggestion: SuggestionView
  onChanged: (id: string, status: string | null) => void
}

type BlockScope = 'book' | 'author'

// SuggestionCard renders a single AI suggestion with cover + reasoning tooltip
// and the three actions from the plan: dismiss, block (with scope menu), and
// the type-specific primary action — "interested" for buy, "open" for read_next
// (the book is already in the library so we can link straight there).
export default function SuggestionCard({ suggestion, onChanged }: SuggestionCardProps) {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)

  const setStatus = async (status: string) => {
    setBusy(true)
    try {
      await callApi(`/api/v1/me/suggestions/${suggestion.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      onChanged(suggestion.id, status === 'dismissed' ? null : status)
      if (status === 'dismissed') {
        showToast('Dismissed', { variant: 'success' })
      } else if (status === 'interested') {
        showToast('Marked as interested', { variant: 'success' })
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to update', { variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const block = async (scope: BlockScope) => {
    setBusy(true)
    setBlockOpen(false)
    try {
      await callApi(`/api/v1/me/suggestions/${suggestion.id}/block`, {
        method: 'POST',
        body: JSON.stringify({ scope }),
      })
      onChanged(suggestion.id, null)
      showToast(scope === 'book' ? 'Blocked this book' : `Blocked anything by ${suggestion.author}`, { variant: 'success' })
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to block', { variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const isReadNext = suggestion.type === 'read_next'
  // Detail page link:
  //   - read_next → the library-scoped BookPage in a library the user has
  //     the book in (the API picks one via LATERAL subquery on library_books)
  //   - buy → the library-agnostic /books/:id route, which renders the
  //     floating-book BookDetailPage with metadata, re-enrich, BookFinder,
  //     and Add-to-library actions.
  const detailHref =
    isReadNext && suggestion.library_id && suggestion.book_id
      ? `/libraries/${suggestion.library_id}/books/${suggestion.book_id}`
      : suggestion.book_id
        ? `/books/${suggestion.book_id}`
        : null

  return (
    <div className="w-36 sm:w-40 flex-shrink-0 group relative flex flex-col">
      {detailHref ? (
        <Link to={detailHref} className="relative block">
          <BookCover title={suggestion.title} coverUrl={suggestion.cover_url ?? null} className="w-full" />
          {suggestion.reasoning && (
            <div className="pointer-events-none absolute inset-0 flex items-end bg-black/75 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
              <p className="line-clamp-6">{suggestion.reasoning}</p>
            </div>
          )}
        </Link>
      ) : (
        <div className="relative">
          <BookCover title={suggestion.title} coverUrl={suggestion.cover_url ?? null} className="w-full" />
          {suggestion.reasoning && (
            <div className="pointer-events-none absolute inset-0 flex items-end bg-black/75 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
              <p className="line-clamp-6">{suggestion.reasoning}</p>
            </div>
          )}
        </div>
      )}
      <div className="mt-1.5 flex-1">
        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">
          {suggestion.title}
        </p>
        {suggestion.author && (
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 truncate">
            {suggestion.author}
          </p>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
        {isReadNext && detailHref ? (
          <Link
            to={detailHref}
            className="flex-1 text-center rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          >
            Open
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStatus('interested')}
            disabled={busy || suggestion.status === 'interested'}
            className="flex-1 rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
          >
            {suggestion.status === 'interested' ? 'Saved ✓' : 'Interested'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setStatus('dismissed')}
          disabled={busy}
          title="Dismiss"
          className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          ✕
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setBlockOpen(o => !o)}
            disabled={busy}
            title="Block"
            className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            ⊘
          </button>
          {blockOpen && (
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
              <button
                type="button"
                onClick={() => block('book')}
                className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                Block this book
              </button>
              {suggestion.author && (
                <button
                  type="button"
                  onClick={() => block('author')}
                  className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                >
                  Block by {suggestion.author}
                </button>
              )}
              <button
                type="button"
                onClick={() => setBlockOpen(false)}
                className="block w-full text-left px-3 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
