// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Says when the server has a newer client than this tab is running, and
// reloads on the reader's word. Never on its own: a reload in the middle of a
// review throws away what was typed, and the tab still works, it is only old.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { watchForNewVersion } from '../lib/appVersion'
import { Icon } from '../lib/icons'

export default function NewVersionBar() {
  const { t } = useTranslation()
  const [waiting, setWaiting] = useState(false)
  const { pathname } = useLocation()
  const watch = useRef<ReturnType<typeof watchForNewVersion> | null>(null)

  useEffect(() => {
    const w = watchForNewVersion(__APP_VERSION__, () => setWaiting(true))
    watch.current = w
    return w.stop
  }, [])

  // Moving between pages is the moment a reader would welcome the news, and it
  // is cheap: the watcher ignores anything asked inside its own floor.
  useEffect(() => { watch.current?.check() }, [pathname])

  if (!waiting) return null
  return (
    <div role="status"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-accent-line bg-surface-raised px-4 py-3 shadow-2xl sm:left-4 sm:right-auto">
      <Icon name="refresh" className="h-4 w-4 shrink-0 text-accent" />
      <p className="min-w-0 flex-1 text-[13px] text-content">
        {t('app_version.ready', { defaultValue: 'A newer version of Librarium is ready.' })}
      </p>
      <button type="button" className="lb-btn sm shrink-0" onClick={() => window.location.reload()}>
        {t('app_version.reload', { defaultValue: 'Reload' })}
      </button>
      <button type="button" onClick={() => setWaiting(false)}
        aria-label={t('common.close', { defaultValue: 'Close' })}
        className="shrink-0 rounded-md p-1 text-content-muted hover:bg-surface-inset hover:text-content">
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  )
}
