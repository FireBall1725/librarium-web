import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'

import { withBase } from '../lib/basePath'

export const SUPPORTED_LOCALES = ['en-CA', 'fr-FR', 'de-DE'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'en-CA': 'English (Canada)',
  'fr-FR': 'Français (France)',
  'de-DE': 'Deutsch (Deutschland)',
}

export const LOCALE_FLAGS: Record<SupportedLocale, string> = {
  'en-CA': '🇨🇦',
  'fr-FR': '🇫🇷',
  'de-DE': '🇩🇪',
}

/**
 * Locales whose first draft was machine-written rather than translated by a
 * person.
 *
 * Said out loud in the picker, because somebody choosing a language deserves
 * to know how much to trust it before they rely on it, and because a wrong
 * string in an interface reads as carelessness unless its provenance is
 * stated. English is the source and French was written by hand, so neither is
 * listed. A locale leaves this set when somebody has read it through.
 */
export const MACHINE_DRAFTED: ReadonlySet<SupportedLocale> = new Set(['de-DE'])

export const LOCALE_STORAGE_KEY = 'librarium:locale'

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: 'en-CA',
    load: 'currentOnly',
    ns: ['common', 'dashboard'],
    defaultNS: 'common',
    backend: {
      // Through withBase: this is fetched from JS, and the container
      // entrypoint only rewrites index.html. On an instance served from a
      // sub-path the request went to the host root, 404'd, and the whole UI
      // rendered raw translation keys with nothing in the console to say why.
      loadPath: withBase('/locales/{{lng}}/{{ns}}.json'),
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
    returnEmptyString: false,
  })

export default i18n
