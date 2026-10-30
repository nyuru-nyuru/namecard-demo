import { useEffect, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import CardInspection from '../components/CardInspection'
import { loadGameFlow, type LoadedGameFlow } from './files'
import { editorFlowchartUrl } from './flowcharts'
import { parseGameFlow, type GameCard } from './gameflow'
import { callPerson, cardLocation, createGame, isComplete, moveCard, viewBack, type Destination, type GameState } from './state'
import './game.css'

function CardFace({ card }: { card: GameCard }) {
  return (
    <>
      <strong className="business-card__name">{card.personDisplayName}</strong>
      <span>{card.role}</span>
      <strong>{card.company}</strong>
      <span className="business-card__year">{card.year}</span>
    </>
  )
}

function DraggableCard({ card, locked, inspect }: {
  card: GameCard
  locked: boolean
  inspect: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id, disabled: locked,
  })
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`business-card${isDragging ? ' business-card--dragging' : ''}`}
      {...attributes}
      {...listeners}
      // Locked cards remain buttons for inspection, not disabled controls.
      aria-disabled={undefined}
      aria-label={`View ${card.personDisplayName}, ${card.role}, ${card.year}`}
      onClick={inspect}
    >
      <CardFace card={card} />
    </button>
  )
}

function Slot({ personId, index, locked, children, place, selecting }: {
  personId: number
  index: number
  locked: boolean
  children?: React.ReactNode
  place: () => void
  selecting: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${personId}:${index}`, disabled: locked,
    data: { personId, slot: index },
  })
  return (
    <li ref={setNodeRef} className={`binder-slot${isOver ? ' binder-slot--over' : ''}`}>
      <span className="binder-slot__number">{index + 1}</span>
      {children || <span className="binder-slot__empty">Empty pocket</span>}
      {selecting && !locked && (
        <button type="button" className="slot-place" onClick={place} aria-label={`Place in slot ${index + 1}`}>
          Place here
        </button>
      )}
    </li>
  )
}

function CardBin({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'bin' })
  return (
    <aside ref={setNodeRef} className={`card-bin${isOver ? ' card-bin--over' : ''}`} aria-label="Card bin">
      {children}
    </aside>
  )
}

function BinderPage({ personId, name, locked, children }: {
  personId: number
  name: string
  locked: boolean
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: `page:${personId}` })
  return (
    <section ref={setNodeRef} className={`binder-page${locked ? ' binder-page--locked' : ''}`} aria-label={`${name}'s page`}>
      {children}
    </section>
  )
}

