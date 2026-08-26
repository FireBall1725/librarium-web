import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, Link, useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, ApiError } from '../../auth/AuthContext'
import type { Crumb, LibraryOutletContext } from '../../components/LibraryOutlet'
import type { Book, PagedBooks, MediaType, Tag, Series, SeriesArc, SeriesEntry, SeriesVolume, SeriesMatchCandidate, SeriesLookupResult, Genre, AIMetadataProposal, SeriesMetadataPayload, SeriesArcsPayload } from '../../types'
import { useAuthenticatedImage } from '../../hooks/useAuthenticatedImage'
import BookCover, { BookCoverThumb } from '../../components/BookCover'
import SeriesFormModal from '../../components/SeriesFormModal'
import { useToast } from '../../components/Toast'
import AddBookModal from '../../components/AddBookModal'
import EditBookModal from '../../components/EditBookModal'
import {
  allConditions,
  conditionLabel,
  displayLanguage,
  parseSearchQuery,
  removeFromQuery,
  upsertQueryToken,
} from '../../lib/search'


// ─── ISBN result helpers ──────────────────────────────────────────────────────




// ─── Books tab ────────────────────────────────────────────────────────────────

interface BooksTabProps {
  libraryId: string
  mediaTypes: MediaType[]
  canEdit: boolean
}

