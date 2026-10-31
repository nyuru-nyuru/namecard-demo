import { entityCounters, identityMessages, isAutomaticRelation, readFlow, synchronizeFlow, type EventPosition, type GameCard, type GameFlow } from '../game/gameflow.ts'
import { english, LocalizedError, msg } from '../i18n/messages.ts'

export const EDITOR_DRAFT_KEY = 'namecard-game.editor-draft.v1'

function allocate(flow: GameFlow, kind: keyof typeof entityCounters): { id: number; objectId: number } {
  const counter = entityCounters[kind]
  const errors = identityMessages(flow)
  if (errors.length || !Number.isSafeInteger(flow.nextId + 1) || !Number.isSafeInteger(flow[counter] + 1)) {
    throw new LocalizedError('errors.allocateIds', { detail: errors.length ? errors : msg('errors.idCapacity') })
  }
  return { id: flow[counter], objectId: flow.nextId }
}

export function readEditorDraft(value: unknown): GameFlow {
  let flow = readFlow(value)
  const errors = identityMessages(flow)
  if (errors.length) throw new LocalizedError('errors.validation', { issues: errors })
  for (const phone of flow.telephoneEvents) {
    if (!flow.persons.some((person) => person.id === phone.personId)) {
      throw new LocalizedError('errors.draftTelephonePerson', { id: phone.id })
    }
    if (flow.telephoneEvents.filter((event) => event.personId === phone.personId).length > 1) {
      throw new LocalizedError('errors.draftMultipleTelephones', { id: phone.personId })
    }
  }
  for (const person of flow.persons) {
    if (flow.namecards.some((card) => card.personId === person.id)) {
      flow = ensureTelephone(flow, person.id)
    }
  }
  return synchronizeFlow(flow)
}

export function addPerson(flow: GameFlow, name = english('editor.defaultPersonName')): GameFlow {
  const identity = allocate(flow, 'persons')
  return synchronizeFlow(ensureTelephone({
    ...flow,
    nextId: identity.objectId + 1,
    nextPersonId: identity.id + 1,
    persons: [...flow.persons, { ...identity, name, namecards: [] }],
  }, identity.id))
}

export function renamePerson(flow: GameFlow, id: number, name: string): GameFlow {
  return { ...flow, persons: flow.persons.map((person) => person.id === id ? { ...person, name } : person) }
}

function checkOwner(flow: GameFlow, personId: number | null, cardId?: number) {
  if (personId === null) return
  if (!flow.persons.some((person) => person.id === personId)) throw new LocalizedError('errors.chooseOwner')
  if (flow.namecards.filter((card) => card.personId === personId && card.id !== cardId).length >= 8) {
    throw new LocalizedError('errors.ownerCapacity')
  }
}

function ensureTelephone(flow: GameFlow, personId: number | null): GameFlow {
  if (personId === null || flow.telephoneEvents.some((event) => event.personId === personId)) return flow
  const identity = allocate(flow, 'telephoneEvents')
  return {
    ...flow,
    nextId: identity.objectId + 1,
    nextTelephoneEventId: identity.id + 1,
    telephoneEvents: [...flow.telephoneEvents, { ...identity, personId, unlocks: [] }],
  }
}

export function addTelephone(flow: GameFlow, personId: number): GameFlow {
  if (!flow.persons.some((person) => person.id === personId)) throw new LocalizedError('errors.chooseTelephonePerson')
  if (flow.telephoneEvents.some((event) => event.personId === personId)) throw new LocalizedError('errors.telephoneExists')
  return synchronizeFlow(ensureTelephone(flow, personId))
}

export function addCard(flow: GameFlow, personId: number | null = null): GameFlow {
  checkOwner(flow, personId)
  const identity = allocate(flow, 'namecards')
  return synchronizeFlow(ensureTelephone({
    ...flow,
    nextId: identity.objectId + 1,
    nextNamecardId: identity.id + 1,
    namecards: [...flow.namecards, {
      ...identity,
      personId,
      personDisplayName: flow.persons.find((person) => person.id === personId)?.name ?? '',
      company: '',
      role: '',
      misc: '',
      year: new Date().getFullYear(),
      backText: '',
      unlocks: [],
    }],
  }, personId))
}

export function updateCard(
  flow: GameFlow,
  id: number,
  patch: Partial<Pick<GameCard, 'personId' | 'personDisplayName' | 'company' | 'role' | 'year' | 'misc' | 'backText' | 'logo' | 'companyId' | 'department'>>,
): GameFlow {
  const card = flow.namecards.find((card) => card.id === id)
  if (!card) throw new LocalizedError('errors.cardMissing', { id })
  if ('personId' in patch) checkOwner(flow, patch.personId ?? null, id)
  if ('year' in patch && !Number.isSafeInteger(patch.year)) throw new LocalizedError('errors.wholeYear')
  return synchronizeFlow(ensureTelephone({
    ...flow,
    namecards: flow.namecards.map((card) => card.id === id ? { ...card, ...patch } : card),
  }, 'personId' in patch ? patch.personId ?? null : card.personId))
}

