// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Noticing that the server has a newer client than this tab is running.
//
// A deploy replaces the files under the same address. A tab already open keeps
// the code it loaded, so a fixed bug stays broken until someone reloads, and
// nothing on screen says so. The build writes its version to version.json; this
// asks for that file now and then and compares it with the version compiled in.

import { withBase } from './basePath'

/** What a build off someone's laptop reports. Never compared against. */
export const DEV_VERSION = '0.0.0-dev'

/** How often an open tab asks. Long: a deploy is not an emergency. */
export const CHECK_EVERY_MS = 15 * 60 * 1000

/**
 * Whether the served version means this tab is behind.
 *
 * Any difference counts, in either direction: releases, release candidates and
 * nightlies don't sort against each other usefully, and a rollback leaves a tab
 * running code the server no longer has, which is the same problem. A dev build
 * is exempt because the version it claims never changes.
 */
export function isDifferentVersion(running: string, served: string | null): boolean {
  if (!served || served === running) return false
  return running !== DEV_VERSION && served !== DEV_VERSION
}

/** The version the server is handing out now, or null if it won't say. */
export async function fetchServedVersion(f: typeof fetch = fetch): Promise<string | null> {
  try {
    // no-store, not no-cache: this is the one request that must not be answered
    // from the cache that caused the problem.
    const r = await f(withBase('/version.json'), { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const body: unknown = await r.json()
    const version = (body as { version?: unknown })?.version
    return typeof version === 'string' && version ? version : null
  } catch {
    // Offline, or a dev server with no version.json. Neither is worth saying.
    return null
  }
}

/**
 * Watch for a newer client, and call back once when there is one.
 *
 * Checks on a timer and whenever the tab is looked at again, because a laptop
 * asleep for a day is the common case and its timer didn't run. Also listens
 * for Vite's preload error, which is a chunk the deploy deleted: proof the tab
 * is stale, arriving before any timer would have noticed.
 */
export function watchForNewVersion(running: string, onFound: () => void, every = CHECK_EVERY_MS): () => void {
  let stopped = false
  const found = () => {
    if (stopped) return
    stopped = true
    stop()
    onFound()
  }

  const check = async () => {
    if (stopped || document.hidden) return
    if (isDifferentVersion(running, await fetchServedVersion())) found()
  }

  const onVisible = () => { if (!document.hidden) void check() }
  const onPreloadError = () => found()

  const timer = setInterval(() => void check(), every)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('vite:preloadError', onPreloadError)
  void check()

  function stop() {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('vite:preloadError', onPreloadError)
  }
  return () => { stopped = true; stop() }
}
