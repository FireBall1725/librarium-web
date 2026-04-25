// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { usePageTitle } from './usePageTitle'

// usePageTitle is the simplest hook in the codebase — it sets
// document.title on mount and restores it on unmount. The contract
// matters: every page wires this on render, and a regression that
// stopped restoring would leak whichever route's title was last
// active across the app.
describe('usePageTitle', () => {
  afterEach(() => {
    document.title = ''
  })

  it('sets the document title with the Librarium suffix when given a value', () => {
    document.title = 'baseline'
    renderHook(() => usePageTitle('Books'))
    expect(document.title).toBe('Books — Librarium')
  })

  it('falls back to "Librarium" when given an empty title', () => {
    document.title = 'baseline'
    renderHook(() => usePageTitle(''))
    expect(document.title).toBe('Librarium')
  })

  it('restores the previous title when the consuming component unmounts', () => {
    document.title = 'previous'
    const { unmount } = renderHook(() => usePageTitle('Books'))
    expect(document.title).toBe('Books — Librarium')
    unmount()
    expect(document.title).toBe('previous')
  })

  it('updates the title when the input changes', () => {
    document.title = 'baseline'
    const { rerender } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: 'Books' },
    })
    expect(document.title).toBe('Books — Librarium')
    rerender({ title: 'Series' })
    expect(document.title).toBe('Series — Librarium')
  })
})
