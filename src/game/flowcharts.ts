import { appUrl } from '../urls.ts'
import { english, LocalizedError } from '../i18n/messages.ts'
import { emptyFlow, readFlow, type GameFlow } from './gameflow.ts'

const FLOWCHART_PREFIX = 'namecard-game.flowchart.v1.'
const FLOWCHART_SUFFIX = '.gameflow.json'
export const ACTIVE_FLOWCHART_KEY = 'namecard-game.active-flowchart.v1'

export type FlowchartSummary = { id: string; title: string }
export type FlowchartDocument = FlowchartSummary & { gameflow: GameFlow }
export type FlowchartStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>

export function flowchartStorageKey(id: string): string {
  if (!id.trim()) throw new LocalizedError('errors.flowchartId')
  return `${FLOWCHART_PREFIX}${id}${FLOWCHART_SUFFIX}`
}

function displayTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) throw new LocalizedError('errors.flowchartTitle')
  return trimmed
}

export function createFlowchart(
  gameflow: GameFlow = { ...emptyFlow(), mode: 'all-unlocked' },
  title = english('editor.defaultFlowchartTitle'),
): FlowchartDocument {
  return { id: crypto.randomUUID(), title: displayTitle(title), gameflow }
}

export function renameFlowchart(flowchart: FlowchartDocument, title: string): FlowchartDocument {
  return { ...flowchart, title: displayTitle(title) }
}

export function getFlowchart(id: string, storage: FlowchartStorage = localStorage): FlowchartDocument {
  const serialized = storage.getItem(flowchartStorageKey(id))
  if (serialized === null) throw new LocalizedError('errors.flowchartMissing', { id })
  const value: unknown = JSON.parse(serialized)
  if (value === null || typeof value !== 'object' ||
    !('id' in value) || value.id !== id ||
    !('title' in value) || typeof value.title !== 'string' ||
    !('gameflow' in value)) {
    throw new LocalizedError('errors.flowchartFormat', { id })
  }
  return { id, title: displayTitle(value.title), gameflow: readFlow(value.gameflow) }
}

export function getFlowcharts(storage: FlowchartStorage = localStorage): FlowchartSummary[] {
  const flowcharts: FlowchartSummary[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(FLOWCHART_PREFIX) || !key.endsWith(FLOWCHART_SUFFIX)) continue
    const id = key.slice(FLOWCHART_PREFIX.length, -FLOWCHART_SUFFIX.length)
    const flowchart = getFlowchart(id, storage)
    flowcharts.push({ id: flowchart.id, title: flowchart.title })
  }
  return flowcharts.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
}

export function saveFlowchart(flowchart: FlowchartDocument, storage: FlowchartStorage = localStorage): void {
  storage.setItem(flowchartStorageKey(flowchart.id), JSON.stringify({
    ...flowchart,
    title: displayTitle(flowchart.title),
  }))
}

export function editorFlowchartUrl(id?: string): string {
  const query = id === undefined ? '' : `?flowchart=${encodeURIComponent(id)}`
  return appUrl(`editor/${query}`)
}

export function playFlowchartUrl(id: string): string {
  return appUrl(`?flowchart=${encodeURIComponent(id)}`)
}
