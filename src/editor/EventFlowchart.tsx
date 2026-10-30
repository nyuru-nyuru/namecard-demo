import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { isAutomaticRelation, type EventPosition, type GameFlow } from '../game/gameflow.ts'
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
import '@xyflow/react/dist/style.css'
import './flowchart.css'

type EventNodeData = {
  kind: 'card' | 'telephone'
  name: string
  detail: string
  company: string
  starting: boolean
  unreachable: boolean
}
type FlowNode = Node<EventNodeData, 'event'>
type FlowEdge = Edge<{ automatic: boolean }>

function FlowchartNode({ id, data, selected, isConnectable }: NodeProps<FlowNode>) {
  return <div className={`fe-flow-node fe-flow-node--${data.kind}${selected ? ' fe-flow-node--selected' : ''}${data.unreachable ? ' fe-flow-node--unreachable' : ''}`}>
    <Handle type="target" position={Position.Left} isConnectable={isConnectable && data.kind === 'card'} />
    <span className="fe-flow-node__kind">{data.kind === 'card' ? 'Card' : 'Telephone'} #{id}</span>
    <strong>{data.name}</strong>
    <span>{data.detail}</span>
    {data.company && <span>{data.company}</span>}
    <div className="fe-flow-node__badges">
      {data.starting && <span className="fe-badge">Starting card</span>}
      {data.unreachable && <span className="fe-badge">Unreachable</span>}
    </div>
    <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
  </div>
}

const nodeTypes = { event: FlowchartNode }

function chartNodes(flow: GameFlow, unreachable: Set<number>): FlowNode[] {
  const positions = defaultEventPositions(flow)
  return [
    ...flow.namecards.map((card): FlowNode => ({
      id: String(card.id),
      type: 'event',
      position: flow.eventPositions?.[card.id] ?? positions[card.id],
      ariaLabel: eventLabel(flow, card.id),
      data: {
        kind: 'card',
        name: card.personDisplayName || 'Unnamed card',
        detail: `${card.year} - ${card.role || 'No role'}`,
        company: card.company,
        starting: flow.startingCards.includes(card.id),
        unreachable: unreachable.has(card.id),
      },
    })),
    ...flow.telephoneEvents.map((phone): FlowNode => {
      const person = flow.persons.find((person) => person.id === phone.personId)
      return {
        id: String(phone.id),
        type: 'event',
        position: flow.eventPositions?.[phone.id] ?? positions[phone.id],
        ariaLabel: eventLabel(flow, phone.id),
        data: {
          kind: 'telephone',
          name: person?.name || 'Missing person',
          detail: `${person?.namecards.length ?? 0} cards required before calling`,
          company: '',
          starting: false,
          unreachable: unreachable.has(phone.id),
        },
      }
    }),
  ]
}

function chartEdges(flow: GameFlow): FlowEdge[] {
  const ids = new Set([...flow.namecards, ...flow.telephoneEvents].map((event) => event.id))
  return [...flow.namecards, ...flow.telephoneEvents].flatMap((source) =>
    [...new Set(source.unlocks)].filter((target) => ids.has(target)).map((target) => {
      const automatic = isAutomaticRelation(flow, source.id, target)
      return {
        id: `${source.id}:${target}`,
        source: String(source.id),
        target: String(target),
        data: { automatic },
        deletable: !automatic,
        reconnectable: false,
        className: automatic ? 'fe-flow-edge fe-flow-edge--automatic' : 'fe-flow-edge',
        ariaLabel: `${automatic ? 'Automatic protected relation' : 'Unlock relation'} from #${source.id} to #${target}`,
        label: automatic ? 'Automatic' : undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: automatic ? '#9a763b' : '#1b634b' },
      }
    }),
  )
}

