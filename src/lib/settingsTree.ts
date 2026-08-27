// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The settings information architecture.
//
// Settings used to be a flat list of nine links in the main sidebar plus three
// more destinations filed under Admin and one under the account menu, which
// meant the answer to "where do I change X" was "somewhere in those thirteen".
// Grouping them into five areas gives each page a parent, and gives the index a
// shape a reader can hold in their head.
//
// One list, used by the index tiles, the contextual sidebar and the
// breadcrumbs, so those three cannot disagree about where a page lives.

/** Which fetched summary value a row displays, if any. */
export type FactKey =
  | 'mediaTypes'
  | 'genres'
  | 'providers'
  | 'aiProvider'
  | 'people'
  | 'version'
  | 'theme'
  | 'displayName'

export interface SettingsPage {
  id: string
  /** Route, absolute. Some still point at their pre-redesign home. */
  to: string
  labelKey: string
  labelFallback: string
  fact?: FactKey
  /** Static value where there is nothing to fetch. */
  staticFact?: string
}

export interface SettingsSection {
  id: string
  labelKey: string
  labelFallback: string
  pages: SettingsPage[]
}

export const SETTINGS_TREE: SettingsSection[] = [
  {
    id: 'account',
    labelKey: 'settings_section.account',
    labelFallback: 'Account',
    pages: [
      { id: 'profile', to: '/profile', labelKey: 'settings_nav.profile', labelFallback: 'Profile', fact: 'displayName' },
      { id: 'appearance', to: '/settings/appearance', labelKey: 'settings_nav.appearance', labelFallback: 'Appearance', fact: 'theme' },
      // Were tabs on the profile page, which meant they had no URL: nothing
      // could link to your API tokens, and nobody found them without already
      // knowing the tab bar was there.
      { id: 'tokens', to: '/settings/tokens', labelKey: 'settings_nav.tokens', labelFallback: 'API tokens' },
      { id: 'ai-privacy', to: '/settings/ai-privacy', labelKey: 'settings_nav.ai_privacy', labelFallback: 'AI and privacy' },
    ],
  },
  {
    id: 'collection',
    labelKey: 'settings_section.collection',
    labelFallback: 'Collection',
    pages: [
      { id: 'media-types', to: '/settings/media-types', labelKey: 'settings_nav.media_types', labelFallback: 'Media Types', fact: 'mediaTypes' },
      { id: 'genres', to: '/settings/genres', labelKey: 'settings_nav.genres', labelFallback: 'Genres', fact: 'genres' },
      { id: 'tags', to: '/settings/tags', labelKey: 'settings_nav.tags', labelFallback: 'Tags' },
      { id: 'lists', to: '/settings/lists', labelKey: 'settings_nav.lists', labelFallback: 'Lists' },
      { id: 'shelves', to: '/settings/shelves', labelKey: 'settings_nav.shelves', labelFallback: 'Shelves' },
      // Beside Tags because they are the same shape: a named, per-library set
      // of books. A shelf is a tag with an icon and a description.
      { id: 'profiles', to: '/settings/profiles', labelKey: 'settings_nav.profiles', labelFallback: 'Profiles' },
      // Beside the vocabulary pages, because a contributor is instance-wide the
      // same way a genre is: folding two names together changes what every
      // household on the server sees.
      { id: 'duplicate-authors', to: '/settings/duplicate-authors', labelKey: 'settings_nav.duplicate_authors', labelFallback: 'Duplicate authors' },
    ],
  },
  {
    id: 'sources',
    labelKey: 'settings_section.sources',
    labelFallback: 'Sources',
    pages: [
      // Both of these used to be wrong. Metadata providers pointed at
      // /admin/connections, whose index route redirects to ai, so the two rows
      // opened the same page and the providers page was unreachable from the
      // tree. The providers page itself was filed under Collection as
      // "Metadata", a name that does not say what it holds.
      { id: 'providers', to: '/settings/metadata', labelKey: 'settings_nav.providers', labelFallback: 'Metadata providers', fact: 'providers' },
      { id: 'ai', to: '/settings/ai', labelKey: 'connections_nav.ai', labelFallback: 'AI provider', fact: 'aiProvider' },
    ],
  },
  {
    id: 'storage',
    labelKey: 'settings_section.storage',
    labelFallback: 'Storage',
    pages: [
      { id: 'media-management', to: '/settings/media-management', labelKey: 'settings_nav.media_management', labelFallback: 'Media Management' },
      // Import lived under a Tools heading of its own in the nav. It is data
      // coming in, which is a storage concern, and one destination fewer.
      { id: 'import', to: '/import', labelKey: 'nav.import', labelFallback: 'Import' },
    ],
  },
  {
    id: 'system',
    labelKey: 'settings_section.system',
    labelFallback: 'System',
    pages: [
      { id: 'people', to: '/admin/users', labelKey: 'settings_nav.people', labelFallback: 'People', fact: 'people' },
      // Beside People because the two answer the same question at different
      // scopes: who has an account here, and who can see which library.
      { id: 'members', to: '/settings/members', labelKey: 'settings_nav.members', labelFallback: 'Members' },
      { id: 'jobs', to: '/settings/jobs', labelKey: 'settings_nav.jobs', labelFallback: 'Jobs' },
      { id: 'history', to: '/settings/jobs/history', labelKey: 'settings_nav.job_history', labelFallback: 'Job history' },
      { id: 'general', to: '/settings/general', labelKey: 'settings_nav.general', labelFallback: 'General', fact: 'version' },
      { id: 'licences', to: '/settings/licences', labelKey: 'settings_nav.licences', labelFallback: 'Licences', staticFact: 'AGPL-3.0' },
    ],
  },
]

/** The section a route belongs to, for the contextual sidebar and crumbs. */
export function sectionForPath(pathname: string): SettingsSection | null {
  for (const section of SETTINGS_TREE) {
    for (const page of section.pages) {
      // startsWith, not equality: job pages nest under their kind, and the
      // sidebar should stay on System while the reader is down there.
      if (pathname === page.to || pathname.startsWith(page.to + '/')) return section
    }
  }
  return null
}

export function pageForPath(pathname: string): SettingsPage | null {
  let best: SettingsPage | null = null
  for (const section of SETTINGS_TREE) {
    for (const page of section.pages) {
      if (pathname === page.to || pathname.startsWith(page.to + '/')) {
        // Longest match wins, so /settings/jobs/history resolves to Job history
        // rather than to Jobs, which is a prefix of it.
        if (!best || page.to.length > best.to.length) best = page
      }
    }
  }
  return best
}
