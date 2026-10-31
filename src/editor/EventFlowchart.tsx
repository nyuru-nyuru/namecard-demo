import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type AriaLabelConfig,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeFunc,
  type ReactFlowInstance,
} from '@xyflow/react'
import { isAutomaticRelation, startingCardIds, type EventPosition, type GameFlow } from '../game/gameflow.ts'
import {
  addCard,
  addPerson,
  addTelephone,
  defaultEventPositions,
  removeGraphSelection,
  setEventPositions,
  setStartingCard,
  setUnlock,
} from './model.ts'
import { cardLabel, eventLabel } from './labels.ts'
import { useI18n } from '../i18n/context.ts'
import { errorMessage, msg, type LocalizedText, type Translator } from '../i18n/messages.ts'
import '@xyflow/react/dist/style.css'
import './flowchart.css'

type EventNodeData = {
  kind: 'card' | 'telephone'
  entityId: number
  name: string
  detail: string
  company: string
  starting: boolean
  unreachable: boolean
  invalid: boolean
}
type FlowNode = Node<EventNodeData, 'event'>
type FlowEdge = Edge<{ automatic: boolean }>

function FlowchartNode({ id, data, selected, isConnectable }: NodeProps<FlowNode>) {
  const { t } = useI18n()
  return <div className={`fe-flow-node fe-flow-node--${data.kind}${selected ? ' fe-flow-node--selected' : ''}${data.unreachable ? ' fe-flow-node--unreachable' : ''}${data.invalid ? ' fe-invalid-card' : ''}`}>
    <Handle type="target" position={Position.Left} isConnectable={isConnectable && data.kind === 'card'} />
    <span className="fe-flow-node__kind" title={t('flowchart.objectId', { id })}>{t(data.kind === 'card' ? 'flowchart.cardNode' : 'flowchart.telephoneNode', { id: data.entityId })}</span>
    <strong>{data.name}</strong>
    <span>{data.detail}</span>
    {data.company && <span>{data.company}</span>}
    <div className="fe-flow-node__badges">
      {data.starting && <span className="fe-badge">{t('common.startingCard')}</span>}
      {data.unreachable && <span className="fe-badge">{t('flowchart.unreachable')}</span>}
      {data.invalid && <span className="fe-badge fe-badge--error">{t('common.validationError')}</span>}
    </div>
    <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
  </div>
}

const nodeTypes = { event: FlowchartNode }

function chartNodes(flow: GameFlow, unreachable: Set<number>, invalidCardIds: ReadonlySet<number>, t: Translator): FlowNode[] {
  const positions = defaultEventPositions(flow)
  const starting = new Set(startingCardIds(flow))
  return [
    ...flow.namecards.map((card): FlowNode => ({
      id: String(card.objectId),
      type: 'event',
      position: flow.eventPositions?.[card.objectId] ?? positions[card.objectId],
      ariaLabel: eventLabel(flow, card.objectId, t) + (invalidCardIds.has(card.id) ? ` · ${t('common.validationError')}` : ''),
      data: {
        kind: 'card',
        entityId: card.id,
        name: card.personDisplayName || t('common.unnamedCard'),
        detail: `${card.year} - ${card.role || t('common.noRole')}`,
        company: card.company,
        starting: starting.has(card.id),
        unreachable: unreachable.has(card.objectId),
        invalid: invalidCardIds.has(card.id),
      },
    })),
    ...flow.telephoneEvents.map((phone): FlowNode => {
      const person = flow.persons.find((person) => person.id === phone.personId)
      return {
        id: String(phone.objectId),
        type: 'event',
        position: flow.eventPositions?.[phone.objectId] ?? positions[phone.objectId],
        ariaLabel: eventLabel(flow, phone.objectId, t),
        data: {
          kind: 'telephone',
          entityId: phone.id,
          name: person?.name || t('common.missingPerson'),
          detail: t('flowchart.callRequirements', { count: person?.namecards.length ?? 0 }),
          company: '',
          starting: false,
          unreachable: unreachable.has(phone.objectId),
          invalid: false,
        },
      }
    }),
  ]
}

