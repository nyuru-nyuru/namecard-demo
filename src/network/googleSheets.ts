import { LocalizedError } from '../i18n/messages.ts'
import { request } from './http.ts'

export type GoogleSheetCsvOptions = {
  spreadsheetId: string
  range: string
  signal?: AbortSignal
} & (
  | { apiKey: string; accessToken?: never }
  | { accessToken: string; apiKey?: never }
)

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LocalizedError('errors.googleSheetsRequired', { field })
  }
  return value.trim()
}

function invalidRange(path: string): never {
  throw new LocalizedError('errors.googleSheetsResponse', { path })
}

function valueRangeToCsv(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalidRange('root')
  if (!('range' in value) || typeof value.range !== 'string' || !value.range.trim()) invalidRange('range')
  if ('majorDimension' in value && value.majorDimension !== 'ROWS') invalidRange('majorDimension')
  if (!('values' in value)) return ''
  if (!Array.isArray(value.values)) invalidRange('values')
  const rows = value.values.map((row: unknown, rowIndex) => {
    if (!Array.isArray(row)) invalidRange(`values[${rowIndex}]`)
    return row.map((cell: unknown, columnIndex) => {
      if (typeof cell !== 'string' && typeof cell !== 'boolean' &&
        !(typeof cell === 'number' && Number.isFinite(cell))) {
        invalidRange(`values[${rowIndex}][${columnIndex}]`)
      }
      const text = String(cell)
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
    })
  })
  if (rows.length === 0) return ''
  const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0)
  return rows.map((row) =>
    Array.from({ length: width }, (_, index) => row[index] ?? '').join(','),
  ).join('\r\n') + '\r\n'
}

export async function getGoogleSheetCsv(options: GoogleSheetCsvOptions): Promise<string> {
  const spreadsheetId = requiredText(options.spreadsheetId, 'spreadsheetId')
  const range = requiredText(options.range, 'range')
  const hasApiKey = options.apiKey !== undefined
  const hasAccessToken = options.accessToken !== undefined
  if (hasApiKey === hasAccessToken) throw new LocalizedError('errors.googleSheetsCredentials')

  const headers = new Headers({ Accept: 'application/json' })
  if (hasApiKey) headers.set('X-Goog-Api-Key', requiredText(options.apiKey, 'apiKey'))
  else headers.set('Authorization', `Bearer ${requiredText(options.accessToken, 'accessToken')}`)
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
  )
  url.searchParams.set('majorDimension', 'ROWS')
  url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE')
  const response = await request(url, { method: 'GET', headers, signal: options.signal })
  const value: unknown = await response.json()
  return valueRangeToCsv(value)
}

// export function valueRangeToCsv(valueRange) {
//   const values = valueRange.values ?? [];
//   if (values.length === 0) return "";

//   // ValueRange can contain either rows or columns.
//   const rows =
//     valueRange.majorDimension === "COLUMNS"
//       ? Array.from(
//           { length: Math.max(...values.map(column => column.length)) },
//           (_, rowIndex) => values.map(column => column[rowIndex] ?? "")
//         )
//       : values;

//   const width = rows.reduce((max, row) => Math.max(max, row.length), 0);

//   function escapeCell(value) {
//     const text = String(value ?? "");
//     return /[",\r\n]/.test(text)
//       ? `"${text.replace(/"/g, '""')}"`
//       : text;
//   }

//   return rows
//     .map(row =>
//       Array.from({ length: width }, (_, i) => escapeCell(row[i])).join(",")
//     )
//     .join("\r\n");
//   }