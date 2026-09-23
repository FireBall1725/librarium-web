// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { createSmartList, updateList, type CallApi } from './lists'

const spy = () => {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = []
  const callApi = (async (path: string, init?: RequestInit) => {
    calls.push({ path, body: JSON.parse(String(init?.body ?? '{}')) })
    return {}
  }) as CallApi
  return { calls, callApi }
}

// A view's colour is what tells one apart from another in the rail. Saving a
// view sent no colour at all, and renaming had no way to change it (LIB-207).
describe('a view keeps its colour', () => {
  it('saves the colour the dialog collected', async () => {
    const { calls, callApi } = spy()
    await createSmartList(callApi, 'Signed firsts', 'status=read', 'star', 'books', 'list', '#ef4444')
    expect(calls[0].body).toMatchObject({ name: 'Signed firsts', icon: 'star', color: '#ef4444' })
  })

  it('sends an empty colour rather than nothing when none was picked', async () => {
    const { calls, callApi } = spy()
    await createSmartList(callApi, 'Signed firsts', 'status=read', 'star')
    expect(calls[0].body).toMatchObject({ color: '' })
  })

  it('changes the colour on a rename', async () => {
    const { calls, callApi } = spy()
    await updateList(callApi, 'list-1', { name: 'Grisham', color: '#3b82f6' })
    expect(calls[0].body).toEqual({ name: 'Grisham', color: '#3b82f6' })
  })

  // The endpoint is a partial update, so a key left out must stay left out.
  it('leaves the colour alone when the change does not mention it', async () => {
    const { calls, callApi } = spy()
    await updateList(callApi, 'list-1', { layout: 'grid' })
    expect(calls[0].body).toEqual({ layout: 'grid' })
  })
})