function chartEdges(flow: GameFlow, t: Translator): FlowEdge[] {
  const ids = new Set([...flow.namecards, ...flow.telephoneEvents].map((event) => event.objectId))
  return [...flow.namecards, ...flow.telephoneEvents].flatMap((source) =>
    [...new Set(source.unlocks)].filter((target) => ids.has(target)).map((target) => {
      const automatic = isAutomaticRelation(flow, source.objectId, target)
      return {
        id: `${source.objectId}:${target}`,
        source: String(source.objectId),
        target: String(target),
        data: { automatic },
        deletable: !automatic,
        reconnectable: false,
        className: automatic ? 'fe-flow-edge fe-flow-edge--automatic' : 'fe-flow-edge',
        ariaLabel: t(automatic ? 'flowchart.automaticEdge' : 'flowchart.manualEdge', {
          source: eventLabel(flow, source.objectId, t), target: eventLabel(flow, target, t),
        }),
        label: automatic ? t('flowchart.automatic') : undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: automatic ? '#9a763b' : '#1b634b' },
      }
    }),
  )
}

export default function EventFlowchart({ flow, change, editCard, unreachableIds, invalidCardIds, disabled, reportError, showEvents }: {
  flow: GameFlow
  change: (operation: (flow: GameFlow) => GameFlow) => void
  editCard: (id: number) => void
  unreachableIds: number[]
  invalidCardIds: ReadonlySet<number>
  disabled: boolean
  reportError: (message: LocalizedText) => void
  showEvents: () => void
}) {
  const { t } = useI18n()
  const unreachable = useMemo(() => new Set(unreachableIds), [unreachableIds])
  const [nodes, setNodes] = useNodesState<FlowNode>(chartNodes(flow, unreachable, invalidCardIds, t))
  const [edges, setEdges] = useEdgesState<FlowEdge>(chartEdges(flow, t))
  const [instance, setInstance] = useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null)
  const [cardOwner, setCardOwner] = useState('')
  const [phoneOwner, setPhoneOwner] = useState('new')
  const [personName, setPersonName] = useState(() => t('editor.defaultPersonName'))
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [selectionEditor, setSelectionEditor] = useState<'selection' | 'relations' | null>(null)
  const workspace = useRef<HTMLDivElement>(null)
  const selectionPanel = useRef<HTMLElement>(null)
  const previousIds = useRef(new Set([...flow.namecards, ...flow.telephoneEvents].map((event) => String(event.objectId))))

  useEffect(() => {
    if (selectionEditor === 'relations') selectionPanel.current?.focus()
  }, [selectionEditor])

  useEffect(() => {
    const nextNodes = chartNodes(flow, unreachable, invalidCardIds, t)
    const added = nextNodes.find((node) => !previousIds.current.has(node.id))
    previousIds.current = new Set(nextNodes.map((node) => node.id))
    setNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]))
      return nextNodes.map((node) => ({
        ...previous.get(node.id),
        ...node,
        selected: added ? node.id === added.id : previous.get(node.id)?.selected === true,
      }))
    })
    setEdges((current) => {
      const selected = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id))
      return chartEdges(flow, t).map((edge) => ({ ...edge, selected: selected.has(edge.id) }))
    })
    if (added && instance) {
      void instance.setCenter(added.position.x + 115, added.position.y + 70, { zoom: 1, duration: 150 }).catch((error: unknown) => {
        reportError(msg('flowchart.focusFailed', { error: errorMessage(error) }))
      })
    }
  }, [flow, unreachable, invalidCardIds, instance, reportError, setNodes, setEdges, t])

  const ariaLabelConfig: AriaLabelConfig = {
    'node.a11yDescription.default': t('graphAccessibility.node'),
    'node.a11yDescription.keyboardDisabled': t('graphAccessibility.nodeKeyboardDisabled'),
    'node.a11yDescription.ariaLiveMessage': ({ x, y }) => t('graphAccessibility.nodeMoved', { x, y }),
    'edge.a11yDescription.default': t('graphAccessibility.edge'),
    'controls.ariaLabel': t('graphAccessibility.controls'),
    'controls.zoomIn.ariaLabel': t('graphAccessibility.zoomIn'),
    'controls.zoomOut.ariaLabel': t('graphAccessibility.zoomOut'),
    'controls.fitView.ariaLabel': t('graphAccessibility.fitView'),
    'controls.interactive.ariaLabel': t('graphAccessibility.interactive'),
    'minimap.ariaLabel': t('graphAccessibility.minimap'),
    'handle.ariaLabel': t('graphAccessibility.handle'),
  }

  const events = [...flow.namecards, ...flow.telephoneEvents].sort((a, b) => a.objectId - b.objectId)
  const phonesAvailable = flow.persons.filter((person) => !flow.telephoneEvents.some((phone) => phone.personId === person.id))
  const owner = flow.persons.some((person) => String(person.id) === cardOwner) ? cardOwner : ''
  const telephoneOwner = phoneOwner === 'new' || phonesAvailable.some((person) => String(person.id) === phoneOwner) ? phoneOwner : 'new'
  const source = events.find((event) => String(event.objectId) === sourceId)
  const targets = flow.namecards.filter((card) => card.objectId !== source?.objectId && !source?.unlocks.includes(card.objectId))
  const target = targets.some((card) => String(card.objectId) === targetId) ? targetId : ''
  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedEdges = edges.filter((edge) => edge.selected)
  const selectedCard = selectedNodes.length === 1 ? flow.namecards.find((card) => String(card.objectId) === selectedNodes[0].id) : undefined
  const missingEdges = events.flatMap((source) => source.unlocks.filter((id) => !events.some((event) => event.objectId === id)))

  const handleSelectionChange = useCallback<OnSelectionChangeFunc<FlowNode, FlowEdge>>(({ nodes, edges }) => {
    setSelectionEditor(nodes.length || edges.length ? 'selection' : null)
  }, [])

  const closeSelectionEditor = () => {
    setSelectionEditor(null)
    workspace.current?.focus({ preventScroll: true })
  }

  const handleNodesChange = (changes: NodeChange<FlowNode>[]) => {
    if (disabled) return
    setNodes((current) => applyNodeChanges(changes.filter((change) => change.type !== 'remove'), current))
    const positions: Record<number, EventPosition> = {}
    for (const change of changes) {
      if (change.type === 'position' && change.position && change.dragging !== true) {
        positions[Number(change.id)] = change.position
      }
    }
    if (Object.keys(positions).length) change((current) => setEventPositions(current, positions))
  }

  const handleEdgesChange = (changes: EdgeChange<FlowEdge>[]) => {
    if (!disabled) setEdges((current) => applyEdgeChanges(changes.filter((change) => change.type !== 'remove'), current))
  }

  const deleteSelection = () => {
    if (!instance) return
    void instance.deleteElements({ nodes: selectedNodes, edges: selectedEdges }).catch((error: unknown) => {
      reportError(msg('flowchart.deleteFailed', { error: errorMessage(error) }))
    })
  }

  return <section className="fe-flowchart" aria-labelledby="flowchart-title">
    <h2 id="flowchart-title">{t('flowchart.title')}</h2>
    <p className="fe-help" id="flowchart-help">{t(flow.mode === 'all-unlocked' ? 'flowchart.allUnlockedHelp' : 'flowchart.help')}</p>
    <div className="fe-flowchart-tools">
      <div className="fe-flowchart-create">
        <label>{t('flowchart.newCardOwner')}
          <select value={owner} onChange={(event) => setCardOwner(event.target.value)}>
            <option value="">{t('editor.unassignedDraft')}</option>
            {flow.persons.map((person) => <option key={person.id} value={person.id} disabled={person.namecards.length >= 8}>
              {person.name || t('common.personId', { id: person.id })} ({person.namecards.length}/8)
            </option>)}
          </select>
        </label>
        <button type="button" disabled={disabled || (owner !== '' && flow.persons.some((person) => String(person.id) === owner && person.namecards.length >= 8))}
          onClick={() => change((current) => addCard(current, owner === '' ? null : Number(owner)))}>{t('flowchart.addCard')}</button>
      </div>
      <div className="fe-flowchart-create">
        <label>{t('flowchart.telephonePerson')}
          <select value={telephoneOwner} onChange={(event) => setPhoneOwner(event.target.value)}>
            <option value="new">{t('flowchart.createPerson')}</option>
            {phonesAvailable.map((person) => <option key={person.id} value={person.id}>{person.name || t('common.personId', { id: person.id })}</option>)}
          </select>
        </label>
        {telephoneOwner === 'new' && <label>{t('flowchart.newPersonName')}
          <input value={personName} onChange={(event) => setPersonName(event.target.value)} />
        </label>}
        <button type="button" disabled={disabled || (telephoneOwner === 'new' && !personName.trim())}
          onClick={() => change((current) => telephoneOwner === 'new'
            ? addPerson(current, personName.trim())
            : addTelephone(current, Number(telephoneOwner)))}>{t('flowchart.addTelephone')}</button>
      </div>
      <button type="button" disabled={disabled} aria-haspopup="dialog"
        aria-controls="flowchart-selection-editor" aria-expanded={selectionEditor !== null}
        onClick={() => setSelectionEditor('relations')}>{t('flowchart.openSelection')}</button>
    </div>
    {missingEdges.length > 0 && <div className="fe-alert" role="alert">
      {t('flowchart.missingRelations', { count: missingEdges.length })}
      <button type="button" onClick={showEvents}>{t('flowchart.openEvents')}</button>
    </div>}
    <div className="fe-flowchart-layout" ref={workspace} role="region" aria-label={t('flowchart.editableLabel')} tabIndex={-1}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && selectionEditor !== null) {
          event.stopPropagation()
          closeSelectionEditor()
        }
      }}>
      <div className="fe-flowchart-canvas" aria-describedby="flowchart-help">
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes}
          edges={edges}
          ariaLabelConfig={ariaLabelConfig}
          nodeTypes={nodeTypes}
          onInit={setInstance}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onSelectionChange={handleSelectionChange}
          onNodeClick={() => setSelectionEditor('selection')}
          onEdgeClick={() => setSelectionEditor('selection')}
          onPaneClick={() => setSelectionEditor(null)}
          onConnect={({ source, target }) => change((current) => setUnlock(current, Number(source), Number(target), true))}
          isValidConnection={({ source, target }) => source !== target &&
            flow.namecards.some((card) => String(card.objectId) === target) &&
            !events.find((event) => String(event.objectId) === source)?.unlocks.includes(Number(target))}
          onNodeDoubleClick={(_, node) => { if (node.data.kind === 'card') editCard(node.data.entityId) }}
          onBeforeDelete={async ({ nodes: removing }) => {
            if (disabled) return false
            const phones = flow.telephoneEvents.filter((phone) => removing.some((node) => node.id === String(phone.objectId)))
            if (phones.length) {
              const names = phones.map((phone) => flow.persons.find((person) => person.id === phone.personId)?.name || t('common.personId', { id: phone.personId }))
              return window.confirm(t('flowchart.confirmDeleteTelephones', { names: names.join(', ') }))
            }
            return removing.length === 0 || window.confirm(t('flowchart.confirmDeleteCards', { count: removing.length }))
          }}
          onDelete={({ nodes: removedNodes, edges: removedEdges }) => change((current) => removeGraphSelection(
            current,
            removedNodes.map((node) => Number(node.id)),
            removedEdges.map((edge) => ({ sourceId: Number(edge.source), targetId: Number(edge.target) })),
          ))}
          onError={(code, detail) => reportError(msg('flowchart.error', { code, detail }))}
          nodesDraggable={!disabled}
          nodesConnectable={!disabled}
          elementsSelectable={!disabled}
          deleteKeyCode={disabled ? null : ['Backspace', 'Delete']}
          minZoom={0.15}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: 0.15, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          aria-label={t('flowchart.editableLabel')}
        >
          <Background gap={20} color="#ccd7cb" />
          <Controls showInteractive={false} />
          <Panel position="top-right" className="react-flow__attribution">
            <a href="https://reactflow.dev/attribution" target="_blank" rel="noopener noreferrer"
              aria-label={t('graphAccessibility.attribution')}>{t('graphAccessibility.brand')}</a>
          </Panel>
        </ReactFlow>
        {events.length === 0 && <p className="fe-flowchart-empty">{t('flowchart.empty')}</p>}
      </div>
      {selectionEditor !== null && <aside className="fe-panel fe-flowchart-selection" ref={selectionPanel}
        id="flowchart-selection-editor" role="dialog" aria-modal="false"
        aria-label={t('flowchart.selectionLabel')} tabIndex={-1}>
        <div className="fe-flowchart-selection-heading">
          <h3>{t('flowchart.selection')}</h3>
          <button type="button" className="fe-flowchart-selection-close" aria-label={t('flowchart.closeSelection')}
            onClick={closeSelectionEditor}>X</button>
        </div>
        <p className="fe-help">{t('flowchart.selectionCount', { nodes: selectedNodes.length, edges: selectedEdges.length })}</p>
        {selectedNodes.map((node) => <p key={node.id}>{eventLabel(flow, Number(node.id), t)}</p>)}
        {selectedEdges.map((edge) => <p key={edge.id}>
          {t('flowchart.selectedEdge', {
            source: edge.source, target: edge.target,
            description: t(edge.data?.automatic ? 'flowchart.protectedEdge' : 'flowchart.editableEdge'),
          })}
        </p>)}
        {selectedCard && <>
          <label className="fe-check"><input type="checkbox" checked={startingCardIds(flow).includes(selectedCard.id)}
            disabled={flow.mode === 'all-unlocked'}
            onChange={(event) => change((current) => setStartingCard(current, selectedCard.id, event.target.checked))} />{t('common.startingCard')}</label>
          <button type="button" onClick={() => editCard(selectedCard.id)}>{t('flowchart.editCardDetails')}</button>
        </>}
        <button type="button" className="fe-danger" disabled={disabled || !instance || (!selectedNodes.length && !selectedEdges.some((edge) => edge.deletable !== false))}
          onClick={deleteSelection}>{t('flowchart.deleteSelection')}</button>
        <p className="fe-help">{t('flowchart.deleteHelp')}</p>
        <h3>{t('flowchart.addDirectedRelation')}</h3>
        <form className="fe-flowchart-relation" onSubmit={(event) => {
          event.preventDefault()
          if (!source || target === '') {
            reportError(msg('flowchart.chooseSourceAndTarget'))
            return
          }
          change((current) => setUnlock(current, source.objectId, Number(target), true))
          setTargetId('')
        }}>
          <label>{t('flowchart.source')}
            <select value={source ? sourceId : ''} onChange={(event) => { setSourceId(event.target.value); setTargetId('') }}>
              <option value="">{t('flowchart.selectSource')}</option>
              {events.map((event) => <option key={event.objectId} value={event.objectId}>{eventLabel(flow, event.objectId, t)}</option>)}
            </select>
          </label>
          <label>{t('flowchart.target')}
            <select value={target} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">{t('common.selectTarget')}</option>
              {targets.map((card) => <option key={card.objectId} value={card.objectId}>{cardLabel(card, t)}</option>)}
            </select>
          </label>
          <button type="submit" disabled={disabled || !source || target === ''}>{t('common.addRelation')}</button>
        </form>
        <p className="fe-help">{t('flowchart.relationHelp')}</p>
      </aside>}
    </div>
  </section>
}
