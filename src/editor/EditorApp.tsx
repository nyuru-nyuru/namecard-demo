import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/context.ts'
import { errorMessage as message, LocalizedError, msg, type LocalizedText } from '../i18n/messages.ts'
import { DEFAULT_SAMPLE_DATASET, downloadFlow, loadGameFlow, loadSampleDataset, SAMPLE_DATASETS } from '../game/files.ts'
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
  flowValidationIssues,
  incomingConditions,
  isAutomaticRelation,
  startingCardIds,
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

function Arrow({ automatic = false }: { automatic?: boolean }) {
  return <svg className={automatic ? 'fe-arrow fe-arrow--auto' : 'fe-arrow'} viewBox="0 0 64 18" aria-hidden="true">
    <path d="M1 9 H58 M49 2 L58 9 L49 16" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
}

function CardEditor({ card, flow, change, invalid, onOwnerChange }: {
  card: GameCard; flow: GameFlow; change: ChangeFlow; invalid: boolean; onOwnerChange: (personId: number | null) => void
}) {
  const { t } = useI18n()
  const patch = (value: Parameters<typeof updateCard>[2]) => change((current) => {
    const updated = updateCard(current, card.id, value)
    if (value.personId !== undefined) onOwnerChange(value.personId)
    return updated
  })
  const ownerExists = card.personId === null || flow.persons.some((person) => person.id === card.personId)
  const allUnlocked = flow.mode === 'all-unlocked'
  return <section className={`fe-panel fe-card-editor${invalid ? ' fe-invalid-card' : ''}`} aria-labelledby="card-editor-title">
    <div className="fe-section-heading">
      <h2 id="card-editor-title">{t('editor.editCardTitle', { id: card.id })}</h2>
      <span className="fe-badge">{t('editor.permanentIdBadge', { objectId: card.objectId })}</span>
      {invalid && <span className="fe-badge fe-badge--error">{t('common.validationError')}</span>}
    </div>
    <label>{t('editor.owner')}
      <select value={card.personId ?? ''} onChange={(event) => patch({ personId: event.target.value === '' ? null : Number(event.target.value) })}>
        <option value="">{t('editor.unassignedDraft')}</option>
        {!ownerExists && <option value={card.personId!}>{t('common.missingPersonId', { id: card.personId! })}</option>}
        {flow.persons.map((person) => <option key={person.id} value={person.id}
          disabled={person.id !== card.personId && person.namecards.length >= 8}>
          #{person.id} · {person.name || t('common.unnamedPerson')} ({person.namecards.length}/8)
        </option>)}
      </select>
    </label>
    <p className="fe-help">{t('editor.ownerHelp')}</p>
    <label>{t('editor.displayName')}<input value={card.personDisplayName} onChange={(event) => patch({ personDisplayName: event.target.value })} /></label>
    <label>{t('editor.company')}<input value={card.company} onChange={(event) => patch({ company: event.target.value })} /></label>
    <label>{t('editor.department')}<input value={card.department ?? ''} onChange={(event) => patch({ department: event.target.value })} /></label>
    <label>{t('editor.logo')}<input value={card.logo ?? ''} onChange={(event) => patch({ logo: event.target.value })} /></label>
    <label>{t('editor.role')}<input value={card.role} onChange={(event) => patch({ role: event.target.value })} /></label>
    <label>{t('editor.year')}<input type="number" min="1" max="9999" step="1" value={card.year || ''}
      onChange={(event) => patch({ year: Number(event.target.value) })} /></label>
    <label>{t('editor.misc')}<textarea rows={5} value={card.misc} onChange={(event) => patch({ misc: event.target.value })} /></label>
    <p className="fe-help">{t('editor.miscHelp')}</p>
    <label>{t('editor.backText')}<textarea rows={4} value={card.backText} onChange={(event) => patch({ backText: event.target.value })} /></label>
    <p className="fe-help">{t(allUnlocked ? 'editor.allUnlockedBackHelp' : 'editor.backTextHelp')}</p>
    <label className="fe-check">
      <input type="checkbox" checked={startingCardIds(flow).includes(card.id)} disabled={allUnlocked}
        onChange={(event) => change((current) => setStartingCard(current, card.id, event.target.checked))} />
      {t('editor.startingBin')}
    </label>
    <button className="fe-danger" type="button" onClick={() => {
      const lastCard = card.personId !== null && flow.namecards.filter((item) => item.personId === card.personId).length === 1
      if (window.confirm(t('editor.confirmDeleteCard', {
        id: card.id, lastCardWarning: lastCard ? t('editor.lastCardWarning') : '',
      }))) {
        change((current) => removeCard(current, card.id))
      }
    }}>{t('editor.deleteCard', { id: card.id })}</button>
  </section>
}

