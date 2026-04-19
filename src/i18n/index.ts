import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'

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
      loadPath: '/locales/{{lng}}/{{ns}}.json',
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
