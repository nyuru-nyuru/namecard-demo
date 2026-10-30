import { isAutomaticRelation, readFlow, synchronizeFlow, type EventPosition, type GameCard, type GameFlow } from '../game/gameflow.ts'

export const EDITOR_DRAFT_KEY = 'namecard-game.editor-draft.v1'

function allocate(flow: GameFlow, count: number): number {
  const ids = [...flow.persons, ...flow.namecards, ...flow.telephoneEvents].map(({ id }) => id)
  if (!Number.isSafeInteger(flow.nextId) || flow.nextId < 0 ||
    ids.some((id) => id >= flow.nextId) || !Number.isSafeInteger(flow.nextId + count)) {
    throw new Error('Cannot allocate IDs: nextId must exceed every existing ID and leave room for new IDs.')
  }
  return flow.nextId
}

export function readEditorDraft(value: unknown): GameFlow {
  let flow = readFlow(value)
  const ids = [...flow.persons, ...flow.namecards, ...flow.telephoneEvents].map(({ id }) => id)
  if (ids.some((id) => id < 0) || new Set(ids).size !== ids.length) {
    throw new Error('Draft IDs must be unique nonnegative integers across people, cards, and telephones.')
  }
  allocate(flow, 0)
  for (const phone of flow.telephoneEvents) {
    if (!flow.persons.some((person) => person.id === phone.personId)) {
      throw new Error(`Telephone #${phone.id} has no person. Repair its personId in the JSON before importing.`)
    }
    if (flow.telephoneEvents.filter((event) => event.personId === phone.personId).length > 1) {
      throw new Error(`Person #${phone.personId} has multiple telephone events. Keep one in the JSON before importing.`)
    }
  }
  for (const person of flow.persons) {
    if (flow.namecards.some((card) => card.personId === person.id)) {
      flow = ensureTelephone(flow, person.id)
    }
  }
  return synchronizeFlow(flow)
}

export function addPerson(flow: GameFlow, name = 'New person'): GameFlow {
  const id = allocate(flow, 2)
  return synchronizeFlow({
    ...flow,
    nextId: id + 2,
    persons: [...flow.persons, { id, name, namecards: [] }],
    telephoneEvents: [...flow.telephoneEvents, { id: id + 1, personId: id, unlocks: [] }],
  })
}

export function renamePerson(flow: GameFlow, id: number, name: string): GameFlow {
  return { ...flow, persons: flow.persons.map((person) => person.id === id ? { ...person, name } : person) }
}

function checkOwner(flow: GameFlow, personId: number | null, cardId?: number) {
  if (personId === null) return
  if (!flow.persons.some((person) => person.id === personId)) throw new Error('Choose an existing person or Unassigned.')
  if (flow.namecards.filter((card) => card.personId === personId && card.id !== cardId).length >= 8) {
    throw new Error('A person can own at most eight cards. Move or remove a card first.')
  }
}

function ensureTelephone(flow: GameFlow, personId: number | null): GameFlow {
  if (personId === null || flow.telephoneEvents.some((event) => event.personId === personId)) return flow
  const id = allocate(flow, 1)
  return {
    ...flow,
    nextId: id + 1,
    telephoneEvents: [...flow.telephoneEvents, { id, personId, unlocks: [] }],
  }
}

export function addTelephone(flow: GameFlow, personId: number): GameFlow {
  if (!flow.persons.some((person) => person.id === personId)) throw new Error('Choose an existing person for the telephone.')
  if (flow.telephoneEvents.some((event) => event.personId === personId)) throw new Error('This person already has a telephone event.')
  return synchronizeFlow(ensureTelephone(flow, personId))
}

export function addCard(flow: GameFlow, personId: number | null = null): GameFlow {
  checkOwner(flow, personId)
  const id = allocate(flow, 1)
  return synchronizeFlow(ensureTelephone({
    ...flow,
    nextId: id + 1,
    namecards: [...flow.namecards, {
      id,
      personId,
      personDisplayName: flow.persons.find((person) => person.id === personId)?.name ?? '',
      company: '',
      role: '',
      year: new Date().getFullYear(),
      backText: '',
      unlocks: [],
    }],
  }, personId))
}

export function updateCard(
  flow: GameFlow,
  id: number,
  patch: Partial<Pick<GameCard, 'personId' | 'personDisplayName' | 'company' | 'role' | 'year' | 'backText'>>,
): GameFlow {
  const card = flow.namecards.find((card) => card.id === id)
  if (!card) throw new Error(`Card #${id} does not exist.`)
  if ('personId' in patch) checkOwner(flow, patch.personId ?? null, id)
  if ('year' in patch && !Number.isSafeInteger(patch.year)) throw new Error('Year must be a whole number.')
  return synchronizeFlow(ensureTelephone({
    ...flow,
    namecards: flow.namecards.map((card) => card.id === id ? { ...card, ...patch } : card),
  }, 'personId' in patch ? patch.personId ?? null : card.personId))
}