function PersonView({ flow, change, selectedCard, selectCard, invalidCardIds }: {
  flow: GameFlow; change: ChangeFlow; selectedCard: number | null; selectCard: (id: number) => void
  invalidCardIds: ReadonlySet<number>
}) {
  const { t } = useI18n()
  const starting = new Set(startingCardIds(flow))
  const selected = flow.namecards.find((card) => card.id === selectedCard)
  const selectedPersonId = flow.persons.find((person) => person.id === selected?.personId)?.id
  const [expandedPeople, setExpandedPeople] = useState(() => {
    const personId = selectedPersonId ?? flow.persons[0]?.id
    return new Set(personId === undefined ? [] : [personId])
  })
  const expandPerson = (id: number) => setExpandedPeople((current) => current.has(id) ? current : new Set([...current, id]))
  const unassigned = flow.namecards.filter((card) => !flow.persons.some((person) => person.id === card.personId))
  const createPerson = () => change((current) => {
    const updated = addPerson(current, t('editor.defaultPersonName'))
    expandPerson(current.nextPersonId)
    return updated
  })
  const createCard = (personId: number | null) => change((current) => {
    const updated = addCard(current, personId)
    selectCard(current.nextNamecardId)
    return updated
  })
  const cards = (items: GameCard[]) => <ol className="fe-card-list">
    {items.map((card) => <li key={card.id}>
      <button className={`fe-card-tile${selectedCard === card.id ? ' fe-selected' : ''}${invalidCardIds.has(card.id) ? ' fe-invalid-card' : ''}`} type="button"
        aria-pressed={selectedCard === card.id} onClick={() => selectCard(card.id)}>
        <span><strong>{card.year}</strong> · #{card.id}{starting.has(card.id) ? t('editor.startingBadge') : ''}
          {invalidCardIds.has(card.id) && <span className="fe-badge fe-badge--error" role="img"
            aria-label={t('common.validationError')} title={t('common.validationError')}>!</span>}
        </span>
        <strong>{card.personDisplayName || t('common.unnamedCard')}</strong>
        <span>{card.role || t('common.noRole')} · {card.company || t('common.noCompany')}</span>
      </button>
    </li>)}
  </ol>
  return <div className="fe-person-layout">
    <div className="fe-person-list">
      <div className="fe-section-heading">
        <div><h2>{t('editor.peopleTitle')}</h2><p className="fe-help">{t('editor.peopleHelp')}</p></div>
        <button type="button" onClick={createPerson}>{t('editor.addPerson')}</button>
      </div>
      {flow.persons.length === 0 && <p className="fe-empty">{t('editor.noPeople')}</p>}
      {flow.persons.map((person) => <section key={person.id} className="fe-panel" aria-label={t('common.personId', { id: person.id })}>
        <h3>
          <button type="button" className="fe-person-toggle" aria-expanded={expandedPeople.has(person.id)}
            aria-controls={`person-${person.id}-content`} onClick={() => setExpandedPeople((current) => {
              const next = new Set(current)
              if (next.has(person.id)) next.delete(person.id)
              else next.add(person.id)
              return next
            })}>
            <svg className="fe-person-chevron" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3 L11 8 L6 13" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="fe-person-summary">
              <strong>{person.name || t('common.unnamedPerson')}</strong>
              <span className="fe-person-id">{t('common.personId', { id: person.id })}</span>
            </span>
            <span className="fe-badge">{t('editor.personCardCount', { count: person.namecards.length })}</span>
          </button>
        </h3>
        <div id={`person-${person.id}-content`} className="fe-person-content" hidden={!expandedPeople.has(person.id)}>
          <div className="fe-section-heading">
            <label className="fe-person-name">{t('editor.personName', { id: person.id })}
              <input value={person.name} onChange={(event) => change((current) => renamePerson(current, person.id, event.target.value))} />
            </label>
          </div>
          {cards(person.namecards.flatMap((id) => flow.namecards.filter((card) => card.id === id)))}
          {person.namecards.length === 0 && <p className="fe-help">{t(flow.telephoneEvents.some((phone) => phone.personId === person.id)
            ? 'editor.emptyPersonWithPhone' : 'editor.emptyPersonWithoutPhone')}</p>}
          <div className="fe-actions">
            <button type="button" disabled={person.namecards.length >= 8} onClick={() => createCard(person.id)}>{t('editor.addOwnedCard')}</button>
            <button type="button" className="fe-danger" onClick={() => {
              if (window.confirm(t('editor.confirmRemovePerson', {
                name: person.name || t('common.personId', { id: person.id }), count: person.namecards.length,
              }))) {
                change((current) => removePerson(current, person.id))
              }
            }}>{t('editor.removePerson')}</button>
          </div>
        </div>
      </section>)}
      <section className="fe-panel" aria-labelledby="unassigned-title">
        <div className="fe-section-heading">
          <h2 id="unassigned-title">{t('editor.unassignedTitle', { count: unassigned.length })}</h2>
          <button type="button" onClick={() => createCard(null)}>{t('editor.addUnassignedCard')}</button>
        </div>
        <p className="fe-help">{t('editor.draftsHelp')}</p>
        {cards(unassigned)}
      </section>
    </div>
    <aside className="fe-edit-column">
      {selected
        ? <CardEditor card={selected} flow={flow} change={change} invalid={invalidCardIds.has(selected.id)} onOwnerChange={(personId) => {
          if (personId !== null) expandPerson(personId)
        }} />
        : <div className="fe-panel fe-empty">{t('editor.selectCard')}</div>}
    </aside>
  </div>
}

