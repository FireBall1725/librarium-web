// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import type { ComponentProps } from 'react'

// book_series.position is numeric(6,1), so 0.1 is the finest step it stores;
// "any" would let 1.25 through and the column would round it without saying so.
export const SERIES_POSITION_STEP = '0.1'

// Every series position box uses this so no screen can pick its own step.
export default function SeriesPositionInput(props: Omit<ComponentProps<'input'>, 'type' | 'step' | 'min'>) {
  return <input type="number" step={SERIES_POSITION_STEP} min="0" {...props} />
}
