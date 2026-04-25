// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

// Global Vitest setup. Loaded before each test file via `setupFiles`
// in vitest.config.ts. The jest-dom import extends Vitest's `expect`
// with DOM-aware matchers (`toBeInTheDocument`, `toHaveAttribute`,
// `toHaveTextContent`, …) — without it every assertion has to walk
// the element manually.
import '@testing-library/jest-dom/vitest'