function removeReferences(flow: GameFlow, ids: Set<number>): GameFlow {
  return synchronizeFlow({
    ...flow,
    namecards: flow.namecards.filter((card) => !ids.has(card.id))
      .map((card) => ({ ...card, unlocks: card.unlocks.filter((id) => !ids.has(id)) })),
    telephoneEvents: flow.telephoneEvents.filter((event) => !ids.has(event.id))
      .map((event) => ({ ...event, unlocks: event.unlocks.filter((id) => !ids.has(id)) })),
    startingCards: flow.startingCards.filter((id) => !ids.has(id)),
    ...(flow.eventPositions === undefined ? {} : {
      eventPositions: Object.fromEntries(Object.entries(flow.eventPositions).filter(([id]) => !ids.has(Number(id)))),
    }),
  })
}

export function removeCard(flow: GameFlow, id: number): GameFlow {
  const card = flow.namecards.find((card) => card.id === id)
  if (!card) throw new Error(`Card #${id} does not exist.`)
  const ids = new Set([id])
  if (card.personId !== null && !flow.namecards.some((item) => item.id !== id && item.personId === card.personId)) {
    for (const phone of flow.telephoneEvents.filter((event) => event.personId === card.personId)) ids.add(phone.id)
  }
  return removeReferences(flow, ids)
}

export function removePerson(flow: GameFlow, id: number): GameFlow {
  const removedIds = new Set([id, ...flow.telephoneEvents.filter((event) => event.personId === id).map((event) => event.id)])
  return removeReferences({
    ...flow,
    persons: flow.persons.filter((person) => person.id !== id),
    namecards: flow.namecards.map((card) => card.personId === id ? { ...card, personId: null } : card),
  }, removedIds)
}

export function setStartingCard(flow: GameFlow, id: number, enabled: boolean): GameFlow {
  if (enabled && !flow.namecards.some((card) => card.id === id)) throw new Error('Only existing cards can be starting cards.')
  return {
    ...flow,
    startingCards: enabled
      ? [...new Set([...flow.startingCards, id])]
      : flow.startingCards.filter((cardId) => cardId !== id),
  }
}

export function setUnlock(flow: GameFlow, sourceId: number, targetId: number, enabled: boolean): GameFlow {
  const source = [...flow.namecards, ...flow.telephoneEvents].find((event) => event.id === sourceId)
  if (!source) throw new Error('The source event no longer exists.')
  if (isAutomaticRelation(flow, sourceId, targetId)) {
    throw new Error('Card-to-telephone links are automatic. Change card ownership instead.')
  }
  if (enabled && (!flow.namecards.some((card) => card.id === targetId) || sourceId === targetId)) {
    throw new Error('Select a different existing card as the unlock target.')
  }
  const unlocks = enabled ? [...new Set([...source.unlocks, targetId])] : source.unlocks.filter((id) => id !== targetId)
  return synchronizeFlow({
    ...flow,
    namecards: flow.namecards.map((card) => card.id === sourceId ? { ...card, unlocks } : card),
    telephoneEvents: flow.telephoneEvents.map((event) => event.id === sourceId ? { ...event, unlocks } : event),
  })
}

export function removeGraphSelection(
  flow: GameFlow,
  eventIds: number[],
  relations: { sourceId: number; targetId: number }[] = [],
): GameFlow {
  const ids = new Set(eventIds)
  if (eventIds.some((id) => ![...flow.namecards, ...flow.telephoneEvents].some((event) => event.id === id))) {
    throw new Error('A selected event no longer exists.')
  }
  let next = flow
  for (const phone of flow.telephoneEvents.filter((event) => ids.has(event.id))) {
    next = removePerson(next, phone.personId)
  }
  for (const card of flow.namecards.filter((card) => ids.has(card.id))) next = removeCard(next, card.id)
  for (const { sourceId, targetId } of relations) {
    if ([...next.namecards, ...next.telephoneEvents].some((event) => event.id === sourceId)) {
      next = setUnlock(next, sourceId, targetId, false)
    }
  }
  return next
}

export function setEventPositions(flow: GameFlow, positions: Record<number, EventPosition>): GameFlow {
  for (const [id, position] of Object.entries(positions)) {
    if (![...flow.namecards, ...flow.telephoneEvents].some((event) => event.id === Number(id))) {
      throw new Error(`Cannot position missing event #${id}.`)
    }
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new Error(`Event #${id} needs finite x and y coordinates.`)
    }
  }
  return { ...flow, eventPositions: { ...flow.eventPositions, ...positions } }
}

export function defaultEventPositions(flow: GameFlow): Record<number, EventPosition> {
  const positions: Record<number, EventPosition> = {}
  let row = 0
  for (const person of flow.persons) {
    const ids = [...person.namecards, ...flow.telephoneEvents.filter((event) => event.personId === person.id).map((event) => event.id)]
    ids.forEach((id, column) => { positions[id] = { x: 40 + column * 300, y: 40 + row * 200 } })
    if (ids.length) row++
  }
  const unassigned = [...flow.namecards, ...flow.telephoneEvents].filter((event) => positions[event.id] === undefined)
  unassigned.forEach((event, index) => {
    positions[event.id] = { x: 40 + (index % 4) * 300, y: 40 + (row + Math.floor(index / 4)) * 200 }
  })
  return positions
}
