// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Theme selection. Themes are named, not a light/dark boolean, so the set can
// grow without touching a component: each one is a block of token values in
// index.css and nothing else.
//
// Two attributes are written to <html>, and both are load-bearing:
//
//   data-theme  drives the semantic colour tokens. This is the real mechanism.
//   .dark       kept because ~980 `dark:` utilities have not been converted
//               yet. Until they are, a dark-family theme still has to set the
//               class or those components render their light colours on a dark
//               ground. Remove it once the count reaches zero.

export type ThemeId = 'system' | 'paper' | 'ink' | 'sepia' | 'nocturne'

export interface ThemeMeta {
  id: ThemeId
  /** Shown in the picker. */
  label: string
  /** One line of description for a settings card. */
  hint: string
  /** Whether this theme needs the legacy `.dark` class. */
  dark: boolean
}

// `system` follows the OS and resolves to paper or ink.
export const THEMES: ThemeMeta[] = [
  { id: 'system',   label: 'Match system', hint: 'Follow the operating system', dark: false },
  { id: 'paper',    label: 'Paper',        hint: 'Light, the original',         dark: false },
  { id: 'ink',      label: 'Ink',          hint: 'Dark, the original',          dark: true  },
  { id: 'sepia',    label: 'Sepia',        hint: 'Warm dark, reading lamp',     dark: true  },
  { id: 'nocturne', label: 'Nocturne',     hint: 'Cool dark, low glare',        dark: true  },
]

export const THEME_STORAGE_KEY = 'librarium:theme'
export const THEME_PREFERENCE_KEY = 'theme'

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

/** Resolve `system` to the theme actually rendered. */
export function resolveTheme(theme: ThemeId): Exclude<ThemeId, 'system'> {
  if (theme !== 'system') return theme
  return prefersDark() ? 'ink' : 'paper'
}

export function applyTheme(theme: ThemeId) {
  const resolved = resolveTheme(theme)
  const meta = THEMES.find(t => t.id === resolved)
  const root = document.documentElement

  root.setAttribute('data-theme', resolved)
  root.classList.toggle('dark', Boolean(meta?.dark))
  root.style.colorScheme = meta?.dark ? 'dark' : 'light'
}

export function readStoredTheme(): ThemeId {
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  if (raw && THEMES.some(t => t.id === raw)) return raw as ThemeId

  // Migrate the pre-token setting, which only knew light/dark/system.
  const legacy = localStorage.getItem('theme')
  if (legacy === 'light') return 'paper'
  if (legacy === 'dark') return 'ink'
  return 'system'
}

export function storeTheme(theme: ThemeId) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}