function GameBoard({ flow, source, flowchart }: LoadedGameFlow) {
  const [state, setState] = useState(() => createGame(flow))
  const [spread, setSpread] = useState(0)
  const [inspecting, setInspecting] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [notice, setNotice] = useState('Read the card backs to find your next leads.')
  const [error, setError] = useState('')
  const suppressClick = useRef(false)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )
  const cards = new Map(flow.namecards.map((card) => [card.id, card]))
  const inspectingCard = inspecting === null ? undefined : cards.get(inspecting)
  const inspectionLocation = inspecting === null ? 'bin' : cardLocation(state, inspecting)
  const inspectedLocked = inspectionLocation !== 'bin' && state.locked.includes(inspectionLocation.personId)
  const activeCard = active === null ? undefined : cards.get(active)
  const pages = flow.persons.slice(spread * 2, spread * 2 + 2)

  function act(action: (current: GameState) => GameState, message: string) {
    try {
      const next = action(state)
      const gained = next.owned.length - state.owned.length
      const completed = next.locked.length - state.locked.length
      setState(next)
      setError('')
      setNotice(`${message}${gained ? ` ${gained} new card${gained === 1 ? '' : 's'} added to the bin.` : ''}${completed ? ' A completed page has been locked.' : ''}`)
      return true
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      return false
    }
  }

  function place(cardId: number, destination: Destination) {
    if (act((current) => moveCard(flow, current, cardId, destination), destination === 'bin' ? 'Card returned to bin.' : 'Card filed.')) {
      setSelected(null)
    }
  }

  function finishDrag({ active, over }: DragEndEvent) {
    setActive(null)
    setTimeout(() => { suppressClick.current = false }, 0)
    if (typeof active.id !== 'number') return
    if (typeof over?.id === 'string' && over.id.startsWith('slot:')) {
      const [, personId, slot] = over.id.split(':').map(Number)
      place(active.id, { personId, slot })
    } else if (typeof over?.id === 'string' && over.id.startsWith('page:')) {
      setError('Choose an unlocked pocket. The card has not been moved.')
    } else {
      place(active.id, 'bin')
    }
  }

  return (
    <>
      <header className="game-header">
        <p className="game-eyebrow">THE CONTACT ARCHIVE</p>
        <h1>A life in cards</h1>
        <p>Rebuild eight-bit careers, one introduction at a time.</p>
        {flowchart && <p>Playing: <strong>{flowchart.title}</strong></p>}
        <div className="game-actions">
          <a href={editorFlowchartUrl(flowchart?.id)}>{flowchart ? 'Back to flowchart' : 'Game state editor'}</a>
          <button type="button" onClick={() => {
            if (window.confirm('Restart this game? All filing and discoveries will be reset.')) {
              setState(createGame(flow)); setSpread(0); setSelected(null); setInspecting(null)
              setError(''); setNotice('Game restarted.')
            }
          }}>Restart game</button>
        </div>
      </header>
      <details className="game-help">
        <summary>How to play</summary>
        <p>Inspect a card and show its back to discover leads. Each page has two columns and four rows.
          File each person's cards from oldest to newest, left to right then top to bottom, starting in pocket 1 with no gaps.
          Drag to a pocket, or inspect a card, choose a binder slot, then select "Place here".
          Occupied pockets swap cards; a displaced bin card returns to the bin. Drop outside the binder to return a card to the bin.
          Completed pages lock, but their cards remain readable. Call their owners for more leads.
          Some introductions need more than one clue or call. Finish every page to complete the archive.</p>
        <p>Loaded: {source}. Progress lasts until you reload or restart.</p>
      </details>
      <div className="game-progress">
        <span>{state.owned.length} / {flow.namecards.length} cards discovered</span>
        <span>{state.locked.length} / {flow.persons.length} histories complete</span>
      </div>
      <p className="game-notice" role="status">{notice}</p>
      {error && <p className="game-error" role="alert">{error}</p>}
      {isComplete(flow, state) && (
        <section className="game-ending" aria-label="Game complete">
          <h2>The archive is complete.</h2>
          <p>Every card is home, and every career is in order. Thank you for reconnecting these lives.</p>
        </section>
      )}
      {selected !== null && (
        <div className="game-selection" role="status">
          Filing {cards.get(selected)?.personDisplayName}, {cards.get(selected)?.year}. Choose a pocket on an open page.
          <button type="button" onClick={() => setSelected(null)}>Cancel placement</button>
          <button type="button" onClick={() => place(selected, 'bin')}>Return to bin</button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          const collisions = pointerWithin(args)
          const slots = collisions.filter(({ id }) => String(id).startsWith('slot:'))
          return slots.length ? slots : collisions
        }}
        onDragStart={({ active }) => {
          suppressClick.current = true
          setActive(Number(active.id))
          setSelected(null)
        }}
        onDragEnd={finishDrag}
        onDragCancel={() => {
          setActive(null)
          setTimeout(() => { suppressClick.current = false }, 0)
        }}
      >
        <div className="game-table">
          <section className="binder" aria-label="Open binder">
            <nav className="binder-navigation" aria-label="Binder pages">
              <button type="button" disabled={spread === 0} onClick={() => setSpread(spread - 1)}>Previous spread</button>
              <span>Pages {spread * 2 + 1}-{Math.min(spread * 2 + 2, flow.persons.length)} of {flow.persons.length}</span>
              <button type="button" disabled={(spread + 1) * 2 >= flow.persons.length} onClick={() => setSpread(spread + 1)}>Next spread</button>
            </nav>
            <div className="binder-viewport" role="region" aria-label="Binder spread" tabIndex={0}>
              <div className="binder-spread">
                {pages.map((person) => {
                  const locked = state.locked.includes(person.id)
                  const hasTelephone = flow.telephoneEvents.some((event) => event.personId === person.id)
                  return (
                    <BinderPage key={person.id} personId={person.id} name={person.name} locked={locked}>
                      <header>
                        <h2>{person.name}</h2>
                        <p>{locked ? 'History complete - Locked' : `${person.namecards.length} cards in this history`}</p>
                        {hasTelephone && <button
                          type="button"
                          disabled={!locked || state.called.includes(person.id)}
                          onClick={() => act((current) => callPerson(flow, current, person.id), `Called ${person.name}.`)}
                        >{state.called.includes(person.id) ? `${person.name} called` : `Call ${person.name}`}</button>}
                      </header>
                      <ol className="binder-slots">
                        {state.pages[person.id].map((id, index) => (
                          <Slot key={index} personId={person.id} index={index} locked={locked}
                            selecting={selected !== null} place={() => { if (selected !== null) place(selected, { personId: person.id, slot: index }) }}>
                            {id !== null && cards.has(id) && (
                              <DraggableCard card={cards.get(id)!} locked={locked} inspect={() => {
                                if (!suppressClick.current) setInspecting(id)
                              }} />
                            )}
                          </Slot>
                        ))}
                      </ol>
                    </BinderPage>
                  )
                })}
              </div>
            </div>
          </section>
          <CardBin>
            <h2>The card bin <span>({state.bin.length})</span></h2>
            <p>Unfiled contacts. Click to inspect; drag to file.</p>
            <div className="card-pile">
              {state.bin.map((id) => (
                <DraggableCard key={id} card={cards.get(id)!} locked={false} inspect={() => {
                  if (!suppressClick.current) setInspecting(id)
                }} />
              ))}
              {state.bin.length === 0 && <p className="bin-empty">No loose cards. Follow the leads on your filed cards, or make a call.</p>}
            </div>
          </CardBin>
        </div>
        <DragOverlay>{activeCard && <div className="business-card drag-preview"><CardFace card={activeCard} /></div>}</DragOverlay>
      </DndContext>
      {inspectingCard && (
        <CardInspection
          key={inspectingCard.id}
          card={inspectingCard}
          locked={inspectedLocked}
          inBin={inspectionLocation === 'bin'}
          close={() => setInspecting(null)}
          readBack={() => act((current) => viewBack(flow, current, inspectingCard.id), inspectingCard.backText.trim() ? 'Information noted.' : 'This card has a blank back.')}
          file={() => { setSelected(inspectingCard.id); setInspecting(null) }}
          returnToBin={() => { place(inspectingCard.id, 'bin'); setInspecting(null) }}
        >
          <CardFace card={inspectingCard} />
        </CardInspection>
      )}
    </>
  )
}