function EventNode({ flow, id, change, editCard, invalidCardIds }: {
  flow: GameFlow; id: number; change: ChangeFlow; editCard: (id: number) => void
  invalidCardIds: ReadonlySet<number>
}) {
  const { t } = useI18n()
  const [target, setTarget] = useState('')
  const card = flow.namecards.find((item) => item.objectId === id)
  const phone = flow.telephoneEvents.find((item) => item.objectId === id)
  const source = card ?? phone!
  const invalid = card !== undefined && invalidCardIds.has(card.id)
  const allUnlocked = flow.mode === 'all-unlocked'
  const starting = card !== undefined && startingCardIds(flow).includes(card.id)
  const manual = source.unlocks.filter((targetId) => !isAutomaticRelation(flow, id, targetId))
  const automatic = source.unlocks.filter((targetId) => isAutomaticRelation(flow, id, targetId))
  const incoming = card ? incomingConditions(flow, card.id)
    : flow.namecards.filter((item) => item.personId === phone?.personId)
      .sort((a, b) => a.year - b.year || a.id - b.id).map((item) => item.objectId)
  const targets = flow.namecards.filter((item) => item.objectId !== id && !source.unlocks.includes(item.objectId))
  const relation = (targetId: number, auto: boolean) => <li key={targetId} className="fe-relation">
    <span className="fe-edge-origin">#{id}</span><Arrow automatic={auto} />
    <span className="fe-sr-only">{t(auto ? 'editor.automaticRelationDescription' : 'editor.manualRelationDescription')}</span>
    <a href={`#event-${targetId}`}>{eventLabel(flow, targetId, t)}</a>
    {auto
      ? <span className="fe-badge">{t('editor.automaticReadOnly')}</span>
      : <button type="button" className="fe-remove-edge" aria-label={t('editor.removeRelation', { source: id, target: targetId })}
        onClick={() => change((current) => setUnlock(current, id, targetId, false))}>{t('common.remove')}</button>}
  </li>
  return <article id={`event-${id}`} className={`fe-panel fe-event-node${phone ? ' fe-event-node--phone' : ''}${invalid ? ' fe-invalid-card' : ''}`} tabIndex={-1}>
    <div className="fe-section-heading">
      <h3>{eventLabel(flow, id, t)}</h3>
      {invalid && <span className="fe-badge fe-badge--error">{t('common.validationError')}</span>}
      {card && <button type="button" onClick={() => editCard(card.id)}>{t('common.editCard')}</button>}
    </div>
    {card ? <>
      <label className="fe-check"><input type="checkbox" checked={starting} disabled={allUnlocked}
        onChange={(event) => change((current) => setStartingCard(current, card.id, event.target.checked))} />{t('common.startingCard')}</label>
      <p className="fe-help">{t(allUnlocked ? 'editor.allUnlockedBackHelp' : 'editor.cardActivation')}</p>
      <p className="fe-back-preview">{card.backText || t(allUnlocked ? 'inspection.blankBack' : 'editor.blankBackPreview')}</p>
      <strong>{t(starting ? 'editor.startingRequirements' : 'editor.allRequirements')}</strong>
    </> : <>
      <p className="fe-help">{t('editor.telephoneActivation')}</p>
      <strong>{t('editor.automaticPrerequisites')}</strong>
    </>}
    {incoming.length
      ? <ul className="fe-incoming">{incoming.map((sourceId) => <li key={sourceId}><a href={`#event-${sourceId}`}>{eventLabel(flow, sourceId, t)}</a></li>)}</ul>
      : <p className="fe-help">{t(card
        ? starting ? 'editor.noStartingConditions' : 'editor.noIncomingConditions'
        : 'editor.emptyPagePrerequisites')}</p>}
    <h4>{t('editor.outgoingRelations')}</h4>
    {manual.length + automatic.length === 0 && <p className="fe-help">{t('editor.noOutgoingRelations')}</p>}
    <ul className="fe-relations">{manual.map((targetId) => relation(targetId, false))}{automatic.map((targetId) => relation(targetId, true))}</ul>
    <form className="fe-add-edge" onSubmit={(event) => {
      event.preventDefault()
      if (target !== '' && targets.some((item) => item.objectId === Number(target))) {
        change((current) => setUnlock(current, id, Number(target), true))
        setTarget('')
      }
    }}>
      <label>{t(card ? 'editor.addCardUnlock' : 'editor.addTelephoneUnlock')}
        <select value={targets.some((item) => String(item.objectId) === target) ? target : ''} onChange={(event) => setTarget(event.target.value)}>
          <option value="">{t('common.selectTarget')}</option>
          {targets.map((item) => <option key={item.objectId} value={item.objectId}>{cardLabel(item, t)}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!targets.some((item) => String(item.objectId) === target)}>{t('common.addRelation')}</button>
    </form>
  </article>
}

function EventView({ flow, change, editCard, invalidCardIds }: {
  flow: GameFlow; change: ChangeFlow; editCard: (id: number) => void; invalidCardIds: ReadonlySet<number>
}) {
  const { t } = useI18n()
  const sources = [...flow.namecards, ...flow.telephoneEvents].sort((a, b) => a.objectId - b.objectId)
  return <section aria-labelledby="events-title">
    <h2 id="events-title">{t('editor.eventsTitle')}</h2>
    <p className="fe-help">{t(flow.mode === 'all-unlocked' ? 'editor.allUnlockedHelp' : 'editor.eventsHelp')}</p>
    <nav className="fe-event-index" aria-label={t('editor.jumpToEvent')}>
      {sources.map((source) => <a key={source.objectId} href={`#event-${source.objectId}`}>{t(flow.namecards.some((card) => card.objectId === source.objectId) ? 'common.card' : 'common.phone')} #{source.id}</a>)}
    </nav>
    {sources.length === 0 && <p className="fe-empty">{t('editor.noEvents')}</p>}
    <div className="fe-event-list">{sources.map((source) => <EventNode key={source.objectId} flow={flow} id={source.objectId}
      change={change} editCard={editCard} invalidCardIds={invalidCardIds} />)}</div>
  </section>
}

function UnreachableEventsWarning({ flow, ids }: { flow: GameFlow; ids: number[] }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(true)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!visible || focused) return
    const timeout = window.setTimeout(() => setVisible(false), 5000)
    return () => window.clearTimeout(timeout)
  }, [visible, focused])

  if (!visible) return null
  return <aside className="fe-reachability-warning" role="status" aria-live="polite" aria-label={t('editor.unreachableLabel')}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
    }}>
    <div className="fe-reachability-warning__heading">
      <strong>{t(ids.length === 1 ? 'editor.unreachableOne' : 'editor.unreachableMany', { count: ids.length })}</strong>
      <button type="button" className="fe-reachability-warning__dismiss" aria-label={t('editor.dismissUnreachable')}
        onClick={() => setVisible(false)}>X</button>
    </div>
    <p>{t('editor.unreachableHelp')}</p>
    <details>
      <summary>{t('editor.showUnreachable')}</summary>
      <ul>{ids.map((id) => <li key={id}>{eventLabel(flow, id, t)}</li>)}</ul>
    </details>
  </aside>
}