function removeReferences(flow: GameFlow, ids: Set<number>): GameFlow {
  const removedCardIds = new Set(flow.namecards.filter((card) => ids.has(card.objectId)).map((card) => card.id))
  return synchronizeFlow({
    ...flow,
    namecards: flow.namecards.filter((card) => !ids.has(card.objectId))
      .map((card) => ({ ...card, unlocks: card.unlocks.filter((id) => !ids.has(id)) })),
    telephoneEvents: flow.telephoneEvents.filter((event) => !ids.has(event.objectId))
      .map((event) => ({ ...event, unlocks: event.unlocks.filter((id) => !ids.has(id)) })),
    startingCards: flow.startingCards.filter((id) => !removedCardIds.has(id)),
    ...(flow.eventPositions === undefined ? {} : {
      eventPositions: Object.fromEntries(Object.entries(flow.eventPositions).filter(([id]) => !ids.has(Number(id)))),
    }),
  })
}

export function removeCard(flow: GameFlow, id: number): GameFlow {
  const card = flow.namecards.find((card) => card.id === id)
  if (!card) throw new LocalizedError('errors.cardMissing', { id })
  const ids = new Set([card.objectId])
  if (card.personId !== null && !flow.namecards.some((item) => item.id !== id && item.personId === card.personId)) {
    for (const phone of flow.telephoneEvents.filter((event) => event.personId === card.personId)) ids.add(phone.objectId)
  }
  return removeReferences(flow, ids)
}

export function removePerson(flow: GameFlow, id: number): GameFlow {
  const person = flow.persons.find((person) => person.id === id)
  if (!person) throw new LocalizedError('errors.personMissing', { id })
  const removedIds = new Set([person.objectId, ...flow.telephoneEvents.filter((event) => event.personId === id).map((event) => event.objectId)])
  return removeReferences({
    ...flow,
    persons: flow.persons.filter((person) => person.id !== id),
    namecards: flow.namecards.map((card) => card.personId === id ? { ...card, personId: null } : card),
  }, removedIds)
}

export function setStartingCard(flow: GameFlow, id: number, enabled: boolean): GameFlow {
  if (enabled && !flow.namecards.some((card) => card.id === id)) throw new LocalizedError('errors.startingCardMissing')
  return {
    ...flow,
    startingCards: enabled
      ? [...new Set([...flow.startingCards, id])]
      : flow.startingCards.filter((cardId) => cardId !== id),
  }
}

export function setUnlock(flow: GameFlow, sourceId: number, targetId: number, enabled: boolean): GameFlow {
  const source = [...flow.namecards, ...flow.telephoneEvents].find((event) => event.objectId === sourceId)
  if (!source) throw new LocalizedError('errors.sourceMissing')
  if (isAutomaticRelation(flow, sourceId, targetId)) {
    throw new LocalizedError('errors.automaticRelation')
  }
  if (enabled && (!flow.namecards.some((card) => card.objectId === targetId) || sourceId === targetId)) {
    throw new LocalizedError('errors.chooseUnlockTarget')
  }
  const unlocks = enabled ? [...new Set([...source.unlocks, targetId])] : source.unlocks.filter((id) => id !== targetId)
  return synchronizeFlow({
    ...flow,
    namecards: flow.namecards.map((card) => card.objectId === sourceId ? { ...card, unlocks } : card),
    telephoneEvents: flow.telephoneEvents.map((event) => event.objectId === sourceId ? { ...event, unlocks } : event),
  })
}

export function removeGraphSelection(
  flow: GameFlow,
  eventIds: number[],
  relations: { sourceId: number; targetId: number }[] = [],
): GameFlow {
  const ids = new Set(eventIds)
  if (eventIds.some((id) => ![...flow.namecards, ...flow.telephoneEvents].some((event) => event.objectId === id))) {
    throw new LocalizedError('errors.selectionMissing')
  }
  let next = flow
  for (const phone of flow.telephoneEvents.filter((event) => ids.has(event.objectId))) {
    next = removePerson(next, phone.personId)
  }
  for (const card of flow.namecards.filter((card) => ids.has(card.objectId))) next = removeCard(next, card.id)
  for (const { sourceId, targetId } of relations) {
    if ([...next.namecards, ...next.telephoneEvents].some((event) => event.objectId === sourceId)) {
      next = setUnlock(next, sourceId, targetId, false)
    }
  }
  return next
}

export function setEventPositions(flow: GameFlow, positions: Record<number, EventPosition>): GameFlow {
  for (const [id, position] of Object.entries(positions)) {
    if (![...flow.namecards, ...flow.telephoneEvents].some((event) => event.objectId === Number(id))) {
      throw new LocalizedError('errors.positionMissingEvent', { id })
    }
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new LocalizedError('errors.eventCoordinates', { id })
    }
  }
  return { ...flow, eventPositions: { ...flow.eventPositions, ...positions } }
}

export function defaultEventPositions(flow: GameFlow): Record<number, EventPosition> {
  const positions: Record<number, EventPosition> = {}
  let row = 0
  for (const person of flow.persons) {
    const ids = [
      ...person.namecards.flatMap((id) => flow.namecards.filter((card) => card.id === id).map((card) => card.objectId)),
      ...flow.telephoneEvents.filter((event) => event.personId === person.id).map((event) => event.objectId),
    ]
    ids.forEach((id, column) => { positions[id] = { x: 40 + column * 300, y: 40 + row * 200 } })
    if (ids.length) row++
  }
  const unassigned = [...flow.namecards, ...flow.telephoneEvents].filter((event) => positions[event.objectId] === undefined)
  unassigned.forEach((event, index) => {
    positions[event.objectId] = { x: 40 + (index % 4) * 300, y: 40 + (row + Math.floor(index / 4)) * 200 }
  })
  return positions
}