export default function EventFlowchart({ flow, change, editCard, unreachableIds, disabled, reportError, showEvents }: {
  flow: GameFlow
  change: (operation: (flow: GameFlow) => GameFlow) => void
  editCard: (id: number) => void
  unreachableIds: number[]
  disabled: boolean
  reportError: (message: string) => void
  showEvents: () => void
}) {
  const unreachable = useMemo(() => new Set(unreachableIds), [unreachableIds])
  const [nodes, setNodes] = useNodesState<FlowNode>(chartNodes(flow, unreachable))
  const [edges, setEdges] = useEdgesState<FlowEdge>(chartEdges(flow))
  const [instance, setInstance] = useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null)
  const [cardOwner, setCardOwner] = useState('')
  const [phoneOwner, setPhoneOwner] = useState('new')
  const [personName, setPersonName] = useState('New person')
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const previousIds = useRef(new Set([...flow.namecards, ...flow.telephoneEvents].map((event) => String(event.id))))

  useEffect(() => {
    const nextNodes = chartNodes(flow, unreachable)
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
      return chartEdges(flow).map((edge) => ({ ...edge, selected: selected.has(edge.id) }))
    })
    if (added && instance) {
      void instance.setCenter(added.position.x + 115, added.position.y + 70, { zoom: 1, duration: 150 }).catch((error: unknown) => {
        reportError(`Could not focus the new event: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }, [flow, unreachable, instance, reportError, setNodes, setEdges])

  const events = [...flow.namecards, ...flow.telephoneEvents].sort((a, b) => a.id - b.id)
  const phonesAvailable = flow.persons.filter((person) => !flow.telephoneEvents.some((phone) => phone.personId === person.id))
  const owner = flow.persons.some((person) => String(person.id) === cardOwner) ? cardOwner : ''
  const telephoneOwner = phoneOwner === 'new' || phonesAvailable.some((person) => String(person.id) === phoneOwner) ? phoneOwner : 'new'
  const source = events.find((event) => String(event.id) === sourceId)
  const targets = flow.namecards.filter((card) => card.id !== source?.id && !source?.unlocks.includes(card.id))
  const target = targets.some((card) => String(card.id) === targetId) ? targetId : ''
  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedEdges = edges.filter((edge) => edge.selected)
  const selectedCard = selectedNodes.length === 1 ? flow.namecards.find((card) => String(card.id) === selectedNodes[0].id) : undefined
  const missingEdges = events.flatMap((source) => source.unlocks.filter((id) => !events.some((event) => event.id === id)))

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
      reportError(`Flowchart deletion failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  return <section className="fe-flowchart" aria-labelledby="flowchart-title">
    <h2 id="flowchart-title">Event flowchart</h2>
    <p className="fe-help" id="flowchart-help">Drag events to arrange them; positions are saved with the gameflow.
      Connect a right-hand handle to a card's left-hand handle, or use the relation form.
      Solid arrows are editable; dashed card-to-telephone arrows are automatic and protected.
      All incoming conditions must be satisfied (AND). Select nodes or edges and press Delete or use the delete button.</p>
    <div className="fe-flowchart-tools">
      <div className="fe-flowchart-create">
        <label>New card owner
          <select value={owner} onChange={(event) => setCardOwner(event.target.value)}>
            <option value="">Unassigned draft</option>
            {flow.persons.map((person) => <option key={person.id} value={person.id} disabled={person.namecards.length >= 8}>
              {person.name || `Person #${person.id}`} ({person.namecards.length}/8)
            </option>)}
          </select>
        </label>
        <button type="button" disabled={disabled || (owner !== '' && flow.persons.some((person) => String(person.id) === owner && person.namecards.length >= 8))}
          onClick={() => change((current) => addCard(current, owner === '' ? null : Number(owner)))}>+ Card node</button>
      </div>
      <div className="fe-flowchart-create">
        <label>Telephone person
          <select value={telephoneOwner} onChange={(event) => setPhoneOwner(event.target.value)}>
            <option value="new">Create a new person</option>
            {phonesAvailable.map((person) => <option key={person.id} value={person.id}>{person.name || `Person #${person.id}`}</option>)}
          </select>
        </label>
        {telephoneOwner === 'new' && <label>New person name
          <input value={personName} onChange={(event) => setPersonName(event.target.value)} />
        </label>}
        <button type="button" disabled={disabled || (telephoneOwner === 'new' && !personName.trim())}
          onClick={() => change((current) => telephoneOwner === 'new'
            ? addPerson(current, personName.trim())
            : addTelephone(current, Number(telephoneOwner)))}>+ Telephone node</button>
      </div>
    </div>
    {missingEdges.length > 0 && <div className="fe-alert" role="alert">
      {missingEdges.length} relation(s) point to missing events and cannot be drawn. Repair them in the linked Event View.
      <button type="button" onClick={showEvents}>Open Event View</button>
    </div>}
    <div className="fe-flowchart-layout">
      <div className="fe-flowchart-canvas" aria-describedby="flowchart-help">
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={setInstance}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={({ source, target }) => change((current) => setUnlock(current, Number(source), Number(target), true))}
          isValidConnection={({ source, target }) => source !== target &&
            flow.namecards.some((card) => String(card.id) === target) &&
            !events.find((event) => String(event.id) === source)?.unlocks.includes(Number(target))}
          onNodeDoubleClick={(_, node) => { if (node.data.kind === 'card') editCard(Number(node.id)) }}
          onBeforeDelete={async ({ nodes: removing }) => {
            if (disabled) return false
            const phones = flow.telephoneEvents.filter((phone) => removing.some((node) => node.id === String(phone.id)))
            if (phones.length) {
              const names = phones.map((phone) => flow.persons.find((person) => person.id === phone.personId)?.name || `Person #${phone.personId}`)
              return window.confirm(`Delete the selected telephone event(s) and remove their person(s): ${names.join(', ')}?\n\nTheir cards will be kept as unassigned drafts unless also selected for deletion. All edges to and from deleted nodes will be removed. This cannot be undone.`)
            }
            return removing.length === 0 || window.confirm(`Delete ${removing.length} card event(s) and every incoming/outgoing edge?\n\nDeleting a person's last card also removes their telephone, but keeps the empty person. This cannot be undone.`)
          }}
          onDelete={({ nodes: removedNodes, edges: removedEdges }) => change((current) => removeGraphSelection(
            current,
            removedNodes.map((node) => Number(node.id)),
            removedEdges.map((edge) => ({ sourceId: Number(edge.source), targetId: Number(edge.target) })),
          ))}
          onError={(code, detail) => reportError(`Flowchart error ${code}: ${detail}`)}
          nodesDraggable={!disabled}
          nodesConnectable={!disabled}
          elementsSelectable={!disabled}
          deleteKeyCode={disabled ? null : ['Backspace', 'Delete']}
          minZoom={0.15}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: 0.15, maxZoom: 1 }}
          attributionPosition="top-right"
          aria-label="Editable event flowchart"
        >
          <Background gap={20} color="#ccd7cb" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {events.length === 0 && <p className="fe-flowchart-empty">Add a card or telephone node to start the flowchart.</p>}
      </div>
      <aside className="fe-panel fe-flowchart-sidebar" aria-label="Flowchart selection and relations">
        <h3>Selection</h3>
        <p className="fe-help">{selectedNodes.length} node(s), {selectedEdges.length} edge(s) selected.</p>
        {selectedNodes.map((node) => <p key={node.id}>{eventLabel(flow, Number(node.id))}</p>)}
        {selectedEdges.map((edge) => <p key={edge.id}>
          #{edge.source} to #{edge.target}: {edge.data?.automatic ? 'Automatic - cannot be removed independently.' : 'Editable unlock condition.'}
        </p>)}
        {selectedCard && <>
          <label className="fe-check"><input type="checkbox" checked={flow.startingCards.includes(selectedCard.id)}
            onChange={(event) => change((current) => setStartingCard(current, selectedCard.id, event.target.checked))} />Starting card</label>
          <button type="button" onClick={() => editCard(selectedCard.id)}>Edit card details</button>
        </>}
        <button type="button" className="fe-danger" disabled={disabled || !instance || (!selectedNodes.length && !selectedEdges.some((edge) => edge.deletable !== false))}
          onClick={deleteSelection}>Delete selected nodes / edges</button>
        <p className="fe-help">Deleting a telephone also removes its person after confirmation, keeping their cards as unassigned drafts.</p>
        <h3>Add a directed relation</h3>
        <form className="fe-flowchart-relation" onSubmit={(event) => {
          event.preventDefault()
          if (!source || target === '') {
            reportError('Choose an existing source event and target card.')
            return
          }
          change((current) => setUnlock(current, source.id, Number(target), true))
          setTargetId('')
        }}>
          <label>Source event
            <select value={source ? sourceId : ''} onChange={(event) => { setSourceId(event.target.value); setTargetId('') }}>
              <option value="">Select source event</option>
              {events.map((event) => <option key={event.id} value={event.id}>{eventLabel(flow, event.id)}</option>)}
            </select>
          </label>
          <label>Target card
            <select value={target} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Select target card</option>
              {targets.map((card) => <option key={card.id} value={card.id}>{cardLabel(card)}</option>)}
            </select>
          </label>
          <button type="submit" disabled={disabled || !source || target === ''}>Add relation</button>
        </form>
        <p className="fe-help">Telephone targets are derived from card ownership, not added manually. Double-click a card to edit its fields.</p>
      </aside>
    </div>
  </section>
}
