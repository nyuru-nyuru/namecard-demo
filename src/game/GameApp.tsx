import { useEffect, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import CardInspection from '../components/CardInspection'
import { useI18n } from '../i18n/context.ts'
import { dragAccessibility } from '../i18n/dragAccessibility.ts'
import { errorMessage, msg, type LocalizedText, type Message } from '../i18n/messages.ts'
import { loadGameFlow, type LoadedGameFlow } from './files'
import { editorFlowchartUrl } from './flowcharts'
import { parseGameFlow, type GameCard } from './gameflow'
import { callPerson, cardLocation, createGame, isComplete, moveCard, viewBack, type Destination, type GameState } from './state'
import './game.css'

function CardFace({ card, details = false }: { card: GameCard; details?: boolean }) {
  return (
    <>
      <strong className="business-card__name">{card.personDisplayName}</strong>
      <span>{card.role}</span>
      <strong>{card.logo && `${card.logo} `}{card.company}</strong>
      {details && card.department && <span>{card.department}</span>}
      {details && card.misc && <span className="business-card__misc">{card.misc}</span>}
      <span className="business-card__year">{card.year}</span>
    </>
  )
}

function DraggableCard({ card, locked, inspect }: {
  card: GameCard
  locked: boolean
  inspect: () => void
}) {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id, disabled: locked, attributes: { roleDescription: t('dnd.draggable') },
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
      aria-label={t('game.viewCard', { name: card.personDisplayName, role: card.role, year: card.year })}
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
  const { t } = useI18n()
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${personId}:${index}`, disabled: locked,
    data: { personId, slot: index },
  })
  return (
    <li ref={setNodeRef} className={`binder-slot${isOver ? ' binder-slot--over' : ''}`}>
      <span className="binder-slot__number">{index + 1}</span>
      {children || <span className="binder-slot__empty">{t('game.emptyPocket')}</span>}
      {selecting && !locked && (
        <button type="button" className="slot-place" onClick={place} aria-label={t('game.placeInSlot', { slot: index + 1 })}>
          {t('game.placeHere')}
        </button>
      )}
    </li>
  )
}

function BinSlot({ index, children }: { index: number | 'end'; children: React.ReactNode }) {
  const { t } = useI18n()
  const label = index === 'end' ? t('game.binEnd') : t('game.binPosition', { position: index + 1 })
  const { setNodeRef, isOver } = useDroppable({
    id: index === 'end' ? 'bin-end' : `bin-slot:${index}`,
  })
  return <div ref={setNodeRef} role="group" aria-label={label}
    className={`bin-slot${index === 'end' ? ' bin-slot--end' : ''}${isOver ? ' bin-slot--over' : ''}`}>
    {children}
    {isOver && index !== 'end' && <span className="bin-slot__marker" aria-hidden="true">{label}</span>}
  </div>
}

function CardBin({ children, count }: { children: React.ReactNode; count: number }) {
  const { t } = useI18n()
  const { setNodeRef, isOver } = useDroppable({ id: 'bin' })
  const { setNodeRef: setPileRef, isOver: pileIsOver } = useDroppable({ id: 'bin-pile' })
  return (
    <aside ref={setNodeRef} className={`card-bin${isOver || pileIsOver ? ' card-bin--over' : ''}`} aria-label={t('game.cardBin')}>
      <h2>{t('game.binTitle')} <span>({count})</span></h2>
      <p>{t('game.binHelp')}</p>
      <div ref={setPileRef} className="card-pile">{children}</div>
    </aside>
  )
}

function BinderPage({ personId, name, locked, children }: {
  personId: number
  name: string
  locked: boolean
  children: React.ReactNode
}) {
  const { t } = useI18n()
  const { setNodeRef } = useDroppable({ id: `page:${personId}` })
  return (
    <section ref={setNodeRef} className={`binder-page${locked ? ' binder-page--locked' : ''}`} aria-label={t('game.personPage', { name })}>
      {children}
    </section>
  )
}

function GameBoard({ flow, source, sourceMessage, flowchart }: LoadedGameFlow) {
  const { t, format } = useI18n()
  const allUnlocked = flow.mode === 'all-unlocked'
  const [state, setState] = useState(() => createGame(flow))
  const [spread, setSpread] = useState(0)
  const [inspecting, setInspecting] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [notice, setNotice] = useState<LocalizedText>(msg(allUnlocked ? 'game.notice.allUnlocked' : 'game.notice.leads'))
  const [error, setError] = useState<LocalizedText>('')
  const suppressClick = useRef(false)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )
  const cards = new Map(flow.namecards.map((card) => [card.id, card]))
  const inspectingCard = inspecting === null ? undefined : cards.get(inspecting)
  const selectedCard = selected === null ? undefined : cards.get(selected)
  const inspectionLocation = inspecting === null ? 'bin' : cardLocation(state, inspecting)
  const inspectedLocked = inspectionLocation !== 'bin' && state.locked.includes(inspectionLocation.personId)
  const activeCard = active === null ? undefined : cards.get(active)
  const pages = flow.persons.slice(spread * 2, spread * 2 + 2)

  function act(action: (current: GameState) => GameState, message: Message) {
    try {
      const next = action(state)
      const gained = next.owned.length - state.owned.length
      const completed = next.locked.length - state.locked.length
      setState(next)
      setError('')
      setNotice(msg('game.notice.action', {
        message,
        gained: gained ? msg(gained === 1 ? 'game.notice.gainedOne' : 'game.notice.gainedMany', { count: gained }) : '',
        completed: completed ? msg('game.notice.pageLocked') : '',
      }))
      return true
    } catch (error) {
      setError(errorMessage(error))
      return false
    }
  }

  function place(cardId: number, destination: Destination) {
    const toBin = destination === 'bin' || 'binIndex' in destination
    const notice = toBin
      ? state.bin.includes(cardId) ? 'game.notice.reordered' : 'game.notice.returned'
      : 'game.notice.filed'
    if (act((current) => moveCard(flow, current, cardId, destination), msg(notice))) {
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
    } else if (typeof over?.id === 'string' && over.id.startsWith('bin-slot:')) {
      place(active.id, { binIndex: Number(over.id.split(':')[1]) })
    } else if (typeof over?.id === 'string' && over.id.startsWith('page:')) {
      setError(msg('game.errors.choosePocket'))
    } else {
      place(active.id, 'bin')
    }
  }

  return (
    <>
      <header className="game-header">
        <p className="game-eyebrow">{t('game.eyebrow')}</p>
        <h1>{t('game.title')}</h1>
        <p>{t('game.subtitle')}</p>
        {flowchart && <p>{t('game.playing')} <strong>{flowchart.title}</strong></p>}
        <div className="game-actions">
          <a href={editorFlowchartUrl(flowchart?.id)}>{t(flowchart ? 'game.backToFlowchart' : 'game.editor')}</a>
          <button type="button" onClick={() => {
            if (window.confirm(t('game.confirmRestart'))) {
              setState(createGame(flow)); setSpread(0); setSelected(null); setInspecting(null)
              setError(''); setNotice(msg('game.notice.restarted'))
            }
          }}>{t('game.restart')}</button>
        </div>
      </header>
      <details className="game-help">
        <summary>{t('game.howToPlay')}</summary>
        <p>{t(allUnlocked ? 'game.instructionsAllUnlocked' : 'game.instructions')}</p>
        <p>{t('game.loaded', { source: sourceMessage ?? source })}</p>
      </details>
      <div className="game-progress">
        <span>{t('game.cardsDiscovered', { count: state.owned.length, total: flow.namecards.length })}</span>
        <span>{t('game.historiesComplete', { count: state.locked.length, total: flow.persons.length })}</span>
      </div>
      <p className="game-notice" role="status">{format(notice)}</p>
      {error && <p className="game-error" role="alert">{format(error)}</p>}
      {isComplete(flow, state) && (
        <section className="game-ending" aria-label={t('game.completeLabel')}>
          <h2>{t('game.completeTitle')}</h2>
          <p>{t('game.completeText')}</p>
        </section>
      )}
      {selectedCard && (
        <div className="game-selection" role="status">
          {t('game.filing', { name: selectedCard.personDisplayName, year: selectedCard.year })}
          <button type="button" onClick={() => setSelected(null)}>{t('game.cancelPlacement')}</button>
          <button type="button" onClick={() => place(selectedCard.id, 'bin')}>{t('game.returnToBin')}</button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        accessibility={dragAccessibility(t, 'dnd.gameInstructions', (id) => {
          if (typeof id === 'number') {
            const card = cards.get(id)
            return card ? t('dnd.card', { name: card.personDisplayName, year: card.year }) : t('dnd.item', { id })
          }
          if (id === 'bin' || id === 'bin-pile') return t('game.cardBin')
          if (id === 'bin-end') return t('game.binEnd')
          if (id.startsWith('bin-slot:')) return t('game.binPosition', { position: Number(id.split(':')[1]) + 1 })
          const [kind, personId, slot] = id.split(':')
          const name = flow.persons.find((person) => person.id === Number(personId))?.name || t('common.missingPerson')
          return kind === 'slot'
            ? t('dnd.slot', { name, slot: Number(slot) + 1 })
            : t('game.personPage', { name })
        })}
        collisionDetection={(args) => {
          const collisions = pointerWithin(args)
          if (collisions.some(({ id }) => id === 'bin-pile')) {
            const positions = collisions.filter(({ id }) => id === 'bin-end' || String(id).startsWith('bin-slot:'))
            return positions.length ? positions : collisions.filter(({ id }) => id === 'bin-pile')
          }
          if (collisions.some(({ id }) => id === 'bin')) return collisions.filter(({ id }) => id === 'bin')
          const slots = collisions.filter(({ id }) => String(id).startsWith('slot:'))
          // Scrolled-out bin positions must not catch drops outside the bin.
          return slots.length ? slots : collisions.filter(({ id }) => id !== 'bin-end' && !String(id).startsWith('bin-slot:'))
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
          <section className="binder" aria-label={t('game.openBinder')}>
            <nav className="binder-navigation" aria-label={t('game.binderPages')}>
              <button type="button" disabled={spread === 0} onClick={() => setSpread(spread - 1)}>{t('game.previousSpread')}</button>
              <span>{t('game.pageCount', { first: spread * 2 + 1, last: Math.min(spread * 2 + 2, flow.persons.length), total: flow.persons.length })}</span>
              <button type="button" disabled={(spread + 1) * 2 >= flow.persons.length} onClick={() => setSpread(spread + 1)}>{t('game.nextSpread')}</button>
            </nav>
            <div className="binder-viewport" role="region" aria-label={t('game.binderSpread')} tabIndex={0}>
              <div className="binder-spread">
                {pages.map((person) => {
                  const locked = state.locked.includes(person.id)
                  const hasTelephone = flow.telephoneEvents.some((event) => event.personId === person.id)
                  return (
                    <BinderPage key={person.id} personId={person.id} name={person.name} locked={locked}>
                      <header>
                        <h2>{person.name}</h2>
                        <p>{locked ? t('game.historyLocked') : t('game.historyCards', { count: person.namecards.length })}</p>
                        {hasTelephone && <button
                          type="button"
                          disabled={!locked || state.called.includes(person.id)}
                          onClick={() => act((current) => callPerson(flow, current, person.id), msg('game.notice.called', { name: person.name }))}
                        >{t(state.called.includes(person.id) ? 'game.calledPerson' : 'game.callPerson', { name: person.name })}</button>}
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
          <CardBin count={state.bin.length}>
            {state.bin.map((id, index) => (
              <BinSlot key={id} index={index}>
                <DraggableCard card={cards.get(id)!} locked={false} inspect={() => {
                  if (!suppressClick.current) setInspecting(id)
                }} />
              </BinSlot>
            ))}
            <BinSlot index="end">
              {state.bin.length === 0
                ? <p className="bin-empty">{t(allUnlocked ? 'game.binEmptyAllUnlocked' : 'game.binEmpty')}</p>
                : <span>{t('game.binEnd')}</span>}
            </BinSlot>
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
          readBack={() => act((current) => viewBack(flow, current, inspectingCard.id), msg(inspectingCard.backText.trim() ? 'game.notice.information' : 'game.notice.blank'))}
          file={() => { setSelected(inspectingCard.id); setInspecting(null) }}
          returnToBin={() => { place(inspectingCard.id, 'bin'); setInspecting(null) }}
        >
          <CardFace card={inspectingCard} details />
        </CardInspection>
      )}
    </>
  )
}

export default function GameApp() {
  const { t, format } = useI18n()
  const [loaded, setLoaded] = useState<LoadedGameFlow | null>(null)
  const [error, setError] = useState<LocalizedText>('')
  const [revision, setRevision] = useState(0)
  const flowchartId = new URLSearchParams(window.location.search).get('flowchart')
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const spreadsheet = {
      spreadsheetId: import.meta.env.VITE_SPREADSHEET_ID,
      range: import.meta.env.VITE_SPREADSHEET_NAME,
      apiKey: import.meta.env.VITE_GOOGLE_SHEETS_API_KEY,
      signal: controller.signal,
    }
    const hasSpreadsheetSettings = [spreadsheet.spreadsheetId, spreadsheet.range, spreadsheet.apiKey]
      .some((value) => value !== undefined)
    void loadGameFlow(flowchartId, undefined, hasSpreadsheetSettings ? spreadsheet : undefined).then((result) => {
      if (!cancelled) {
        setLoaded(result)
        setError(result.warning ?? '')
      }
    }).catch((error: unknown) => {
      if (!cancelled) setError(errorMessage(error))
    })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [flowchartId])
  return (
    <main className="filing-game">
      {error && <p className="game-error" role="alert">{format(error)}</p>}
      {loaded ? <GameBoard key={revision} {...loaded} /> : <h1>{t(error ? 'game.loadFailed' : 'game.opening')}</h1>}
      <footer className="game-import">
        <label className="game-import-file">{t('game.import')}
          <input className="visually-hidden" type="file" accept=".json,application/json" onChange={async (event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (!file) return
            try {
              const flow = parseGameFlow(JSON.parse(await file.text()))
              if (loaded && !window.confirm(t('game.confirmImport'))) return
              setLoaded({ flow, source: file.name }); setRevision((value) => value + 1); setError('')
            } catch (error) {
              setError(errorMessage(error))
            }
          }} />
        </label>
        <a href={editorFlowchartUrl(flowchartId ?? undefined)}>{t('game.createOrEdit')}</a>
      </footer>
    </main>
  )
}
