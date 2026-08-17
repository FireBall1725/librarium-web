// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { shortVersion } from './serverComponents'

describe('shortVersion', () => {
  it('keeps a normal semver untouched', () => {
    expect(shortVersion('v1.6.0')).toBe('v1.6.0')
    expect(shortVersion('v0.42.0')).toBe('v0.42.0')
    expect(shortVersion('v4.0.0-rc.2')).toBe('v4.0.0-rc.2')
  })

  it('trims a pseudo-version to its date', () => {
    expect(shortVersion('v0.0.0-20240606120523-5a60cdf6a761')).toBe('v0.0.0-20240606')
    expect(shortVersion('v0.0.0-20170810143723-de5bf2ad4578')).toBe('v0.0.0-20170810')
  })

  it('trims a pseudo-version that carries a pre-release part', () => {
    // The form Go produces for a commit after a tagged release.
    expect(shortVersion('v1.0.1-0.20181226105442-5d4364ee4fb2')).toBe('v1.0.1-0.20181226')
  })

  it('leaves a version alone when only part of the pattern matches', () => {
    // A pre-release that merely looks numeric must not be mistaken for a
    // timestamp, or a real version would be silently rewritten.
    expect(shortVersion('v1.2.3-20240606')).toBe('v1.2.3-20240606')
    expect(shortVersion('v1.2.3-5a60cdf6a761')).toBe('v1.2.3-5a60cdf6a761')
    // A hash of the wrong length is not a pseudo-version.
    expect(shortVersion('v0.0.0-20240606120523-5a60cdf6a7')).toBe('v0.0.0-20240606120523-5a60cdf6a7')
  })

  it('does not touch an empty or unusual value', () => {
    expect(shortVersion('')).toBe('')
    expect(shortVersion('(devel)')).toBe('(devel)')
  })
})
