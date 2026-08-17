// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { SETTINGS_TREE, pageForPath, sectionForPath } from './settingsTree'
// The route table as text. Vite's ?raw import keeps this inside the bundler's
// world, so the test needs no node types and no filesystem path to go stale.
import appSource from '../App.tsx?raw'

describe('the tree itself', () => {
  it('gives every page a unique route', () => {
    const routes = SETTINGS_TREE.flatMap(s => s.pages.map(p => p.to))
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('gives every page a unique id, since the id keys the sidebar', () => {
    const ids = SETTINGS_TREE.flatMap(s => s.pages.map(p => p.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses absolute routes, so a link works from anywhere', () => {
    for (const s of SETTINGS_TREE) {
      for (const p of s.pages) expect(p.to.startsWith('/')).toBe(true)
    }
  })
})

describe('every page in the tree reaches a real page', () => {
  // Read the route table as text rather than rendering it: this is about what
  // the tree points at, and mounting the whole app to find out would need a
  // DOM, a router and an auth provider to answer a question the source already
  // answers.
  const app = appSource

  /** Routes declared as a redirect rather than a page. */
  const redirects = new Set(
    [...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<Navigate/g)].map(m => m[1])
  )

  /** Every path App declares, redirect or not. */
  const declared = new Set([...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]))

  const pages = SETTINGS_TREE.flatMap(s => s.pages)

  it.each(pages.map(p => [p.id, p.to] as const))(
    '%s does not point at a redirect',
    (_id, to) => {
      // Two rows pointing at /admin/connections and /admin/connections/ai both
      // opened AI, because the first was a redirect to the second. The tree
      // looked fine: the routes were distinct strings.
      expect(redirects.has(to)).toBe(false)
    }
  )

  it.each(pages.map(p => [p.id, p.to] as const))(
    '%s has a route declared for it',
    (_id, to) => {
      // Appearance sat in the tree for several commits with no route at all,
      // so the link fell through the catch-all and landed on the Dashboard.
      const nested = to.replace(/^\/settings\//, '')
      expect(declared.has(to) || declared.has(nested)).toBe(true)
    }
  )
})

describe('sectionForPath', () => {
  it('finds the section a page lives in', () => {
    expect(sectionForPath('/settings/genres')?.id).toBe('collection')
    expect(sectionForPath('/admin/users')?.id).toBe('system')
  })

  it('stays on the section for a nested route', () => {
    expect(sectionForPath('/settings/jobs/enrich-metadata')?.id).toBe('system')
  })

  it('returns null outside settings', () => {
    expect(sectionForPath('/books')).toBeNull()
  })

  it('does not match a route that merely starts with a page route', () => {
    // /settings/genres-extra is not under /settings/genres.
    expect(sectionForPath('/settings/genres-extra')).toBeNull()
  })
})

describe('pageForPath', () => {
  it('prefers the longest match', () => {
    // /settings/jobs is a prefix of /settings/jobs/history, so a first-match
    // scan would label the history page "Jobs".
    expect(pageForPath('/settings/jobs/history')?.id).toBe('history')
    expect(pageForPath('/settings/jobs')?.id).toBe('jobs')
  })

  it('resolves a job kind to its parent page', () => {
    expect(pageForPath('/settings/jobs/enrich-metadata')?.id).toBe('jobs')
  })
})
