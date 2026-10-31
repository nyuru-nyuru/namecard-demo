import type { Namecard } from '../model/namecard'
import { english, LocalizedError, msg, type Message, type Translator } from '../i18n/messages.ts'

export type GameCard = Omit<Namecard, 'personId' | 'backViewed'> & {
  objectId: number
  personId: number | null
  personDisplayName: string
  backText: string
  logo?: string
  companyId?: number | null
  department?: string
  unlocks: number[]
}

export type GamePerson = {
  id: number
  objectId: number
  name: string
  namecards: number[]
}

export type TelephoneEvent = {
  id: number
  objectId: number
  personId: number
  unlocks: number[]
}

export type EventPosition = { x: number; y: number }

export type GameFlowMode = 'progression' | 'all-unlocked'

export type FlowValidationIssue = Message & { cardIds?: number[] }

export type GameFlow = {
  version: 1
  mode?: GameFlowMode
  nextId: number
  nextPersonId: number
  nextNamecardId: number
  nextTelephoneEventId: number
  persons: GamePerson[]
  namecards: GameCard[]
  telephoneEvents: TelephoneEvent[]
  startingCards: number[]
  eventPositions?: Record<number, EventPosition>
}

export function emptyFlow(): GameFlow {
  return {
    version: 1, nextId: 0, nextPersonId: 0, nextNamecardId: 0, nextTelephoneEventId: 0,
    persons: [], namecards: [], telephoneEvents: [], startingCards: [],
  }
}

export const entityCounters = {
  persons: 'nextPersonId',
  namecards: 'nextNamecardId',
  telephoneEvents: 'nextTelephoneEventId',
} as const

export function identityMessages(flow: GameFlow): Message[] {
  const errors: Message[] = []
  const objectIds = [...flow.persons, ...flow.namecards, ...flow.telephoneEvents].map((entity) => entity.objectId)
  const validIds = (ids: number[]) =>
    ids.every((id) => Number.isSafeInteger(id) && id >= 0) && new Set(ids).size === ids.length
  if (!validIds(objectIds)) errors.push(msg('validation.uniqueIds'))
  if (!Number.isSafeInteger(flow.nextId) || flow.nextId < 0 || objectIds.some((id) => id >= flow.nextId)) {
    errors.push(msg('validation.nextId'))
  }
  for (const kind of ['persons', 'namecards', 'telephoneEvents'] as const) {
    const ids = flow[kind].map((entity) => entity.id)
    if (!validIds(ids)) errors.push(msg('validation.typeIds', { kind }))
    const counter = entityCounters[kind]
    if (!Number.isSafeInteger(flow[counter]) || flow[counter] < 0 || ids.some((id) => id >= flow[counter])) {
      errors.push(msg('validation.typeCounter', { counter, kind }))
    }
  }
  return errors
}

export function identityErrors(flow: GameFlow, t: Translator = english): string[] {
  return identityMessages(flow).map((message) => t(message.key, message.values))
}

// Ownership is authoritative; answer keys and telephone edges are derived from it.
export function synchronizeFlow(flow: GameFlow): GameFlow {
  const phoneIds = new Set(flow.telephoneEvents.map((event) => event.objectId))
  return {
    ...flow,
    persons: flow.persons.map((person) => ({
      ...person,
      namecards: flow.namecards
        .filter((card) => card.personId === person.id)
        .sort((a, b) => a.year - b.year || a.id - b.id)
        .map((card) => card.id),
    })),
    namecards: flow.namecards.map((card) => ({
      ...card,
      unlocks: [
        ...card.unlocks.filter((id) => !phoneIds.has(id)),
        ...flow.telephoneEvents.filter((event) => event.personId === card.personId).map((event) => event.objectId),
      ],
    })),
  }
}

export function incomingConditions(flow: GameFlow, cardId: number): number[] {
  const card = flow.namecards.find((card) => card.id === cardId)
  if (!card) throw new LocalizedError('errors.cardMissing', { id: cardId })
  return [...flow.namecards, ...flow.telephoneEvents]
    .filter((source) => source.unlocks.includes(card.objectId))
    .map((source) => source.objectId)
}

export function isAutomaticRelation(flow: GameFlow, sourceId: number, targetId: number): boolean {
  const card = flow.namecards.find((item) => item.objectId === sourceId)
  return card !== undefined && flow.telephoneEvents.some((event) =>
    event.objectId === targetId && event.personId === card.personId,
  )
}

export function startingCardIds(flow: GameFlow): number[] {
  return flow.mode === 'all-unlocked' ? flow.namecards.map((card) => card.id) : [...flow.startingCards]
}

