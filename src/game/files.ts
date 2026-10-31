import { appUrl } from '../urls.ts'
import { english, errorMessage, LocalizedError, msg, type Message } from '../i18n/messages.ts'
import { parseGameFlow, readFlow, type GameFlow } from './gameflow.ts'
import { getFlowchart, type FlowchartStorage, type FlowchartSummary } from './flowcharts.ts'
import { getGoogleSheetCsv, type GoogleSheetCsvOptions } from '../network/googleSheets.ts'
import { parseMeisiCsv } from './meisi.ts'

export type LoadedGameFlow = {
  flow: GameFlow
  source: string
  sourceMessage?: Message
  flowchart?: FlowchartSummary
  warning?: Message
}

type SampleDataset = {
  id: string
  titleKey: Message['key']
  titleValues?: Message['values']
} & ({ filename: string } | { loaded: LoadedGameFlow })

type SpreadsheetCacheStorage = Pick<Storage, 'getItem' | 'setItem'>

export const DEFAULT_SAMPLE_DATASET = {
  id: 'meisi', titleKey: 'samples.meisi', filename: 'sample_meisi_gameflow.json',
} as const

const sampleDatasets: SampleDataset[] = [
  DEFAULT_SAMPLE_DATASET,
  { id: 'careers', titleKey: 'samples.careers', filename: 'sample_gameflow.json' },
]

export const SAMPLE_DATASETS: readonly SampleDataset[] = sampleDatasets

export async function loadSampleDataset(id: string, signal?: AbortSignal): Promise<LoadedGameFlow> {
  const dataset = SAMPLE_DATASETS.find((dataset) => dataset.id === id)
  if (!dataset) throw new LocalizedError('errors.unknownSample', { id })
  if ('loaded' in dataset) {
    signal?.throwIfAborted()
    return { ...dataset.loaded, flow: readFlow(dataset.loaded.flow) }
  }
  const response = await fetch(appUrl(dataset.filename), { signal })
  if (!response.ok) throw new LocalizedError('errors.loadFile', { filename: dataset.filename, status: response.status })
  return { flow: readFlow(await response.json()), source: dataset.filename }
}

export function loadFromSpreadsheet(options: GoogleSheetCsvOptions): Promise<string> {
  return getGoogleSheetCsv(options)
}

export function getConfiguredSpreadsheetOptions(signal?: AbortSignal): GoogleSheetCsvOptions | undefined {
  const spreadsheet = {
    spreadsheetId: import.meta.env?.VITE_SPREADSHEET_ID,
    range: import.meta.env?.VITE_SPREADSHEET_NAME,
    apiKey: import.meta.env?.VITE_GOOGLE_SHEETS_API_KEY,
    signal,
  }
  const hasSettings = [spreadsheet.spreadsheetId, spreadsheet.range, spreadsheet.apiKey]
    .some((value) => value !== undefined)
  return hasSettings ? spreadsheet : undefined
}

export async function loadSpreadsheetGameFlow(
  spreadsheet: GoogleSheetCsvOptions,
  storage?: SpreadsheetCacheStorage,
): Promise<LoadedGameFlow> {
  spreadsheet.signal?.throwIfAborted()
  const id = `google-sheets:${JSON.stringify([spreadsheet.spreadsheetId?.trim(), spreadsheet.range?.trim()])}`
  const existing = sampleDatasets.find((sample) => sample.id === id)
  let flow = existing && 'loaded' in existing ? readFlow(existing.loaded.flow) : undefined
  let warning = existing && 'loaded' in existing ? existing.loaded.warning : undefined
  let cache = storage
  const cacheKey = `namecard-game.spreadsheet.v1.${id}`
  if (!flow) {
    try {
      cache ??= typeof window === 'undefined' ? undefined : window.sessionStorage
      const cached = cache?.getItem(cacheKey)
      if (cached !== undefined && cached !== null) flow = parseGameFlow(JSON.parse(cached))
    } catch (error) {
      warning = msg('game.errors.spreadsheetCache', { error: errorMessage(error) })
    }
  }
  if (!flow) {
    flow = parseGameFlow(parseMeisiCsv(await loadFromSpreadsheet(spreadsheet)))
    spreadsheet.signal?.throwIfAborted()
    try {
      cache?.setItem(cacheKey, JSON.stringify(flow))
    } catch (error) {
      warning = msg('game.errors.spreadsheetCache', { error: errorMessage(error) })
    }
  }
  spreadsheet.signal?.throwIfAborted()
  const sourceMessage = msg('game.source.googleSheets', { range: spreadsheet.range })
  const loaded = { flow, source: english(sourceMessage.key, sourceMessage.values), sourceMessage, ...(warning ? { warning } : {}) }
  const dataset: SampleDataset = {
    id,
    titleKey: sourceMessage.key,
    titleValues: sourceMessage.values,
    loaded: { ...loaded, flow: readFlow(flow) },
  }
  const existingIndex = sampleDatasets.findIndex((sample) => sample.id === dataset.id)
  if (existingIndex !== -1) sampleDatasets.splice(existingIndex, 1)
  sampleDatasets.unshift(dataset)
  return loaded
}

export async function loadGameFlow(
  flowchartId?: string | null,
  storage?: FlowchartStorage,
  spreadsheet?: GoogleSheetCsvOptions,
): Promise<LoadedGameFlow> {
  if (flowchartId !== undefined && flowchartId !== null) {
    const flowchart = getFlowchart(flowchartId, storage)
    return {
      flow: parseGameFlow(flowchart.gameflow),
      source: english('game.source.saved', { title: flowchart.title, id: flowchart.id }),
      sourceMessage: msg('game.source.saved', { title: flowchart.title, id: flowchart.id }),
      flowchart: { id: flowchart.id, title: flowchart.title },
    }
  }
  if (!spreadsheet) return loadLocalGameFlow()
  try {
    return await loadSpreadsheetGameFlow(spreadsheet)
  } catch (sheetError) {
    if (spreadsheet.signal?.aborted) throw sheetError
    try {
      const local = await loadLocalGameFlow(spreadsheet.signal)
      return {
        ...local,
        warning: msg('game.errors.googleSheetsFallback', { error: errorMessage(sheetError) }),
      }
    } catch (localError) {
      if (spreadsheet.signal?.aborted) throw localError
      throw new LocalizedError('errors.googleSheetsAndLocalFailed', {
        sheetError: errorMessage(sheetError),
        localError: errorMessage(localError),
      })
    }
  }
}

async function loadLocalGameFlow(signal?: AbortSignal): Promise<LoadedGameFlow> {
  const response = await fetch(appUrl('gameflow.json'), { signal })
  // Vite's SPA fallback returns index.html for an absent public file.
  const missing = response.status === 404 ||
    (response.ok && response.headers.get('content-type')?.includes('text/html'))
  if (!missing) {
    if (!response.ok) throw new LocalizedError('errors.loadFile', { filename: 'gameflow.json', status: response.status })
    return { flow: parseGameFlow(await response.json()), source: 'gameflow.json' }
  }
  const sample = await loadSampleDataset(DEFAULT_SAMPLE_DATASET.id, signal)
  const sourceMessage = msg('game.source.sample', { filename: DEFAULT_SAMPLE_DATASET.filename })
  return { flow: parseGameFlow(sample.flow), source: english(sourceMessage.key, sourceMessage.values), sourceMessage }
}

export function downloadFlow(flow: GameFlow, filename = 'gameflow.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
