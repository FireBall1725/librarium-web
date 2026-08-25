// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Typeface choice, for readers the default typography does not serve.
//
// Separate from the theme rather than folded into it: a theme is a palette and
// this is legibility, and pairing them would mean choosing a colour scheme to
// get a typeface. One attribute on <html>, read by index.css, the same shape
// the theme uses.

export type ReadingFontId = 'default' | 'dyslexic'

export interface ReadingFontMeta {
  id: ReadingFontId
  label: string
  hint: string
}

export const READING_FONTS: ReadingFontMeta[] = [
  {
    id: 'default',
    label: 'Default',
    hint: 'Cormorant Garamond and Crimson Pro',
  },
  {
    id: 'dyslexic',
    // Weighted letterforms and unique shapes, so characters are harder to
    // rotate or transpose. It does not work for everyone with dyslexia, which
    // is why it is offered rather than applied.
    label: 'OpenDyslexic',
    hint: 'Weighted bottoms and distinct letter shapes',
  },
]

export const READING_FONT_STORAGE_KEY = 'librarium:reading-font'

export function readStoredReadingFont(): ReadingFontId {
  if (typeof window === 'undefined') return 'default'
  const stored = window.localStorage.getItem(READING_FONT_STORAGE_KEY)
  return stored === 'dyslexic' ? 'dyslexic' : 'default'
}

export function storeReadingFont(id: ReadingFontId) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(READING_FONT_STORAGE_KEY, id)
}

/**
 * Write the choice to <html>.
 *
 * An attribute rather than a class, so it cannot collide with the `.dark` one
 * the theme still sets, and so index.css can key on it the same way it keys on
 * data-theme.
 */
export function applyReadingFont(id: ReadingFontId) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (id === 'default') root.removeAttribute('data-reading-font')
  else root.setAttribute('data-reading-font', id)
}