export function obtainableCards(flow: GameFlow): Set<number> {
  const owned = new Set(startingCardIds(flow))
  let changed = true
  while (changed) {
    changed = false
    const satisfied = new Set([
      ...flow.namecards.filter((card) => owned.has(card.id) && card.backText.trim()).map((card) => card.objectId),
      ...flow.telephoneEvents
        .filter((event) => flow.persons.find((person) => person.id === event.personId)
          ?.namecards.every((id) => owned.has(id)))
        .map((event) => event.objectId),
    ])
    for (const card of flow.namecards) {
      const conditions = incomingConditions(flow, card.id)
      if (!owned.has(card.id) && conditions.length > 0 && conditions.every((id) => satisfied.has(id))) {
        owned.add(card.id)
        changed = true
      }
    }
  }
  return owned
}

export function unreachableEventIds(flow: GameFlow): number[] {
  const owned = obtainableCards(flow)
  return [
    ...flow.namecards.filter((card) => !owned.has(card.id)),
    ...flow.telephoneEvents.filter((event) => {
      const person = flow.persons.find((person) => person.id === event.personId)
      return !person || !person.namecards.every((id) => owned.has(id))
    }),
  ].map((event) => event.objectId).sort((a, b) => a - b)
}

export function flowValidationIssues(flow: GameFlow): FlowValidationIssue[] {
  const errors: FlowValidationIssue[] = identityMessages(flow)
  const cards = new Map(flow.namecards.map((card) => [card.id, card]))
  const cardObjects = new Map(flow.namecards.map((card) => [card.objectId, card]))
  const phones = new Map(flow.telephoneEvents.map((event) => [event.objectId, event]))
  const starting = new Set(startingCardIds(flow))
  if (flow.persons.length === 0) errors.push(msg('validation.personRequired'))
  if (new Set(flow.startingCards).size !== flow.startingCards.length ||
    flow.startingCards.some((id) => !cards.has(id))) errors.push(msg('validation.startingCards'))
  for (const [id, position] of Object.entries(flow.eventPositions ?? {})) {
    if ((!cardObjects.has(Number(id)) && !phones.has(Number(id))) ||
      !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      const card = cardObjects.get(Number(id))
      errors.push({ ...msg('validation.position', { id }), cardIds: card ? [card.id] : [] })
    }
  }
  for (const person of flow.persons) {
    if (!person.name.trim()) errors.push(msg('validation.personName', { id: person.id }))
    if (person.namecards.length > 8) errors.push(msg('validation.cardCapacity', { name: person.name }))
    const expected = flow.namecards.filter((card) => card.personId === person.id)
      .sort((a, b) => a.year - b.year || a.id - b.id).map((card) => card.id)
    if (JSON.stringify(person.namecards) !== JSON.stringify(expected)) {
      errors.push(msg('validation.answerKey', { name: person.name }))
    }
    const phoneCount = flow.telephoneEvents.filter((event) => event.personId === person.id).length
    if (phoneCount > 1 || (expected.length > 0 && phoneCount !== 1)) {
      errors.push(msg('validation.telephoneCount', { name: person.name }))
    }
  }
  for (const card of flow.namecards) {
    const cardErrors: Message[] = []
    if (!flow.persons.some((person) => person.id === card.personId)) cardErrors.push(msg('validation.cardOwner', { id: card.id }))
    if (!card.company.trim() || !card.personDisplayName.trim()) {
      cardErrors.push(msg('validation.cardFields', { id: card.id }))
    }
    if (!Number.isInteger(card.year) || card.year < 1 || card.year > 9999) cardErrors.push(msg('validation.cardYear', { id: card.id }))
    const ownPhone = flow.telephoneEvents.find((event) => event.personId === card.personId)
    if (ownPhone && !card.unlocks.includes(ownPhone.objectId)) cardErrors.push(msg('validation.cardTelephone', { id: card.id }))
    if (flow.mode !== 'all-unlocked' && card.unlocks.some((id) => cardObjects.has(id)) && !card.backText.trim()) {
      cardErrors.push(msg('validation.cardBack', { id: card.id }))
    }
    if (!starting.has(card.id) && incomingConditions(flow, card.id).length === 0) {
      cardErrors.push(msg('validation.cardCondition', { id: card.id }))
    }
    for (const id of card.unlocks) {
      if (!cardObjects.has(id) && !phones.has(id)) cardErrors.push(msg('validation.missingTarget', { id: card.id, target: id }))
      if (id === card.objectId) cardErrors.push(msg('validation.selfUnlock', { id: card.id }))
      if (phones.has(id) && phones.get(id)?.personId !== card.personId) cardErrors.push(msg('validation.wrongTelephone', { id: card.id }))
    }
    if (new Set(card.unlocks).size !== card.unlocks.length) cardErrors.push(msg('validation.duplicateCardEdges', { id: card.id }))
    errors.push(...cardErrors.map((message) => ({ ...message, cardIds: [card.id] })))
  }
  for (const event of flow.telephoneEvents) {
    if (!flow.persons.some((person) => person.id === event.personId)) errors.push(msg('validation.telephonePerson', { id: event.id }))
    if (event.unlocks.some((id) => !cardObjects.has(id))) errors.push(msg('validation.telephoneTargets', { id: event.id }))
    if (new Set(event.unlocks).size !== event.unlocks.length) errors.push(msg('validation.duplicateTelephoneEdges', { id: event.id }))
  }
  if (errors.length === 0) {
    const reachable = obtainableCards(flow)
    const missing = flow.namecards.filter((card) => !reachable.has(card.id))
    if (missing.length) errors.push({
      ...msg('validation.unobtainable', { cards: missing.map((card) => `#${card.id}`).join(', ') }),
      cardIds: missing.map((card) => card.id),
    })
  }
  return errors
}