export default function GameApp() {
  const [loaded, setLoaded] = useState<LoadedGameFlow | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const flowchartId = new URLSearchParams(window.location.search).get('flowchart')
  useEffect(() => {
    let cancelled = false
    loadGameFlow(flowchartId).then((result) => {
      if (!cancelled) setLoaded(result)
    }).catch((error: unknown) => {
      if (!cancelled) setError(error instanceof Error ? error.message : String(error))
    })
    return () => { cancelled = true }
  }, [flowchartId])
  return (
    <main className="filing-game">
      {error && <p className="game-error" role="alert">{error}</p>}
      {loaded ? <GameBoard key={revision} {...loaded} /> : <h1>{error ? 'Unable to load the game' : 'Opening the archive...'}</h1>}
      <footer className="game-import">
        <label>Play a gameflow JSON file
          <input type="file" accept=".json,application/json" onChange={async (event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (!file) return
            try {
              const flow = parseGameFlow(JSON.parse(await file.text()))
              if (loaded && !window.confirm('Load this gameflow and reset current progress?')) return
              setLoaded({ flow, source: file.name }); setRevision((value) => value + 1); setError('')
            } catch (error) {
              setError(error instanceof Error ? error.message : String(error))
            }
          }} />
        </label>
        <a href={editorFlowchartUrl(flowchartId ?? undefined)}>Create or edit a gameflow</a>
      </footer>
    </main>
  )
}
