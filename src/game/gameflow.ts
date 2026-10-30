import type { Namecard } from '../model/namecard'

export type GameCard = Omit<Namecard, 'personId' | 'backViewed'> & {
  personId: number | null
  personDisplayName: string
  backText: string
  unlocks: number[]
}

export type GamePerson = {
  id: number
  name: string
  namecards: number[]
}

export type TelephoneEvent = {
  id: number
  personId: number
  unlocks: number[]
}

export type EventPosition = { x: number; y: number }

export type GameFlow = {
  version: 1
  nextId: number
  persons: GamePerson[]
  namecards: GameCard[]
  telephoneEvents: TelephoneEvent[]
  startingCards: number[]
  eventPositions?: Record<number, EventPosition>
}

export function emptyFlow(): GameFlow {
  return { version: 1, nextId: 0, persons: [], namecards: [], telephoneEvents: [], startingCards: [] }
}

// Ownership is authoritative; answer keys and telephone edges are derived from it.
export function synchronizeFlow(flow: GameFlow): GameFlow {
  const phoneIds = new Set(flow.telephoneEvents.map((event) => event.id))
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
        ...flow.telephoneEvents.filter((event) => event.personId === card.personId).map((event) => event.id),
      ],
    })),
  }
}

export function incomingConditions(flow: GameFlow, cardId: number): number[] {
  return [...flow.namecards, ...flow.telephoneEvents]
    .filter((source) => source.unlocks.includes(cardId))
    .map((source) => source.id)
}

export function isAutomaticRelation(flow: GameFlow, sourceId: number, targetId: number): boolean {
  const card = flow.namecards.find((item) => item.id === sourceId)
  return card !== undefined && flow.telephoneEvents.some((event) =>
    event.id === targetId && event.personId === card.personId,
  )
}