export function validateFlow(flow: GameFlow, t: Translator = english): string[] {
  return flowValidationIssues(flow).map((message) => t(message.key, message.values))
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new LocalizedError('errors.object', { path })
  return value as Record<string, unknown>
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new LocalizedError('errors.integer', { path })
  return value
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new LocalizedError('errors.text', { path })
  return value
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new LocalizedError('errors.array', { path })
  return value
}

function idList(value: unknown, path: string): number[] {
  return array(value, path).map((id) => integer(id, path))
}

function readEventPositions(value: unknown): Record<number, EventPosition> {
  const positions: Record<number, EventPosition> = {}
  for (const [key, rawPosition] of Object.entries(object(value, 'eventPositions'))) {
    const id = Number(key)
    if (!Number.isSafeInteger(id) || id < 0 || String(id) !== key) {
      throw new LocalizedError('errors.positionKeys')
    }
    const position = object(rawPosition, `eventPositions.${key}`)
    if (typeof position.x !== 'number' || typeof position.y !== 'number' ||
      !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new LocalizedError('errors.positionCoordinates', { id: key })
    }
    positions[id] = { x: position.x, y: position.y }
  }
  return positions
}

// Draft imports may be semantically incomplete, but must always have a valid shape.
export function readFlow(value: unknown): GameFlow {
  const root = object(value, 'Gameflow')
  if (root.version !== 1) throw new LocalizedError('errors.version')
  const mode = root.mode
  if (mode !== undefined && mode !== 'progression' && mode !== 'all-unlocked') throw new LocalizedError('errors.mode')
  const nextId = integer(root.nextId, 'nextId')
  const identity = (entity: Record<string, unknown>, path: string) => {
    const id = integer(entity.id, `${path}.id`)
    // Legacy files used the same ID for both domain identity and graph identity.
    return { id, objectId: entity.objectId === undefined ? id : integer(entity.objectId, `${path}.objectId`) }
  }
  return {
    version: 1,
    ...(mode === undefined ? {} : { mode }),
    nextId,
    nextPersonId: root.nextPersonId === undefined ? nextId : integer(root.nextPersonId, 'nextPersonId'),
    nextNamecardId: root.nextNamecardId === undefined ? nextId : integer(root.nextNamecardId, 'nextNamecardId'),
    nextTelephoneEventId: root.nextTelephoneEventId === undefined ? nextId : integer(root.nextTelephoneEventId, 'nextTelephoneEventId'),
    startingCards: idList(root.startingCards, 'startingCards'),
    persons: array(root.persons, 'persons').map((value) => {
      const person = object(value, 'Person')
      return { ...identity(person, 'Person'), name: text(person.name, 'Person.name'), namecards: idList(person.namecards, 'Person.namecards') }
    }),
    namecards: array(root.namecards, 'namecards').map((value) => {
      const card = object(value, 'Namecard')
      return {
        ...identity(card, 'Namecard'),
        personId: card.personId === null ? null : integer(card.personId, 'Namecard.personId'),
        company: text(card.company, 'Namecard.company'),
        role: card.role === undefined ? '' : text(card.role, 'Namecard.role'),
        year: integer(card.year, 'Namecard.year'),
        personDisplayName: text(card.personDisplayName, 'Namecard.personDisplayName'),
        misc: card.misc === undefined ? '' : text(card.misc, 'Namecard.misc'),
        backText: text(card.backText, 'Namecard.backText'),
        ...(card.logo === undefined ? {} : { logo: text(card.logo, 'Namecard.logo') }),
        ...(card.companyId === undefined ? {} : { companyId: card.companyId === null ? null : integer(card.companyId, 'Namecard.companyId') }),
        ...(card.department === undefined ? {} : { department: text(card.department, 'Namecard.department') }),
        unlocks: idList(card.unlocks, 'Namecard.unlocks'),
      }
    }),
    telephoneEvents: array(root.telephoneEvents, 'telephoneEvents').map((value) => {
      const event = object(value, 'TelephoneEvent')
      return { ...identity(event, 'TelephoneEvent'), personId: integer(event.personId, 'TelephoneEvent.personId'), unlocks: idList(event.unlocks, 'TelephoneEvent.unlocks') }
    }),
    ...(root.eventPositions === undefined ? {} : { eventPositions: readEventPositions(root.eventPositions) }),
  }
}

export function parseGameFlow(value: unknown): GameFlow {
  const flow = readFlow(value)
  const errors = flowValidationIssues(flow)
  if (errors.length) throw new LocalizedError('errors.validation', { issues: errors })
  return flow
}
