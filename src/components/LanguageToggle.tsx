import { useI18n } from '../i18n/context.ts'

export default function LanguageToggle() {
  const { locale, setLocale, t, format, preferenceError } = useI18n()
  return <div className="language-bar">
    <div className="language-toggle" role="group" aria-label={t('language.label')}>
      <span>{t('language.label')}</span>
      <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
        {t('language.english')}
      </button>
      <button type="button" lang="ja" aria-pressed={locale === 'ja'} onClick={() => setLocale('ja')}>
        {t('language.japanese')}
      </button>
    </div>
    {preferenceError && <p className="language-error" role="alert">{format(preferenceError)}</p>}
  </div>
}
