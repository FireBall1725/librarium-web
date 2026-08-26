// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RATING_MAX, STAR_MAX, formatStars, starsOf } from '../lib/rating'

/**
 * Five stars, half at a time.
 *
 * The stored value is one to ten, which is exactly five stars of two, so a half
 * star is a whole number in the column and nothing has to round. It replaced a
 * number input labelled 1-10, which asked the reader to do that conversion in
 * their head against a rail that talked about stars.
 *
 * Each star is two buttons, a left half and a right half, rather than one
 * button that guesses from the cursor: a pointer position is not available to
 * the keyboard, and half of a rating should not depend on where in a control
 * someone happened to click.
 */
export default function StarRating({
  value, onChange, disabled, size = 22,
}: {
  /** The stored rating, 1 to 10. Null or 0 means unrated. */
  value: number | null
  onChange: (rating: number | null) => void
  disabled?: boolean
  size?: number
}) {
  const { t } = useTranslation()
  const [hover, setHover] = useState<number | null>(null)

  const shown = hover ?? value ?? 0
  const stars = starsOf(shown)

  const set = (rating: number) => {
    if (disabled) return
    // Clicking the rating it already has clears it, which is the only way to
    // take a rating off without a second control for it.
    onChange(rating === value ? null : rating)
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center"
        onMouseLeave={() => setHover(null)}
        role="group"
        aria-label={t('rating.label', { defaultValue: 'Rating' })}
      >
        {Array.from({ length: STAR_MAX }, (_, i) => {
          const state = halfOf(stars, i)
          return (
            <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
              <Star state={state} size={size} />
              {/* Two hit targets over one drawing. Stacked absolutely so the
                  star is drawn once and still reachable in halves. */}
              {([0, 1] as const).map(part => {
                const rating = i * 2 + part + 1
                return (
                  <button
                    key={part}
                    type="button"
                    disabled={disabled}
                    onClick={() => set(rating)}
                    onMouseEnter={() => setHover(rating)}
                    onFocus={() => setHover(rating)}
                    onBlur={() => setHover(null)}
                    aria-label={t('rating.set', {
                      stars: formatStars(rating),
                      defaultValue: `Rate ${formatStars(rating)} stars`,
                    })}
                    aria-pressed={value === rating}
                    className="absolute top-0 h-full w-1/2 cursor-pointer disabled:cursor-default"
                    style={{ left: part === 0 ? 0 : '50%' }}
                  />
                )
              })}
            </span>
          )
        })}
      </div>

      <span className="text-xs tabular-nums text-content-tertiary">
        {shown > 0
          ? t('facets.stars', {
              count: starsOf(shown), stars: formatStars(shown),
              defaultValue: `${formatStars(shown)} stars`,
            })
          : t('rating.none', { defaultValue: 'Not rated' })}
        {/* The stored value, because it is what the API takes and what someone
            reading the data will see. */}
        {shown > 0 && <span className="ml-1 text-content-faint">({shown}/{RATING_MAX})</span>}
      </span>
    </div>
  )
}

/** Which way the star at this index is filled. Two points per star. */
function halfOf(stars: number, index: number): 'full' | 'half' | 'empty' {
  const filled = stars - index
  return filled >= 1 ? 'full' : filled >= 0.5 ? 'half' : 'empty'
}

/**
 * A rating drawn, with nothing to click.
 *
 * Anywhere a rating is offered or reported rather than set: the suggestion the
 * search box makes, where the point is to recognise the rating at a glance
 * rather than read a sentence about it.
 */
export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const stars = starsOf(rating)
  return (
    <span className="inline-flex items-center" aria-label={`${formatStars(rating)} stars`}>
      {Array.from({ length: STAR_MAX }, (_, i) => (
        <Star key={i} state={halfOf(stars, i)} size={size} />
      ))}
    </span>
  )
}

function Star({ state, size }: { state: 'full' | 'half' | 'empty'; size: number }) {
  // useId, not a random string. Rendering has to be pure: a fresh id every pass
  // changes the markup on every render and makes the gradient a new object to
  // the DOM each time, for a value that only has to be unique on the page.
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      className={state === 'empty' ? 'text-line-strong' : 'text-warning'}>
      {state === 'half' && (
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.35 6.2 20.4l1.1-6.47L2.6 9.35l6.5-.95z"
        fill={state === 'full' ? 'currentColor' : state === 'half' ? `url(#${id})` : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