export default function EditorApp() {
  const { t, format } = useI18n()
  // Language changes must not reload or rename the open document.
  const initialT = useRef(t)
  const [flowchart, setFlowchart] = useState<FlowchartDocument | null>(null)
  const [flowcharts, setFlowcharts] = useState<FlowchartSummary[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const [view, setView] = useState<'people' | 'events' | 'flowchart'>('flowchart')
  const [sampleDataset, setSampleDataset] = useState<string>(DEFAULT_SAMPLE_DATASET.id)
  const [revision, setRevision] = useState(0)
  const [selectedCard, setSelectedCard] = useState<number | null>(null)
  const [busy, setBusy] = useState(true)
  const [loadError, setLoadError] = useState<LocalizedText>('')
  const [storageError, setStorageError] = useState<LocalizedText>('')
  const [actionError, setActionError] = useState<LocalizedText>('')
  const [notice, setNotice] = useState<LocalizedText>('')
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
      setStorageError(msg('editor.errors.save', { error: message(error) }))
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
            setNotice(msg('editor.notice.restored', { title: restored.title }))
          }
          return
        }
        const draft = localStorage.getItem(EDITOR_DRAFT_KEY)
        if (draft !== null) {
          const restored = readEditorDraft(JSON.parse(draft))
          if (active) {
            commit(createFlowchart(restored, initialT.current('editor.myFlowchartTitle')))
            setNotice(msg('editor.notice.migrated'))
          }
          return
        }
      } catch (error) {
        if (active) setLoadError(msg('editor.errors.restore', { error: message(error) }))
        return
      }
      try {
        const loaded = await loadGameFlow()
        if (active) {
          const initialFlow = readEditorDraft(loaded.flow)
          commit(createFlowchart(
            { ...initialFlow, mode: initialFlow.mode ?? 'all-unlocked' },
            initialT.current(loaded.sourceMessage?.key === 'game.source.sample' ? 'editor.sampleFlowchartTitle' : 'editor.myFlowchartTitle'),
          ))
          setNotice(msg('editor.notice.loaded', { source: loaded.sourceMessage ?? loaded.source }))
        }
      } catch (error) {
        if (active) setLoadError(msg('editor.errors.load', { error: message(error) }))
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
  const issues = useMemo(() => flow ? flowValidationIssues(flow) : [], [flow])
  const errors = issues.map((issue) => t(issue.key, issue.values))
  const invalidCardIds = useMemo(() => new Set(issues.flatMap((issue) => issue.cardIds ?? [])), [issues])
  const unreachable = useMemo(() => flow ? unreachableEventIds(flow) : [], [flow])
  const editCard = (id: number) => { setSelectedCard(id); setView('people') }
  const openDocument = (next: FlowchartDocument, detail: LocalizedText) => {
    commit(next)
    setRevision((value) => value + 1)
    setSelectedCard(null)
    setView('flowchart')
    setLoadError('')
    setActionError('')
    setNotice(detail)
  }
  const replace = (next: GameFlow, detail: LocalizedText, title = t('editor.importedFlowchartTitle')) => {
    openDocument(flowchart ? { ...flowchart, gameflow: next } : createFlowchart(next, title), detail)
  }
  const confirmLeave = () => !unsaved || window.confirm(t('editor.confirmLeave'))
  const confirmReplace = () => !flowchart || window.confirm(t('editor.confirmReplace', { title: flowchart.title }))
  const download = (draft: boolean) => {
    if (!flow) return
    try {
      const normalized = synchronizeFlow(flow)
      const problems = draft ? [] : validateFlow(normalized)
      if (problems.length) throw new LocalizedError('editor.errors.exportBlocked', { count: problems.length })
      downloadFlow(normalized, draft ? 'gameflow.draft.json' : 'gameflow.json')
      setActionError('')
      setNotice(msg(draft ? 'editor.notice.draftDownloaded' : 'editor.notice.exported'))
    } catch (error) {
      setActionError(message(error))
    }
  }
  const play = () => {
    if (!flowchart) return
    try {
      const normalized = synchronizeFlow(flowchart.gameflow)
      const problems = validateFlow(normalized)
      if (problems.length) throw new LocalizedError('editor.errors.playBlocked', { count: problems.length })
      if (!commit({ ...flowchart, gameflow: normalized })) {
        setActionError(msg('editor.errors.playNotSaved'))
        return
      }
      window.location.assign(playFlowchartUrl(flowchart.id))
    } catch (error) {
      setActionError(message(error))
    }
  }
  return <main className="flow-editor">
    <header className="fe-header">
      <div><p className="fe-eyebrow">{t('editor.eyebrow')}</p><h1>{t('editor.title')}</h1><p>{t('editor.subtitle')}</p></div>
      <div className="fe-header-actions">
        <button type="button" className="fe-primary fe-play" aria-label={t('editor.playCurrent')}
          title={flowchart ? t('editor.playTitle', { title: flowchart.title }) : t('editor.openToPlay')}
          disabled={busy || !flowchart} onClick={play}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 L21 12 L7 20 Z" fill="currentColor" /></svg>
        </button>
      </div>
    </header>
    <div className="fe-editor-layout">
      <aside className="fe-flowchart-library fe-panel" aria-labelledby="flowchart-library-title">
        <h2 id="flowchart-library-title">{t('editor.savedFlowcharts')}</h2>
        <button type="button" disabled={busy} onClick={() => {
          if (!confirmLeave()) return
          try {
            openDocument(createFlowchart(undefined, t('editor.defaultFlowchartTitle')), msg('editor.notice.created'))
          } catch (error) {
            setActionError(msg('editor.errors.create', { error: message(error) }))
          }
        }}>{t('editor.newFlowchart')}</button>
        <nav className="fe-flowchart-navigation" aria-label={t('editor.savedFlowcharts')}>
          {flowcharts.length > 0 ? <ul className="fe-flowchart-list">
            {flowcharts.map((item) => <li key={item.id}>
              <button type="button" disabled={busy} aria-current={flowchart?.id === item.id ? 'page' : undefined}
                title={`${item.title} (${item.id})`} onClick={() => {
                  if (flowchart?.id === item.id || !confirmLeave()) return
                  try {
                    const restored = getFlowchart(item.id)
                    openDocument({ ...restored, gameflow: readEditorDraft(restored.gameflow) }, msg('editor.notice.opened', { title: restored.title }))
                  } catch (error) {
                    setActionError(msg('editor.errors.open', { error: message(error) }))
                  }
                }}>
                <span className="fe-flowchart-list-title">{item.title}</span>
                <span className="fe-flowchart-list-id">{item.id.slice(0, 8)}</span>
              </button>
            </li>)}
          </ul> : <p className="fe-help">{t(busy ? 'editor.loadingFlowcharts' : 'editor.noSavedFlowcharts')}</p>}
        </nav>
      </aside>
      <div className="fe-editor-content">
        {flowchart && <section className="fe-flowchart-details fe-panel" aria-label={t('editor.currentFlowchart')}>
          <form className="fe-flowchart-title" onSubmit={(event) => {
            event.preventDefault()
            try {
              const renamed = renameFlowchart(flowchart, titleDraft)
              commit(renamed)
              setActionError('')
              setNotice(msg('editor.notice.renamed', { title: renamed.title }))
            } catch (error) {
              setActionError(message(error))
            }
          }}>
            <label>{t('editor.flowchartTitle')}<input value={titleDraft} disabled={busy} onChange={(event) => setTitleDraft(event.target.value)} /></label>
            <button type="submit" disabled={busy || titleDraft === flowchart.title}>{t('editor.rename')}</button>
          </form>
          <p className="fe-help fe-flowchart-id">{t('editor.permanentId')} <code>{flowchart.id}</code></p>
          <label>{t('editor.gameMode')}
            <select value={flowchart.gameflow.mode ?? 'progression'} disabled={busy} aria-describedby="game-mode-help"
              onChange={(event) => {
                const mode = event.target.value
                change((current) => {
                  if (mode !== 'progression' && mode !== 'all-unlocked') throw new LocalizedError('errors.mode')
                  return { ...current, mode }
                })
              }}>
              <option value="progression">{t('editor.modeProgression')}</option>
              <option value="all-unlocked">{t('editor.modeAllUnlocked')}</option>
            </select>
          </label>
          <p id="game-mode-help" className="fe-help">{t(flowchart.gameflow.mode === 'all-unlocked'
            ? 'editor.allUnlockedHelp' : 'editor.progressionHelp')}</p>
        </section>}
        <section className="fe-toolbar" aria-label={t('editor.fileActions')}>
          <button type="button" disabled={busy} onClick={() => importInput.current?.click()}>{t('editor.import')}</button>
          <input className="fe-file-input" type="file" accept=".json,application/json" ref={importInput} aria-label={t('editor.importLabel')}
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              setBusy(true)
              try {
                const imported = readEditorDraft(JSON.parse(await file.text()))
                if (confirmReplace()) replace(imported, msg('editor.notice.imported', { filename: file.name }), file.name.replace(/\.json$/i, ''))
              } catch (error) {
                setActionError(msg('editor.errors.import', { error: message(error) }))
              } finally {
                setBusy(false)
              }
            }} />
          <button type="button" disabled={busy} onClick={async () => {
            if (!confirmReplace()) return
            setBusy(true)
            try {
              const loaded = await loadGameFlow()
              replace(readEditorDraft(loaded.flow), msg('editor.notice.loaded', { source: loaded.sourceMessage ?? loaded.source }))
            } catch (error) {
              setLoadError(msg('editor.errors.publicFile', { error: message(error) }))
            } finally {
              setBusy(false)
            }
          }}>{t('editor.loadPublic')}</button>
          <label>{t('editor.sampleDataset')}
            <select value={sampleDataset} disabled={busy} onChange={(event) => setSampleDataset(event.target.value)}>
              {SAMPLE_DATASETS.map((dataset) => <option key={dataset.id} value={dataset.id}>{t(dataset.titleKey, dataset.titleValues)}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={async () => {
            if (!confirmReplace()) return
            setBusy(true)
            try {
              const loaded = await loadSampleDataset(sampleDataset)
              replace(readEditorDraft(loaded.flow), msg('editor.notice.sampleLoaded', { source: loaded.sourceMessage ?? loaded.source }))
            } catch (error) {
              setActionError(msg('editor.errors.sample', { error: message(error) }))
            } finally {
              setBusy(false)
            }
          }}>{t('editor.loadSample')}</button>
          <button type="button" disabled={busy || !flow} onClick={() => download(true)}>{t('editor.downloadDraft')}</button>
          <button type="button" className="fe-primary" disabled={busy || !flow} onClick={() => download(false)}>{t('editor.export')}</button>
        </section>
        <p className="fe-help fe-export-help">{t('editor.exportHelp')}</p>
        <div className="fe-status" role="status" aria-live="polite">
          {busy ? t('app.loading') : flow ? t('editor.status', {
            people: flow.persons.length, cards: flow.namecards.length, phones: flow.telephoneEvents.length,
            nextPersonId: flow.nextPersonId, nextNamecardId: flow.nextNamecardId,
            nextTelephoneEventId: flow.nextTelephoneEventId, nextId: flow.nextId,
            saved: t(unsaved ? 'editor.notSaved' : 'editor.saved'),
          }) : t('editor.noFlow')}
          {notice && <p>{format(notice)}</p>}
        </div>
        {loadError && <div className="fe-alert" role="alert">{format(loadError)}</div>}
        {storageError && <div className="fe-alert" role="alert">{format(storageError)}
          <button type="button" disabled={!flowchart || busy} onClick={() => {
            if (flowchart && commit(flowchart)) setActionError('')
          }}>{t('editor.retrySave')}</button>
        </div>}
        {actionError && <div className="fe-alert" role="alert">{format(actionError)}</div>}
        {flow && <>
          <section className={`fe-validation ${errors.length ? 'fe-validation--invalid' : ''}`} aria-label={t('editor.validationLabel')} aria-live="polite">
            <details open={errors.length > 0}>
              <summary>{errors.length ? t('editor.validationBlocked', { count: errors.length }) : t('editor.validationReady')}</summary>
              {errors.length > 0 && <ul>{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>}
            </details>
          </section>
          {flow.startingCards.some((id) => !flow.namecards.some((card) => card.id === id)) && <div className="fe-alert">
            {t('editor.missingStartingCards')}
            <button type="button" onClick={() => change((current) => ({
              ...current, startingCards: current.startingCards.filter((id) => current.namecards.some((card) => card.id === id)),
            }))}>{t('editor.removeMissingStartingCards')}</button>
          </div>}
          <div className="fe-view-switch" role="group" aria-label={t('editor.view')}>
            <button type="button" aria-pressed={view === 'people'} onClick={() => setView('people')}>{t('editor.personView')}</button>
            <button type="button" aria-pressed={view === 'events'} onClick={() => setView('events')}>{t('editor.eventView')}</button>
            <button type="button" aria-pressed={view === 'flowchart'} onClick={() => setView('flowchart')}>{t('editor.flowchartView')}</button>
          </div>
          <fieldset className="fe-workspace" disabled={busy}>
            <legend className="fe-sr-only">{t(view === 'people' ? 'editor.personEditor' : view === 'events' ? 'editor.eventEditor' : 'editor.flowchartEditor')}</legend>
            {view === 'people'
              ? <PersonView flow={flow} change={change} selectedCard={selectedCard} selectCard={setSelectedCard} invalidCardIds={invalidCardIds} />
              : view === 'events'
                ? <EventView flow={flow} change={change} editCard={editCard} invalidCardIds={invalidCardIds} />
                : <EventFlowchart key={revision} flow={flow} change={change} editCard={editCard}
                  unreachableIds={unreachable} invalidCardIds={invalidCardIds} disabled={busy}
                  reportError={setActionError} showEvents={() => setView('events')} />}
          </fieldset>
          {unreachable.length > 0 && <UnreachableEventsWarning key={`${revision}:${unreachable.join(',')}`} flow={flow} ids={unreachable} />}
        </>}
      </div>
    </div>
  </main>
}