export function obtainableCards(flow: GameFlow): Set<number> {
  const owned = new Set(flow.startingCards)
  let changed = true
  while (changed) {
    changed = false
    const satisfied = new Set([
      ...flow.namecards.filter((card) => owned.has(card.id) && card.backText.trim()).map((card) => card.id),
      ...flow.telephoneEvents
        .filter((event) => flow.persons.find((person) => person.id === event.personId)
          ?.namecards.every((id) => owned.has(id)))
        .map((event) => event.id),
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
  ].map((event) => event.id).sort((a, b) => a - b)
}

export function validateFlow(flow: GameFlow): string[] {
  const errors: string[] = []
  const entities = [...flow.persons, ...flow.namecards, ...flow.telephoneEvents]
  const ids = entities.map((entity) => entity.id)
  const cards = new Map(flow.namecards.map((card) => [card.id, card]))
  const phones = new Map(flow.telephoneEvents.map((event) => [event.id, event]))
  if (flow.persons.length === 0) errors.push('Add at least one person.')
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 0) || new Set(ids).size !== ids.length) {
    errors.push('All entity IDs must be unique nonnegative safe integers, including telephone events.')
  }
  if (!Number.isSafeInteger(flow.nextId) || flow.nextId < 0 || ids.some((id) => id >= flow.nextId)) {
    errors.push('nextId must be a safe integer greater than every existing ID.')
  }
  if (new Set(flow.startingCards).size !== flow.startingCards.length ||
    flow.startingCards.some((id) => !cards.has(id))) errors.push('Starting cards must be distinct existing card IDs.')
  for (const [id, position] of Object.entries(flow.eventPositions ?? {})) {
    if ((!cards.has(Number(id)) && !phones.has(Number(id))) ||
      !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      errors.push(`Layout position #${id} must reference an existing event and have finite coordinates.`)
    }
  }
  for (const person of flow.persons) {
    if (!person.name.trim()) errors.push(`Person #${person.id} needs a name.`)
    if (person.namecards.length > 8) errors.push(`${person.name} has more than eight cards.`)
    const expected = flow.namecards.filter((card) => card.personId === person.id)
      .sort((a, b) => a.year - b.year || a.id - b.id).map((card) => card.id)
    if (JSON.stringify(person.namecards) !== JSON.stringify(expected)) {
      errors.push(`${person.name}'s answer key must contain exactly their cards, sorted by year then ID.`)
    }
    const phoneCount = flow.telephoneEvents.filter((event) => event.personId === person.id).length
    if (phoneCount > 1 || (expected.length > 0 && phoneCount !== 1)) {
      errors.push(`${person.name} must have exactly one telephone event when they have cards, and at most one otherwise.`)
    }
  }
  for (const card of flow.namecards) {
    if (!flow.persons.some((person) => person.id === card.personId)) errors.push(`Card #${card.id} must belong to a person.`)
    if (!card.company.trim() || !card.role.trim() || !card.personDisplayName.trim()) {
      errors.push(`Card #${card.id} needs a company, role, and display name.`)
    }
    if (!Number.isInteger(card.year) || card.year < 1 || card.year > 9999) errors.push(`Card #${card.id} needs a year from 1 to 9999.`)
    const ownPhone = flow.telephoneEvents.find((event) => event.personId === card.personId)
    if (ownPhone && !card.unlocks.includes(ownPhone.id)) errors.push(`Card #${card.id} must link to its owner's telephone event.`)
    if (card.unlocks.some((id) => cards.has(id)) && !card.backText.trim()) {
      errors.push(`Card #${card.id} unlocks another card but has no information on its back.`)
    }
    if (!flow.startingCards.includes(card.id) && incomingConditions(flow, card.id).length === 0) {
      errors.push(`Card #${card.id} is neither a starting card nor unlocked by an event.`)
    }
    for (const id of card.unlocks) {
      if (!cards.has(id) && !phones.has(id)) errors.push(`Card #${card.id} has a missing unlock target #${id}.`)
      if (id === card.id) errors.push(`Card #${card.id} cannot unlock itself.`)
      if (phones.has(id) && phones.get(id)?.personId !== card.personId) errors.push(`Card #${card.id} links to another person's telephone.`)
    }
    if (new Set(card.unlocks).size !== card.unlocks.length) errors.push(`Card #${card.id} has duplicate unlock edges.`)
  }
  for (const event of flow.telephoneEvents) {
    if (!flow.persons.some((person) => person.id === event.personId)) errors.push(`Telephone #${event.id} references a missing person.`)
    if (event.unlocks.some((id) => !cards.has(id))) errors.push(`Telephone #${event.id} can only unlock existing cards.`)
    if (new Set(event.unlocks).size !== event.unlocks.length) errors.push(`Telephone #${event.id} has duplicate unlock edges.`)
  }
  if (errors.length === 0) {
    const reachable = obtainableCards(flow)
    const missing = flow.namecards.filter((card) => !reachable.has(card.id))
    if (missing.length) errors.push(`Unobtainable cards (circular or blocked conditions): ${missing.map((card) => `#${card.id}`).join(', ')}.`)
  }
  return errors
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
  return value as Record<string, unknown>
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${path} must be a safe integer.`)
  return value
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be text.`)
  return value
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`)
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
      throw new Error('eventPositions keys must be nonnegative event IDs.')
    }
    const position = object(rawPosition, `eventPositions.${key}`)
    if (typeof position.x !== 'number' || typeof position.y !== 'number' ||
      !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new Error(`eventPositions.${key} must have finite numeric x and y coordinates.`)
    }
    positions[id] = { x: position.x, y: position.y }
  }
  return positions
}

// Draft imports may be semantically incomplete, but must always have a valid shape.
export function readFlow(value: unknown): GameFlow {
  const root = object(value, 'Gameflow')
  if (root.version !== 1) throw new Error('Unsupported gameflow version; expected version 1.')
  return {
    version: 1,
    nextId: integer(root.nextId, 'nextId'),
    startingCards: idList(root.startingCards, 'startingCards'),
    persons: array(root.persons, 'persons').map((value) => {
      const person = object(value, 'Person')
      return { id: integer(person.id, 'Person.id'), name: text(person.name, 'Person.name'), namecards: idList(person.namecards, 'Person.namecards') }
    }),
    namecards: array(root.namecards, 'namecards').map((value) => {
      const card = object(value, 'Namecard')
      return {
        id: integer(card.id, 'Namecard.id'),
        personId: card.personId === null ? null : integer(card.personId, 'Namecard.personId'),
        company: text(card.company, 'Namecard.company'),
        role: text(card.role, 'Namecard.role'),
        year: integer(card.year, 'Namecard.year'),
        personDisplayName: text(card.personDisplayName, 'Namecard.personDisplayName'),
        backText: text(card.backText, 'Namecard.backText'),
        unlocks: idList(card.unlocks, 'Namecard.unlocks'),
      }
    }),
    telephoneEvents: array(root.telephoneEvents, 'telephoneEvents').map((value) => {
      const event = object(value, 'TelephoneEvent')
      return { id: integer(event.id, 'TelephoneEvent.id'), personId: integer(event.personId, 'TelephoneEvent.personId'), unlocks: idList(event.unlocks, 'TelephoneEvent.unlocks') }
    }),
    ...(root.eventPositions === undefined ? {} : { eventPositions: readEventPositions(root.eventPositions) }),
  }
}

export function parseGameFlow(value: unknown): GameFlow {
  const flow = readFlow(value)
  const errors = validateFlow(flow)
  if (errors.length) throw new Error(errors.join('\n'))
  return flow
}
