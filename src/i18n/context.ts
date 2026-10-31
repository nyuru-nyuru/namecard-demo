import { createContext, useContext } from 'react'
import type { Locale, LocalizedText, Translator } from './messages.ts'

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translator
  format: (text: LocalizedText) => string
  preferenceError: LocalizedText
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider.')
  return context
}
