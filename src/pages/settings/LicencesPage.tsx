// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Licences: the required notices, in one place.
//
// The hand-kept lists below cover what actually reaches the browser. Build
// tooling (TypeScript, Vite, ESLint, Vitest and the rest) is deliberately
// absent: none of it is distributed, so none of it carries a notice obligation
// here, and padding the page with it buries the entries that do.
//
// The server's own components are not hand-kept and are not listed here. They
// are fetched from whichever instance is connected, because that is the only
// thing that knows what it was built from — a client can be pointed at several
// Librarium servers on several versions, so a list compiled into the client
// would be right for at most one of them and silently wrong for the rest.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import { usePageTitle } from '../../hooks/usePageTitle'
import { shortVersion, type ServerComponents } from '../../lib/serverComponents'

interface LicenceGroup {
  title: string
  note?: string
  items: Array<[name: string, licence: string]>
}

/**
 * Runtime dependencies, taken from package.json's `dependencies` and each
 * package's own declared licence. Anything added there belongs here in the
 * same pull request, which is the only thing keeping this page true.
 */
const RUNTIME: Array<[string, string]> = [
  ['React · React DOM', 'MIT'],
  ['React Router', 'MIT'],
  ['i18next', 'MIT'],
  ['react-i18next', 'MIT'],
  ['i18next-browser-languagedetector', 'MIT'],
  ['i18next-http-backend', 'MIT'],
  ['react-js-cron', 'MIT'],
]

/**
 * Both typefaces are self-hosted rather than pulled from a font CDN: a CDN sees
 * every page load, which a self-hosted privacy-focused application should not
 * require of the people running it. The OFL requires the licence to travel with
 * the font, which is what these rows are for.
 */
const TYPEFACES: Array<[string, string]> = [
  ['Cormorant Garamond', 'OFL-1.1'],
  ['Crimson Pro', 'OFL-1.1'],
]

export default function LicencesPage() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  usePageTitle(t('settings_nav.licences', { defaultValue: 'Licences' }))

  // null while loading, so the section can say "loading" rather than showing an
  // empty list that reads as "the server has no dependencies".
  const [server, setServer] = useState<ServerComponents | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    callApi<ServerComponents>('/api/v1/components')
      .then(r => { if (!cancelled) setServer(r) })
      .catch(err => {
        if (cancelled) return
        // An older server has no /components route. That is a missing section,
        // not a broken page, so it says so in place and the rest still renders.
        setServerError(err instanceof ApiError && err.status === 404
          ? t('licences.server_unsupported', {
              defaultValue: 'This server is too old to report its components.',
            })
          : t('licences.server_failed', {
              defaultValue: 'Could not reach the server for its component list.',
            }))
      })
    return () => { cancelled = true }
  }, [callApi, t])

  const groups: LicenceGroup[] = [
    {
      title: t('licences.runtime', { defaultValue: 'Web client' }),
      items: RUNTIME,
    },
    {
      title: t('licences.typefaces', { defaultValue: 'Typefaces' }),
      items: TYPEFACES,
    },
  ]

  return (
    <>
      <PageHeader
        title={t('settings_nav.licences', { defaultValue: 'Licences' })}
        description={t('licences.description', {
          defaultValue:
            'Librarium is free and open source under the GNU AGPL-3.0. It is built on the projects below, listed so the required notices stay in one place. Each keeps its own copyright.',
        })}
      />

      <div className="px-8 py-6">
        <div className="mb-8 rounded-xl border border-line bg-surface-raised p-5">
          <p className="font-display text-2xl font-semibold text-content">Librarium</p>
          <p className="mt-1 text-sm text-content-secondary">
            {t('licences.librarium', {
              defaultValue:
                'Copyright (C) 2026 FireBall1725. Licensed under the GNU Affero General Public License, version 3.',
            })}
          </p>
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.en.html"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-block text-sm text-accent hover:underline"
          >
            {t('licences.read_agpl', { defaultValue: 'Read the AGPL-3.0' })}
          </a>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(310px,1fr))] items-start gap-8">
          {groups.map(group => (
            <section key={group.title}>
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                {group.title}
              </h2>
              <ul>
                {group.items.map(([name, licence]) => (
                  <li key={name}
                    className="flex items-center gap-3.5 border-b border-line py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-content">{name}</span>
                    <code className="flex-none rounded-md border border-line-strong bg-surface-inset px-2 py-[3px] font-mono text-[11px] text-content-tertiary">
                      {licence}
                    </code>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* The server's list. Its own section rather than a fourth column in
            the grid above: sixty-odd rows next to a seven-row column reads as
            one enormous list with three stubs beside it. */}
        <section className="mt-10 border-t border-line pt-7">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              {t('licences.server', { defaultValue: 'API server' })}
            </h2>
            {server && (
              <span className="text-[11px] text-content-tertiary">
                {/* `n`, not `count`: i18next treats a variable named count as
                    a plural selector and goes looking for server_version_one /
                    _other, which do not exist. It happens to fall back to the
                    base key, but only by luck. */}
                {t('licences.server_version', {
                  version: server.version,
                  n: server.components.length,
                  defaultValue: 'v{{version}} · {{n}} components',
                })}
              </span>
            )}
          </div>

          {serverError ? (
            <p className="font-read text-[13.5px] text-content-tertiary">{serverError}</p>
          ) : !server ? (
            <p className="font-read text-[13.5px] text-content-tertiary">
              {t('common.loading', { defaultValue: 'Loading…' })}
            </p>
          ) : server.components.length === 0 ? (
            <p className="font-read text-[13.5px] text-content-tertiary">
              {t('licences.server_empty', {
                defaultValue: 'This server was built outside module mode and cannot list its components.',
              })}
            </p>
          ) : (
            // Flowed into columns rather than laid out as a grid: the rows are
            // one alphabetical list and reading it down a column then across
            // keeps that order, which a grid would scramble left-to-right.
            <ul className="columns-[340px] gap-x-8">
              {server.components.map(c => (
                <li key={c.name}
                  className="flex items-center gap-3.5 break-inside-avoid border-b border-line py-2.5 text-sm">
                  <span className="min-w-0 flex-[2] truncate text-content" title={c.name}>{c.name}</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-content-faint"
                    title={c.version}>
                    {shortVersion(c.version)}
                  </span>
                  <code className={`flex-none rounded-md border px-2 py-[3px] font-mono text-[11px] ${
                    c.licence
                      ? 'border-line-strong bg-surface-inset text-content-tertiary'
                      // Unknown is shown, not hidden: it is the row that needs
                      // someone to go and read a LICENSE file.
                      : 'border-warning-line text-warning'
                  }`}>
                    {c.licence || t('licences.unknown', { defaultValue: 'unknown' })}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
