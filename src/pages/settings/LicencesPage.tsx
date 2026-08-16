// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Licences: the required notices, in one place.
//
// The lists below cover what actually reaches the browser. Build tooling
// (TypeScript, Vite, ESLint, Vitest and the rest) is deliberately absent: none
// of it is distributed, so none of it carries a notice obligation here, and
// padding the page with it buries the entries that do.

import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/PageHeader'
import { usePageTitle } from '../../hooks/usePageTitle'

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
  ['emoji-picker-react', 'MIT'],
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
  usePageTitle(t('settings_nav.licences', { defaultValue: 'Licences' }))

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

        <p className="font-read mt-6 text-[13.5px] text-content-tertiary">
          {t('licences.footnote', {
            defaultValue: 'Adding a dependency means adding it here in the same pull request.',
          })}
        </p>

        <p className="font-read mt-2 text-[13.5px] text-content-tertiary">
          {t('licences.api_note', {
            defaultValue:
              'The API server ships its own dependencies and notices; see its repository for that list.',
          })}
        </p>
      </div>
    </>
  )
}
