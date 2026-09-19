// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Contributor lookups shared by the add and edit book forms.

import type { useAuth } from '../auth/AuthContext'
import type { ContributorResult } from '../types'

type CallApi = ReturnType<typeof useAuth>['callApi']

/** The contributor with exactly this name, created if there isn't one. */
export async function findOrCreateContributor(callApi: CallApi, name: string): Promise<ContributorResult | null> {
  const matches = await callApi<ContributorResult[]>(`/api/v1/contributors?q=${encodeURIComponent(name)}`)
  const exact = (matches ?? []).find(c => c.name.toLowerCase() === name.toLowerCase())
  if (exact) return exact
  return callApi<ContributorResult>('/api/v1/contributors', { method: 'POST', body: JSON.stringify({ name }) })
}

/**
 * Joins row i onto the row above it as one name, for a name a lookup split
 * in two ("Martin Luther King" and "Jr."). Returns the list unchanged when
 * either row has no contributor picked.
 */
export async function joinWithAbove<T extends { contributor: ContributorResult | null }>(callApi: CallApi, rows: T[], i: number): Promise<T[]> {
  const above = rows[i - 1]?.contributor
  const here = rows[i]?.contributor
  if (!above || !here) return rows
  const joined = await findOrCreateContributor(callApi, `${above.name}, ${here.name}`)
  if (!joined) return rows
  return rows.map((r, j) => j === i - 1 ? { ...r, contributor: joined } : r).filter((_, j) => j !== i)
}
