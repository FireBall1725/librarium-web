// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it, vi } from 'vitest'
import { DEV_VERSION, fetchServedVersion, isDifferentVersion, watchForNewVersion } from './appVersion'

const answer = (body: unknown, ok = true) =>
  vi.fn<typeof fetch>(async () => ({ ok, json: async () => body }) as unknown as Response)

describe('isDifferentVersion', () => {
  it('sees a deploy', () => {
    expect(isDifferentVersion('26.9.1', '26.9.2')).toBe(true)
  })

  it('counts a rollback too, because the chunks this tab wants are gone either way', () => {
    expect(isDifferentVersion('26.9.2', '26.9.1')).toBe(true)
  })

  it('says nothing when they match, or when the server will not say', () => {
    expect(isDifferentVersion('26.9.1', '26.9.1')).toBe(false)
    expect(isDifferentVersion('26.9.1', null)).toBe(false)
  })

  it('leaves a dev build alone: its version never changes', () => {
    expect(isDifferentVersion(DEV_VERSION, '26.9.1')).toBe(false)
    expect(isDifferentVersion('26.9.1', DEV_VERSION)).toBe(false)
  })
})

describe('fetchServedVersion', () => {
  it('asks with no-store, because a cached answer is the thing being detected', async () => {
    const f = answer({ version: '26.9.2' })
    expect(await fetchServedVersion(f)).toBe('26.9.2')
    expect(f.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
  })

  it('shrugs off a 404, a body with no version, and a network failure', async () => {
    expect(await fetchServedVersion(answer({ version: '26.9.2' }, false))).toBeNull()
    expect(await fetchServedVersion(answer({}))).toBeNull()
    expect(await fetchServedVersion(vi.fn<typeof fetch>(async () => { throw new Error('offline') }))).toBeNull()
  })
})

describe('watchForNewVersion', () => {
  it('reports a missing chunk straight away, and only once', () => {
    const onFound = vi.fn()
    const stop = watchForNewVersion('26.9.1', onFound)
    window.dispatchEvent(new Event('vite:preloadError'))
    window.dispatchEvent(new Event('vite:preloadError'))
    expect(onFound).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops listening once it is torn down', () => {
    const onFound = vi.fn()
    watchForNewVersion('26.9.1', onFound)()
    window.dispatchEvent(new Event('vite:preloadError'))
    expect(onFound).not.toHaveBeenCalled()
  })
})
