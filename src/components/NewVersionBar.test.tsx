// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const check = vi.fn()
const stop = vi.fn()
let found: (() => void) | null = null

vi.mock('../lib/appVersion', () => ({
  watchForNewVersion: (_running: string, onFound: () => void) => {
    found = onFound
    return { check, stop }
  },
}))

const { default: NewVersionBar } = await import('./NewVersionBar')

function Page() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate('/series')}>go</button>
}

const mount = () => render(
  <MemoryRouter initialEntries={['/books']}>
    <Routes>
      <Route path="/books" element={<Page />} />
      <Route path="/series" element={<p>series</p>} />
    </Routes>
    <NewVersionBar />
  </MemoryRouter>,
)

beforeEach(() => { check.mockClear(); stop.mockClear(); found = null })

describe('NewVersionBar', () => {
  it('says nothing until there is something to say', () => {
    mount()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('asks again on every navigation, which is what a timer alone missed', () => {
    mount()
    const onMount = check.mock.calls.length
    fireEvent.click(screen.getByRole('button'))
    expect(check.mock.calls.length).toBeGreaterThan(onMount)
  })

  // Reloading is offered, never done: a reload mid-review throws away the typing.
  it('offers a reload once a newer version is out, and can be dismissed', () => {
    mount()
    expect(found).toBeTruthy()
    act(() => found!())
    expect(screen.getByRole('status')).toHaveTextContent('newer version')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
