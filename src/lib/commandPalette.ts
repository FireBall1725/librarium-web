// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// What the command bar can find.
//
// The rail has had a "Search everything…" box since the redesign that submitted
// to /books?q=, so it searched titles and called that everything. This is the
// everything: the collection, the things you have named yourself, every page in
// the app, and the handful of commands worth reaching without navigating first.
//
// Sources split by cost. Navigation, settings pages, views, libraries and
// shelves are already in memory or cheap to hold, so they filter on every
// keystroke with no network. Books, series, authors and loans are searched
// server-side on a debounce.

import type { IconName } from './icons'
import { SETTINGS_TREE } from './settingsTree'
import type { SavedView } from './views'
import { viewIcon } from './viewIcons'

/**
 * Which section an item belongs to.
 *
 * Groups are derived from the items themselves rather than rendered from a
 * hand-kept list of sections. A fixed list has to be updated whenever a source
 * is added, and forgetting means the rows exist, count toward "did we find
 * anything", and render nowhere: a palette that looks broken rather than empty.
 */
export type ItemKind =
  | 'action'
  | 'book'
  | 'series'
  | 'author'
  | 'view'
  | 'shelf'
  | 'library'
  | 'loan'
  | 'page'

export interface CommandItem {
  kind: ItemKind
  /** Unique within a result set; kind plus source id, since ids can collide. */
  id: string
  label: string
  sublabel?: string
  icon: IconName
  /** Where it goes. Items that do something instead carry `run`. */
  to?: string
  run?: () => void
  /** Colour for the icon, where the thing has one of its own. */
  tint?: string
}

/**
 * Normalise for matching: case, accents and separators all ignored.
 *
 * Accents so "asimov" finds "Asímov"; separators so "apitokens" finds "API
 * tokens" and "20thcentury" finds "20th Century Boys". Someone typing fast at a
 * command bar does not put the spaces in.
 *
 * This governs the LOCAL sources only: pages, views, shelves, libraries and
 * actions. Books, series, authors and loans are matched by Postgres against the
 * raw query, so they follow the database's rules, not these.
 */
export const fold = (s: string) =>
  s.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()

export const matches = (haystack: string, needle: string) =>
  fold(haystack).includes(fold(needle))

/**
 * Every page in the app, so the palette answers "where do I change X" without
 * the reader knowing which of five settings sections owns it.
 *
 * Built from SETTINGS_TREE rather than a second list, which is the same reason
 * the tree exists: the index, the sidebar and the breadcrumbs already read it,
 * and a fourth copy would be the one that drifts.
 */
export function pageItems(t: (k: string, o?: Record<string, unknown>) => string): CommandItem[] {
  const top: CommandItem[] = [
    { kind: 'page', id: 'page:dashboard', label: t('nav.dashboard', { defaultValue: 'Dashboard' }), icon: 'home', to: '/dashboard' },
    { kind: 'page', id: 'page:books', label: t('nav.books', { defaultValue: 'Books' }), icon: 'books', to: '/books' },
    { kind: 'page', id: 'page:series', label: t('nav.series', { defaultValue: 'Series' }), icon: 'series', to: '/series' },
    { kind: 'page', id: 'page:authors', label: t('nav.authors', { defaultValue: 'Authors' }), icon: 'authors', to: '/authors' },
    { kind: 'page', id: 'page:loans', label: t('nav.loans', { defaultValue: 'Loans' }), icon: 'lent', to: '/loans' },
    { kind: 'page', id: 'page:libraries', label: t('nav.libraries', { defaultValue: 'Libraries' }), icon: 'libraries', to: '/libraries' },
    { kind: 'page', id: 'page:settings', label: t('nav.settings', { defaultValue: 'Settings' }), icon: 'settings', to: '/settings' },
  ]

  const settings = SETTINGS_TREE.flatMap(section =>
    section.pages.map<CommandItem>(p => ({
      kind: 'page',
      id: `page:${p.id}`,
      label: t(p.labelKey, { defaultValue: p.labelFallback }),
      // The section, so two pages with similar names are told apart by where
      // they live rather than by the reader guessing.
      sublabel: t(section.labelKey, { defaultValue: section.labelFallback }),
      icon: 'settings',
      to: p.to,
    }))
  )

  return [...top, ...settings]
}

export function viewItems(views: SavedView[]): CommandItem[] {
  return views
    .filter(v => !v.hidden)
    .map(v => ({
      kind: 'view',
      id: `view:${v.id}`,
      label: v.name,
      icon: viewIcon(v),
      to: v.params ? `/books?${v.params}` : '/books',
    }))
}

/**
 * Rank matches so the closest one is first.
 *
 * An exact name beats a prefix beats a match anywhere, and within a tie the
 * shorter label wins: typing "dune" should reach Dune before Dune Messiah.
 * Without this the order is whatever each source returned, which puts the
 * thing you typed halfway down a list.
 */
export function score(label: string, query: string): number {
  const l = fold(label)
  const q = fold(query)
  if (l === q) return 0
  if (l.startsWith(q)) return 1
  if (l.includes(q)) return 2
  return 3
}

export function rank(items: CommandItem[], query: string): CommandItem[] {
  if (!query) return items
  return items
    .map((item, i) => ({ item, i, s: score(item.label, query) }))
    .sort((a, b) =>
      a.s - b.s ||
      a.item.label.length - b.item.label.length ||
      // Stable for everything else, so groups keep the order their source
      // returned rather than shuffling as you type.
      a.i - b.i)
    .map(x => x.item)
}

/** Section headings, in the order the palette shows them. */
export const KIND_LABEL: Record<ItemKind, string> = {
  action: 'palette.actions',
  book: 'palette.books',
  series: 'palette.series',
  author: 'palette.authors',
  view: 'palette.views',
  shelf: 'palette.shelves',
  library: 'palette.libraries',
  loan: 'palette.loans',
  page: 'palette.pages',
}

/**
 * The order sections appear in.
 *
 * Actions first because a command bar that buries its commands under search
 * results is a search box. Pages last because they are always there and always
 * match something, so they would otherwise crowd out the collection.
 */
export const KIND_ORDER: ItemKind[] = [
  'action', 'book', 'series', 'author', 'view', 'shelf', 'library', 'loan', 'page',
]
