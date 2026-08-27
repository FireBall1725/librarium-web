import { defineConfig, devices } from '@playwright/test'

import { STORAGE_STATE } from './e2e/support/instance'

/**
 * The API the tests verify against.
 *
 * Driving the UI says what a person did; asking the API says what actually
 * happened, and the two are not the same. A book marked read through an
 * optimistic control shows as read whether or not the write landed, which is
 * how a reading-state write to a dead route survived a whole afternoon.
 */
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8090'

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:5273'

export default defineConfig({
  testDir: './e2e',
  // Serial. The suite sets an instance up from nothing and then builds on it;
  // parallel workers would race for the one admin the setup route allows.
  workers: 1,
  fullyParallel: false,
  // A failing end-to-end test is usually a real failure rather than a flake,
  // and a retry that hides one is worse than a red build. One retry in CI
  // covers the genuinely timing-dependent case of a container still waking up.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    // Kept only for failures. A trace per passing test is hundreds of
    // megabytes of artefact nobody opens.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Runs first and saves the session, so no spec spends its opening ten
    // seconds proving that login works. That is one test's job.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],
  // Vite rather than the built image: the tests are for the app's behaviour,
  // and a dev server starts in a second where a Docker build takes minutes.
  // The API it proxies to is the throwaway stack, not the local one.
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port 5273`,
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_API_PROXY_TARGET: API_URL },
  },
})
