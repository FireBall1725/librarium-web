// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { SETTINGS_TREE, pageForPath, sectionForPath } from './settingsTree'

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
