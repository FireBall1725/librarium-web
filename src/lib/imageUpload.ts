// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import type { TFunction } from 'i18next'
import { ApiError } from '../auth/AuthContext'

/** The largest cover or contributor photo the API accepts. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** What the API sniffs for; anything else gets a 400. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

/**
 * Why an image upload failed, in words.
 *
 * Goes by status, not body: a proxy in front of the API can replace a 4xx body
 * with its own page (nginx's 413 is HTML), so the API's message isn't there to read.
 */
export function imageUploadError(err: unknown, t: TFunction): string {
  const status = err instanceof ApiError ? err.status : 0
  if (status === 413) return tooLargeMessage(t)
  if (status === 400) {
    return t('image_upload.wrong_type', { defaultValue: "That file isn't a PNG, JPEG, GIF or WebP image." })
  }
  if (status === 403) {
    return t('image_upload.no_permission', { defaultValue: "You don't have permission to change this." })
  }
  return t('image_upload.failed', { defaultValue: "The upload didn't go through. Try again." })
}

/** Checked before sending, so a big file fails at once instead of after the upload. */
export function tooLargeMessage(t: TFunction): string {
  return t('image_upload.too_large', { defaultValue: 'That image is over 10 MB. Try a smaller one.' })
}
