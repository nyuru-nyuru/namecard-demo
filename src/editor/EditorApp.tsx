import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { downloadFlow, loadGameFlow } from '../game/files.ts'
import {
  ACTIVE_FLOWCHART_KEY,
  createFlowchart,
  editorFlowchartUrl,
  getFlowchart,
  getFlowcharts,
  playFlowchartUrl,
  renameFlowchart,
  saveFlowchart,
  type FlowchartDocument,
  type FlowchartSummary,
} from '../game/flowcharts.ts'
import {
  incomingConditions,
  isAutomaticRelation,
  synchronizeFlow,
  unreachableEventIds,
  validateFlow,
  type GameCard,
  type GameFlow,
} from '../game/gameflow.ts'
import {
  EDITOR_DRAFT_KEY,
  addCard,
  addPerson,
  readEditorDraft,
  removeCard,
  removePerson,
  renamePerson,
  setStartingCard,
  setUnlock,
  updateCard,
} from './model.ts'
import EventFlowchart from './EventFlowchart.tsx'
import { cardLabel, eventLabel } from './labels.ts'
import './editor.css'

type ChangeFlow = (operation: (flow: GameFlow) => GameFlow) => void

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function Arrow({ automatic = false }: { automatic?: boolean }) {
  return <svg className={automatic ? 'fe-arrow fe-arrow--auto' : 'fe-arrow'} viewBox="0 0 64 18" aria-hidden="true">
    <path d="M1 9 H58 M49 2 L58 9 L49 16" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
}

