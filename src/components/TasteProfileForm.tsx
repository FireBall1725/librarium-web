// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useMemo, useState } from 'react'
import { useAuth, ApiError } from '../auth/AuthContext'
import { useToast } from './Toast'
import type { TasteProfile } from '../types'

// Presets are starting suggestions — user can add custom entries too.
const GENRE_PRESETS = [
  'sci-fi', 'fantasy', 'mystery', 'thriller', 'romance',
  'literary fiction', 'historical fiction', 'horror',
  'non-fiction', 'biography', 'manga', 'comics', 'young adult',
]

const THEME_PRESETS = [
  'cozy', 'dark', 'literary', 'epic', 'humorous',
  'grimdark', 'hopeful', 'escapist', 'slow-burn', 'fast-paced',
  'character-driven', 'plot-driven',
]

const FORMAT_PRESETS = [
  'novels', 'short stories', 'manga', 'manhwa',
  'graphic novels', 'light novels', 'non-fiction',
]

const ERA_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'No preference' },
  { value: 'classics', label: 'Classics' },
  { value: 'modern', label: 'Modern' },
  { value: 'current', label: 'Current / recent' },
]

type ChipState = 'neutral' | 'love' | 'avoid'

interface TriChipProps {
  label: string
  state: ChipState
  onChange: (next: ChipState) => void
  starred?: boolean
  onToggleStar?: () => void
  allowStar?: boolean
}