function BooksTab({ libraryId, mediaTypes, canEdit }: BooksTabProps) {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const location = useLocation()
  const [data, setData] = useState<PagedBooks | null>(null)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(() => {
    const s = location.state as { isbn?: string; openAdd?: boolean } | null
    return !!(s?.isbn || s?.openAdd)
  })
  const [addInitialIsbn] = useState(() => (location.state as { isbn?: string } | null)?.isbn ?? '')
  const [addInitialTitle] = useState(() => (location.state as { title?: string } | null)?.title ?? '')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkApplying, setIsBulkApplying] = useState(false)
  const [editBook, setEditBook] = useState<Book | null>(null)
  const [seriesSuggestion, setSeriesSuggestion] = useState<{ book: Book; series: Series; position: number | null } | null>(null)

  const ALL_COLS = ['type', 'tags', 'contributors', 'series', 'shelves', 'date_added', 'publisher', 'published', 'language'] as const
  type ColKey = typeof ALL_COLS[number]
  const COL_LABELS: Record<ColKey, string> = {
    type: 'Type', tags: 'Tags', contributors: 'Contributors',
    series: 'Series', shelves: 'Shelves', date_added: 'Date Added',
    publisher: 'Publisher', published: 'Published', language: 'Language',
  }
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const saved = localStorage.getItem('library-books-cols-v2')
      if (saved) return new Set(JSON.parse(saved) as ColKey[])
    } catch { /* ignore */ }
    return new Set<ColKey>(['type', 'tags', 'contributors', 'series'])
  })
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)
  // Set to true once the initial API preferences load has settled, so subsequent
  // user-initiated changes are synced back without causing a save loop.
  const prefsReadyRef = useRef(false)

  useEffect(() => {
    localStorage.setItem('library-books-cols-v2', JSON.stringify([...visibleCols]))
  }, [visibleCols])

  // Declared above the preferences effect below, which calls all three
  // setters. They seed from localStorage so the UI has something before the
  // server round-trip lands.
  const [perPage, setPerPage] = useState(() => {
    const saved = localStorage.getItem('librarium:books:perPage')
    const n = saved ? Number(saved) : 25
    return [25, 50, 100, 200].includes(n) ? n : 25
  })
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() =>
    localStorage.getItem('librarium:books:viewMode') === 'grid' ? 'grid' : 'table'
  )
  const [showReadBadges, setShowReadBadges] = useState(() =>
    localStorage.getItem('librarium:show_read_badges') !== 'false'
  )

  // Load persisted preferences from the server once on mount.
  useEffect(() => {
    callApi<{ prefs: Record<string, unknown> }>('/api/v1/auth/me/preferences')
      .then(({ prefs }) => {
        const cols = prefs[`library:${libraryId}:book_columns`]
        if (Array.isArray(cols)) {
          const valid = cols.filter((c): c is ColKey => (ALL_COLS as readonly string[]).includes(c as string))
          if (valid.length > 0) setVisibleCols(new Set(valid))
        }
        const pp = prefs[`library:${libraryId}:books_per_page`]
        if (typeof pp === 'number' && [25, 50, 100, 200].includes(pp)) {
          setPerPage(pp)
          setPage(1)
        }
        const vm = prefs[`library:${libraryId}:books_view_mode`]
        if (vm === 'table' || vm === 'grid') setViewMode(vm)
        const rb = prefs['show_read_badges']
        if (typeof rb === 'boolean') {
          setShowReadBadges(rb)
          localStorage.setItem('librarium:show_read_badges', String(rb))
        }
      })
      .catch(() => { /* silently fall back to localStorage values */ })
      .finally(() => { prefsReadyRef.current = true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once on mount

  function patchPreference(key: string, value: unknown) {
    callApi('/api/v1/auth/me/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {})
  }

  function setViewModeAndSave(mode: 'table' | 'grid') {
    setViewMode(mode)
    localStorage.setItem('librarium:books:viewMode', mode)
    if (prefsReadyRef.current) patchPreference(`library:${libraryId}:books_view_mode`, mode)
    if (mode === 'grid') setSelectedIds(new Set())
  }

  function toggleCol(col: ColKey) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col); else next.add(col)
      if (prefsReadyRef.current) {
        patchPreference(`library:${libraryId}:book_columns`, [...next])
      }
      return next
    })
  }

  useEffect(() => {
    if (!colPickerOpen) return
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setColPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colPickerOpen])
  const [sort, setSort] = useState('title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [availableLetters, setAvailableLetters] = useState<string[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allGenres, setAllGenres] = useState<Genre[]>([])
  const [contribSuggestions, setContribSuggestions] = useState<{ label: string; insert: string; description: string }[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [dropdownIdx, setDropdownIdx] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Bulk metadata / cover refresh
  const [showBulkMetaModal, setShowBulkMetaModal] = useState(false)
  const [bulkMetaForce, setBulkMetaForce] = useState(false)
  const [bulkMetaUseAI, setBulkMetaUseAI] = useState(false)
  const [isBulkJobEnqueueing, setIsBulkJobEnqueueing] = useState(false)

  const pageIds = data?.items.map(b => b.id) ?? []
  const allOnPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id))
  const someOnPageSelected = !allOnPageSelected && pageIds.some(id => selectedIds.has(id))

  // ── Search dropdown helpers ──────────────────────────────────────────────────

  function getLastToken(q: string): string {
    // Find the last whitespace-delimited token (handles quoted strings)
    const m = q.match(/\S+$/)
    return m ? m[0] : ''
  }

  type Suggestion = { label: string; insert: string; description: string }

  function getSuggestions(currentToken: string): Suggestion[] {
    const lower = currentToken.toLowerCase()
    const colonIdx = lower.indexOf(':')

    if (colonIdx === -1) {
      // No field yet — show fields + operators, filtered by what user has typed
      const all: Suggestion[] = [
        { label: 'type:', insert: 'type:', description: 'Filter by media type' },
        { label: 'tag:', insert: 'tag:', description: 'Filter by tag' },
        { label: 'genre:', insert: 'genre:', description: 'Filter by genre' },
        { label: 'contributor:', insert: 'contributor:', description: 'Filter by author / contributor' },
        { label: 'series:', insert: 'series:', description: 'Filter by series name' },
        { label: 'shelf:', insert: 'shelf:', description: 'Filter by shelf name' },
        { label: 'publisher:', insert: 'publisher:', description: 'Filter by publisher' },
        { label: 'language:', insert: 'language:', description: 'Filter by language code (e.g. en, ja)' },
        { label: 'has:', insert: 'has:', description: 'Filter by property (e.g. has:cover)' },
        { label: 'NOT', insert: 'NOT ', description: 'Exclude the next term' },
        { label: 'OR', insert: 'OR ', description: 'Match any condition (default is AND)' },
      ]
      if (lower === '') return all
      return all.filter(s => s.label.toLowerCase().startsWith(lower))
    }

    const field = lower.slice(0, colonIdx)
    const valuePrefix = lower.slice(colonIdx + 1)

    if (field === 'type') {
      return mediaTypes
        .filter(mt => mt.display_name.toLowerCase().startsWith(valuePrefix))
        .map(mt => ({
          label: `type:${mt.display_name}`,
          insert: mt.display_name.includes(' ') ? `type:"${mt.display_name}"` : `type:${mt.display_name}`,
          description: '',
        }))
    }

    if (field === 'tag') {
      return allTags
        .filter(t => t.name.toLowerCase().startsWith(valuePrefix))
        .map(t => ({
          label: `tag:${t.name}`,
          insert: t.name.includes(' ') ? `tag:"${t.name}"` : `tag:${t.name}`,
          description: '',
        }))
    }

    if (field === 'contributor' || field === 'author') {
      return contribSuggestions.filter(s => s.label.toLowerCase().includes(valuePrefix))
    }

    if (field === 'has') {
      return [{ label: 'has:cover', insert: 'has:cover', description: 'Has a cover image' }]
        .filter(s => s.label.toLowerCase().startsWith(lower))
    }

    return []
  }

  function applySuggestion(insert: string) {
    const lastTok = getLastToken(query)
    const base = lastTok ? query.slice(0, query.lastIndexOf(lastTok)) : query
    const newQuery = (base + insert).replace(/\s+/g, ' ')
    setQuery(newQuery)
    setDropdownIdx(-1)
    // If suggestion ends with ':' keep dropdown open to show value options
    if (insert.endsWith(':') || insert.endsWith('" ') || insert.endsWith(' ')) {
      setShowDropdown(true)
    } else {
      setShowDropdown(false)
      setSearch(newQuery)
      setPage(1)
    }
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  const load = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage), sort, sort_dir: sortDir })
      if (search) {
        // Send raw query to backend — the server parses the query language.
        params.set('q', search)
      }
      const result = await callApi<PagedBooks>(`/api/v1/libraries/${libraryId}/books?${params}`)
      setData(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load books')
    }
  }, [callApi, libraryId, page, perPage, search, sort, sortDir])

  // ── Background refresh ────────────────────────────────────────────────────────
  // Silently re-fetches the current view every 30 s while the tab is visible.
  // Only swaps state when the fingerprint (id+updated_at per book) changes, so
  // nothing re-renders unless data actually changed.

  const fingerprintRef = useRef('')
  useEffect(() => {
    fingerprintRef.current = (data?.items ?? []).map(b => `${b.id}:${b.updated_at}`).join(',')
  }, [data])

  const backgroundPoll = useCallback(async () => {
    if (document.hidden) return
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage), sort, sort_dir: sortDir })
      if (search) params.set('q', search)
      const result = await callApi<PagedBooks>(`/api/v1/libraries/${libraryId}/books?${params}`)
      const newFingerprint = (result?.items ?? []).map(b => `${b.id}:${b.updated_at}`).join(',')
      if (newFingerprint !== fingerprintRef.current) {
        fingerprintRef.current = newFingerprint
        setData(result)
      }
    } catch { /* ignore — foreground load handles errors */ }
  }, [callApi, libraryId, page, perPage, search, sort, sortDir])

  useEffect(() => {
    const INTERVAL_MS = 30_000
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => { id = setInterval(backgroundPoll, INTERVAL_MS) }
    const stop  = () => { if (id !== null) { clearInterval(id); id = null } }
    const onVisibility = () => (document.hidden ? stop() : start())
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [backgroundPoll])

  // Check if a book matches any series in the library and queue a suggestion.
  // Called both after a new book is saved and when a duplicate is detected.
  const suggestSeriesForBook = useCallback(async (book: Book) => {
    try {
      const allSeries = await callApi<Series[]>(`/api/v1/libraries/${libraryId}/series`)
      if (!allSeries?.length) return
      const normalize = (s: string) => s.toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]/g, '')
      const normalBook = normalize(book.title)
      for (const s of allSeries) {
        const normalSeries = normalize(s.name)
        if (normalSeries.length < 3) continue
        if (normalBook.includes(normalSeries)) {
          const volMatch = book.title.match(/(?:vol(?:ume)?\.?\s*|#\s*)(\d+)/i)
            ?? book.subtitle?.match(/(?:vol(?:ume)?\.?\s*|#\s*)(\d+)/i)
          const position = volMatch ? parseInt(volMatch[1]) : null
          setSeriesSuggestion({ book, series: s, position })
          return
        }
      }
    } catch { /* ignore */ }
  }, [callApi, libraryId])

  const handleBookSaved = useCallback((book: Book) => {
    setShowAdd(false)
    setEditBook(null)
    load()
    callApi<string[]>(`/api/v1/libraries/${libraryId}/books/letters`)
      .then(r => setAvailableLetters(r ?? []))
      .catch(() => {})
    // Only suggest for new books (not edits)
    if (!editBook) suggestSeriesForBook(book)
  }, [callApi, editBook, libraryId, load, suggestSeriesForBook])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    callApi<string[]>(`/api/v1/libraries/${libraryId}/books/letters`)
      .then(r => setAvailableLetters(r ?? []))
      .catch(() => {})
    callApi<Tag[]>(`/api/v1/libraries/${libraryId}/tags`)
      .then(r => setAllTags(r ?? []))
      .catch(() => {})
    callApi<Genre[]>('/api/v1/genres')
      .then(r => setAllGenres(r ?? []))
      .catch(() => {})
  }, [callApi, libraryId])

  // Async contributor typeahead — fires when query has contributor:<2+ chars>
  useEffect(() => {
    const lastTok = query.match(/\S+$/)?.[0] ?? ''
    const m = lastTok.match(/^(?:contributor|author):(.+)$/i)
    if (!m || m[1].length < 2) { setContribSuggestions([]); return }
    const prefix = m[1].startsWith('"') ? m[1].slice(1) : m[1]
    if (prefix.length < 2) { setContribSuggestions([]); return }
    let cancelled = false
    const t = setTimeout(() => {
      callApi<{ id: string; name: string }[]>(`/api/v1/contributors?q=${encodeURIComponent(prefix)}`)
        .then(results => {
          if (cancelled) return
          setContribSuggestions((results ?? []).map(c => ({
            label: `contributor:${c.name}`,
            insert: c.name.includes(' ') ? `contributor:"${c.name}"` : `contributor:${c.name}`,
            description: '',
          })))
        })
        .catch(() => { if (!cancelled) setContribSuggestions([]) })
    }, 150)
    return () => { cancelled = true; clearTimeout(t) }
  }, [callApi, query])

  useEffect(() => { setSelectedIds(new Set()) }, [page, search])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearch(query)
  }

  const handleSort = (col: string) => {
    if (sort === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setSortDir('asc') }
    setPage(1)
  }

  const handleLetterClick = (l: string) => {
    const parsed = parseSearchQuery(query)
    const letterCond = allConditions(parsed).find(c => c.field === 'letter')
    const activeLetter = letterCond?.value?.toUpperCase() ?? ''
    const newQuery = activeLetter === l
      ? removeFromQuery(query, letterCond!.raw)
      : upsertQueryToken(query, `letter:${l}`, /\bletter:\S+/gi)
    setQuery(newQuery)
    setSearch(newQuery)
    setPage(1)
  }

  const deleteBook = async (book: Book) => {
    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return
    try {
      await callApi(`/api/v1/libraries/${libraryId}/books/${book.id}`, { method: 'DELETE' })
      load()
      callApi<string[]>(`/api/v1/libraries/${libraryId}/books/letters`)
        .then(r => setAvailableLetters(r ?? []))
        .catch(() => {})
    } catch { /* ignore */ }
  }

  const totalPages = data ? Math.ceil(data.total / perPage) : 1

  function bookPatchBody(book: Book, overrides: { media_type_id?: string; tag_ids?: string[]; genre_ids?: string[] }) {
    return {
      title:         book.title,
      subtitle:      book.subtitle,
      media_type_id: overrides.media_type_id ?? book.media_type_id,
      description:   book.description,
      contributors:  book.contributors.map(c => ({
        contributor_id: c.contributor_id,
        role:           c.role,
        display_order:  c.display_order,
      })),
      tag_ids:   overrides.tag_ids ?? book.tags.map(t => t.id),
      genre_ids: overrides.genre_ids ?? (book.genres ?? []).map(g => g.id),
    }
  }

  const applyBulk = async (transform: (book: Book) => object) => {
    if (!data) return
    const books = data.items.filter(b => selectedIds.has(b.id))
    setIsBulkApplying(true)
    for (const book of books) {
      try {
        await callApi(`/api/v1/libraries/${libraryId}/books/${book.id}`, {
          method: 'PUT',
          body: JSON.stringify(transform(book)),
        })
      } catch { /* skip individual errors */ }
    }
    setIsBulkApplying(false)
    setSelectedIds(new Set())
    load()
  }

  const bulkChangeType = (mediaTypeId: string) =>
    applyBulk(book => bookPatchBody(book, { media_type_id: mediaTypeId }))

  const bulkAddTag = (tagId: string) =>
    applyBulk(book => bookPatchBody(book, {
      tag_ids: book.tags.some(t => t.id === tagId)
        ? book.tags.map(t => t.id)
        : [...book.tags.map(t => t.id), tagId],
    }))

  const bulkRemoveTag = (tagId: string) =>
    applyBulk(book => bookPatchBody(book, {
      tag_ids: book.tags.filter(t => t.id !== tagId).map(t => t.id),
    }))

  const bulkAddGenre = (genreId: string) =>
    applyBulk(book => bookPatchBody(book, {
      genre_ids: (book.genres ?? []).some(g => g.id === genreId)
        ? (book.genres ?? []).map(g => g.id)
        : [...(book.genres ?? []).map(g => g.id), genreId],
    }))

  const bulkRemoveGenre = (genreId: string) =>
    applyBulk(book => bookPatchBody(book, {
      genre_ids: (book.genres ?? []).filter(g => g.id !== genreId).map(g => g.id),
    }))

  const bulkEnrichMetadata = async (force: boolean, useAICleanup: boolean) => {
    const bookIds = Array.from(selectedIds)
    setIsBulkJobEnqueueing(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/books/bulk/enrich`, {
        method: 'POST',
        body: JSON.stringify({ book_ids: bookIds, force, use_ai_cleanup: useAICleanup }),
      })
      showToast(`Metadata refresh queued for ${bookIds.length} book${bookIds.length !== 1 ? 's' : ''}.`, {
        action: { label: 'View jobs', to: '/settings/jobs' },
      })
    } catch { /* ignore */ }
    setIsBulkJobEnqueueing(false)
    setShowBulkMetaModal(false)
    setBulkMetaForce(false)
    setBulkMetaUseAI(false)
    setSelectedIds(new Set())
  }

  const bulkRefreshCovers = async () => {
    const bookIds = Array.from(selectedIds)
    setIsBulkApplying(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/books/bulk/cover`, {
        method: 'POST',
        body: JSON.stringify({ book_ids: bookIds }),
      })
      showToast(`Cover refresh queued for ${bookIds.length} book${bookIds.length !== 1 ? 's' : ''}.`, {
        action: { label: 'View jobs', to: '/settings/jobs' },
      })
    } catch { /* ignore */ }
    setIsBulkApplying(false)
    setSelectedIds(new Set())
  }

  const bulkDelete = async () => {
    if (!data) return
    if (!confirm(`Delete ${selectedIds.size} book${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
    const books = data.items.filter(b => selectedIds.has(b.id))
    setIsBulkApplying(true)
    for (const book of books) {
      try {
        await callApi(`/api/v1/libraries/${libraryId}/books/${book.id}`, { method: 'DELETE' })
      } catch { /* skip */ }
    }
    setIsBulkApplying(false)
    setSelectedIds(new Set())
    load()
    callApi<string[]>(`/api/v1/libraries/${libraryId}/books/letters`)
      .then(r => setAvailableLetters(r ?? []))
      .catch(() => {})
  }

  // Computed here rather than in an IIFE inside the JSX. The old inline
  // version ran during render, which made every handler defined inside it
  // look like render-time work to react-hooks/refs, since applySuggestion
  // touches searchInputRef.
  const dropdownSuggestions = showDropdown ? getSuggestions(getLastToken(query)) : []

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowDropdown(true); setDropdownIdx(-1) }}
              onFocus={() => { setShowDropdown(true); setDropdownIdx(-1) }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              onKeyDown={e => {
                const suggestions = getSuggestions(getLastToken(query))
                if (e.key === 'Escape') { setShowDropdown(false); setDropdownIdx(-1); return }
                if (!showDropdown || suggestions.length === 0) return
                if (e.key === 'ArrowDown') { e.preventDefault(); setDropdownIdx(i => Math.min(i + 1, suggestions.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setDropdownIdx(i => Math.max(i - 1, -1)) }
                else if (e.key === 'Enter' && dropdownIdx >= 0) { e.preventDefault(); applySuggestion(suggestions[dropdownIdx].insert) }
                else if (e.key === 'Tab') { e.preventDefault(); applySuggestion(suggestions[Math.max(dropdownIdx, 0)].insert) }
              }}
              placeholder='Search… type:Manga, tag:read, contributor:endo, NOT, OR, "phrase"'
              className="w-full rounded-lg border border-line-strong dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {showDropdown && dropdownSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-line bg-surface shadow-lg overflow-hidden">
                {dropdownSuggestions.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); applySuggestion(s.insert) }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${i === dropdownIdx ? 'bg-blue-50 dark:bg-blue-950/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  >
                    <span className="font-mono font-medium text-accent min-w-[7rem]">{s.label}</span>
                    {s.description && <span className="text-xs text-content-subtle">{s.description}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="submit"
            className="rounded-lg border border-line-strong px-3 py-2 text-sm text-content-tertiary hover:bg-surface-muted transition-colors">Search</button>
        </form>
        {/* View mode toggle */}
        <div className="flex items-center rounded-lg border border-line-strong overflow-hidden flex-shrink-0">
          <button
            onClick={() => setViewModeAndSave('table')}
            className={`px-2.5 py-2 transition-colors ${viewMode === 'table' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            title="Table view">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <button
            onClick={() => setViewModeAndSave('grid')}
            className={`px-2.5 py-2 transition-colors ${viewMode === 'grid' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            title="Grid view">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
        </div>
        {/* Column picker — table mode only */}
        {viewMode === 'table' && (
        <div className="relative flex-shrink-0" ref={colPickerRef}>
          <button
            onClick={() => setColPickerOpen(o => !o)}
            className="rounded-lg border border-line-strong px-2.5 py-2 text-content-muted hover:bg-surface-muted transition-colors"
            title="Choose columns">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </button>
          {colPickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-lg border border-line bg-surface shadow-lg py-1">
              {ALL_COLS.map(col => (
                <label key={col} className="flex items-center gap-2.5 px-3 py-2 text-sm text-content-secondary hover:bg-surface-muted cursor-pointer">
                  <input type="checkbox" checked={visibleCols.has(col)}
                    onChange={() => toggleCol(col)}
                    className="rounded border-line-strong text-blue-600" />
                  {COL_LABELS[col]}
                </label>
              ))}
            </div>
          )}
        </div>
        )}
        <Link to={`/import?library=${libraryId}`}
          className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-content-secondary hover:bg-surface-muted transition-colors flex-shrink-0">
          Import CSV
        </Link>
        <button onClick={() => setShowAdd(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors flex-shrink-0">
          Add book
        </button>
      </div>

      {(() => {
        const parsed = parseSearchQuery(search)
        const flat = allConditions(parsed)
        // Hide if it's just a single plain title search (no structured tokens)
        const hasStructured = flat.some(c => c.field !== 'title' || c.op === 'regex' || c.op === 'phrase' || c.op === 'not_contains')
        if (!hasStructured && flat.length <= 1) return null
        return (
          <div className="flex flex-wrap gap-1.5 mb-3 items-center">
            {parsed.groups.map((group, gi) =>
              group.conditions.map((c, ci) => {
                const isNeg = c.op.startsWith('not_')
                const chipColor = c.field === 'letter'
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-accent-strong ring-blue-200 dark:ring-blue-700'
                  : c.field === 'type'
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 ring-indigo-200 dark:ring-indigo-800'
                    : c.field === 'tag'
                      ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 ring-purple-200 dark:ring-purple-800'
                      : c.field === 'genre'
                        ? 'bg-green-50 dark:bg-green-950/40 text-success-strong ring-success-line '
                        : c.field === 'has'
                          ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 ring-teal-200 dark:ring-teal-800'
                          : isNeg
                        ? 'bg-red-50 dark:bg-red-950/40 text-danger-strong ring-red-200 dark:ring-red-800'
                        : 'bg-accent-surface text-accent-strong ring-blue-200 dark:ring-blue-800'
                return (
                  <Fragment key={`${gi}-${ci}`}>
                    {gi > 0 && ci === 0 && <span className="text-xs text-content-subtle font-medium">AND</span>}
                    {ci > 0 && group.mode === 'OR' && <span className="text-xs text-orange-500 dark:text-orange-400 font-medium">OR</span>}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${chipColor}`}>
                      {isNeg && <span className="font-bold">NOT</span>}
                      {conditionLabel(c)}
                      <button
                        type="button"
                        onClick={() => {
                          const next = removeFromQuery(search, c.raw)
                          setSearch(next); setQuery(next); setPage(1)
                        }}
                        className="ml-0.5 hover:opacity-75 transition-opacity leading-none"
                      >×</button>
                    </span>
                  </Fragment>
                )
              })
            )}
          </div>
        )
      })()}

      {availableLetters.length > 0 && (() => {
        const activeLetter = allConditions(parseSearchQuery(search)).find(c => c.field === 'letter')?.value?.toUpperCase() ?? ''
        return (
          <div className="flex flex-wrap gap-0.5 mb-3">
            {availableLetters.map(l => (
              <button key={l} type="button"
                onClick={() => handleLetterClick(l)}
                className={`w-7 h-7 rounded text-xs font-medium transition-colors ${activeLetter === l ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                {l}
              </button>
            ))}
          </div>
        )
      })()}

      {error && <div className="mb-4 rounded-lg bg-danger-surface border border-danger-line px-4 py-3 text-sm text-danger-strong">{error}</div>}

      {!data && <div className="text-sm text-content-subtle text-center py-16">Loading…</div>}

      {data?.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface p-12 text-center">
          <p className="text-sm font-medium text-content-muted">{search ? 'No books match your search.' : 'No books yet'}</p>
          {!search && <button onClick={() => setShowAdd(true)}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
            Add your first book
          </button>}
        </div>
      )}

      {selectedIds.size > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent-line bg-accent-surface px-4 py-2.5 text-sm">
            <span className="font-medium text-accent-strong">
              {selectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-blue-200 dark:bg-blue-700" />

            {/* Type */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-content-tertiary">Type:</span>
              <select
                disabled={isBulkApplying}
                defaultValue=""
                onChange={async e => {
                  const id = e.target.value
                  if (!id) return
                  e.target.value = ''
                  await bulkChangeType(id)
                }}
                className="rounded border border-line-strong bg-surface-raised dark:text-white px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
              >
                <option value="">Change type…</option>
                {mediaTypes.map(mt => <option key={mt.id} value={mt.id}>{mt.display_name}</option>)}
              </select>
            </div>

            {/* Tags */}
            {allTags.length > 0 && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-content-tertiary">Add tag:</span>
                  <select
                    disabled={isBulkApplying}
                    defaultValue=""
                    onChange={async e => {
                      const id = e.target.value
                      if (!id) return
                      e.target.value = ''
                      await bulkAddTag(id)
                    }}
                    className="rounded border border-line-strong bg-surface-raised dark:text-white px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Pick tag…</option>
                    {allTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-content-tertiary">Remove tag:</span>
                  <select
                    disabled={isBulkApplying}
                    defaultValue=""
                    onChange={async e => {
                      const id = e.target.value
                      if (!id) return
                      e.target.value = ''
                      await bulkRemoveTag(id)
                    }}
                    className="rounded border border-line-strong bg-surface-raised dark:text-white px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Pick tag…</option>
                    {allTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </>
            )}

            {/* Genres */}
            {allGenres.length > 0 && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-content-tertiary">Add genre:</span>
                  <select
                    disabled={isBulkApplying}
                    defaultValue=""
                    onChange={async e => {
                      const id = e.target.value
                      if (!id) return
                      e.target.value = ''
                      await bulkAddGenre(id)
                    }}
                    className="rounded border border-line-strong bg-surface-raised dark:text-white px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Pick genre…</option>
                    {allGenres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-content-tertiary">Remove genre:</span>
                  <select
                    disabled={isBulkApplying}
                    defaultValue=""
                    onChange={async e => {
                      const id = e.target.value
                      if (!id) return
                      e.target.value = ''
                      await bulkRemoveGenre(id)
                    }}
                    className="rounded border border-line-strong bg-surface-raised dark:text-white px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Pick genre…</option>
                    {allGenres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </>
            )}

            <div className="h-4 w-px bg-blue-200 dark:bg-blue-700" />

            {/* Async bulk jobs */}
            <button
              type="button"
              disabled={isBulkApplying || isBulkJobEnqueueing}
              onClick={() => setShowBulkMetaModal(true)}
              className="text-xs text-accent-strong hover:text-blue-900 dark:hover:text-blue-100 disabled:opacity-50 transition-colors"
            >
              Refresh metadata
            </button>
            <button
              type="button"
              disabled={isBulkApplying || isBulkJobEnqueueing}
              onClick={bulkRefreshCovers}
              className="text-xs text-accent-strong hover:text-blue-900 dark:hover:text-blue-100 disabled:opacity-50 transition-colors"
            >
              Refresh covers
            </button>

            <div className="h-4 w-px bg-blue-200 dark:bg-blue-700" />

            <button
              type="button"
              disabled={isBulkApplying || isBulkJobEnqueueing}
              onClick={bulkDelete}
              className="text-xs text-danger hover:text-danger-strong disabled:opacity-50 transition-colors"
            >
              Delete
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs text-content-muted hover:text-content-secondary transition-colors"
            >
              Clear ×
            </button>

            {(isBulkApplying || isBulkJobEnqueueing) && (
              <span className="text-xs text-accent animate-pulse">
                {isBulkJobEnqueueing ? 'Queuing…' : 'Applying…'}
              </span>
            )}
          </div>

          {/* Refresh metadata confirmation modal */}
          {showBulkMetaModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-xl">
                <h3 className="text-base font-semibold text-content mb-2">
                  Refresh metadata
                </h3>
                <p className="text-sm text-content-tertiary mb-4">
                  Queue metadata enrichment for {selectedIds.size} book{selectedIds.size !== 1 ? 's' : ''}?
                  Books without an ISBN will be skipped.
                </p>
                <label className="flex items-start gap-2.5 mb-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bulkMetaForce}
                    onChange={e => setBulkMetaForce(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line-strong"
                  />
                  <span className="text-sm text-content-secondary">
                    Override existing fields
                    <span className="block text-xs text-content-muted mt-0.5">
                      When unchecked, only empty fields are filled in. When checked, provider data replaces existing values.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bulkMetaUseAI}
                    onChange={e => setBulkMetaUseAI(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line-strong"
                  />
                  <span className="text-sm text-content-secondary">
                    Clean descriptions with AI
                    <span className="block text-xs text-content-muted mt-0.5">
                      Strip marketing fluff and retailer boilerplate from each book's description after enrichment. Uses AI tokens.
 </span>
 </span>
 </label>
 <div className="flex gap-2 justify-end">
 <button
 type="button"
 onClick={() => { setShowBulkMetaModal(false); setBulkMetaForce(false); setBulkMetaUseAI(false) }}
 className="rounded-lg px-4 py-2 text-sm text-content-tertiary hover:bg-surface-inset transition-colors"
 >
 Cancel
 </button>
 <button
 type="button"
 disabled={isBulkJobEnqueueing}
 onClick={() => bulkEnrichMetadata(bulkMetaForce, bulkMetaUseAI)}
 className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
 >
 {isBulkJobEnqueueing ? 'Queuing…' : 'Queue jobs'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {data && data.items.length > 0 && (
        <>
          {viewMode === 'grid' ? (
 <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
 {data.items.map(book => (
 <div key={book.id} className="group relative flex flex-col gap-2">
 <div className="relative">
 <Link to={`/libraries/${libraryId}/books/${book.id}`} className="block">
 <BookCover title={book.title} coverUrl={book.cover_url} className="w-full"
 readStatus={showReadBadges ? book.user_read_status : undefined} />
 </Link>
 {canEdit && (
 <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button onClick={() => setEditBook(book)}
 className="p-1 rounded bg-white/90 dark:bg-gray-900/90 text-content-tertiary hover:text-accent shadow-sm transition-colors"
 title="Edit book">
 <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
 <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
 </svg>
 </button>
 <button onClick={() => deleteBook(book)}
 className="p-1 rounded bg-white/90 dark:bg-gray-900/90 text-content-tertiary hover:text-danger shadow-sm transition-colors"
 title="Delete book">
 <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
 <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
 </svg>
 </button>
 </div>
 )}
 </div>
 <div className="min-w-0 px-0.5">
 <Link to={`/libraries/${libraryId}/books/${book.id}`}
 className="block text-xs font-medium text-content line-clamp-2 leading-snug hover:text-accent transition-colors">
 {book.title}
 </Link>
 {book.contributors.length > 0 && (
 <p className="text-xs text-gray-500 truncate mt-0.5">{book.contributors[0].name}</p>
 )}
 {(book.active_loan_count ?? 0) > 0 && (
 <span className="mt-1 inline-flex items-center rounded-full bg-warning-surface px-2 py-0.5 text-[10px] font-medium text-warning-strong ring-1 ring-amber-200 dark:ring-amber-800">
 Lent
 </span>
 )}
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="rounded-xl border border-line bg-surface overflow-x-auto">
 <table className="w-full text-sm">
 <thead className="bg-gray-50 dark:bg-gray-800 border-b border-line dark:border-gray-700">
 <tr>
 <th className="w-8 px-3 py-3">
 <input
 type="checkbox"
 checked={allOnPageSelected}
 ref={el => { if (el) el.indeterminate = someOnPageSelected }}
 onChange={e => {
 if (e.target.checked) setSelectedIds(new Set(pageIds))
 else setSelectedIds(new Set())
 }}
 className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
 />
 </th>
 {([{ label: 'Title', col: 'title' }, ...(visibleCols.has('type') ? [{ label: 'Type', col: 'media_type' }] : [])]).map(({ label, col }) => (
 <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
 <button type="button" onClick={() => handleSort(col)}
 className="flex items-center gap-1 uppercase tracking-wide hover:text-content-secondary transition-colors">
 {label}
 {sort === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : <span className="opacity-0"> ↑</span>}
                      </button>
                    </th>
                  ))}
                  {visibleCols.has('tags') && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tags</th>}
                  {visibleCols.has('contributors') && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Contributors</th>}
                  {visibleCols.has('series') && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Series</th>}
                  {visibleCols.has('shelves') && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Shelves</th>}
                  {visibleCols.has('date_added') && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Date Added</th>}
                  {visibleCols.has('publisher') && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Publisher</th>}
                  {visibleCols.has('published') && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Published</th>}
                  {visibleCols.has('language') && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-content-muted dark:text-gray-400">Language</th>}
 <th className="sticky right-0 px-4 py-3 bg-gray-50 dark:bg-gray-800" />
 </tr>
 </thead>

 <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
 {data.items.map(book => (
 <tr key={book.id} className="group hover:bg-surface-muted transition-colors">
 <td className="w-8 px-3 py-2" onClick={e => e.stopPropagation()}>
 <input
 type="checkbox"
 checked={selectedIds.has(book.id)}
 onChange={e => setSelectedIds(prev => {
 const next = new Set(prev)
 if (e.target.checked) next.add(book.id); else next.delete(book.id)
 return next
 })}
 className="rounded border-line-strong text-blue-600 focus:ring-blue-500 cursor-pointer"
 />
 </td>
 <td className="px-4 py-2">
 <div className="flex items-center gap-2.5">
 <BookCoverThumb title={book.title} coverUrl={book.cover_url}
 readStatus={showReadBadges ? book.user_read_status : undefined} />
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <Link to={`/libraries/${libraryId}/books/${book.id}`}
 className="font-medium text-content hover:text-accent transition-colors">
 {book.title}
 </Link>
 {(book.active_loan_count ?? 0) > 0 && (
 <span className="inline-flex items-center rounded-full bg-warning-surface px-2 py-0.5 text-[10px] font-medium text-warning-strong ring-1 ring-amber-200 dark:ring-amber-800">
 Lent
 </span>
 )}
 </div>
 {book.subtitle && <p className="text-xs text-gray-400 truncate max-w-xs">{book.subtitle}</p>}
 {book.genres?.length > 0 && (
 <div className="flex flex-wrap gap-1 mt-1">
 {book.genres.map(genre => (
 <button key={genre.id} type="button"
 onClick={() => {
 const genreToken = genre.name.includes(' ') ? `genre:"${genre.name}"` : `genre:${genre.name}`
 const next = upsertQueryToken(query, genreToken, /\bgenre:(?:"[^"]*"|\S+)/gi)
 setQuery(next); setSearch(next); setPage(1)
 }}
 className="rounded-full border border-line px-1.5 py-0.5 text-xs font-medium text-content-tertiary hover:border-blue-400 dark:hover:border-blue-500 hover:text-accent transition-colors"
 title={`Filter by genre: ${genre.name}`}>
 {genre.name}
 </button>
 ))}
 </div>
 )}
 </div>{/* min-w-0 */}
 </div>{/* flex items-center */}
 </td>
 {visibleCols.has('type') && (
                      <td className="px-4 py-2">
                        <button type="button"
                          onClick={() => {
                            const typeToken = book.media_type.includes(' ') ? `type:"${book.media_type}"` : `type:${book.media_type}`
 const next = upsertQueryToken(query, typeToken, /\btype:(?:"[^"]*"|\S+)/gi)
 setQuery(next); setSearch(next); setPage(1)
 }}
 className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs font-medium text-content-tertiary whitespace-nowrap hover:border-blue-400 dark:hover:border-blue-500 hover:text-accent transition-colors"
 title={`Filter by type: ${book.media_type}`}>
 {book.media_type}
 </button>
 </td>
 )}
 {visibleCols.has('tags') && (
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {book.tags.map(tag => (
                            <button key={tag.id} type="button"
                              onClick={() => {
                                const tagToken = tag.name.includes(' ') ? `tag:"${tag.name}"` : `tag:${tag.name}`
                                const next = upsertQueryToken(query, tagToken, /\btag:(?:"[^"]*"|\S+)/gi)
                                setQuery(next); setSearch(next); setPage(1)
                              }}
                              className="rounded-full border border-transparent px-1.5 py-0.5 text-xs font-medium text-white transition-colors hover:border-blue-300 dark:hover:border-blue-400"
                              style={{ backgroundColor: tag.color || '#6b7280' }}
                              title={`Filter by tag: ${tag.name}`}>
                              {tag.name}
                            </button>
                          ))}
                          {!book.tags.length && <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </div>
                      </td>
                    )}
                    {visibleCols.has('contributors') && (
 <td className="px-4 py-2 text-content-tertiary text-xs">
 {book.contributors.length > 0
 ? (
 <div className="flex flex-col gap-0.5">
 {book.contributors.map((c, ci) => (
 <span key={ci}>
 <button type="button"
 onClick={() => {
 const token = c.name.includes(' ') ? `contributor:"${c.name}"` : `contributor:${c.name}`
 const next = upsertQueryToken(query, token, /\bcontributor:(?:"[^"]*"|\S+)/gi)
 setQuery(next); setSearch(next); setPage(1)
 }}
 className="hover:underline hover:text-accent transition-colors"
 title={`Filter by contributor: ${c.name}`}>
 {c.name}
 </button>
 {' '}<span className="text-gray-400 dark:text-gray-500">({c.role.charAt(0).toUpperCase() + c.role.slice(1)})</span>
                                </span>
                              ))}
                            </div>
                          )
                          : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                    )}
                    {visibleCols.has('series') && (
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                        {book.series?.length > 0
                          ? <div className="flex flex-col gap-0.5">
                              {book.series.map(s => (
                                <span key={s.series_id} className="whitespace-nowrap">
                                  <button type="button"
                                    onClick={() => {
                                      const token = s.series_name.includes(' ') ? `series:"${s.series_name}"` : `series:${s.series_name}`
 const next = upsertQueryToken(query, token, /\bseries:(?:"[^"]*"|\S+)/gi)
 setQuery(next); setSearch(next); setPage(1)
 }}
 className="hover:underline hover:text-accent transition-colors"
 title={`Filter by series: ${s.series_name}`}>
 {s.series_name}
 </button>
 <span className="text-gray-400 dark:text-gray-500"> #{s.position}</span>
 </span>
 ))}
 </div>
 : <span className="text-gray-300 dark:text-gray-600">—</span>}
 </td>
 )}
 {visibleCols.has('shelves') && (
                      <td className="px-4 py-2">
                        {book.shelves?.length > 0
                          ? <div className="flex flex-wrap gap-1">
                              {book.shelves.map(s => (
                                <button key={s.id} type="button"
                                  onClick={() => {
                                    const token = s.name.includes(' ') ? `shelf:"${s.name}"` : `shelf:${s.name}`
 const next = upsertQueryToken(query, token, /\bshelf:(?:"[^"]*"|\S+)/gi)
 setQuery(next); setSearch(next); setPage(1)
 }}
 className="rounded-full border border-line px-1.5 py-0.5 text-xs text-content-tertiary hover:border-blue-400 dark:hover:border-blue-500 hover:text-accent transition-colors"
 title={`Filter by shelf: ${s.name}`}>
 {s.name}
 </button>
 ))}
 </div>
 : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
 </td>
 )}
 {visibleCols.has('date_added') && (
 <td className="px-4 py-2 text-xs text-content-muted whitespace-nowrap">
 {new Date(book.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    )}
                    {visibleCols.has('publisher') && (
 <td className="px-4 py-2 text-xs text-content-tertiary max-w-[10rem]">
 {book.publisher
 ? <button type="button"
 onClick={() => {
 const token = book.publisher.includes(' ') ? `publisher:"${book.publisher}"` : `publisher:${book.publisher}`
 const next = upsertQueryToken(query, token, /\bpublisher:(?:"[^"]*"|\S+)/gi)
 setQuery(next); setSearch(next); setPage(1)
 }}
 className="truncate max-w-full block hover:underline hover:text-accent transition-colors text-left"
 title={`Filter by publisher: ${book.publisher}`}>
 {book.publisher}
 </button>
 : <span className="text-gray-300 dark:text-gray-600">—</span>}
 </td>
 )}
 {visibleCols.has('published') && (
 <td className="px-4 py-2 text-xs text-content-tertiary tabular-nums">
 {book.publish_year ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
 </td>
 )}
 {visibleCols.has('language') && (
 <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
 {book.language
 ? <button type="button"
 onClick={() => {
 const next = upsertQueryToken(query, `language:${book.language}`, /\blanguage:(?:"[^"]*"|\S+)/gi)
 setQuery(next); setSearch(next); setPage(1)
 }}
 className="hover:underline hover:text-accent transition-colors"
 title={`Filter by language: ${displayLanguage(book.language)}`}>
 {displayLanguage(book.language)}
 </button>
 : <span className="text-gray-300 dark:text-gray-600">—</span>}
 </td>
 )}
 <td className="sticky right-0 px-4 py-2 bg-surface group-hover:bg-surface-muted transition-colors">
 <div className="flex items-center gap-1 justify-end">
 {canEdit && (
 <>
 <button onClick={() => setEditBook(book)}
 className="p-1.5 rounded text-content-subtle hover:text-accent hover:bg-accent-surface transition-colors"
 title="Edit book">
 <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
 <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
 </svg>
 </button>
 <button onClick={() => deleteBook(book)}
 className="p-1.5 rounded text-content-subtle hover:text-danger hover:bg-danger-surface transition-colors"
 title="Delete book">
 <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
 <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
 </svg>
 </button>
 </>
 )}
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}

 {data && data.total > 0 && (
 <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
 <span>{data.total} book{data.total !== 1 ? 's' : ''} · Page {page} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <select
                  value={perPage}
                  onChange={e => {
                    const n = Number(e.target.value)
                    localStorage.setItem('librarium:books:perPage', String(n))
 setPerPage(n)
 setPage(1)
 if (prefsReadyRef.current) patchPreference(`library:${libraryId}:books_per_page`, n)
 }}
 className="rounded border border-line-strong bg-transparent px-1.5 py-1 text-xs text-content-tertiary focus:outline-none"
 >
 {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} / page</option>)}
 </select>
 <div className="flex items-center gap-1">
 <button onClick={() => setPage(1)} disabled={page === 1}
 className="rounded px-2 py-1 border border-line-strong hover:bg-surface-raised disabled:opacity-40 transition-colors">«</button>
 <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
 className="rounded px-2 py-1 border border-line-strong hover:bg-surface-raised disabled:opacity-40 transition-colors">‹</button>
 {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
 // show pages around current page
 let p: number
 if (totalPages <= 7) p = i + 1
 else if (page <= 4) p = i + 1
 else if (page >= totalPages - 3) p = totalPages - 6 + i
 else p = page - 3 + i
 return (
 <button key={p} onClick={() => setPage(p)} disabled={p === page}
 className={`rounded px-2.5 py-1 border transition-colors ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-40'}`}>
 {p}
 </button>
 )
 })}
 <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
 className="rounded px-2 py-1 border border-line-strong hover:bg-surface-raised disabled:opacity-40 transition-colors">›</button>
 <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
 className="rounded px-2 py-1 border border-line-strong hover:bg-surface-raised disabled:opacity-40 transition-colors">»</button>
 </div>
 </div>
 </div>
 )}
 </>
 )}

 {showAdd && (
 <AddBookModal
 libraryId={libraryId}
 mediaTypes={mediaTypes}
 onClose={() => setShowAdd(false)}
 onSaved={handleBookSaved}
 onDuplicate={suggestSeriesForBook}
 initialIsbn={addInitialIsbn || undefined}
 initialTitle={addInitialTitle || undefined}
 />
 )}
 {editBook && (
 <EditBookModal
 libraryId={libraryId}
 book={editBook}
 onClose={() => setEditBook(null)}
 onSaved={book => { setEditBook(null); handleBookSaved(book) }}
 />
 )}

 {seriesSuggestion && !showAdd && !editBook && (
 <SeriesLinkSuggestionModal
 libraryId={libraryId}
 book={seriesSuggestion.book}
 series={seriesSuggestion.series}
 suggestedPosition={seriesSuggestion.position}
 onClose={() => setSeriesSuggestion(null)}
 />
 )}

 </div>
 )
}