function CardEditor({ card, flow, change }: { card: GameCard; flow: GameFlow; change: ChangeFlow }) {
  const patch = (value: Parameters<typeof updateCard>[2]) => change((current) => updateCard(current, card.id, value))
  const ownerExists = card.personId === null || flow.persons.some((person) => person.id === card.personId)
  return <section className="fe-panel fe-card-editor" aria-labelledby="card-editor-title">
    <div className="fe-section-heading">
      <h2 id="card-editor-title">Edit card #{card.id}</h2>
      <span className="fe-badge">ID is permanent</span>
    </div>
    <label>Owner
      <select value={card.personId ?? ''} onChange={(event) => patch({ personId: event.target.value === '' ? null : Number(event.target.value) })}>
        <option value="">Unassigned draft</option>
        {!ownerExists && <option value={card.personId!}>Missing person #{card.personId}</option>}
        {flow.persons.map((person) => <option key={person.id} value={person.id}
          disabled={person.id !== card.personId && person.namecards.length >= 8}>
          #{person.id} · {person.name || 'Unnamed person'} ({person.namecards.length}/8)
        </option>)}
      </select>
    </label>
    <p className="fe-help">Ownership updates the answer key and telephone links. Display name is independent.</p>
    <label>Display name<input value={card.personDisplayName} onChange={(event) => patch({ personDisplayName: event.target.value })} /></label>
    <label>Company<input value={card.company} onChange={(event) => patch({ company: event.target.value })} /></label>
    <label>Role<input value={card.role} onChange={(event) => patch({ role: event.target.value })} /></label>
    <label>Year<input type="number" min="1" max="9999" step="1" value={card.year || ''}
      onChange={(event) => patch({ year: Number(event.target.value) })} /></label>
    <label>Back text<textarea rows={4} value={card.backText} onChange={(event) => patch({ backText: event.target.value })} /></label>
    <p className="fe-help">Reading nonblank back text satisfies this card’s outgoing card conditions. Telephone calls are separate.</p>
    <label className="fe-check">
      <input type="checkbox" checked={flow.startingCards.includes(card.id)}
        onChange={(event) => change((current) => setStartingCard(current, card.id, event.target.checked))} />
      Available in the starting bin
    </label>
    <button className="fe-danger" type="button" onClick={() => {
      const lastCard = card.personId !== null && flow.namecards.filter((item) => item.personId === card.personId).length === 1
      if (window.confirm(`Permanently delete card #${card.id} and all its incoming/outgoing relations?${lastCard ? " This is the person's last card, so their telephone event and its relations will also be removed. The empty person will be kept." : ''}`)) {
        change((current) => removeCard(current, card.id))
      }
    }}>Delete card #{card.id}</button>
  </section>
}

function PersonView({ flow, change, selectedCard, selectCard }: {
  flow: GameFlow; change: ChangeFlow; selectedCard: number | null; selectCard: (id: number) => void
}) {
  const selected = flow.namecards.find((card) => card.id === selectedCard)
  const unassigned = flow.namecards.filter((card) => !flow.persons.some((person) => person.id === card.personId))
  const createCard = (personId: number | null) => change((current) => {
    const updated = addCard(current, personId)
    selectCard(current.nextId)
    return updated
  })
  const cards = (items: GameCard[]) => <ol className="fe-card-list">
    {items.map((card) => <li key={card.id}>
      <button className={`fe-card-tile${selectedCard === card.id ? ' fe-selected' : ''}`} type="button"
        aria-pressed={selectedCard === card.id} onClick={() => selectCard(card.id)}>
        <span><strong>{card.year}</strong> · #{card.id}{flow.startingCards.includes(card.id) ? ' · Starting' : ''}</span>
        <strong>{card.personDisplayName || 'Unnamed card'}</strong>
        <span>{card.role || 'No role'} · {card.company || 'No company'}</span>
      </button>
    </li>)}
  </ol>
  return <div className="fe-person-layout">
    <div className="fe-person-list">
      <div className="fe-section-heading">
        <div><h2>People &amp; answer keys</h2><p className="fe-help">Cards are ordered by year, then ID. Each person has one binder page with up to eight cards.</p></div>
        <button type="button" onClick={() => change((current) => addPerson(current))}>+ Person</button>
      </div>
      {flow.persons.length === 0 && <p className="fe-empty">No people yet. Add a person to create their binder page and telephone event.</p>}
      {flow.persons.map((person) => <section key={person.id} className="fe-panel" aria-label={`Person #${person.id}`}>
        <div className="fe-section-heading">
          <label className="fe-person-name">Person #{person.id} · name
            <input value={person.name} onChange={(event) => change((current) => renamePerson(current, person.id, event.target.value))} />
          </label>
          <span className="fe-badge">{person.namecards.length}/8 cards</span>
        </div>
        {cards(person.namecards.flatMap((id) => flow.namecards.filter((card) => card.id === id)))}
        {person.namecards.length === 0 && <p className="fe-help">{flow.telephoneEvents.some((phone) => phone.personId === person.id)
          ? 'An empty page is allowed. Its telephone can be called immediately.'
          : 'This empty person has no telephone. Adding or assigning a card recreates it; you can also add a telephone in Flowchart View.'}</p>}
        <div className="fe-actions">
          <button type="button" disabled={person.namecards.length >= 8} onClick={() => createCard(person.id)}>+ Card for this person</button>
          <button type="button" className="fe-danger" onClick={() => {
            if (window.confirm(`Remove ${person.name || `person #${person.id}`} and their telephone event? All ${person.namecards.length} cards will be kept as unassigned drafts. Telephone unlock relations will be removed.`)) {
              change((current) => removePerson(current, person.id))
            }
          }}>Remove person; keep cards</button>
        </div>
      </section>)}
      <section className="fe-panel" aria-labelledby="unassigned-title">
        <div className="fe-section-heading">
          <h2 id="unassigned-title">Unassigned drafts ({unassigned.length})</h2>
          <button type="button" onClick={() => createCard(null)}>+ Unassigned card</button>
        </div>
        <p className="fe-help">Drafts are saved locally, but every card needs an owner before game export.</p>
        {cards(unassigned)}
      </section>
    </div>
    <aside className="fe-edit-column">
      {selected
        ? <CardEditor card={selected} flow={flow} change={change} />
        : <div className="fe-panel fe-empty">Select a card to edit its fields, owner, or starting status.</div>}
    </aside>
  </div>
}

function EventNode({ flow, id, change, editCard }: {
  flow: GameFlow; id: number; change: ChangeFlow; editCard: (id: number) => void
}) {
  const [target, setTarget] = useState('')
  const card = flow.namecards.find((item) => item.id === id)
  const phone = flow.telephoneEvents.find((item) => item.id === id)
  const source = card ?? phone!
  const manual = source.unlocks.filter((targetId) => !isAutomaticRelation(flow, id, targetId))
  const automatic = source.unlocks.filter((targetId) => isAutomaticRelation(flow, id, targetId))
  const incoming = card ? incomingConditions(flow, id) : flow.persons.find((person) => person.id === phone?.personId)?.namecards ?? []
  const targets = flow.namecards.filter((item) => item.id !== id && !source.unlocks.includes(item.id))
  const relation = (targetId: number, auto: boolean) => <li key={targetId} className="fe-relation">
    <span className="fe-edge-origin">#{id}</span><Arrow automatic={auto} />
    <span className="fe-sr-only">{auto ? 'contributes to the exact completed page for' : 'is an unlock condition for'}</span>
    <a href={`#event-${targetId}`}>{eventLabel(flow, targetId)}</a>
    {auto
      ? <span className="fe-badge">Automatic · read-only</span>
      : <button type="button" className="fe-remove-edge" aria-label={`Remove relation from #${id} to #${targetId}`}
        onClick={() => change((current) => setUnlock(current, id, targetId, false))}>Remove</button>}
  </li>
  return <article id={`event-${id}`} className={`fe-panel fe-event-node${phone ? ' fe-event-node--phone' : ''}`} tabIndex={-1}>
    <div className="fe-section-heading">
      <h3>{eventLabel(flow, id)}</h3>
      {card && <button type="button" onClick={() => editCard(id)}>Edit card</button>}
    </div>
    {card ? <>
      <label className="fe-check"><input type="checkbox" checked={flow.startingCards.includes(id)}
        onChange={(event) => change((current) => setStartingCard(current, id, event.target.checked))} />Starting card</label>
      <p className="fe-help">Source activates when the player reads this card’s nonblank back text.</p>
      <p className="fe-back-preview">{card.backText || 'Blank back — add text before using card-to-card relations.'}</p>
      <strong>{flow.startingCards.includes(id) ? 'Starting cards bypass incoming requirements.' : 'Unlock requires ALL incoming sources (AND):'}</strong>
    </> : <>
      <p className="fe-help">Activates only when the player calls after completing this person’s exact page in chronological order. Reading card backs does not activate the telephone.</p>
      <strong>Automatic prerequisites — complete this exact page:</strong>
    </>}
    {incoming.length
      ? <ul className="fe-incoming">{incoming.map((sourceId) => <li key={sourceId}><a href={`#event-${sourceId}`}>{eventLabel(flow, sourceId)}</a></li>)}</ul>
      : <p className="fe-help">{card
        ? flow.startingCards.includes(id) ? 'Available at the start; no incoming conditions.' : 'No incoming conditions. Make this a starting card or add a relation from another event.'
        : 'Empty page: no card prerequisites; the player must still make the call.'}</p>}
    <h4>Outgoing directed relations</h4>
    {manual.length + automatic.length === 0 && <p className="fe-help">No outgoing relations.</p>}
    <ul className="fe-relations">{manual.map((targetId) => relation(targetId, false))}{automatic.map((targetId) => relation(targetId, true))}</ul>
    <form className="fe-add-edge" onSubmit={(event) => {
      event.preventDefault()
      if (target !== '' && targets.some((item) => item.id === Number(target))) {
        change((current) => setUnlock(current, id, Number(target), true))
        setTarget('')
      }
    }}>
      <label>Add a card this {card ? 'card' : 'telephone'} unlocks
        <select value={targets.some((item) => String(item.id) === target) ? target : ''} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Select target card</option>
          {targets.map((item) => <option key={item.id} value={item.id}>{cardLabel(item)}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!targets.some((item) => String(item.id) === target)}>Add relation</button>
    </form>
  </article>
}

function EventView({ flow, change, editCard }: { flow: GameFlow; change: ChangeFlow; editCard: (id: number) => void }) {
  const sources = [...flow.namecards, ...flow.telephoneEvents].sort((a, b) => a.id - b.id)
  return <section aria-labelledby="events-title">
    <h2 id="events-title">Event graph · linked adjacency view</h2>
    <p className="fe-help">Solid arrows are editable card-unlock conditions. Dashed arrows are automatic ownership-to-telephone links.
      Multiple incoming conditions are AND, never OR. Starting cards are already available.</p>
    <nav className="fe-event-index" aria-label="Jump to event">
      {sources.map((source) => <a key={source.id} href={`#event-${source.id}`}>{flow.namecards.some((card) => card.id === source.id) ? 'Card' : 'Phone'} #{source.id}</a>)}
    </nav>
    {sources.length === 0 && <p className="fe-empty">Add people and cards in Person View or Flowchart View to build the event graph.</p>}
    <div className="fe-event-list">{sources.map((source) => <EventNode key={source.id} flow={flow} id={source.id} change={change} editCard={editCard} />)}</div>
  </section>
}

function UnreachableEventsWarning({ flow, ids }: { flow: GameFlow; ids: number[] }) {
  const [visible, setVisible] = useState(true)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!visible || focused) return
    const timeout = window.setTimeout(() => setVisible(false), 5000)
    return () => window.clearTimeout(timeout)
  }, [visible, focused])

  if (!visible) return null
  return <aside className="fe-reachability-warning" role="status" aria-live="polite" aria-label="Unreachable events"
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
    }}>
    <div className="fe-reachability-warning__heading">
      <strong>Warning: {ids.length} unreachable event{ids.length === 1 ? '' : 's'}</strong>
      <button type="button" className="fe-reachability-warning__dismiss" aria-label="Dismiss unreachable events warning"
        onClick={() => setVisible(false)}>X</button>
    </div>
    <p>These cards or telephone calls cannot be reached from the starting cards. All incoming conditions must be satisfied.</p>
    <details>
      <summary>Show unreachable events</summary>
      <ul>{ids.map((id) => <li key={id}>{eventLabel(flow, id)}</li>)}</ul>
    </details>
  </aside>
}

