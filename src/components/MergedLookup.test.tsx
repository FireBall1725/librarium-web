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

describe('Ask again', () => {
  it('asks the providers again when pressed', async () => {
    let asked = 0
    const merged = { ...hybrids([]), providers: [{ name: 'hardcover', display_name: 'Hardcover', status: "answered", millis: 200 }] } as MergedBookResult
    render(<MergedLookup merged={merged} onUse={() => {}} onRetry={() => { asked++ }} />)
    screen.getByRole('button', { name: 'Ask again' }).click()
    expect(asked).toBe(1)
  })

  it('has no button without a way to retry', () => {
    const merged = { ...hybrids([]), providers: [{ name: 'hardcover', display_name: 'Hardcover', status: "answered", millis: 200 }] } as MergedBookResult
    render(<MergedLookup merged={merged} onUse={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull()
  })
})
