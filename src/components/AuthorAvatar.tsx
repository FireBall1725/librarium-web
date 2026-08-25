// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useState } from 'react'
import { useAuthenticatedImage } from '../hooks/useAuthenticatedImage'

/**
 * An author's photo, or a generated stand-in.
 *
 * Almost no collection has author photos, so the generated version is the
 * common case and is designed rather than defaulted: initials in the display
 * face on a two-tone gradient, keyed on the name so one author keeps one look
 * everywhere they appear.
 *
 * Fixed hex pairs rather than theme tokens, unlike book covers. Covers appear
 * in long runs where the palette has to hold together, but avatars are read one
 * at a time, and a set of twelve distinguishable identities is worth more here
 * than palette discipline. They are chosen mid-saturation so white initials
 * clear contrast on either theme.
 */

const PAIRS: Array<[string, string]> = [
  ['#6366f1', '#a855f7'], ['#0d9488', '#22d3ee'], ['#f59e0b', '#f43f5e'],
  ['#059669', '#84cc16'], ['#0ea5e9', '#4f46e5'], ['#e11d48', '#fb923c'],
  ['#7c3aed', '#e879f9'], ['#0891b2', '#14b8a6'], ['#be123c', '#f472b6'],
  ['#4d7c0f', '#facc15'], ['#1d4ed8', '#38bdf8'], ['#9333ea', '#f97316'],
]

/**
 * FNV-1a with a murmur3 finaliser. The avalanche matters: FNV's low bits are
 * poorly distributed over short similar strings, and author lists are full of
 * those, so without it neighbouring names land on the same colour.
 */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d) >>> 0
  h ^= h >>> 15
  return h >>> 0
}

/** First and last initial, which is what distinguishes names in a list. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export default function AuthorAvatar({
  name,
  photoUrl,
  size = 64,
}: {
  name: string
  photoUrl?: string | null
  size?: number
}) {
  const [imgError, setImgError] = useState(false)
  const { ref, src } = useAuthenticatedImage(photoUrl)

  if (src && !imgError) {
    return (
      <img
        ref={ref}
        src={src}
        alt=""
        onError={() => setImgError(true)}
        style={{ width: size, height: size }}
        className="mx-auto rounded-full object-cover"
      />
    )
  }

  // The generated avatar is not a placeholder for a photo, it is the answer for
  // an author who has none, so it renders straight away rather than after a
  // skeleton. The ref rides on it so a photo that does exist starts loading
  // once this scrolls into view.
  const h = hash(name)
  const [c1, c2] = PAIRS[h % PAIRS.length]
  // Angle off the higher bits, so two authors sharing a pair still differ.
  const angle = 110 + ((h >>> 11) % 140)

  return (
    <span
      ref={ref}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        backgroundImage:
          `radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.30), transparent 58%),` +
          `linear-gradient(${angle}deg, ${c1}, ${c2})`,
      }}
      className="font-display mx-auto inline-grid flex-none place-items-center rounded-full font-semibold leading-none text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2),0_8px_20px_-10px_rgb(0_0_0/0.5)]"
    >
      {initialsOf(name)}
    </span>
  )
}