// ─── Series link suggestion modal ────────────────────────────────────────────

interface SeriesLinkSuggestionModalProps {
 libraryId: string
 book: Book
 series: Series
 suggestedPosition: number | null
 onClose: () => void
}

function SeriesLinkSuggestionModal({ libraryId, book, series, suggestedPosition, onClose }: SeriesLinkSuggestionModalProps) {
 const { callApi } = useAuth()
 useEffect(() => {
 const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  const [position, setPosition] = useState(suggestedPosition != null ? String(suggestedPosition) : '')
  const [isSaving, setIsSaving] = useState(false)

  const handleAdd = async () => {
    setIsSaving(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/series/${series.id}/books`, {
        method: 'POST',
 body: JSON.stringify({ book_id: book.id, position: Number(position) || 1 }),
 })
 onClose()
 } catch { /* ignore */ } finally {
 setIsSaving(false)
 }
 }

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
 <div className="w-full max-w-sm rounded-xl bg-surface shadow-xl p-6">
 <div className="flex items-center justify-between mb-1">
 <h3 className="text-base font-semibold text-gray-900 dark:text-white">Add to series?</h3>
 <button type="button" onClick={onClose}
 className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-surface-inset transition-colors"
 aria-label="Close">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>
 <p className="text-sm text-content-tertiary mb-4">
 <span className="font-medium text-gray-900 dark:text-white">{book.title}</span> looks like it belongs to{' '}
 <span className="font-medium text-content dark:text-white">{series.name}</span>.
 </p>
 <div className="mb-4">
 <label className="block text-sm font-medium text-content-secondary mb-1">Volume position</label>
 <input type="number" min="0" step="0.5" value={position} onChange={e => setPosition(e.target.value)}
 placeholder="e.g. 1, 2, 1.5"
 className="w-full rounded-lg border border-line-strong dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
 </div>
 <div className="flex gap-3">
 <button type="button" onClick={onClose}
 className="flex-1 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors">
 Not now
 </button>
 <button type="button" onClick={handleAdd} disabled={!position || isSaving}
 className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
 {isSaving ? 'Adding…' : 'Add to series'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Series tab ───────────────────────────────────────────────────────────────

const formatPosition = (pos: number) => pos % 1 === 0 ? pos.toFixed(0) : pos.toFixed(1)

const TOTAL_SERIES_FIELDS = 9

function countSeriesLookupFields(r: SeriesLookupResult): number {
  return [
    !!r.description,
    r.total_count != null,
    !!r.status,
    !!r.original_language,
    r.publication_year != null,
    !!r.demographic,
    (r.genres?.length ?? 0) > 0,
    !!r.url,
    !!r.cover_url,
  ].filter(Boolean).length
}

// ─── Series merge helpers ─────────────────────────────────────────────────────

interface SeriesFieldOption<T> {
  value: T
  sources: string[]          // e.g. ["MangaDex", "Hardcover"] or ["Current"]
  isCurrent?: boolean
}

function normalizeSeriesName(s: string): string {
  return s.trim().toLowerCase()
}

// mergeString returns unique (case-insensitive, trimmed) option rows for a
// string field, preserving original casing from the first occurrence and
// aggregating source labels on exact-after-normalize matches.
function mergeString(
  current: string | undefined,
  entries: Array<{ source: string; value: string | undefined | null }>,
): SeriesFieldOption<string>[] {
  const out: SeriesFieldOption<string>[] = []
  const byKey = new Map<string, SeriesFieldOption<string>>()
  if (current && current.trim()) {
    const opt: SeriesFieldOption<string> = { value: current, sources: ['Current'], isCurrent: true }
    byKey.set(current.trim().toLowerCase(), opt)
    out.push(opt)
  }
  for (const e of entries) {
    const v = (e.value ?? '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.sources.includes(e.source)) existing.sources.push(e.source)
    } else {
      const opt: SeriesFieldOption<string> = { value: e.value ?? '', sources: [e.source] }
      byKey.set(key, opt)
      out.push(opt)
    }
  }
  return out
}

function mergeNumber(
  current: number | null | undefined,
  entries: Array<{ source: string; value: number | null | undefined }>,
): SeriesFieldOption<number | null>[] {
  const out: SeriesFieldOption<number | null>[] = []
  const byKey = new Map<string, SeriesFieldOption<number | null>>()
  if (current != null) {
    const opt: SeriesFieldOption<number | null> = { value: current, sources: ['Current'], isCurrent: true }
    byKey.set(String(current), opt)
    out.push(opt)
  }
  for (const e of entries) {
    if (e.value == null) continue
    const key = String(e.value)
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.sources.includes(e.source)) existing.sources.push(e.source)
    } else {
      const opt: SeriesFieldOption<number | null> = { value: e.value, sources: [e.source] }
      byKey.set(key, opt)
      out.push(opt)
    }
  }
  return out
}

function mergeGenres(
  current: string[],
  entries: Array<{ source: string; value: string[] | undefined }>,
): SeriesFieldOption<string[]>[] {
  const key = (arr: string[]) => [...arr].map(s => s.trim().toLowerCase()).sort().join('|')
  const out: SeriesFieldOption<string[]>[] = []
  const byKey = new Map<string, SeriesFieldOption<string[]>>()
  if (current.length > 0) {
    const opt: SeriesFieldOption<string[]> = { value: current, sources: ['Current'], isCurrent: true }
    byKey.set(key(current), opt)
    out.push(opt)
  }
  for (const e of entries) {
    if (!e.value || e.value.length === 0) continue
    const k = key(e.value)
    const existing = byKey.get(k)
    if (existing) {
      if (!existing.sources.includes(e.source)) existing.sources.push(e.source)
    } else {
      const opt: SeriesFieldOption<string[]> = { value: e.value, sources: [e.source] }
      byKey.set(k, opt)
      out.push(opt)
    }
  }
  return out
}

// Sort so options with more sources come first, then current-first, then stable.
function sortOptions<T>(opts: SeriesFieldOption<T>[]): SeriesFieldOption<T>[] {
  return [...opts].sort((a, b) => {
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length
    if (!!b.isCurrent !== !!a.isCurrent) return a.isCurrent ? -1 : 1
    return 0
  })
}


interface AddToSeriesModalProps {
  libraryId: string
  seriesId: string
  existingBookIds: string[]
  editEntry?: SeriesEntry | null
  /** Pre-fill the position field (e.g. when opening from a ghost row). */
  initialPosition?: number
  /** Pre-fill and auto-run the book search (e.g. series name + vol number). */
  initialQuery?: string
  onClose: () => void
  onSaved: () => void
}

function AddToSeriesModal({ libraryId, seriesId, existingBookIds, editEntry, initialPosition, initialQuery, onClose, onSaved }: AddToSeriesModalProps) {
  const { callApi } = useAuth()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  const [query, setQuery] = useState(initialQuery ?? '')
  const [results, setResults] = useState<Book[]>([])
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(
    editEntry ? { id: editEntry.book_id, title: editEntry.title } : null
  )
  const [position, setPosition] = useState(
    editEntry ? String(editEntry.position) : initialPosition != null ? String(initialPosition) : ''
  )
  const [isSearching, setIsSearching] = useState(false)
  const isFirstRun = useRef(true)

  // Live search: immediate on first render (pre-filled query), 300 ms debounce after that.
  useEffect(() => {
    if (!query) { setResults([]); return }
    const delay = isFirstRun.current ? 0 : 300
    isFirstRun.current = false
    const t = setTimeout(() => {
      setIsSearching(true)
      callApi<PagedBooks>(`/api/v1/libraries/${libraryId}/books?q=${encodeURIComponent(query)}&per_page=20`)
        .then(data => setResults((data?.items ?? []).filter(b => !existingBookIds.includes(b.id) || editEntry?.book_id === b.id)))
        .catch(() => {})
        .finally(() => setIsSearching(false))
    }, delay)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    await callApi(`/api/v1/libraries/${libraryId}/series/${seriesId}/books`, {
      method: 'POST',
 body: JSON.stringify({ book_id: selected.id, position: Number(position) || 1 }),
 }).catch(() => {})
 onSaved()
 }

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
 <div className="w-full max-w-sm rounded-xl bg-surface shadow-xl p-6">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-base font-semibold text-gray-900 dark:text-white">
 {editEntry ? 'Edit position' : 'Add book to series'}
 </h3>
 <button type="button" onClick={onClose}
 className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-surface-inset transition-colors"
 aria-label="Close">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>
 <form onSubmit={handleSubmit} className="space-y-3">
 {!editEntry && (
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Book *</label>
 {selected ? (
 <div className="flex items-center gap-2 rounded-lg border border-accent-line bg-accent-surface px-3 py-2">
 <span className="flex-1 text-sm text-content truncate">{selected.title}</span>
 <button type="button" onClick={() => { setSelected(null); setQuery('') }}
 className="text-gray-400 hover:text-content-tertiary text-lg leading-none">×</button>
 </div>
 ) : (
 <input type="text" autoFocus value={query} onChange={e => setQuery(e.target.value)}
 placeholder="Search books…"
 className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
 )}
 {isSearching && <p className="text-xs text-content-subtle mt-1">Searching…</p>}
 {!isSearching && results.length > 0 && !selected && (
 <ul className="mt-1 rounded-lg border border-line bg-surface-raised shadow max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
 {results.map(b => (
 <li key={b.id}>
 <button type="button" onClick={() => { setSelected({ id: b.id, title: b.title }); setResults([]) }}
 className="w-full text-left px-3 py-2.5 hover:bg-accent-surface transition-colors">
 <p className="text-sm font-medium text-content leading-snug">{b.title}</p>
 {b.contributors.length > 0 && (
 <p className="text-xs text-content-muted mt-0.5">
 {b.contributors.filter(c => c.role === 'author').map(c => c.name).join(', ') || b.contributors.map(c => c.name).join(', ')}
 </p>
 )}
 </button>
 </li>
 ))}
 </ul>
 )}
 </div>
 )}
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">Position *</label>
 <input type="number" autoFocus={!!editEntry} min="0" step="0.5" value={position}
 onChange={e => setPosition(e.target.value)}
 placeholder="e.g. 1, 2, 1.5"
 className="w-full rounded-lg border border-line-strong dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
 </div>
 <div className="flex gap-3 pt-1">
 <button type="button" onClick={onClose}
 className="flex-1 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors">Cancel</button>
 <button type="submit" disabled={!selected || !position}
 className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
 {editEntry ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Auto-match modal ─────────────────────────────────────────────────────────

interface AutoMatchModalProps {
  series: Series
  libraryId: string
  onClose: () => void
  onApplied: () => void
}

function AutoMatchModal({ series, libraryId, onClose, onApplied }: AutoMatchModalProps) {
  const { callApi } = useAuth()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  type Row = SeriesMatchCandidate & { selected: boolean; positionStr: string }
  const [rows, setRows] = useState<Row[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    callApi<SeriesMatchCandidate[]>(
      `/api/v1/libraries/${libraryId}/series/${series.id}/match-candidates`
    ).then(list => {
      if (cancelled) return
      setRows((list ?? []).map(c => ({ ...c, selected: true, positionStr: String(c.position) })))
    }).catch(err => {
      if (cancelled) return
      setError(err instanceof ApiError ? err.message : 'Failed to load candidates')
    }).finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (i: number) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r))
  const setPos = (i: number, v: string) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, positionStr: v } : r))
  const toggleAll = (checked: boolean) => setRows(rs => rs.map(r => ({ ...r, selected: checked })))

  const selectedCount = rows.filter(r => r.selected).length
  const allSelected = rows.length > 0 && selectedCount === rows.length

  const apply = async () => {
    const matches = rows
      .filter(r => r.selected)
      .map(r => ({ book_id: r.book_id, position: Number(r.positionStr) }))
      .filter(m => !Number.isNaN(m.position) && m.position > 0)
    if (matches.length === 0) return
    setIsSaving(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/series/${series.id}/match-apply`, {
        method: 'POST',
        body: JSON.stringify({ matches }),
      })
      onApplied()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to apply matches')
 } finally {
 setIsSaving(false)
 }
 }

 return (
 <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-16 px-4">
 <div className="w-full max-w-2xl rounded-xl bg-surface shadow-xl">
 <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-gray-700">
 <div>
 <h3 className="text-base font-semibold text-gray-900 dark:text-white">Auto-match books to series</h3>
 <p className="text-xs text-content-muted mt-0.5">
 Library books whose title starts with "{series.name}" followed by a number.
 </p>
 </div>
 <button type="button" onClick={onClose}
 className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-surface-inset transition-colors"
 aria-label="Close">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 <div className="px-6 py-4">
 {isLoading && <p className="text-sm text-content-muted text-center py-8">Scanning library…</p>}
 {!isLoading && error && <p className="text-sm text-danger mb-3">{error}</p>}
 {!isLoading && !error && rows.length === 0 && (
 <p className="text-sm text-content-muted text-center py-8">
 No matching books found. Book titles need to start with "{series.name}" followed by a volume number (e.g. "{series.name} #1" or "{series.name}, Vol. 3").
 </p>
 )}
 {!isLoading && rows.length > 0 && (
 <>
 <div className="flex items-center justify-between mb-3">
 <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
 <input type="checkbox" checked={allSelected}
 onChange={e => toggleAll(e.target.checked)}
 className="rounded border-line-strong text-blue-600 focus:ring-blue-500" />
 Select all
 </label>
 <p className="text-xs text-content-muted dark:text-gray-400">
 {selectedCount} of {rows.length} selected
 </p>
 </div>
 <div className="rounded-lg border border-line overflow-hidden max-h-96 overflow-y-auto">
 <table className="w-full text-sm">
 <thead className="bg-gray-50 dark:bg-gray-800 border-b border-line sticky top-0">
 <tr>
 <th className="px-3 py-2 w-8" />
 <th className="px-3 py-2 w-20 text-left text-xs font-semibold uppercase tracking-wide text-content-muted dark:text-gray-400">Vol #</th>
 <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-content-muted dark:text-gray-400">Title</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
 {rows.map((r, i) => (
 <tr key={r.book_id} className={r.selected ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950 opacity-60'}>
 <td className="px-3 py-2">
 <input type="checkbox" checked={r.selected}
 onChange={() => toggle(i)}
 className="rounded border-line-strong text-blue-600 focus:ring-blue-500" />
 </td>
 <td className="px-3 py-2">
 <input type="number" min="0" step="0.5" value={r.positionStr}
 onChange={e => setPos(i, e.target.value)}
 disabled={!r.selected}
 className="w-16 rounded border border-line-strong dark:bg-gray-800 dark:text-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50" />
 </td>
 <td className="px-3 py-2">
 <p className="text-gray-900 dark:text-white">{r.title}</p>
 {r.other_series.length > 0 && (
 <p className="text-xs text-warning mt-0.5">
 Already in: {r.other_series.map(o => o.series_name).join(', ')}
 </p>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </>
 )}
 </div>

 <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line dark:border-gray-700">
 <button type="button" onClick={onClose}
 className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors">
 Cancel
 </button>
 <button type="button" onClick={apply} disabled={selectedCount === 0 || isSaving}
 className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
 {isSaving ? 'Applying…' : `Apply ${selectedCount} match${selectedCount === 1 ? '' : 'es'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Suggest series modal ─────────────────────────────────────────────────────


// ─── Series metadata search modal ─────────────────────────────────────────────

interface SeriesMetadataSearchModalProps {
  series: Series
  libraryId: string
  onClose: () => void
  onSaved: (updated: Series) => void
}

function SeriesMetadataSearchModal({ series, libraryId, onClose, onSaved }: SeriesMetadataSearchModalProps) {
  const { callApi } = useAuth()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  const [results, setResults] = useState<SeriesLookupResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<SeriesLookupResult | null>(null)

  useEffect(() => {
    const search = async () => {
      try {
        const list = await callApi<SeriesLookupResult[]>(
          `/api/v1/lookup/series?q=${encodeURIComponent(series.name)}`
        )
        const sorted = (list ?? []).sort((a, b) => countSeriesLookupFields(b) - countSeriesLookupFields(a))
        setResults(sorted)
        if (!list || list.length === 0) setError('No results found.')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Search failed')
      } finally {
        setIsLoading(false)
      }
    }
    search()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fieldBadgeCls = (n: number) =>
    n >= 7 ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
    : n >= 4 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'

 if (picked) {
 const matching = results.filter(r => normalizeSeriesName(r.name) === normalizeSeriesName(picked.name))
 return (
 <SeriesMergeView
 series={series}
 libraryId={libraryId}
 primary={picked}
 matching={matching}
 onBack={() => setPicked(null)}
 onClose={onClose}
 onSaved={onSaved}
 />
 )
 }

 return (
 <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-16 px-4">
 <div className="w-full max-w-lg rounded-xl bg-surface shadow-xl">
 <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-gray-700">
 <div>
 <h3 className="text-base font-semibold text-gray-900 dark:text-white">Search metadata providers</h3>
 <p className="text-xs text-content-muted mt-0.5">
 Pick the best match for "{series.name}" — then review fields.
 </p>
 </div>
 <button type="button" onClick={onClose}
 className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-surface-inset transition-colors"
 aria-label="Close">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 <div className="px-6 py-5 space-y-3">
 {isLoading && <p className="text-sm text-content-muted text-center py-8">Searching providers…</p>}
 {!isLoading && error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

 {!isLoading && results.length > 0 && results.map((r, i) => {
 const fieldCount = countSeriesLookupFields(r)
 return (
 <button
 key={i}
 type="button"
 onClick={() => setPicked(r)}
 className="w-full text-left rounded-xl border border-line bg-surface-muted p-3 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-white dark:hover:bg-gray-700/50 transition-colors"
 >
 <div className="flex gap-3 items-start">
 {r.cover_url && (
 <img src={r.cover_url} alt="" referrerPolicy="no-referrer" className="w-10 h-14 object-cover rounded flex-shrink-0 bg-gray-200 dark:bg-gray-700" />
 )}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className="font-medium text-sm text-gray-900 dark:text-white">{r.name}</p>
 <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${fieldBadgeCls(fieldCount)}`}>
 {fieldCount}/{TOTAL_SERIES_FIELDS} fields
 </span>
 </div>
 {r.description && (
 <p className="text-xs text-content-muted mt-0.5 line-clamp-2">{r.description}</p>
 )}
 <div className="flex items-center gap-2 mt-1 flex-wrap">
 {r.total_count != null && <span className="text-xs text-gray-400 dark:text-gray-500">{r.total_count} vols</span>}
 {r.status && (
 <span className={`text-xs rounded-full px-1.5 py-0.5 ${r.status === 'completed' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : r.status === 'hiatus' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : r.status === 'cancelled' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'}`}>
 {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
 </span>
 )}
 {r.demographic && <span className="text-xs text-gray-400 dark:text-gray-500">{r.demographic}</span>}
 {r.original_language && <span className="text-xs text-gray-400 dark:text-gray-500">{r.original_language}</span>}
 <span className="text-xs text-gray-400 dark:text-gray-500">via {r.provider_display}</span>
 </div>
 {r.genres && r.genres.length > 0 && (
 <div className="flex flex-wrap gap-1 mt-1">
 {r.genres.slice(0, 5).map(g => (
 <span key={g} className="text-xs rounded bg-surface-inset text-content-tertiary px-1.5 py-0.5">{g}</span>
 ))}
 </div>
 )}
 </div>
 </div>
 </button>
 )
 })}
 </div>
 </div>
 </div>
 )
}

// ─── Series merge view (step 2 of metadata update) ────────────────────────────

interface SeriesMergeViewProps {
 series: Series
 libraryId: string
 primary: SeriesLookupResult
 matching: SeriesLookupResult[]
 onBack: () => void
 onClose: () => void
 onSaved: (updated: Series) => void
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
 { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'Hiatus' },
  { value: 'cancelled', label: 'Cancelled' },
]

function SeriesMergeView({ series, libraryId, primary, matching, onBack, onClose, onSaved }: SeriesMergeViewProps) {
  const { callApi } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entries = <T,>(fn: (r: SeriesLookupResult) => T) =>
    matching.map(r => ({ source: r.provider_display, value: fn(r) }))

  const descOpts   = useMemo(() => sortOptions(mergeString(series.description, entries(r => r.description))), [series, matching])
  const totalOpts  = useMemo(() => sortOptions(mergeNumber(series.total_count, entries(r => r.total_count))), [series, matching])
  const statusOpts = useMemo(() => sortOptions(mergeString(series.status, entries(r => r.status))), [series, matching])
  const langOpts   = useMemo(() => sortOptions(mergeString(series.original_language, entries(r => r.original_language))), [series, matching])
  const yearOpts   = useMemo(() => sortOptions(mergeNumber(series.publication_year, entries(r => r.publication_year))), [series, matching])
  const demoOpts   = useMemo(() => sortOptions(mergeString(series.demographic, entries(r => r.demographic))), [series, matching])
  const genresOpts = useMemo(() => sortOptions(mergeGenres(series.genres, entries(r => r.genres ?? []))), [series, matching])

  const [desc, setDesc]     = useState<string>(descOpts[0]?.value ?? series.description ?? '')
  const [total, setTotal]   = useState<number | null>(totalOpts[0]?.value ?? series.total_count ?? null)
  const [status, setStatus] = useState<string>(statusOpts[0]?.value ?? series.status ?? 'ongoing')
  const [lang, setLang]     = useState<string>(langOpts[0]?.value ?? series.original_language ?? '')
  const [year, setYear]     = useState<number | null>(yearOpts[0]?.value ?? series.publication_year ?? null)
  const [demo, setDemo]     = useState<string>(demoOpts[0]?.value ?? series.demographic ?? '')
  const [genres, setGenres] = useState<string[]>(genresOpts[0]?.value ?? series.genres ?? [])
  // URL / external_id / external_source tied to primary pick.

  const save = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const body = {
        name: series.name,
        description: desc,
        total_count: total,
        status: status || 'ongoing',
        original_language: lang,
        publication_year: year,
        demographic: demo,
        genres,
        url: primary.url || series.url || '',
        external_id: primary.external_id || series.external_id || '',
        external_source: primary.external_source || series.external_source || '',
      }
      const updated = await callApi<Series>(
        `/api/v1/libraries/${libraryId}/series/${series.id}`,
        { method: 'PUT', body: JSON.stringify(body) },
      )
      if (updated) onSaved(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save')
 } finally {
 setIsSaving(false)
 }
 }

 return (
 <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-16 px-4">
 <div className="w-full max-w-2xl rounded-xl bg-surface shadow-xl">
 <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
 <div className="min-w-0">
 <button type="button" onClick={onBack}
 className="text-xs text-content-muted hover:text-accent mb-1">
 ← Back to results
 </button>
 <h3 className="text-base font-semibold text-content truncate">Update metadata: {primary.name}</h3>
 <p className="text-xs text-content-muted mt-0.5">
 Merging {matching.length} provider{matching.length === 1 ? '' : 's'}: {matching.map(m => m.provider_display).join(', ')}.
 </p>
 </div>
 <button type="button" onClick={onClose}
 className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-surface-inset transition-colors"
 aria-label="Close">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
 <FieldPicker label="Description" options={descOpts} selected={desc}
 equals={(a, b) => a === b} onPick={v => setDesc(v)}
 render={v => <p className="text-sm text-content-strong whitespace-pre-wrap">{v || <em className="text-gray-400">empty</em>}</p>} />

 <FieldPicker label="Total volumes" options={totalOpts} selected={total}
 equals={(a, b) => a === b} onPick={v => setTotal(v)}
 render={v => <span className="text-sm text-content-strong dark:text-gray-200">{v == null ? <em className="text-gray-400">unset</em> : v}</span>} />

 <FieldPicker label="Status" options={statusOpts} selected={status}
 equals={(a, b) => a.toLowerCase() === b.toLowerCase()} onPick={v => setStatus(v)}
 render={v => <span className="text-sm capitalize text-content-strong dark:text-gray-200">{v || <em className="text-gray-400">unset</em>}</span>}
 extraControl={
 <select value={status} onChange={e => setStatus(e.target.value)}
 className="mt-2 rounded-md border border-line-strong dark:text-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
 {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
 </select>
 } />

 <FieldPicker label="Original language" options={langOpts} selected={lang}
 equals={(a, b) => a.toLowerCase() === b.toLowerCase()} onPick={v => setLang(v)}
 render={v => <span className="text-sm text-content-strong dark:text-gray-200">{v || <em className="text-gray-400">unset</em>}</span>} />

 <FieldPicker label="Publication year" options={yearOpts} selected={year}
 equals={(a, b) => a === b} onPick={v => setYear(v)}
 render={v => <span className="text-sm text-content-strong dark:text-gray-200">{v == null ? <em className="text-gray-400">unset</em> : v}</span>} />

 <FieldPicker label="Demographic" options={demoOpts} selected={demo}
 equals={(a, b) => a.toLowerCase() === b.toLowerCase()} onPick={v => setDemo(v)}
 render={v => <span className="text-sm text-content-strong dark:text-gray-200">{v || <em className="text-gray-400">unset</em>}</span>} />

 <FieldPicker label="Genres" options={genresOpts} selected={genres}
 equals={(a, b) => a.length === b.length && a.every((x, i) => x.toLowerCase() === b[i].toLowerCase())}
 onPick={v => setGenres(v)}
 render={v => v.length === 0
 ? <em className="text-sm text-gray-400">none</em>
 : (
 <div className="flex flex-wrap gap-1">
 {v.map(g => <span key={g} className="text-xs rounded bg-surface-inset dark:bg-gray-700 text-content-tertiary px-1.5 py-0.5">{g}</span>)}
 </div>
 )} />

 <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
 Source link &amp; URL: <span className="font-medium text-gray-700 dark:text-gray-300">{primary.provider_display}</span>
 {primary.url && <> — <a href={primary.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">{primary.url}</a></>}
 </div>
 </div>

 <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
 {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
 <div className="ml-auto flex gap-3">
 <button type="button" onClick={onClose}
 className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-muted transition-colors">
 Cancel
 </button>
 <button type="button" onClick={save} disabled={isSaving}
 className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
 {isSaving ? 'Saving…' : 'Save'}
 </button>
 </div>
 </div>
 </div>
 </div>
 )
}

interface FieldPickerProps<T> {
 label: string
 options: SeriesFieldOption<T>[]
 selected: T
 equals: (a: T, b: T) => boolean
 onPick: (v: T) => void
 render: (v: T) => React.ReactNode
 extraControl?: React.ReactNode
}

function FieldPicker<T>({ label, options, selected, equals, onPick, render, extraControl }: FieldPickerProps<T>) {
 return (
 <div>
 <p className="text-xs font-semibold uppercase tracking-wide text-content-muted mb-1.5">{label}</p>
 {options.length === 0 && (
 <p className="text-sm italic text-gray-400 dark:text-gray-500">No values from providers or current record.</p>
 )}
 <div className="space-y-1.5">
 {options.map((opt, i) => {
 const isSelected = equals(selected, opt.value)
 return (
 <button
 key={i}
 type="button"
 onClick={() => onPick(opt.value)}
 className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
 isSelected
 ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">{render(opt.value)}</div>
                <div className="flex flex-wrap gap-1 flex-shrink-0">
                  {opt.sources.map(s => (
                    <span key={s} className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${
                      s === 'Current'
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                        : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                    }`}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {extraControl}
    </div>
  )
}

interface SeriesDetailViewProps {
  seriesId: string
  libraryId: string
  setExtraCrumbs: (cs: Crumb[]) => void
  onBack: () => void
}

// ─── Series volume cover ─────────────────────────────────────────────────────
// Larger than BookCoverThumb, with the volume number embedded as a corner
// badge so the # column can go away. Read-state glow follows the same color
// scheme used by BookCoverThumb so both surfaces are consistent.
function SeriesVolumeCover({
  title, coverUrl, position, positionEnd, readStatus, isGhost,
}: {
  title: string
  coverUrl: string | null | undefined
  position: number
  /** Set on a container, so a three-in-one reads 1-3 rather than a second 1. */
  positionEnd?: number | null
  readStatus?: string
  isGhost?: boolean
}) {
  const [imgError, setImgError] = useState(false)
  const { ref, src } = useAuthenticatedImage(coverUrl)
  const showImage = !!src && !imgError && !isGhost

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const border = isDark ? '0 0 0 1px rgba(255,255,255,0.15)' : '0 0 0 1px rgba(0,0,0,0.2)'
  const glow: React.CSSProperties = (() => {
    if (isGhost) return { boxShadow: border }
    if (readStatus === 'read')           return { boxShadow: `${border}, 0 0 12px 3px rgba(34,197,94,0.7)` }
    if (readStatus === 'reading')        return { boxShadow: `${border}, 0 0 12px 3px rgba(59,130,246,0.7)` }
    if (readStatus === 'did_not_finish') return { boxShadow: `${border}, 0 0 12px 3px rgba(245,158,11,0.7)` }
    return { boxShadow: border }
  })()

  // The first letter is used as a placeholder when no cover; harmless for
  // ghost rows since they always render the gradient.
  const grad = COVER_GRADIENTS[title.charCodeAt(0) % COVER_GRADIENTS.length]

  return (
    <div className={`w-12 flex-shrink-0 rounded ${isGhost ? 'opacity-50' : ''}`} style={glow}>
      <div ref={ref} className="relative aspect-[2/3] rounded overflow-hidden">
        {showImage ? (
          <img src={src} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
            <span className="text-white text-base font-bold opacity-50 select-none">{title.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <span className="absolute bottom-0 right-0 bg-black/75 text-white text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-tl">
          {positionEnd != null && positionEnd > position
            ? `${formatPosition(position)}-${formatPosition(positionEnd)}`
            : formatPosition(position)}
        </span>
      </div>
    </div>
  )
}

// Subset of COVER_GRADIENTS from BookCover — kept inline so we don't need to
// export the array from there.
const COVER_GRADIENTS = [
  'from-rose-500 to-orange-400',
  'from-blue-500 to-cyan-400',
  'from-emerald-500 to-lime-400',
  'from-violet-500 to-fuchsia-400',
  'from-amber-500 to-red-400',
  'from-teal-500 to-blue-400',
]

// ─── AI proposal review panel ────────────────────────────────────────────────
// Pending AI suggestions render at the top of the series detail view. The user
// reviews each proposal, accepts a subset of fields/arcs (or all), or rejects.
// On accept, the API writes the chosen subset to the series and creates arcs.

interface ProposalsPanelProps {
  proposals: AIMetadataProposal[]
  existingArcCount: number
  onAccept: (proposalID: string, body?: Record<string, unknown>) => void
  onReject: (proposalID: string) => void
}

function ProposalsPanel({ proposals, existingArcCount, onAccept, onReject }: ProposalsPanelProps) {
  if (proposals.length === 0) return null
  return (
    <div className="mb-4 space-y-3">
      {proposals.map(p => p.kind === 'series_metadata' ? (
        <SeriesMetadataProposalCard key={p.id} proposal={p} onAccept={onAccept} onReject={onReject} />
      ) : (
        <SeriesArcsProposalCard key={p.id} proposal={p} existingArcCount={existingArcCount} onAccept={onAccept} onReject={onReject} />
      ))}
    </div>
  )
}

function SeriesMetadataProposalCard({ proposal, onAccept, onReject }: { proposal: AIMetadataProposal; onAccept: (id: string, body?: Record<string, unknown>) => void; onReject: (id: string) => void }) {
  const payload = proposal.payload as SeriesMetadataPayload
  const fields: { key: string; label: string; value: string | null }[] = [
    { key: 'status', label: 'Status', value: payload.status ?? null },
    { key: 'total_count', label: 'Total volumes', value: payload.total_count != null ? String(payload.total_count) : null },
    { key: 'demographic', label: 'Demographic', value: payload.demographic ?? null },
    { key: 'genres', label: 'Genres', value: payload.genres && payload.genres.length > 0 ? payload.genres.join(', ') : null },
    { key: 'description', label: 'Description', value: payload.description ?? null },
  ].filter(f => f.value !== null)

  const [selected, setSelected] = useState<Set<string>>(new Set(fields.map(f => f.key)))
  const toggle = (k: string) => setSelected(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const apply = () => {
    if (selected.size === 0) return
    const allSelected = selected.size === fields.length
    onAccept(proposal.id, allSelected ? undefined : { fields: Array.from(selected) })
  }

  if (fields.length === 0) {
    return (
      <div className="rounded-xl border border-warning-line bg-warning-surface p-4 text-sm">
        <div className="flex items-center justify-between">
          <p className="text-warning-strong">AI didn't have evidence for any series-level fields.</p>
 <button onClick={() => onReject(proposal.id)} className="text-xs text-warning-strong hover:underline">Dismiss</button>
 </div>
 </div>
 )
 }

 return (
 <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/30 p-4">
 <div className="flex items-center justify-between mb-3">
 <div>
 <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">AI suggestion: series fields</p>
 <p className="text-xs text-purple-700/80 dark:text-purple-300/70">Review and pick which fields to apply.</p>
 </div>
 <button onClick={() => onReject(proposal.id)} className="text-xs text-content-muted hover:text-red-600 dark:hover:text-red-400">Dismiss</button>
 </div>
 <ul className="space-y-1.5 mb-3">
 {fields.map(f => (
 <li key={f.key}>
 <label className="flex items-start gap-2.5 cursor-pointer select-none">
 <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)}
 className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600" />
 <span className="text-sm text-content-strong flex-1">
 <span className="font-medium">{f.label}:</span>{' '}
 <span className="text-gray-600 dark:text-gray-400">{f.value}</span>
 </span>
 </label>
 </li>
 ))}
 </ul>
 <div className="flex gap-2 justify-end">
 <button onClick={() => onReject(proposal.id)}
 className="rounded-md px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-gray-100 dark:hover:bg-gray-800">
 Reject all
 </button>
 <button onClick={apply} disabled={selected.size === 0}
 className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
 Apply selected
 </button>
 </div>
 </div>
 )
}

function SeriesArcsProposalCard({ proposal, existingArcCount, onAccept, onReject }: { proposal: AIMetadataProposal; existingArcCount: number; onAccept: (id: string, body?: Record<string, unknown>) => void; onReject: (id: string) => void }) {
 const payload = proposal.payload as SeriesArcsPayload
 const [selected, setSelected] = useState<Set<number>>(new Set(payload.arcs?.map((_, i) => i) ?? []))
 const [assignBooks, setAssignBooks] = useState(true)

 if (!payload.arcs || payload.arcs.length === 0) {
 return (
 <div className="rounded-xl border border-warning-line bg-warning-surface p-4 text-sm">
 <div className="flex items-center justify-between">
 <p className="text-amber-800 dark:text-amber-300">AI didn't propose any canonical arcs for this series.</p>
          <button onClick={() => onReject(proposal.id)} className="text-xs text-warning-strong hover:underline">Dismiss</button>
        </div>
      </div>
    )
  }

  const toggle = (i: number) => setSelected(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })

  const apply = () => {
    if (selected.size === 0) return
    if (existingArcCount > 0) {
      const msg = `This will delete the ${existingArcCount} existing arc${existingArcCount === 1 ? '' : 's'} on this series and replace ${existingArcCount === 1 ? 'it' : 'them'} with ${selected.size} new arc${selected.size === 1 ? '' : 's'}. Books will be re-grouped by the new volume ranges. Continue?`
      if (!confirm(msg)) return
    }
    const all = selected.size === payload.arcs.length
    const body: Record<string, unknown> = { assign_books: assignBooks }
    if (!all) body.arc_indices = Array.from(selected).sort((a, b) => a - b)
    onAccept(proposal.id, body)
  }

  const isReplace = existingArcCount > 0

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">AI suggestion: arcs</p>
          <p className="text-xs text-purple-700/80 dark:text-purple-300/70">
            {isReplace
              ? `Accepting will replace the ${existingArcCount} existing arc${existingArcCount === 1 ? '' : 's'} on this series.`
              : 'Pick which arcs to create.'}
          </p>
        </div>
        <button onClick={() => onReject(proposal.id)} className="text-xs text-content-muted hover:text-danger">Dismiss</button>
      </div>
      <ul className="space-y-1.5 mb-3">
        {payload.arcs.map((arc, i) => {
          const range = arc.vol_start != null && arc.vol_end != null ? `vols ${arc.vol_start}–${arc.vol_end}` : 'no range'
          return (
            <li key={i}>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)}
                  className="mt-0.5 h-4 w-4 rounded border-line-strong" />
                <span className="text-sm text-content-strong flex-1">
                  <span className="font-medium">{arc.name}</span>
                  <span className="ml-2 text-xs text-content-muted">{range}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <label className="flex items-center gap-2.5 mb-3 cursor-pointer select-none">
        <input type="checkbox" checked={assignBooks} onChange={e => setAssignBooks(e.target.checked)}
          className="h-4 w-4 rounded border-line-strong" />
        <span className="text-xs text-content-secondary">Auto-assign books in suggested ranges to their arcs</span>
      </label>
      <div className="flex gap-2 justify-end">
        <button onClick={() => onReject(proposal.id)}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-inset">
          Reject all
        </button>
        <button onClick={apply} disabled={selected.size === 0}
          className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
          {isReplace ? 'Replace arcs' : 'Create selected arcs'}
        </button>
      </div>
    </div>
  )
}

// ─── Arc management ──────────────────────────────────────────────────────────

interface ArcManagerPanelProps {
  libraryId: string
  seriesId: string
  arcs: SeriesArc[]
  open: boolean
  onToggle: () => void
  onChanged: () => void
  onSuggestArcs?: () => void
  isSuggesting?: boolean
}

function ArcManagerPanel({ libraryId, seriesId, arcs, open, onToggle, onChanged, onSuggestArcs, isSuggesting }: ArcManagerPanelProps) {
  const { callApi } = useAuth()
  const [editingArc, setEditingArc] = useState<SeriesArc | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const sorted = [...arcs].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface-muted transition-colors rounded-t-xl">
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-sm text-content">Arcs</span>
          <span className="text-xs text-content-muted">{arcs.length === 0 ? 'none yet' : `${arcs.length} arc${arcs.length !== 1 ? 's' : ''}`}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-line-subtle p-4 space-y-3">
          {sorted.length > 0 && (
            <ul className="space-y-1.5">
              {sorted.map(arc => editingArc?.id === arc.id ? (
                <ArcEditRow
                  key={arc.id}
                  libraryId={libraryId}
                  seriesId={seriesId}
                  arc={arc}
                  onCancel={() => setEditingArc(null)}
                  onSaved={() => { setEditingArc(null); onChanged() }}
                />
              ) : (
                <li key={arc.id} className="flex items-center gap-3 text-sm">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-surface-inset text-xs font-semibold text-content-tertiary flex-shrink-0">
                    {formatPosition(arc.position)}
                  </span>
                  <span className="flex-1 font-medium text-content">{arc.name}</span>
                  {arc.vol_start != null && arc.vol_end != null && (
                    <span className="text-xs text-content-subtle">
                      vols {formatPosition(arc.vol_start)}–{formatPosition(arc.vol_end)}
                    </span>
                  )}
                  <span className="text-xs text-content-subtle">{arc.book_count} book{arc.book_count !== 1 ? 's' : ''}</span>
                  <button onClick={() => setEditingArc(arc)}
                    className="p-1 rounded text-content-muted hover:text-accent hover:bg-surface-inset transition-colors"
                    title="Edit arc">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                  <button onClick={async () => {
                      if (!confirm(`Delete arc "${arc.name}"? Books in it will stay in the series, just unassigned.`)) return
                      await callApi(`/api/v1/libraries/${libraryId}/series/${seriesId}/arcs/${arc.id}`, { method: 'DELETE' }).catch(() => {})
                      onChanged()
                    }}
                    className="p-1 rounded text-content-muted hover:text-danger hover:bg-surface-inset transition-colors"
                    title="Delete arc">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showAddForm ? (
            <ArcEditRow
              libraryId={libraryId}
              seriesId={seriesId}
              arc={null}
              defaultPosition={sorted.length + 1}
              onCancel={() => setShowAddForm(false)}
              onSaved={() => { setShowAddForm(false); onChanged() }}
            />
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={() => setShowAddForm(true)}
                className="text-sm text-accent hover:underline">+ Add arc</button>
              {onSuggestArcs && (
                <button onClick={onSuggestArcs} disabled={isSuggesting}
                  className="text-sm text-content-muted hover:text-accent disabled:opacity-50">
                  {isSuggesting ? 'Asking AI…' : (sorted.length > 0 ? 'Re-suggest with AI' : 'Suggest with AI')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ArcEditRowProps {
  libraryId: string
  seriesId: string
  arc: SeriesArc | null
  defaultPosition?: number
  onCancel: () => void
  onSaved: () => void
}

function ArcEditRow({ libraryId, seriesId, arc, defaultPosition, onCancel, onSaved }: ArcEditRowProps) {
  const { callApi } = useAuth()
  const [name, setName] = useState(arc?.name ?? '')
  const [position, setPosition] = useState(String(arc?.position ?? defaultPosition ?? 1))
  const [description, setDescription] = useState(arc?.description ?? '')
  // Vol bounds are optional. Empty input string ⇒ null in the request body
  // so existing bounds can be cleared. Stored as strings while editing so a
  // partially-typed number doesn't get coerced to NaN mid-keystroke.
  const [volStart, setVolStart] = useState(arc?.vol_start != null ? String(arc.vol_start) : '')
  const [volEnd, setVolEnd] = useState(arc?.vol_end != null ? String(arc.vol_end) : '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    const parseBound = (s: string): number | null => {
      const t = s.trim()
      if (t === '') return null
      const n = Number(t)
      return Number.isFinite(n) ? n : null
    }
    const body = JSON.stringify({
      name: name.trim(),
      position: Number(position) || 0,
      description,
      vol_start: parseBound(volStart),
      vol_end: parseBound(volEnd),
    })
    const url = arc
      ? `/api/v1/libraries/${libraryId}/series/${seriesId}/arcs/${arc.id}`
      : `/api/v1/libraries/${libraryId}/series/${seriesId}/arcs`
    const method = arc ? 'PUT' : 'POST'
    try {
      await callApi(url, { method, headers: { 'Content-Type': 'application/json' }, body })
      onSaved()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-lg border border-line bg-surface-muted p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input type="number" step="any" value={position} onChange={e => setPosition(e.target.value)}
          className="w-16 rounded border border-line-strong dark:bg-gray-900 dark:text-white px-2 py-1 text-sm"
          placeholder="Pos" />
        <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
          className="flex-1 rounded border border-line-strong dark:bg-gray-900 dark:text-white px-2 py-1 text-sm"
          placeholder="Arc name" />
      </div>
      <input type="text" value={description} onChange={e => setDescription(e.target.value)}
        className="w-full rounded border border-line-strong dark:bg-gray-900 dark:text-white px-2 py-1 text-sm"
        placeholder="Description (optional)" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-content-muted w-20">Vol range</span>
        <input type="number" step="any" value={volStart} onChange={e => setVolStart(e.target.value)}
          className="w-20 rounded border border-line-strong dark:bg-gray-900 dark:text-white px-2 py-1 text-sm"
          placeholder="Start" />
        <span className="text-xs text-gray-400">–</span>
        <input type="number" step="any" value={volEnd} onChange={e => setVolEnd(e.target.value)}
          className="w-20 rounded border border-line-strong dark:bg-gray-900 dark:text-white px-2 py-1 text-sm"
          placeholder="End" />
        <span className="text-xs text-content-subtle ml-1">
          Optional. Slots missing volumes into this arc when set.
        </span>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="text-xs text-content-muted hover:text-content-secondary">Cancel</button>
        <button onClick={save} disabled={saving || !name.trim()}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : (arc ? 'Save' : 'Add')}
        </button>
      </div>
    </div>
  )
}

interface BookArcAssignerProps {
  entry: SeriesEntry
  arcs: SeriesArc[]
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onAssign: (arcID: string | null) => void
}

function BookArcAssigner({ entry, arcs, isOpen, onOpen, onClose, onAssign }: BookArcAssignerProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  const currentArc = arcs.find(a => a.id === entry.arc_id)
  const sorted = [...arcs].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))

  return (
    <div ref={ref} className="relative">
      <button onClick={isOpen ? onClose : onOpen}
        className="text-xs text-content-muted hover:text-blue-600 transition-colors">
        {currentArc ? `Arc: ${currentArc.name}` : 'Set arc'}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-lg border border-line bg-surface shadow-lg py-1">
          <button onClick={() => onAssign(null)}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${!entry.arc_id ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            Unsorted
          </button>
          <div className="my-1 border-t border-line-subtle" />
          {sorted.map(arc => (
            <button key={arc.id} onClick={() => onAssign(arc.id)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${entry.arc_id === arc.id ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              {arc.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SeriesDetailView({ seriesId, libraryId, setExtraCrumbs, onBack }: SeriesDetailViewProps) {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  // Series is fetched on mount so the URL is the source of truth — users can
  // share links straight to a series without going through the list first.
  const [series, setSeries] = useState<Series | null>(null)
  const [entries, setEntries] = useState<SeriesEntry[]>([])
  const [volumes, setVolumes] = useState<SeriesVolume[]>([])
  const [arcs, setArcs] = useState<SeriesArc[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addHint, setAddHint] = useState<{ position?: number; query?: string } | null>(null)
  const [editEntry, setEditEntry] = useState<SeriesEntry | null>(null)
  const [showArcManager, setShowArcManager] = useState(false)
  const [assigningBookId, setAssigningBookId] = useState<string | null>(null)
  const [showMetaSearch, setShowMetaSearch] = useState(false)
  const [showAutoMatch, setShowAutoMatch] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [proposals, setProposals] = useState<AIMetadataProposal[]>([])
  const [isSuggestingMetadata, setIsSuggestingMetadata] = useState(false)
  const [isSuggestingArcs, setIsSuggestingArcs] = useState(false)

  const deleteSeries = async () => {
    if (!series) return
    if (!confirm(`Delete series "${series.name}"?`)) return
    try {
      await callApi(`/api/v1/libraries/${libraryId}/series/${seriesId}`, { method: 'DELETE' })
      onBack()
    } catch { /* ignore */ }
  }

  const reloadSeries = useCallback(async () => {
    try {
      const updated = await callApi<Series>(`/api/v1/libraries/${libraryId}/series/${seriesId}`)
      if (updated) setSeries(updated)
    } catch { /* ignore */ }
  }, [callApi, libraryId, seriesId])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [list, vols, arcList, props] = await Promise.all([
        callApi<SeriesEntry[]>(`/api/v1/libraries/${libraryId}/series/${seriesId}/books`),
        callApi<SeriesVolume[]>(`/api/v1/libraries/${libraryId}/series/${seriesId}/volumes`),
        callApi<SeriesArc[]>(`/api/v1/libraries/${libraryId}/series/${seriesId}/arcs`),
        callApi<AIMetadataProposal[]>(`/api/v1/libraries/${libraryId}/series/${seriesId}/proposals?status=pending`),
      ])
      setEntries(list ?? [])
      setVolumes(vols ?? [])
      setArcs(arcList ?? [])
      setProposals(props ?? [])
    } catch { /* ignore */ }
    finally { setIsLoading(false) }
  }, [callApi, libraryId, seriesId])

  const suggestSeriesMetadata = async () => {
    if (isSuggestingMetadata) return
    setIsSuggestingMetadata(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/series/${seriesId}/suggest-metadata`, { method: 'POST' })
      await load()
      showToast('AI suggestion ready — review below.', { variant: 'success' })
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to call AI provider'
      showToast(`AI suggestion failed: ${msg}`, { variant: 'error' })
    } finally {
      setIsSuggestingMetadata(false)
    }
  }

  const suggestSeriesArcs = async () => {
    if (isSuggestingArcs) return
    setIsSuggestingArcs(true)
    try {
      await callApi(`/api/v1/libraries/${libraryId}/series/${seriesId}/suggest-arcs`, { method: 'POST' })
      await load()
      showToast('AI arc suggestion ready — review below.', { variant: 'success' })
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to call AI provider'
      showToast(`AI arc suggestion failed: ${msg}`, { variant: 'error' })
    } finally {
      setIsSuggestingArcs(false)
    }
  }

  const acceptProposal = async (proposalID: string, body?: Record<string, unknown>) => {
    await callApi(`/api/v1/libraries/${libraryId}/proposals/${proposalID}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(err => console.error('accept proposal failed', err))
    await Promise.all([load(), reloadSeries()])
  }

  const rejectProposal = async (proposalID: string) => {
    await callApi(`/api/v1/libraries/${libraryId}/proposals/${proposalID}/reject`, { method: 'POST' }).catch(() => {})
    await load()
  }

  // URL is the source of truth — fetch the series on mount or when the id
  // changes. Direct hits to /libraries/{lib}/series/{sid} land here too.
  useEffect(() => { reloadSeries() }, [reloadSeries])

  // Once we know the series name, push a "Series › <name>" breadcrumb so the
  // header reflects where we are.
  useEffect(() => {
    if (series) {
      setExtraCrumbs([{ label: 'Series', to: `/libraries/${libraryId}/series` }, { label: series.name }])
    }
  }, [series, libraryId, setExtraCrumbs])

  const assignBookToArc = async (bookId: string, position: number, arcID: string | null) => {
    // Empty string clears an existing arc; UUID assigns; null/undefined leaves it.
    await callApi(`/api/v1/libraries/${libraryId}/series/${seriesId}/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: bookId, position, arc_id: arcID ?? '' }),
    }).catch(() => {})
    setAssigningBookId(null)
    load()
  }

  const syncVolumes = async () => {
    if (!series?.external_id) return
    setIsSyncing(true)
    try {
      const vols = await callApi<SeriesVolume[]>(
        `/api/v1/libraries/${libraryId}/series/${seriesId}/volumes/sync`,
        { method: 'POST' }
      )
      setVolumes(vols ?? [])
    } catch { /* ignore */ } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => { load() }, [load])

  const removeEntry = async (bookId: string) => {
    if (!confirm('Remove this book from the series?')) return
    await callApi(`/api/v1/libraries/${libraryId}/series/${seriesId}/books/${bookId}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  // Show a loading state until the series is fetched. The rest of the body
  // can safely assume series is non-null.
  if (!series) {
    return <div className="text-sm text-content-subtle text-center py-16">Loading…</div>
  }

  // Build merged list: real entries + ghost rows for missing integer positions.
  // Upper bound is whichever is larger: highest entry/volume position we have, or total_count.
  const existingPositions = new Set(entries.map(e => e.position))
  const volumeByPosition = new Map(volumes.map(v => [v.position, v]))
  const maxEntryPos = entries.length > 0 ? Math.max(...entries.map(e => e.position)) : 0
  const maxVolumePos = volumes.length > 0 ? Math.max(...volumes.map(v => v.position)) : 0
  const upperBound = Math.max(Math.floor(maxEntryPos), Math.floor(maxVolumePos), series.total_count ?? 0)

  type Row = { type: 'entry'; entry: SeriesEntry } | { type: 'ghost'; position: number; volume?: SeriesVolume }

  // When arcs exist we group books under arc-header rows instead of one flat
  // list. Books without an arc cluster under "Unsorted"; missing volumes go to
  // a "Missing volumes" footer group.
  type Group = { key: string; label: string; arcId: string | null; rows: Row[] }
  // No initializer: both branches of the arcs check below assign it.
  let groups: Group[]

  if (arcs.length > 0) {
    // Infer which arc a missing volume sits in. Two-tier strategy:
    //
    //   1. If any arc has explicit vol_start/vol_end bounds covering this
    //      position, use that arc. AI proposals carry these bounds, so the
    //      Final Saga (vols 110–148) properly claims a ghost vol 113 even
    //      when zero books in that arc are owned.
    //   2. Otherwise fall back to immediate neighbours: a ghost between two
    //      owned books in the SAME arc inherits that arc. Anything else
    //      (mixed arcs, one or both unsorted) leaves the ghost unsorted, to
    //      be caught by the "Missing volumes" group.
    const allOwned: Array<{ pos: number; arcID: string | null }> = entries
      .map(e => ({ pos: e.position, arcID: e.arc_id ?? null }))
      .sort((a, b) => a.pos - b.pos)

    const inferArcForPos = (p: number): string | null => {
      // Tier 1 — explicit bounds. Use the most-specific arc when ranges
      // overlap (smaller span wins on ties).
      let bestArcID: string | null = null
      let bestSpan = Infinity
      for (const arc of arcs) {
        if (arc.vol_start == null || arc.vol_end == null) continue
        if (p < arc.vol_start || p > arc.vol_end) continue
        const span = arc.vol_end - arc.vol_start
        if (span < bestSpan) {
          bestSpan = span
          bestArcID = arc.id
        }
      }
      if (bestArcID) return bestArcID

      // Tier 2 — immediate-neighbour inference for arcs without bounds.
      let prev: { pos: number; arcID: string | null } | null = null
      let next: { pos: number; arcID: string | null } | null = null
      for (const o of allOwned) {
        if (o.pos < p) prev = o
        else if (o.pos > p && next === null) { next = o; break }
      }
      if (prev && next && prev.arcID && next.arcID && prev.arcID === next.arcID) {
        return prev.arcID
      }
      return null
    }

    // Bucket entries + ghosts together by (inferred) arc_id. Each bucket
    // ends up containing both real entries and any greyed-out gaps that fall
    // within its position range, sorted naturally by position.
    type RowsByKey = Map<string | null, Row[]>
    const rowsByKey: RowsByKey = new Map()
    const push = (k: string | null, r: Row) => {
      if (!rowsByKey.has(k)) rowsByKey.set(k, [])
      rowsByKey.get(k)!.push(r)
    }
    for (const e of entries) push(e.arc_id ?? null, { type: 'entry', entry: e })
    for (let i = 1; i <= upperBound; i++) {
      if (existingPositions.has(i)) continue
      const arcID = inferArcForPos(i)
      push(arcID, { type: 'ghost', position: i, volume: volumeByPosition.get(i) })
    }
    const rowPos = (r: Row) => r.type === 'entry' ? r.entry.position : r.position
    for (const rs of rowsByKey.values()) rs.sort((a, b) => rowPos(a) - rowPos(b))

    // Build all groups (arcs + unsorted + truly-orphan missing) and sort by
    // their first row's position so reading order flows top-to-bottom.
    const collected: Array<Group & { sortKey: number }> = []
    for (const arc of arcs) {
      const rs = rowsByKey.get(arc.id) ?? []
      if (rs.length === 0) continue // arc with no books and no inferable gaps
      collected.push({
        key: arc.id, label: arc.name, arcId: arc.id,
        rows: rs,
        sortKey: rowPos(rs[0]),
      })
    }
    const unsortedRows = rowsByKey.get(null) ?? []
    if (unsortedRows.length > 0) {
      // Split: real entries in "Unsorted", orphan ghosts in "Missing volumes".
      const unsortedEntries = unsortedRows.filter(r => r.type === 'entry')
      const orphanGhosts = unsortedRows.filter(r => r.type === 'ghost')
      if (unsortedEntries.length > 0) {
        collected.push({
          key: 'unsorted', label: 'Unsorted', arcId: null,
          rows: unsortedEntries,
          sortKey: rowPos(unsortedEntries[0]),
        })
      }
      if (orphanGhosts.length > 0) {
        collected.push({
          key: 'missing', label: 'Missing volumes', arcId: null,
          rows: orphanGhosts,
          sortKey: rowPos(orphanGhosts[0]),
        })
      }
    }
    collected.sort((a, b) => a.sortKey - b.sortKey)
    groups = collected.map(({ key, label, arcId, rows }) => ({ key, label, arcId, rows }))
  } else {
    // Flat — single group with entries + ghosts interleaved by position.
    const allRows: Row[] = [...entries.map(e => ({ type: 'entry' as const, entry: e }))]
    for (let i = 1; i <= upperBound; i++) {
      if (!existingPositions.has(i)) allRows.push({ type: 'ghost', position: i, volume: volumeByPosition.get(i) })
    }
    allRows.sort((a, b) => {
      const posA = a.type === 'entry' ? a.entry.position : a.position
      const posB = b.type === 'entry' ? b.entry.position : b.position
      return posA - posB
    })
    groups = [{ key: 'flat', label: '', arcId: null, rows: allRows }]
  }

  const hasAnyRows = groups.some(g => g.rows.length > 0)
  const COL_COUNT = 5 // cover (with embedded #), title, type, contributors, actions
  const showReadBadges = localStorage.getItem('librarium:show_read_badges') !== 'false'

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={onBack} className="text-sm text-content-muted hover:text-content-secondary transition-colors">← Back</button>
        <span className="text-xs text-content-muted">
          {seriesStatusLabel(series.status)}
          {series.total_count != null && ` · ${series.book_count} / ${series.total_count} volumes`}
        </span>
        <div className="flex-1" />
        {series.external_id && (
          <button onClick={syncVolumes} disabled={isSyncing}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-muted disabled:opacity-50 transition-colors">
            {isSyncing ? 'Syncing…' : 'Sync volumes'}
          </button>
        )}
        <button onClick={() => setShowAutoMatch(true)}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors">
          Auto-match
        </button>
        <button onClick={() => setShowMetaSearch(true)}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors">
          Search metadata
        </button>
        <button onClick={suggestSeriesMetadata} disabled={isSuggestingMetadata}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-muted disabled:opacity-50 transition-colors"
          title="Ask AI to suggest series fields (status, total volumes, demographic, genres, description)">
          {isSuggestingMetadata ? 'Asking AI…' : 'Suggest with AI'}
        </button>
        <button onClick={() => setShowEdit(true)}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-muted transition-colors">
          Edit series
        </button>
        <button onClick={deleteSeries}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-danger-surface hover:text-danger-strong hover:border-red-300 dark:hover:border-red-800 transition-colors">
          Delete series
        </button>
        <button onClick={() => setShowAdd(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
          Add book
        </button>
      </div>

      {(series.description || series.url) && (
        <div className="mb-4 space-y-1">
          {series.description && <p className="text-sm text-content-muted">{series.description}</p>}
          {series.url && (
            <a href={series.url} target="_blank" rel="noopener noreferrer"
              className="text-sm text-accent hover:underline inline-flex items-center gap-1">
              {series.url}
            </a>
          )}
        </div>
      )}

      {isLoading && <div className="text-sm text-content-subtle text-center py-16">Loading…</div>}

      {!isLoading && !hasAnyRows && (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface p-12 text-center">
          <p className="text-sm text-content-muted mb-3">No books in this series yet</p>
          <button onClick={() => setShowAdd(true)} className="text-sm text-blue-600 hover:underline">Add the first book</button>
        </div>
      )}

      {/* AI suggestion review panel — surfaces pending proposals so the user
          can accept/reject before the API writes anything. */}
      <ProposalsPanel proposals={proposals} existingArcCount={arcs.length} onAccept={acceptProposal} onReject={rejectProposal} />

      {/* Arc management panel — collapsed by default. Always available so users
          can add the first arc to a series. */}
      <ArcManagerPanel
        libraryId={libraryId}
        seriesId={seriesId}
        arcs={arcs}
        open={showArcManager}
        onToggle={() => setShowArcManager(o => !o)}
        onChanged={load}
        onSuggestArcs={suggestSeriesArcs}
        isSuggesting={isSuggestingArcs}
      />

      {!isLoading && hasAnyRows && (
        <div className="rounded-xl border border-line bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted border-b border-line">
              <tr>
                {['', 'Title', 'Type', 'Contributors', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-content-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {groups.map(group => (
                <Fragment key={group.key}>
                  {arcs.length > 0 && group.label && (
                    <tr className="bg-gray-50/60 dark:bg-gray-800/40">
                      <td colSpan={COL_COUNT} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-content-muted">{group.label}</span>
                          <span className="text-xs text-content-subtle">· {group.rows.filter(r => r.type === 'entry').length} book{group.rows.filter(r => r.type === 'entry').length !== 1 ? 's' : ''}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {group.rows.map((row, idx) => row.type === 'entry' ? (
                    <tr key={row.entry.book_id} className="hover:bg-surface-muted transition-colors">
                      <td className="pl-4 pr-2 py-3 w-16">
                        <SeriesVolumeCover
                          title={row.entry.title}
                          coverUrl={row.entry.cover_url}
                          position={row.entry.position}
                          positionEnd={row.entry.position_end}
                          readStatus={showReadBadges ? row.entry.user_read_status : undefined}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/libraries/${libraryId}/books/${row.entry.book_id}`}
                          className="font-medium text-content hover:text-accent transition-colors">
                          {row.entry.title}
                        </Link>
                        {row.entry.subtitle && <p className="text-xs text-content-subtle">{row.entry.subtitle}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-surface-inset px-2 py-0.5 text-xs font-medium text-content-tertiary whitespace-nowrap">
                          {row.entry.media_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-content-tertiary text-xs">
                        {row.entry.contributors.length > 0
                          ? row.entry.contributors.map(c => c.name).join(', ')
                          : <span className="text-content-faint">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          {arcs.length > 0 && (
                            <BookArcAssigner
                              entry={row.entry}
                              arcs={arcs}
                              isOpen={assigningBookId === row.entry.book_id}
                              onOpen={() => setAssigningBookId(row.entry.book_id)}
                              onClose={() => setAssigningBookId(null)}
                              onAssign={arcID => assignBookToArc(row.entry.book_id, row.entry.position, arcID)}
                            />
                          )}
                          <button onClick={() => setEditEntry(row.entry)}
                            className="p-1 rounded text-content-muted hover:text-accent hover:bg-surface-inset transition-colors"
                            title="Edit volume position">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                          <button onClick={() => removeEntry(row.entry.book_id)}
                            className="p-1 rounded text-content-muted hover:text-danger hover:bg-surface-inset transition-colors"
                            title="Remove from series">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={`ghost-${row.position}-${idx}`}>
                      <td className="pl-4 pr-2 py-3 w-16">
                        <SeriesVolumeCover
                          title={row.volume?.title || `Vol. ${row.position}`}
                          coverUrl={row.volume?.cover_url || null}
                          position={row.position}
                          isGhost
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="italic text-content-subtle">
                          {row.volume?.title || `Vol. ${row.position}`}
                        </p>
                        {row.volume?.release_date && (
                          <p className="text-xs text-content-subtle">
                            {new Date(row.volume.release_date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          <button onClick={() => {
                              setAddHint({ position: row.position, query: series.name })
                              setShowAdd(true)
                            }}
                            className="text-xs text-content-subtle hover:text-blue-600 transition-colors">Add</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddToSeriesModal
          libraryId={libraryId}
          seriesId={series.id}
          existingBookIds={entries.map(e => e.book_id)}
          initialPosition={addHint?.position}
          initialQuery={addHint?.query}
          onClose={() => { setShowAdd(false); setAddHint(null) }}
          onSaved={() => { setShowAdd(false); setAddHint(null); load() }}
        />
      )}
      {editEntry && (
        <AddToSeriesModal
          libraryId={libraryId}
          seriesId={series.id}
          existingBookIds={entries.map(e => e.book_id)}
          editEntry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => { setEditEntry(null); load() }}
        />
      )}
      {showMetaSearch && (
        <SeriesMetadataSearchModal
          series={series}
          libraryId={libraryId}
          onClose={() => setShowMetaSearch(false)}
          onSaved={updated => { setSeries(updated); setShowMetaSearch(false) }}
        />
      )}
      {showAutoMatch && (
        <AutoMatchModal
          series={series}
          libraryId={libraryId}
          onClose={() => setShowAutoMatch(false)}
          onApplied={() => { setShowAutoMatch(false); load() }}
        />
      )}
      {showEdit && (
        <SeriesFormModal
          libraryId={libraryId}
          series={series}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); reloadSeries() }}
        />
      )}
    </div>
  )
}

interface SeriesTabProps {
  libraryId: string
  setExtraCrumbs: (crumbs: Crumb[]) => void
}

// Publication status as a plain word in the same metadata register as the
// count text — sits inline with "X owned" so the two pieces of secondary info
// don't compete for attention. Reading state stays as the only colored pill.
function seriesStatusLabel(status: string): string {
  if (status === 'completed') return 'Complete'
  if (status === 'hiatus') return 'On hiatus'
  if (status === 'cancelled') return 'Cancelled'
  return 'Ongoing'
}

// 2×2 collage of the first four volume covers — auto-derived; no manual
// "series cover" upload yet. Falls back to a gradient placeholder per tile.




/**
 * What is left of the per-library Series section: the detail view, and nothing
 * else.
 *
 * The list retired to /series, which does the same job across every library
 * with filters, a sort and a create button this section never had. The detail
 * view stays because it is still the only place arcs, volume sync, auto-match,
 * the metadata merge picker and the AI proposal panel live. Moving those is
 * its own piece of work; until then the route is reachable and the list that
 * used to wrap it is gone.
 */
function SeriesTab({ libraryId, setExtraCrumbs }: SeriesTabProps) {
  const navigate = useNavigate()
  const { seriesId } = useParams<{ seriesId?: string }>()

  // No id means the retired list. The route redirects before this renders, so
  // this only catches a direct navigation and sends it the same way.
  if (!seriesId) return <Navigate to={`/series?lib=${libraryId}`} replace />

  return (
    <SeriesDetailView
      seriesId={seriesId}
      libraryId={libraryId}
      setExtraCrumbs={setExtraCrumbs}
      onBack={() => navigate(`/series?lib=${libraryId}`)}
    />
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LibraryPage({ section }: { section: 'books' | 'series' }) {
  const { libraryId } = useParams<{ libraryId: string }>()
  const { user } = useAuth()
  const { library, mediaTypes, setExtraCrumbs } = useOutletContext<LibraryOutletContext>()

  useEffect(() => {
    const labels: Record<string, string> = {
      books: 'Books', series: 'Series',
    }
    setExtraCrumbs([{ label: labels[section] }])
  }, [section, setExtraCrumbs])

  if (!library || !libraryId) return null

  return (
    <div className="p-8">
      {section === 'books' && (
        <BooksTab libraryId={libraryId} mediaTypes={mediaTypes}
          canEdit={!!(user?.is_instance_admin || library?.owner_id === user?.id)} />
      )}

      {section === 'series' && (
        <SeriesTab libraryId={libraryId} setExtraCrumbs={setExtraCrumbs} />
      )}

    </div>
  )
}
