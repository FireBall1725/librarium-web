// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useState } from 'react'
import { useAuthenticatedImage } from '../hooks/useAuthenticatedImage'

/**
 * Cover art, falling back to a generated placeholder.
 *
 * Most collections are mostly coverless, so the placeholder is the common case
 * rather than the exception and gets the same care as the real thing: the title
 * set in the display face on a tinted ground. The four tints come from the
 * theme's own accent colours, so a wall of placeholders still looks like the
 * rest of the product.
 */

const TINTS = ['cover-a', 'cover-g', 'cover-s', 'cover-r'] as const

/**
 * Pick a tint from the whole string, not its first character.
 *
 * Keying on the first letter puts every title starting with T on the same
 * colour, which in an alphabetical list produces long visible runs of one tint.
 * A cheap FNV-style walk spreads them without needing a stored value.
 */
function tintFor(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return TINTS[Math.abs(h) % TINTS.length]
}

function flagClass(readStatus: string | undefined): string | null {
  if (readStatus === 'read') return 'cover-flag'
  if (readStatus === 'reading') return 'cover-flag cover-flag-reading'
  if (readStatus === 'did_not_finish') return 'cover-flag cover-flag-dnf'
  return null
}

interface BookCoverProps {
  title: string
  coverUrl: string | null | undefined
  /** Sizing for the outer wrapper, e.g. "w-28 sm:w-36". */
  className?: string
  /** Extra classes on the aspect-ratio box itself. */
  innerClassName?: string
  readStatus?: string
  /**
   * What the tint is drawn from, when it should not be the title. Pass the
   * series name and every volume gets one colour, so twenty volumes read as a
   * run of one series on the shelf instead of a row of unrelated books.
   */
  seed?: string
  /**
   * Hide the placeholder title. Set at thumbnail sizes, where the text would
   * be a grey smudge rather than something anyone can read.
   */
  hideLabel?: boolean
}

export default function BookCover({
  title,
  coverUrl,
  className = 'w-28 sm:w-36',
  innerClassName = '',
  readStatus,
  seed,
  hideLabel = false,
}: BookCoverProps) {
  const [imgError, setImgError] = useState(false)
  const src = useAuthenticatedImage(coverUrl)
  const showImage = !!src && !imgError
  const flag = flagClass(readStatus)

  return (
    <div className={`${className} flex-shrink-0`}>
      <div className={`cover ${showImage ? '' : tintFor(seed || title)} ${innerClassName}`}>
        {showImage ? (
          <img
            src={src}
            alt={title}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          !hideLabel && <span className="cover-label">{title}</span>
        )}
        {flag && <span className={flag} aria-hidden="true" />}
      </div>
    </div>
  )
}

/**
 * Row-sized cover.
 *
 * A separate export rather than a prop because the small size is a different
 * design, not a smaller one: the title is dropped and the shadow goes with it,
 * leaving a spine-like block that reads as texture down the left of a list.
 */
export function BookCoverThumb({
  title,
  coverUrl,
  readStatus,
  seed,
}: {
  title: string
  coverUrl: string | null | undefined
  readStatus?: string
  seed?: string
}) {
  return (
    <BookCover
      title={title}
      coverUrl={coverUrl}
      readStatus={readStatus}
      seed={seed}
      hideLabel
      className="w-[30px]"
      innerClassName="shadow-none"
    />
  )
}
