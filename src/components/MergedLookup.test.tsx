// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MergedBookResult } from '../types'
import MergedLookup from './MergedLookup'

const hybrids = (covers: MergedBookResult['covers']): MergedBookResult => ({
  title: { value: 'Hybrids', source: 'hardcover', source_display: 'Hardcover', reason: 'only', alternatives: [] },
  categories: [],
  covers,
})

// The table sat in the 150px cover column when a result had no cover, and
// wrapped the title a letter per line.
describe('MergedLookup layout', () => {
  it('gives the fields the full width when there is no cover', () => {
    render(<MergedLookup merged={hybrids([])} onUse={() => {}} />)
    const grid = screen.getByText('Hybrids').closest('.grid.gap-4')!
    expect(grid.className).not.toMatch(/grid-cols-\[150px/)
  })

  it('keeps the cover column when there is a cover', () => {
    render(<MergedLookup merged={hybrids([{ source: 'hardcover', source_display: 'Hardcover', cover_url: 'https://example.test/c.jpg' }])} onUse={() => {}} />)
    const grid = screen.getByText('Hybrids').closest('.grid.gap-4')!
    expect(grid.className).toMatch(/grid-cols-\[150px/)
  })
})
