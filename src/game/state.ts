import { incomingConditions, startingCardIds, type GameFlow } from './gameflow.ts'
import { LocalizedError } from '../i18n/messages.ts'

export type GameState = {
  owned: number[]
  bin: number[]
  pages: Record<number, (number | null)[]>
  viewedBacks: number[]
  called: number[]
  locked: number[]
}

export type CardLocation = { personId: number; slot: number } | 'bin'
// binIndex is the final zero-based position after removing the moving card.
export type Destination = CardLocation | { binIndex: number }

export function isComplete(flow: GameFlow, state: GameState): boolean {
  return flow.persons.every((person) => state.locked.includes(person.id))
}

function lockCompletedPages(flow: GameFlow, state: GameState): GameState {
  return {
    ...state,
    locked: flow.persons.filter((person) =>
      state.pages[person.id].every((id, index) => id === (person.namecards[index] ?? null)),
    ).map((person) => person.id),
  }
}

export function createGame(flow: GameFlow): GameState {
  const starting = startingCardIds(flow)
  return lockCompletedPages(flow, {
    owned: [...starting],
    bin: [...starting],
    pages: Object.fromEntries(flow.persons.map((person) => [person.id, Array<number | null>(8).fill(null)])),
    viewedBacks: [],
    called: [],
    locked: [],
  })
}

export function cardLocation(state: GameState, cardId: number): CardLocation {
  for (const [personId, slots] of Object.entries(state.pages)) {
    const slot = slots.indexOf(cardId)
    if (slot !== -1) return { personId: Number(personId), slot }
  }
  if (state.bin.includes(cardId)) return 'bin'
  throw new LocalizedError('errors.cardNotOwned', { id: cardId })
}

export function moveCard(flow: GameFlow, state: GameState, cardId: number, destination: Destination): GameState {
  const source = cardLocation(state, cardId)
  if (source !== 'bin' && state.locked.includes(source.personId)) {
    throw new LocalizedError('errors.completedPageLocked')
  }
  const toBin = destination === 'bin' || 'binIndex' in destination
  const bin = state.bin.filter((id) => id !== cardId)
  const binIndex = toBin ? destination === 'bin' ? bin.length : destination.binIndex : -1
  if (toBin) {
    if (!Number.isSafeInteger(binIndex) || binIndex < 0 || binIndex > bin.length) {
      throw new LocalizedError('errors.chooseBinSlot')
    }
    if (source === 'bin' && state.bin.indexOf(cardId) === binIndex) return state
  } else {
    if (!state.pages[destination.personId] || !Number.isInteger(destination.slot) ||
      destination.slot < 0 || destination.slot >= 8) throw new LocalizedError('errors.chooseSlot')
    if (state.locked.includes(destination.personId)) throw new LocalizedError('errors.pageLocked')
  }
  const pages = Object.fromEntries(Object.entries(state.pages).map(([id, slots]) => [id, [...slots]]))
  if (source !== 'bin') pages[source.personId][source.slot] = null
  if (toBin) {
    bin.splice(binIndex, 0, cardId)
  } else {
    const displaced = pages[destination.personId][destination.slot]
    pages[destination.personId][destination.slot] = cardId
    if (displaced !== null) {
      if (source === 'bin') bin.push(displaced)
      else pages[source.personId][source.slot] = displaced
    }
  }
  return lockCompletedPages(flow, { ...state, pages, bin })
}

function grantUnlocked(flow: GameFlow, state: GameState): GameState {
  const satisfied = new Set([
    ...flow.namecards.filter((card) => state.viewedBacks.includes(card.id)).map((card) => card.objectId),
    ...flow.telephoneEvents.filter((event) => state.called.includes(event.personId)).map((event) => event.objectId),
  ])
  const added = flow.namecards.filter((card) => {
    const conditions = incomingConditions(flow, card.id)
    return !state.owned.includes(card.id) && conditions.length > 0 &&
      conditions.every((id) => satisfied.has(id))
  }).map((card) => card.id)
  return { ...state, owned: [...state.owned, ...added], bin: [...state.bin, ...added] }
}

export function viewBack(flow: GameFlow, state: GameState, cardId: number): GameState {
  const card = flow.namecards.find((card) => card.id === cardId)
  if (!card || !state.owned.includes(cardId)) throw new LocalizedError('errors.viewOwnedCard')
  if (!card.backText.trim() || state.viewedBacks.includes(cardId)) return state
  return grantUnlocked(flow, { ...state, viewedBacks: [...state.viewedBacks, cardId] })
}

export function callPerson(flow: GameFlow, state: GameState, personId: number): GameState {
  if (!state.locked.includes(personId)) throw new LocalizedError('errors.completeBeforeCalling')
  if (!flow.telephoneEvents.some((event) => event.personId === personId)) throw new LocalizedError('errors.noTelephone')
  if (state.called.includes(personId)) return state
  return grantUnlocked(flow, { ...state, called: [...state.called, personId] })
}