// TriChip cycles neutral → love → avoid → neutral on tap. Genres can also
// be starred as "strong preference" — the star only renders in the `love`
// state, matching the plan's chip-plus-star design.
function TriChip({ label, state, onChange, starred, onToggleStar, allowStar }: TriChipProps) {
  const next: Record<ChipState, ChipState> = {
    neutral: 'love',
    love: 'avoid',
    avoid: 'neutral',
  }
  const cls = {
    neutral:
      'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    love:
      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-800',
    avoid:
      'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800',
  }
  const prefix = state === 'love' ? '♥ ' : state === 'avoid' ? '✕ ' : ''
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(next[state])}
        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${cls[state]}`}
      >
        {prefix}{label}
      </button>
      {allowStar && state === 'love' && (
        <button
          type="button"
          onClick={onToggleStar}
          title="Strong preference"
          className={`p-0.5 text-sm ${starred ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600 hover:text-amber-400'}`}
        >
          {starred ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}

function chipStateFor(item: string, love?: string[], avoid?: string[]): ChipState {
  if (avoid?.includes(item)) return 'avoid'
  if (love?.includes(item)) return 'love'
  return 'neutral'
}

function toggleInList(list: string[] | undefined, item: string): string[] {
  const set = new Set(list ?? [])
  if (set.has(item)) set.delete(item)
  else set.add(item)
  return Array.from(set)
}

function setChipState(
  love: string[] | undefined,
  avoid: string[] | undefined,
  item: string,
  next: ChipState,
): { love: string[]; avoid: string[] } {
  const l = new Set(love ?? [])
  const a = new Set(avoid ?? [])
  l.delete(item)
  a.delete(item)
  if (next === 'love') l.add(item)
  if (next === 'avoid') a.add(item)
  return { love: Array.from(l), avoid: Array.from(a) }
}

interface SubcategoryProps {
  title: string
  description: string
  presets: string[]
  love?: string[]
  avoid?: string[]
  allowStar?: boolean
  favourite?: string[]
  onChange: (patch: { love: string[]; avoid: string[]; favourite?: string[] }) => void
}

function ChipSubcategory({
  title, description, presets, love, avoid, allowStar, favourite, onChange,
}: SubcategoryProps) {
  const [customInput, setCustomInput] = useState('')

  // Combined set of chips to display: preset list + any items the user has
  // tagged love/avoid that aren't in presets (so their custom additions survive).
  const allItems = useMemo(() => {
    const s = new Set([...presets, ...(love ?? []), ...(avoid ?? [])])
    return Array.from(s)
  }, [presets, love, avoid])

  const handleChipChange = (item: string, next: ChipState) => {
    const { love: nl, avoid: na } = setChipState(love, avoid, item, next)
    const nf = favourite?.filter(x => nl.includes(x))
    onChange({ love: nl, avoid: na, favourite: nf })
  }

  const toggleStar = (item: string) => {
    onChange({
      love: love ?? [],
      avoid: avoid ?? [],
      favourite: toggleInList(favourite, item),
    })
  }

  const addCustom = () => {
    const v = customInput.trim().toLowerCase()
    if (!v) return
    const { love: nl, avoid: na } = setChipState(love, avoid, v, 'love')
    onChange({ love: nl, avoid: na, favourite: favourite ?? [] })
    setCustomInput('')
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {allItems.map(item => (
          <TriChip
            key={item}
            label={item}
            state={chipStateFor(item, love, avoid)}
            onChange={next => handleChipChange(item, next)}
            allowStar={allowStar}
            starred={favourite?.includes(item)}
            onToggleStar={() => toggleStar(item)}
          />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={e => setCustomInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          placeholder={`Add custom ${title.toLowerCase().replace(/s$/, '')}…`}
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!customInput.trim()}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  )
}

interface TasteProfileFormProps {
  disabled?: boolean
}

export default function TasteProfileForm({ disabled }: TasteProfileFormProps) {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const [profile, setProfile] = useState<TasteProfile>({})
  const [initial, setInitial] = useState<TasteProfile>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    callApi<TasteProfile>('/api/v1/me/taste-profile')
      .then(p => {
        const loaded = p ?? {}
        setProfile(loaded)
        setInitial(loaded)
      })
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load taste profile'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirty = useMemo(
    () => JSON.stringify(profile) !== JSON.stringify(initial),
    [profile, initial]
  )

  const patchGenres = (p: { love: string[]; avoid: string[]; favourite?: string[] }) => {
    setProfile(prev => ({ ...prev, genres: { love: p.love, avoid: p.avoid, favourite: p.favourite ?? [] } }))
  }
  const patchThemes = (p: { love: string[]; avoid: string[] }) => {
    setProfile(prev => ({ ...prev, themes: { love: p.love, avoid: p.avoid } }))
  }
  const patchFormats = (p: { love: string[]; avoid: string[] }) => {
    setProfile(prev => ({ ...prev, formats: { love: p.love, avoid: p.avoid } }))
  }

  const handleAuthorsChange = (text: string) => {
    const list = text.split(',').map(s => s.trim()).filter(Boolean)
    setProfile(prev => ({ ...prev, favourite_authors: list }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await callApi('/api/v1/me/taste-profile', {
        method: 'PUT',
        body: JSON.stringify(profile),
      })
      setInitial(profile)
      showToast('Taste profile saved', { variant: 'success' })
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save'
      setError(msg)
      showToast(msg, { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 text-sm text-gray-500 dark:text-gray-400">
        Loading taste profile…
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <ChipSubcategory
          title="Genres"
          description="Tap to cycle neutral → love → avoid. Star your strongest favourites."
          presets={GENRE_PRESETS}
          love={profile.genres?.love}
          avoid={profile.genres?.avoid}
          favourite={profile.genres?.favourite}
          allowStar
          onChange={patchGenres}
        />
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <ChipSubcategory
          title="Themes &amp; moods"
          description="What kind of feeling are you after?"
          presets={THEME_PRESETS}
          love={profile.themes?.love}
          avoid={profile.themes?.avoid}
          onChange={patchThemes}
        />
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <ChipSubcategory
          title="Formats"
          description="Which book formats do you prefer?"
          presets={FORMAT_PRESETS}
          love={profile.formats?.love}
          avoid={profile.formats?.avoid}
          onChange={patchFormats}
        />
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Era</h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Time period you gravitate toward.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ERA_OPTIONS.map(opt => {
            const active = (profile.era ?? '') === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setProfile(prev => ({ ...prev, era: opt.value }))}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Favourite authors</h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Comma-separated. Three to five works best.</p>
        <input
          type="text"
          value={(profile.favourite_authors ?? []).join(', ')}
          onChange={e => handleAuthorsChange(e.target.value)}
          placeholder="e.g. Ursula K. Le Guin, Ted Chiang"
          className="mt-3 w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Hard nos / content boundaries</h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Anything the AI should steer away from (free-form).
        </p>
        <textarea
          value={profile.hard_nos ?? ''}
          onChange={e => setProfile(prev => ({ ...prev, hard_nos: e.target.value }))}
          rows={3}
          placeholder="e.g. no explicit content, no novels over 800 pages, no ongoing series"
          className="mt-3 w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save taste profile'}
        </button>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  )
}
