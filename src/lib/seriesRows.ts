// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import type { CallApi } from './lists'

/** One series row in a book form, as typed: the position is still a string. */
export interface SeriesRowDraft { seriesId: string; position: string }

// Writes the rows as a diff against what the book was in before; a new book
// passes an empty map. A row whose position did not move is still posted
// because the endpoint upserts, and skipping it would mean tracking which
// change came from where for no gain.
export async function saveSeriesRows(
  callApi: CallApi,
  libraryId: string,
  bookId: string,
  rows: SeriesRowDraft[],
  initial: ReadonlyMap<string, number>,
) {
  const kept = new Set(rows.map(r => r.seriesId))
  for (const [seriesId] of initial) {
    if (!kept.has(seriesId))
      await callApi(`/api/v1/libraries/${libraryId}/series/${seriesId}/books/${bookId}`,
        { method: 'DELETE' }).catch(() => {})
  }
  for (const row of rows) {
    if (!row.seriesId) continue
    await callApi(`/api/v1/libraries/${libraryId}/series/${row.seriesId}/books`, {
      method: 'POST',
      body: JSON.stringify({
        book_id: bookId,
        position: row.position.trim() !== '' ? Number(row.position) : 1,
      }),
    }).catch(() => {})
  }
}
