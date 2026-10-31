import en from './en.json' with { type: 'json' }
import ja from './ja.json' with { type: 'json' }

export type Locale = 'en' | 'ja'
export type MessageKey = keyof typeof en
export type Message = { key: MessageKey; values?: MessageValues }
export type MessageValues = Record<string, string | number | Message | Message[]>
export type LocalizedText = string | Message | Message[]
export type Translator = (key: MessageKey, values?: MessageValues) => string

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, ja }

export function msg(key: MessageKey, values?: MessageValues): Message {
  return { key, values }
}

export function formatText(locale: Locale, text: LocalizedText): string {
  if (typeof text === 'string') return text
  if (Array.isArray(text)) return text.map((message) => formatText(locale, message)).join('\n')
  return translate(locale, text.key, text.values)
}

export function translate(locale: Locale, key: MessageKey, values: MessageValues = {}): string {
  return catalogs[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`Missing parameter "${name}" for translation "${key}".`)
    return typeof value === 'number' ? String(value) : formatText(locale, value)
  })
}

export function createTranslator(locale: Locale): Translator {
  return (key, values) => translate(locale, key, values)
}

export const english = createTranslator('en')

export class LocalizedError extends Error {
  readonly localizedMessage: Message

  constructor(key: MessageKey, values?: MessageValues) {
    const message = msg(key, values)
    super(formatText('en', message))
    this.name = 'LocalizedError'
    this.localizedMessage = message
  }
}

export function errorMessage(error: unknown): LocalizedText {
  if (error instanceof LocalizedError) return error.localizedMessage
  if (error instanceof SyntaxError) return msg('errors.invalidJson', { detail: error.message })
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') return msg('errors.storageQuota')
    if (error.name === 'SecurityError') return msg('errors.storageAccess')
  }
  return msg('errors.unexpected', { detail: error instanceof Error ? error.message : String(error) })
}
