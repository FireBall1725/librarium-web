// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stars } from './StarRating'

// Ratings are stored 1 to 10 and read as five stars with halves. The books list
// drew its own stars and repeated one per stored point, so a 5-star book got a
// row of ten (LIB-204). Five is the count, whatever the rating.
describe('Stars', () => {
  const drawn = () => screen.getByLabelText(/stars/).querySelectorAll('svg')

  it('draws five stars for the highest rating, not ten', () => {
    render(<Stars rating={10} />)
    expect(drawn()).toHaveLength(5)
    expect(screen.getByLabelText('5 stars')).toBeInTheDocument()
  })

  it('draws five for a half rating too, and says the half', () => {
    render(<Stars rating={9} />)
    expect(drawn()).toHaveLength(5)
    expect(screen.getByLabelText('4.5 stars')).toBeInTheDocument()
  })

  it('draws the frame at the lowest rating', () => {
    render(<Stars rating={1} />)
    expect(drawn()).toHaveLength(5)
    expect(screen.getByLabelText('0.5 stars')).toBeInTheDocument()
  })
})
