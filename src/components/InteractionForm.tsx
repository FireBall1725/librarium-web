// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { UserBookInteraction } from '../types'

export const READ_STATUSES = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'read', label: 'Read' },
  { value: 'did_not_finish', label: 'Did not finish' },
]

interface Props {
  libraryId: string
  bookId: string
  editionId: string
}

export default function InteractionForm({ libraryId, bookId, editionId }: Props) {
  const { callApi } = useAuth()
  const [interaction, setInteraction] = useState<UserBookInteraction | null>(null)
  const [form, setForm] = useState({
    read_status: 'unread',
    rating: '',
    notes: '',
    review: '',
    date_started: '',
    date_finished: '',
    is_favorite: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const baseUrl = `/api/v1/libraries/${libraryId}/books/${bookId}/editions/${editionId}/my-interaction`

  useEffect(() => {
    callApi<UserBookInteraction>(baseUrl)
      .then(i => {
        if (i) {
          setInteraction(i)
          setForm({
            read_status: i.read_status,
            rating: i.rating != null ? String(i.rating) : '',
            notes: i.notes ?? '',
            review: i.review ?? '',
            date_started: i.date_started ?? '',
            date_finished: i.date_finished ?? '',
            is_favorite: i.is_favorite,
          })
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionId])

  const save = async () => {
    setIsLoading(true); setIsSaved(false)
    try {
      const body = {
        read_status: form.read_status,
        rating: form.rating ? Number(form.rating) : null,
        notes: form.notes,
        review: form.review,
        date_started: form.date_started || null,
        date_finished: form.date_finished || null,
        is_favorite: form.is_favorite,
      }
      const updated = await callApi<UserBookInteraction>(baseUrl, { method: 'PUT', body: JSON.stringify(body) })
      if (updated) setInteraction(updated)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    } catch { /* ignore */ }
    finally { setIsLoading(false) }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">My reading</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Status</label>
          <select value={form.read_status} onChange={e => setForm(f => ({ ...f, read_status: e.target.value }))}
            className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none">
            {READ_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Rating (1–10)</label>
          <input type="number" min="1" max="10" value={form.rating}
            onChange={e => setForm(f => ({ ...f, rating: e.target.value }))}
            placeholder="—"
            className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Date started</label>
          <input type="date" value={form.date_started} onChange={e => setForm(f => ({ ...f, date_started: e.target.value }))}
            className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Date finished</label>
          <input type="date" value={form.date_finished} onChange={e => setForm(f => ({ ...f, date_finished: e.target.value }))}
            className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
        </div>
      </div>
      <div className="mt-2">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Notes <span className="text-gray-400 dark:text-gray-500">(private)</span></label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2} placeholder="Personal notes…"
          className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none resize-none" />
      </div>
      <div className="mt-2">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Review <span className="text-gray-400 dark:text-gray-500">(visible to members)</span></label>
        <textarea value={form.review} onChange={e => setForm(f => ({ ...f, review: e.target.value }))}
          rows={2} placeholder="Share your thoughts…"
          className="w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none resize-none" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={form.is_favorite} onChange={e => setForm(f => ({ ...f, is_favorite: e.target.checked }))}
            className="rounded border-gray-300 dark:border-gray-600" />
          Favourite
        </label>
        <div className="flex items-center gap-2">
          {isSaved && <span className="text-xs text-green-600 dark:text-green-400">Saved!</span>}
          {interaction && (
            <button onClick={async () => {
              if (!confirm('Remove your reading record for this edition?')) return
              await callApi(baseUrl, { method: 'DELETE' }).catch(() => {})
              setInteraction(null)
              setForm({ read_status: 'unread', rating: '', notes: '', review: '', date_started: '', date_finished: '', is_favorite: false })
            }} className="text-xs text-red-500 dark:text-red-400 hover:underline">Remove</button>
          )}
          <button onClick={save} disabled={isLoading}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {isLoading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
