// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Ratings are stored 1 to 10 and read as five stars with halves.
//
// One scale in the database, one in the reader's head. Ten points is what
// `user_books.rating` holds and what its CHECK allows; five stars is how people
// say it. Keeping the conversion in one place is what stops a 7 rendering as
// "7 stars" beside a widget that only draws five of them.

/** The highest rating the column allows. Ten points is five stars of two. */
export const RATING_MAX = 10

/** The most stars shown. Each one is worth two points. */
export const STAR_MAX = 5

/** Stars for a stored rating: 7 is three and a half. */
export const starsOf = (rating: number): number => rating / 2

/** The stored rating for a number of stars, rounded to the nearest half. */
export const ratingOfStars = (stars: number): number =>
  Math.min(RATING_MAX, Math.max(1, Math.round(stars * 2)))

/**
 * Stars as text, without a trailing zero.
 *
 * "3.5" and "4", never "4.0": a whole number of stars said with a decimal
 * reads as a precision the reader did not choose.
 */
export const formatStars = (rating: number): string => {
  const stars = starsOf(rating)
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1)
}

/**
 * Every stored rating that satisfies a comparison against a star count.
 *
 * The scale is ten discrete points, so a comparison is a set rather than a
 * range, and can travel on the filter the rail already sends. That is what lets
 * "more than three and a half stars" work without the server learning about
 * comparisons at all.
 */
export function ratingsMatching(op: '>' | '>=' | '<' | '<=' | '=', stars: number): number[] {
  const target = stars * 2
  const out: number[] = []
  for (let r = 1; r <= RATING_MAX; r++) {
    const ok =
      op === '>' ? r > target
        : op === '>=' ? r >= target
          : op === '<' ? r < target
            : op === '<=' ? r <= target
              : r === target
    if (ok) out.push(r)
  }
  return out
}