export default function EditorApp() {
  const [flowchart, setFlowchart] = useState<FlowchartDocument | null>(null)
  const [flowcharts, setFlowcharts] = useState<FlowchartSummary[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const [view, setView] = useState<'people' | 'events' | 'flowchart'>('flowchart')
  const [revision, setRevision] = useState(0)
  const [selectedCard, setSelectedCard] = useState<number | null>(null)
  const [busy, setBusy] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const unsavedChanges = useRef(false)
  const flow = flowchart?.gameflow ?? null

  const commit = useCallback((next: FlowchartDocument): boolean => {
    setFlowchart(next)
    setTitleDraft(next.title)
    setFlowcharts((current) => current.some((item) => item.id === next.id)
      ? current.map((item) => item.id === next.id ? { id: next.id, title: next.title } : item)
      : [...current, { id: next.id, title: next.title }])
    window.history.replaceState(window.history.state, '', editorFlowchartUrl(next.id))
    unsavedChanges.current = true
    try {
      saveFlowchart(next)
      localStorage.setItem(ACTIVE_FLOWCHART_KEY, next.id)
      setSaved(JSON.stringify(next))
      unsavedChanges.current = false
      setStorageError('')
      return true
    } catch (error) {
      setStorageError(`This flowchart could not be saved locally: ${message(error)} Keep this tab open, retry saving, or download a draft backup.`)
      return false
    }
  }, [])

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const existing = getFlowcharts()
        if (active) setFlowcharts(existing)
        const requestedId = new URLSearchParams(window.location.search).get('flowchart')
        if (requestedId !== null || existing.length > 0) {
          const id = requestedId ?? localStorage.getItem(ACTIVE_FLOWCHART_KEY) ?? existing[0].id
          const restored = getFlowchart(id)
          if (active) {
            commit({ ...restored, gameflow: readEditorDraft(restored.gameflow) })
            setNotice(`Opened "${restored.title}". Each flowchart keeps its own gameflow JSON.`)
          }
          return
        }
        const draft = localStorage.getItem(EDITOR_DRAFT_KEY)
        if (draft !== null) {
          const restored = readEditorDraft(JSON.parse(draft))
          if (active) {
            commit(createFlowchart(restored, 'My flowchart'))
            setNotice('Your previous editor draft is open as a flowchart. The original draft has been kept as a backup.')
          }
          return
        }
      } catch (error) {
        if (active) setLoadError(`Could not open a saved flowchart: ${message(error)} No stored data has been overwritten. Choose another saved flowchart, import JSON, or create a new flowchart.`)
        return
      }
      try {
        const loaded = await loadGameFlow()
        if (active) {
          commit(createFlowchart(readEditorDraft(loaded.flow), loaded.source.startsWith('sample_gameflow') ? 'Sample flowchart' : 'My flowchart'))
          setNotice(`Loaded ${loaded.source}.`)
        }
      } catch (error) {
        if (active) setLoadError(`Could not load a game flow: ${message(error)} Import JSON, retry the public file, or create a new flowchart.`)
      }
    }
    void initialize().finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [commit])

  const serialized = flowchart ? JSON.stringify(flowchart) : null
  const unsaved = serialized !== saved
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => {
      if (!unsavedChanges.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const change: ChangeFlow = (operation) => {
    if (!flowchart) return
    try {
      commit({ ...flowchart, gameflow: operation(flowchart.gameflow) })
      setActionError('')
      setNotice('')
    } catch (error) {
      setActionError(message(error))
    }
  }
  const errors = flow ? validateFlow(flow) : []
  const unreachable = useMemo(() => flow ? unreachableEventIds(flow) : [], [flow])
  const editCard = (id: number) => { setSelectedCard(id); setView('people') }
  const openDocument = (next: FlowchartDocument, detail: string) => {
    commit(next)
    setRevision((value) => value + 1)
    setSelectedCard(null)
    setView('flowchart')
    setLoadError('')
    setActionError('')
    setNotice(detail)
  }
  const replace = (next: GameFlow, detail: string, title = 'Imported flowchart') => {
    openDocument(flowchart ? { ...flowchart, gameflow: next } : createFlowchart(next, title), detail)
  }
  const confirmLeave = () => !unsaved || window.confirm('This flowchart has unsaved changes. Download a draft backup or retry saving before leaving to keep them. Leave this flowchart anyway?')
  const confirmReplace = () => !flowchart || window.confirm(`Replace the gameflow for "${flowchart.title}"? Download a draft backup first if you want to keep it. Other saved flowcharts will not be changed.`)
  const download = (draft: boolean) => {
    if (!flow) return
    try {
      const normalized = synchronizeFlow(flow)
      const problems = draft ? [] : validateFlow(normalized)
      if (problems.length) throw new Error(`Game export blocked: fix the ${problems.length} validation issue(s) below. Draft backup is still available.`)
      downloadFlow(normalized, draft ? 'gameflow.draft.json' : 'gameflow.json')
      setActionError('')
      setNotice(draft
        ? 'Draft backup download requested. It may be incomplete and is for editor import, not gameplay.'
        : 'This flowchart\'s gameflow.json download was requested. Use the play button to play it directly, or import the download into another browser.')
    } catch (error) {
      setActionError(message(error))
    }
  }
  const play = () => {
    if (!flowchart) return
    try {
      const normalized = synchronizeFlow(flowchart.gameflow)
      const problems = validateFlow(normalized)
      if (problems.length) throw new Error(`Playback blocked: fix the ${problems.length} validation issue(s) below. Draft backup is still available.`)
      if (!commit({ ...flowchart, gameflow: normalized })) {
        setActionError('Playback blocked because the current flowchart could not be saved. Retry local save before playing.')
        return
      }
      window.location.assign(playFlowchartUrl(flowchart.id))
    } catch (error) {
      setActionError(message(error))
    }
  }
  return <main className="flow-editor">
    <header className="fe-header">
      <div><p className="fe-eyebrow">BUSINESS CARD ARCHIVE / AUTHORING</p><h1>Game state editor</h1><p>Build people, their career histories, and the clues connecting them.</p></div>
      <div className="fe-header-actions">
        <button type="button" className="fe-primary fe-play" aria-label="Play current flowchart"
          title={flowchart ? `Play ${flowchart.title}` : 'Open a flowchart to play'}
          disabled={busy || !flowchart} onClick={play}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 L21 12 L7 20 Z" fill="currentColor" /></svg>
        </button>
      </div>
    </header>
    <div className="fe-editor-layout">
      <aside className="fe-flowchart-library fe-panel" aria-labelledby="flowchart-library-title">
        <h2 id="flowchart-library-title">Saved flowcharts</h2>
        <button type="button" disabled={busy} onClick={() => {
          if (!confirmLeave()) return
          try {
            openDocument(createFlowchart(), 'Created a new blank flowchart. Your other flowcharts are still saved. Entity IDs begin at 0 in this document.')
          } catch (error) {
            setActionError(`Could not create a flowchart: ${message(error)}`)
          }
        }}>+ New flowchart</button>
        <nav className="fe-flowchart-navigation" aria-label="Saved flowcharts">
          {flowcharts.length > 0 ? <ul className="fe-flowchart-list">
            {flowcharts.map((item) => <li key={item.id}>
              <button type="button" disabled={busy} aria-current={flowchart?.id === item.id ? 'page' : undefined}
                title={`${item.title} (${item.id})`} onClick={() => {
                  if (flowchart?.id === item.id || !confirmLeave()) return
                  try {
                    const restored = getFlowchart(item.id)
                    openDocument({ ...restored, gameflow: readEditorDraft(restored.gameflow) }, `Opened "${restored.title}".`)
                  } catch (error) {
                    setActionError(`Could not open that flowchart; the current flowchart was kept: ${message(error)}`)
                  }
                }}>
                <span className="fe-flowchart-list-title">{item.title}</span>
                <span className="fe-flowchart-list-id">{item.id.slice(0, 8)}</span>
              </button>
            </li>)}
          </ul> : <p className="fe-help">{busy ? 'Loading flowcharts...' : 'No saved flowcharts yet.'}</p>}
        </nav>
      </aside>
      <div className="fe-editor-content">
        {flowchart && <section className="fe-flowchart-details fe-panel" aria-label="Current flowchart">
          <form className="fe-flowchart-title" onSubmit={(event) => {
            event.preventDefault()
            try {
              const renamed = renameFlowchart(flowchart, titleDraft)
              commit(renamed)
              setActionError('')
              setNotice(`Renamed to "${renamed.title}". Its ID and gameflow are unchanged.`)
            } catch (error) {
              setActionError(message(error))
            }
          }}>
            <label>Flowchart title<input value={titleDraft} disabled={busy} onChange={(event) => setTitleDraft(event.target.value)} /></label>
            <button type="submit" disabled={busy || titleDraft === flowchart.title}>Rename</button>
          </form>
          <p className="fe-help fe-flowchart-id">Permanent ID: <code>{flowchart.id}</code></p>
        </section>}
        <section className="fe-toolbar" aria-label="File and draft actions">
          <button type="button" disabled={busy} onClick={() => importInput.current?.click()}>Import JSON</button>
          <input className="fe-file-input" type="file" accept=".json,application/json" ref={importInput} aria-label="Import gameflow JSON"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              setBusy(true)
              try {
                const imported = readEditorDraft(JSON.parse(await file.text()))
                if (confirmReplace()) replace(imported, `Imported ${file.name}. Derived answer keys and telephone links were refreshed; missing telephones were created for people with cards.`, file.name.replace(/\.json$/i, ''))
              } catch (error) {
                setActionError(`Import failed; your current draft was kept: ${message(error)}`)
              } finally {
                setBusy(false)
              }
            }} />
          <button type="button" disabled={busy} onClick={async () => {
            if (!confirmReplace()) return
            setBusy(true)
            try {
              const loaded = await loadGameFlow()
              replace(readEditorDraft(loaded.flow), `Loaded ${loaded.source}.`)
            } catch (error) {
              setLoadError(`Public file could not be loaded; your current draft was kept: ${message(error)}`)
            } finally {
              setBusy(false)
            }
          }}>Load public file</button>
          <button type="button" disabled={busy || !flow} onClick={() => download(true)}>Download draft backup</button>
          <button type="button" className="fe-primary" disabled={busy || !flow} onClick={() => download(false)}>Export gameflow.json</button>
        </section>
        <p className="fe-help fe-export-help">Each flowchart has its own saved gameflow JSON. Use the play button to play the open flowchart.
          Export and draft backups download only this flowchart. Saved flowcharts are specific to this browser and origin, and are separate from game progress.</p>
        <div className="fe-status" role="status" aria-live="polite">
          {busy ? 'Loading…' : flow ? `${flow.persons.length} people · ${flow.namecards.length} cards · ${flow.telephoneEvents.length} telephones · Next ID ${flow.nextId}. ${unsaved ? 'Draft not saved locally.' : 'Draft saved locally.'}` : 'No flow loaded.'}
          {notice && <p>{notice}</p>}
        </div>
        {loadError && <div className="fe-alert" role="alert">{loadError}</div>}
        {storageError && <div className="fe-alert" role="alert">{storageError}
          <button type="button" disabled={!flowchart || busy} onClick={() => {
            if (flowchart && commit(flowchart)) setActionError('')
          }}>Retry local save</button>
        </div>}
        {actionError && <div className="fe-alert" role="alert">{actionError}</div>}
        {flow && <>
          <section className={`fe-validation ${errors.length ? 'fe-validation--invalid' : ''}`} aria-label="Play and export validation" aria-live="polite">
            <details open={errors.length > 0}>
              <summary>{errors.length ? `${errors.length} issue(s) block play and game export — drafts can still be saved` : 'Ready to play and export · all cards obtainable'}</summary>
              {errors.length > 0 && <ul>{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>}
            </details>
          </section>
          {flow.startingCards.some((id) => !flow.namecards.some((card) => card.id === id)) && <div className="fe-alert">
            Imported starting set contains missing cards.
            <button type="button" onClick={() => change((current) => ({
              ...current, startingCards: current.startingCards.filter((id) => current.namecards.some((card) => card.id === id)),
            }))}>Remove missing starting references</button>
          </div>}
          <div className="fe-view-switch" role="group" aria-label="Editor view">
            <button type="button" aria-pressed={view === 'people'} onClick={() => setView('people')}>Person View</button>
            <button type="button" aria-pressed={view === 'events'} onClick={() => setView('events')}>Event View</button>
            <button type="button" aria-pressed={view === 'flowchart'} onClick={() => setView('flowchart')}>Flowchart View</button>
          </div>
          <fieldset className="fe-workspace" disabled={busy}>
            <legend className="fe-sr-only">{view === 'people' ? 'Person editor' : view === 'events' ? 'Event editor' : 'Flowchart editor'}</legend>
            {view === 'people'
              ? <PersonView flow={flow} change={change} selectedCard={selectedCard} selectCard={setSelectedCard} />
              : view === 'events'
                ? <EventView flow={flow} change={change} editCard={editCard} />
                : <EventFlowchart key={revision} flow={flow} change={change} editCard={editCard}
                  unreachableIds={unreachable} disabled={busy} reportError={setActionError} showEvents={() => setView('events')} />}
          </fieldset>
          {unreachable.length > 0 && <UnreachableEventsWarning key={`${revision}:${unreachable.join(',')}`} flow={flow} ids={unreachable} />}
        </>}
      </div>
    </div>
  </main>
}
