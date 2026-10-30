import { parseGameFlow, type GameFlow } from './gameflow.ts'
import { getFlowchart, type FlowchartStorage, type FlowchartSummary } from './flowcharts.ts'

export type LoadedGameFlow = { flow: GameFlow; source: string; flowchart?: FlowchartSummary }

export async function loadGameFlow(flowchartId?: string | null, storage?: FlowchartStorage): Promise<LoadedGameFlow> {
  if (flowchartId !== undefined && flowchartId !== null) {
    const flowchart = getFlowchart(flowchartId, storage)
    return {
      flow: parseGameFlow(flowchart.gameflow),
      source: `${flowchart.title} (flowchart ${flowchart.id})`,
      flowchart: { id: flowchart.id, title: flowchart.title },
    }
  }
  const response = await fetch('/gameflow.json')
  // Vite's SPA fallback returns index.html for an absent public file.
  const missing = response.status === 404 ||
    (response.ok && response.headers.get('content-type')?.includes('text/html'))
  if (!missing) {
    if (!response.ok) throw new Error(`Could not load gameflow.json: HTTP ${response.status}`)
    return { flow: parseGameFlow(await response.json()), source: 'gameflow.json' }
  }
  const sample = await fetch('/sample_gameflow.json')
  if (!sample.ok) throw new Error(`Could not load sample_gameflow.json: HTTP ${sample.status}`)
  return { flow: parseGameFlow(await sample.json()), source: 'sample_gameflow.json (no gameflow.json found)' }
}

export function downloadFlow(flow: GameFlow, filename = 'gameflow.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
