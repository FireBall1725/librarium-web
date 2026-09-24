// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import { ApiError } from '../auth/AuthContext'
import { imageUploadError } from './imageUpload'

const t = ((key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key) as unknown as TFunction

describe('imageUploadError', () => {
  it('reads a 413 as too large, whatever the body said', () => {
    // nginx answers with an HTML page, so the message is not the API's.
    expect(imageUploadError(new ApiError(413, 'Request failed'), t)).toMatch(/over 10 MB/)
  })

  it('reads a 400 as the wrong kind of file', () => {
    expect(imageUploadError(new ApiError(400, 'true'), t)).toMatch(/PNG, JPEG, GIF or WebP/)
  })

  it('reads a 403 as no permission', () => {
    expect(imageUploadError(new ApiError(403, 'insufficient permissions'), t)).toMatch(/permission/)
  })

  it('falls back for anything else, including a network error', () => {
    expect(imageUploadError(new ApiError(500, 'boom'), t)).toMatch(/didn't go through/)
    expect(imageUploadError(new TypeError('Failed to fetch'), t)).toMatch(/didn't go through/)
  })
})
