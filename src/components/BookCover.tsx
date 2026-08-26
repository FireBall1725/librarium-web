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

/**
 * Classes come from the ported reference stylesheet. The corner flag is only
 * defined there for read and reading, which is deliberate: did-not-finish is
 * not progress worth flagging at thumbnail size, and the chip on the row
 * already says so.
 */
function flagClass(readStatus: string | undefined): string | null {
  if (readStatus === 'read') return 'flag'
  if (readStatus === 'reading') return 'flag reading'
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
  /**
   * Where the book stands in relation to the reader. Anything other than
   * "shelf" draws the cover drained of colour.
   *
   * A missing volume, a wishlist entry and a book on the shelf rendered
   * identically, so a grid of a run gave no sign which ones you could go and
   * pick up. Grey is the oldest convention there is for "not yours yet" and it
   * survives being scanned at thumbnail size, which a badge does not.
   */
  ownership?: string
}

export default function BookCover({
  title,
  coverUrl,
  className = 'w-28 sm:w-36',
  innerClassName = '',
  readStatus,
  seed,
  hideLabel = false,
  ownership,
}: BookCoverProps) {
  const [imgError, setImgError] = useState(false)
  const { ref, src, status } = useAuthenticatedImage(coverUrl)
  const showImage = !!src && !imgError
  const flag = flagClass(readStatus)

  /**
   * Waiting on a cover that exists, rather than knowing there is none.
   *
   * These used to look identical: a book whose cover had not arrived rendered
   * the same tinted title card as a book with no cover, then swapped to the
   * photograph. That reads as the wrong answer being shown and corrected. A
   * skeleton says "coming" instead.
   */
  const pending = !showImage && !imgError && (status === 'idle' || status === 'loading')

  // Not held. Absent ownership means held: the single-book read and every
  // pre-existing caller send nothing, and none of them can return a book
  // nobody has.
  const unheld = ownership != null && ownership !== '' && ownership !== 'shelf'

  return (
    <div className={`${className} flex-shrink-0`} ref={ref}>
      <div
        className={`lb-cover ${hideLabel ? 'mini' : ''} ${showImage || pending ? '' : tintFor(seed || title)} ${innerClassName}`}
        // Not fully drained, and not fully faded. All the way to zero reads as
        // a broken image; opacity alone reads as a loading state. Most of the
        // colour gone plus a little of the light is the one that says "real,
        // just not yours".
        style={unheld ? { filter: 'grayscale(0.9)', opacity: 0.65 } : undefined}
      >
        {showImage ? (
          <img
            src={src}
            alt={title}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : pending ? (
          <span
            className="block h-full w-full animate-pulse bg-surface-strong"
            aria-label={title}
            role="img"
          />
        ) : (
          !hideLabel && <span className="lbl">{title}</span>
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
  ownership,
}: {
  title: string
  coverUrl: string | null | undefined
  readStatus?: string
  seed?: string
  ownership?: string
}) {
  return (
    <BookCover
      title={title}
      coverUrl={coverUrl}
      readStatus={readStatus}
      seed={seed}
      ownership={ownership}
      hideLabel
      className="w-[30px]"
      innerClassName="shadow-none"
    />
  )
}
