import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'

import { withBase } from '../lib/basePath'

export const SUPPORTED_LOCALES = ['en-CA', 'fr-FR'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'en-CA': 'English (Canada)',
  'fr-FR': 'Français (France)',
}

export const LOCALE_FLAGS: Record<SupportedLocale, string> = {
  'en-CA': '🇨🇦',
  'fr-FR': '🇫🇷',
}

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
