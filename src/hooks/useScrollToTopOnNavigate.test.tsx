// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { createRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useScrollToTopOnNavigate } from './useScrollToTopOnNavigate'

// The layout's `main` is what scrolls, so the hook is handed an element.
const scrollTo = vi.fn()
const ref = createRef<HTMLElement>()
Object.defineProperty(ref, 'current', { value: { scrollTo } as unknown as HTMLElement, writable: true })

function Harness({ to }: { to?: string }) {
  useScrollToTopOnNavigate(ref)
  const navigate = useNavigate()
  return <button type="button" onClick={() => to && navigate(to)}>go</button>
}

const at = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/books" element={<Harness to="/books?page=2" />} />
      <Route path="/authors" element={<Harness />} />
    </Routes>
  </MemoryRouter>,
)

describe('useScrollToTopOnNavigate', () => {
  it('leaves the first render alone: a fresh document is already at the top', () => {
    scrollTo.mockClear()
    at('/books')
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('goes to the top on the next page, which is the bug the pager had', () => {
    scrollTo.mockClear()
    const { getByRole } = at('/books')
    fireEvent.click(getByRole('button'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })

  it('stays put when only the filter changes, since those controls are up there', () => {
    scrollTo.mockClear()
    const { rerender } = render(
      <MemoryRouter initialEntries={['/books?status=read']}>
        <Routes><Route path="/books" element={<Harness />} /></Routes>
      </MemoryRouter>,
    )
    rerender(
      <MemoryRouter initialEntries={['/books?status=reading']}>
        <Routes><Route path="/books" element={<Harness />} /></Routes>
      </MemoryRouter>,
    )
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
