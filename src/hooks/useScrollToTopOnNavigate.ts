// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Put a new page at the top of itself.
 *
 * A browser scrolls to the top when it loads a document; a router swapping
 * components does not, so opening a book from the bottom of a long list left
 * the reader at the bottom of a page they had never seen. The same happens on
 * the pager, which sits under the last row: page two arrived already scrolled
 * past its first twenty books.
 *
 * Scrolls the element rather than the window, because the layout's `main` is
 * the thing that scrolls; `window.scrollTo` moves a document that never moved.
 *
 * Only the path and the page number count. Every other change to the query is a
 * filter, a sort or a view, which the reader makes from controls at the top of
 * the list and expects to stay where they are for.
 */
export function useScrollToTopOnNavigate(ref: RefObject<HTMLElement | null>) {
  const { pathname, search } = useLocation()
  const page = new URLSearchParams(search).get('page') ?? '1'
  // The first render is a fresh document, already at the top; scrolling it is
  // a no-op that would fight a browser restoring a reload's position.
  const last = useRef<string | null>(null)

  useEffect(() => {
    const here = `${pathname}\u0000${page}`
    if (last.current === here) return
    const first = last.current === null
    last.current = here
    if (!first) ref.current?.scrollTo({ top: 0 })
  }, [pathname, page, ref])
}
