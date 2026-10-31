import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext } from './context.ts'
import { createTranslator, errorMessage, formatText, LocalizedError, msg, type Locale, type LocalizedText } from './messages.ts'

export const LANGUAGE_STORAGE_KEY = 'namecard-game.language.v1'

function initialPreference(): { locale: Locale; error: LocalizedText } {
  try {
    const value = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (value === null) return { locale: 'en', error: '' }
    if (value !== 'en' && value !== 'ja') throw new LocalizedError('language.invalidPreference', { value })
    return { locale: value, error: '' }
  } catch (error) {
    return { locale: 'en', error: msg('language.readFailed', { error: errorMessage(error) }) }
  }
}

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(initialPreference)
  const { locale } = preference
  const value = useMemo(() => ({
    locale,
    t: createTranslator(locale),
    format: (text: LocalizedText) => formatText(locale, text),
    preferenceError: preference.error,
    setLocale(next: Locale) {
      let error: LocalizedText = ''
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
      } catch (cause) {
        error = msg('language.saveFailed', { error: errorMessage(cause) })
      }
      setPreference({ locale: next, error })
    },
  }), [locale, preference.error])
  const { t } = value

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = t('app.title')
  }, [locale, t])

  return <I18nContext value={value}>{children}</I18nContext>
}
