// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

/// <reference types="vitest" />

// Vitest config for librarium-web. We piggyback on Vite's existing
// resolve / plugin pipeline so test files see the same module graph as
// the production bundle — no separate Jest/Babel transform stack to
// keep in sync.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom gives us `document`, `window`, etc. for hooks/components
    // that touch the DOM (most of the surface that matters).
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Match anything ending in .test.ts(x) or .spec.ts(x); excluding
    // node_modules and build output keeps cold runs fast.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.git'],
    css: false,
    // Per-test timeout; default is 5s which is fine for unit tests but
    // stated explicitly so future async-component tests don't surprise.
    testTimeout: 5_000,
  },
})
