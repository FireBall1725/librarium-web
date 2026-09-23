// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PromptDialog } from './Dialog'

const COLOURS = [
  { value: '', label: 'None' },
  { value: '#ef4444', label: 'Red' },
  { value: '#3b82f6', label: 'Blue' },
]

const at = (initialColor: string) => (
  <PromptDialog
    open
    title="Rename"
    label="Name"
    initialValue="A view"
    icons={['tag', 'star']}
    initialIcon="tag"
    colors={COLOURS}
    initialColor={initialColor}
    colorLabel="Colour"
    onCancel={vi.fn()}
    onSubmit={vi.fn()}
  />
)

describe('PromptDialog colours', () => {
  it('starts on the colour the thing already has', () => {
    render(at('#3b82f6'))
    expect(screen.getByLabelText('Blue')).toHaveAttribute('aria-pressed', 'true')
  })

  // The dialog stays mounted between opens, so it has to notice that the thing
  // being renamed changed. It keyed that off the icon alone, and two views with
  // the same icon made the second one wear the first one's colour.
  it('picks up the next view\'s colour even when the icon is the same', () => {
    const { rerender } = render(at('#3b82f6'))
    rerender(at('#ef4444'))
    expect(screen.getByLabelText('Red')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Blue')).toHaveAttribute('aria-pressed', 'false')
  })
})
