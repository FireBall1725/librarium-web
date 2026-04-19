import { useEffect, useState } from 'react'
import { useAuth, ApiError } from '../auth/AuthContext'
import type { BookEdition, BookContributor } from '../types'

export const LANGUAGE_OPTIONS = [
  { code: 'af', name: 'Afrikaans' }, { code: 'ar', name: 'Arabic' },
  { code: 'zh', name: 'Chinese (Simplified)' }, { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'cs', name: 'Czech' }, { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' }, { code: 'en', name: 'English' },
  { code: 'fi', name: 'Finnish' }, { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' }, { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' }, { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' }, { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' }, { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' }, { code: 'ms', name: 'Malay' },
  { code: 'nb', name: 'Norwegian' }, { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' }, { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' }, { code: 'es', name: 'Spanish' },
  { code: 'sv', name: 'Swedish' }, { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' }, { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
]

const FORMAT_BUTTONS = [
  {
    value: 'paperback',
    label: 'Paperback',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    value: 'hardcover',
    label: 'Hardcover',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 4.5A2.25 2.25 0 018.25 2.25h10.5A1.5 1.5 0 0120.25 3.75v16.5a1.5 1.5 0 01-1.5 1.5H8.25A2.25 2.25 0 016 19.5v-15z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 4.5h1.5m-1.5 15h1.5" />
        <line strokeLinecap="round" x1="7.5" y1="2.25" x2="7.5" y2="21.75" />
      </svg>
    ),
  },
  {
    value: 'ebook',
    label: 'E-Book',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 002.25-2.25v-15a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 4.5v15a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    value: 'audiobook',
    label: 'Audiobook',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 00-9 9v1.5A1.5 1.5 0 004.5 15H6a1.5 1.5 0 001.5-1.5v-3A1.5 1.5 0 006 9h-.35A7.5 7.5 0 0112 4.5a7.5 7.5 0 016.35 4.5H18a1.5 1.5 0 00-1.5 1.5v3A1.5 1.5 0 0018 15h1.5A1.5 1.5 0 0021 13.5V12a9 9 0 00-9-9z" />
      </svg>
    ),
  },
] as const

interface AddEditionModalProps {
  libraryId: string
  bookId: string
  edition?: BookEdition | null
  contributors?: BookContributor[]
  onClose: () => void
  onSaved: () => void
}

export function AddEditionModal({ libraryId, bookId, edition, contributors = [], onClose, onSaved }: AddEditionModalProps) {
  const { callApi } = useAuth()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const existingSecs = edition?.duration_seconds ?? 0
  const [form, setForm] = useState({
    format:                  edition?.format        ?? 'paperback',
    language:                edition?.language      ?? '',
    edition_name:            edition?.edition_name  ?? '',
    narrator:                edition?.narrator      ?? '',
    narrator_contributor_id: edition?.narrator_contributor_id ?? '',
    publisher:               edition?.publisher     ?? '',
    publish_date:            edition?.publish_date  ?? '',
    isbn_10:                 edition?.isbn_10       ?? '',
    isbn_13:                 edition?.isbn_13       ?? '',
    duration_hours:          existingSecs > 0 ? String(Math.floor(existingSecs / 3600)) : '',
    duration_minutes:        existingSecs > 0 ? String(Math.floor((existingSecs % 3600) / 60)) : '',
    page_count:              edition?.page_count != null ? String(edition.page_count) : '',
    copy_count:              String(edition?.copy_count ?? 1),
    is_primary:              edition?.is_primary    ?? false,
    acquired_at:             edition?.acquired_at   ?? new Date().toISOString().slice(0, 10),
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isAudio    = form.format === 'audiobook'
  const isEbook    = form.format === 'ebook' || form.format === 'digital'
  const isPhysical = !isAudio && !isEbook

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setIsLoading(true)
    try {
      const durationSecs = isAudio
        ? ((Number(form.duration_hours) || 0) * 3600) + ((Number(form.duration_minutes) || 0) * 60)
        : null

      // Resolve "Other" narrator name to a contributor ID.
      let narratorContribId = isAudio && form.narrator_contributor_id ? form.narrator_contributor_id : null
      if (isAudio && !narratorContribId && form.narrator.trim()) {
        const name = form.narrator.trim()
        const matches = await callApi<{ id: string; name: string }[]>(
          `/api/v1/contributors?q=${encodeURIComponent(name)}`
        )
        const exact = (matches ?? []).find(c => c.name.toLowerCase() === name.toLowerCase())
        if (exact) {
          narratorContribId = exact.id
        } else {
          const created = await callApi<{ id: string; name: string }>('/api/v1/contributors', {
            method: 'POST',
            body: JSON.stringify({ name }),
          })
          if (created) narratorContribId = created.id
        }
      }

      const body = {
        format:                  form.format,
        language:                form.language,
        edition_name:            form.edition_name,
        narrator:                isAudio && !narratorContribId ? form.narrator.trim() || null : null,
        narrator_contributor_id: narratorContribId,
        publisher:               form.publisher,
        publish_date:            form.publish_date,
        isbn_10:                 isPhysical ? form.isbn_10 : null,
        isbn_13:                 !isAudio   ? form.isbn_13 : null,
        duration_seconds:        durationSecs || null,
        page_count:              !isAudio && form.page_count ? Number(form.page_count) : null,
        copy_count:              form.copy_count ? Number(form.copy_count) : 1,
        is_primary:              form.is_primary,
        acquired_at:             form.acquired_at || null,
      }
      const url = edition
        ? `/api/v1/libraries/${libraryId}/books/${bookId}/editions/${edition.id}`
        : `/api/v1/libraries/${libraryId}/books/${bookId}/editions`
      await callApi(url, { method: edition ? 'PUT' : 'POST', body: JSON.stringify(body) })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save edition')
    } finally { setIsLoading(false) }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-gray-900 shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{edition ? 'Edit edition' : 'Add edition'}</h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Format */}
          <div className="grid grid-cols-4 gap-2">
            {FORMAT_BUTTONS.map(fmt => (
              <button key={fmt.value} type="button"
                onClick={() => setForm(f => ({ ...f, format: fmt.value }))}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 text-xs font-medium transition-colors ${
                  form.format === fmt.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                }`}>
                {fmt.icon}
                {fmt.label}
              </button>
            ))}
          </div>

          {/* Edition name + language */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Edition name</label>
              <input type="text" value={form.edition_name} onChange={e => setForm(f => ({ ...f, edition_name: e.target.value }))}
                placeholder="e.g. 2nd Edition" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Language</label>
              <input type="text" list="edition-modal-language-list" value={form.language}
                onChange={e => setForm(f => ({ ...f, language: e.target.value.toLowerCase() }))}
                placeholder="en, ja, fr…" className={inputCls} />
              <datalist id="edition-modal-language-list">
                {LANGUAGE_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </datalist>
            </div>
          </div>

          {/* Publisher + publish date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Publisher</label>
              <input type="text" value={form.publisher} onChange={e => setForm(f => ({ ...f, publisher: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Publish date</label>
              <input type="date" value={form.publish_date} onChange={e => setForm(f => ({ ...f, publish_date: e.target.value }))} className={inputCls} />
            </div>
          </div>

          {/* ISBNs — physical: both; ebook: 13 only; audiobook: none */}
          {isPhysical && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>ISBN-13</label>
                <input type="text" value={form.isbn_13} onChange={e => setForm(f => ({ ...f, isbn_13: e.target.value }))}
                  placeholder="978-…" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>ISBN-10</label>
                <input type="text" value={form.isbn_10} onChange={e => setForm(f => ({ ...f, isbn_10: e.target.value }))} className={inputCls} />
              </div>
            </div>
          )}
          {isEbook && (
            <div>
              <label className={labelCls}>ISBN-13</label>
              <input type="text" value={form.isbn_13} onChange={e => setForm(f => ({ ...f, isbn_13: e.target.value }))}
                placeholder="978-…" className={inputCls} />
            </div>
          )}

          {/* Page count — physical + ebook */}
          {!isAudio && (
            <div>
              <label className={labelCls}>Page count</label>
              <input type="number" min="1" value={form.page_count} onChange={e => setForm(f => ({ ...f, page_count: e.target.value }))} className={inputCls} />
            </div>
          )}

          {/* Duration + narrator — audiobook only */}
          {isAudio && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Duration — hours</label>
                  <input type="number" min="0" value={form.duration_hours}
                    onChange={e => setForm(f => ({ ...f, duration_hours: e.target.value }))}
                    placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Duration — minutes</label>
                  <input type="number" min="0" max="59" value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                    placeholder="0" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Narrator</label>
                {contributors.length > 0 ? (
                  <select
                    value={form.narrator_contributor_id}
                    onChange={e => setForm(f => ({ ...f, narrator_contributor_id: e.target.value, narrator: '' }))}
                    className={inputCls}
                  >
                    <option value="">— Other (enter name below) —</option>
                    {contributors.map(c => (
                      <option key={c.contributor_id} value={c.contributor_id}>{c.name}</option>
                    ))}
                  </select>
                ) : null}
                {(!form.narrator_contributor_id) && (
                  <input
                    type="text"
                    value={form.narrator}
                    onChange={e => setForm(f => ({ ...f, narrator: e.target.value }))}
                    placeholder="Narrator name"
                    className={`${inputCls}${contributors.length > 0 ? ' mt-2' : ''}`}
                  />
                )}
              </div>
            </div>
          )}

          {/* Copies (physical only) + date acquired */}
          <div className={`grid gap-3 ${isPhysical ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {isPhysical && (
              <div>
                <label className={labelCls}>Copies</label>
                <input type="number" min="1" value={form.copy_count} onChange={e => setForm(f => ({ ...f, copy_count: e.target.value }))} className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Date acquired</label>
              <input type="date" value={form.acquired_at} onChange={e => setForm(f => ({ ...f, acquired_at: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
              className="rounded border-gray-300 dark:border-gray-600" />
            Primary edition
          </label>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isLoading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isLoading ? 'Saving…' : edition ? 'Save changes' : 'Add edition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
