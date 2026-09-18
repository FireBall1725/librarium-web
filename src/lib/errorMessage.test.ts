// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, it, expect } from 'vitest'
import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  it('uses the API error string when the API is what answered', () => {
    expect(errorMessage({ error: 'invalid credentials' }, 'Login failed'))
      .toBe('invalid credentials')
  })

  it('falls back when an error page answers with error: true', () => {
    // The regression this exists for. An ingress error-page service replaced
    // the API's body on a 401, `??` passed the boolean through because it is
    // neither null nor undefined, and the login form rendered "true".
    const errorPage = {
      error: true,
      code: 401,
      message: 'Unauthorized',
      description: 'The requested page needs a username and a password',
    }
    expect(errorMessage(errorPage, 'Invalid username or password'))
      .toBe('Invalid username or password')
  })

  it('does not lift message or description out of an envelope it does not know', () => {
    // Deliberate. Those strings describe a web page, not the thing the person
    // was doing, so the caller's fallback is the more accurate answer.
    expect(errorMessage({ message: 'Unauthorized' }, 'fallback')).toBe('fallback')
    expect(errorMessage({ description: 'Needs a password' }, 'fallback')).toBe('fallback')
  })

  it('treats a blank or whitespace-only error as no message at all', () => {
    expect(errorMessage({ error: '' }, 'fallback')).toBe('fallback')
    expect(errorMessage({ error: '   ' }, 'fallback')).toBe('fallback')
  })

  it('survives every non-object body a proxy might return', () => {
    // An HTML error page parsed as text, an empty body, a bare array.
    expect(errorMessage(null, 'fallback')).toBe('fallback')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
    expect(errorMessage('<html>502</html>', 'fallback')).toBe('fallback')
    expect(errorMessage(502, 'fallback')).toBe('fallback')
    expect(errorMessage([], 'fallback')).toBe('fallback')
  })

  it('rejects the other shapes that stringify into something misleading', () => {
    expect(errorMessage({ error: false }, 'fallback')).toBe('fallback')
    expect(errorMessage({ error: 0 }, 'fallback')).toBe('fallback')
    expect(errorMessage({ error: { nested: 'object' } }, 'fallback')).toBe('fallback')
    expect(errorMessage({ error: ['a', 'b'] }, 'fallback')).toBe('fallback')
  })
})
