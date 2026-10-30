import { incomingConditions, type GameFlow } from './gameflow.ts'

export type GameState = {
  owned: number[]
  bin: number[]
  pages: Record<number, (number | null)[]>
  viewedBacks: number[]
  called: number[]
  locked: number[]
}

export type Destination = { personId: number; slot: number } | 'bin'

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
  return lockCompletedPages(flow, {
    owned: [...flow.startingCards],
    bin: [...flow.startingCards],
    pages: Object.fromEntries(flow.persons.map((person) => [person.id, Array<number | null>(8).fill(null)])),
    viewedBacks: [],
    called: [],
    locked: [],
  })
}

export function cardLocation(state: GameState, cardId: number): Destination {
  for (const [personId, slots] of Object.entries(state.pages)) {
    const slot = slots.indexOf(cardId)
    if (slot !== -1) return { personId: Number(personId), slot }
  }
  if (state.bin.includes(cardId)) return 'bin'
  throw new Error(`Card #${cardId} is not in your collection.`)
}

export function moveCard(flow: GameFlow, state: GameState, cardId: number, destination: Destination): GameState {
  const source = cardLocation(state, cardId)
  if (source !== 'bin' && state.locked.includes(source.personId)) {
    throw new Error('Completed pages are locked. Their cards can still be inspected.')
  }
  if (destination !== 'bin') {
    if (!state.pages[destination.personId] || !Number.isInteger(destination.slot) ||
      destination.slot < 0 || destination.slot >= 8) throw new Error('Choose a valid binder slot.')
    if (state.locked.includes(destination.personId)) throw new Error('That page is already locked.')
  }
  if (source === 'bin' && destination === 'bin') return state
  const pages = Object.fromEntries(Object.entries(state.pages).map(([id, slots]) => [id, [...slots]]))
  const bin = state.bin.filter((id) => id !== cardId)
  if (source !== 'bin') pages[source.personId][source.slot] = null
  if (destination === 'bin') {
    bin.push(cardId)
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
    ...state.viewedBacks,
    ...flow.telephoneEvents.filter((event) => state.called.includes(event.personId)).map((event) => event.id),
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
  if (!card || !state.owned.includes(cardId)) throw new Error('You can only view cards you own.')
  if (!card.backText.trim() || state.viewedBacks.includes(cardId)) return state
  return grantUnlocked(flow, { ...state, viewedBacks: [...state.viewedBacks, cardId] })
}

export function callPerson(flow: GameFlow, state: GameState, personId: number): GameState {
  if (!state.locked.includes(personId)) throw new Error("Complete this person's page before calling.")
  if (!flow.telephoneEvents.some((event) => event.personId === personId)) throw new Error('This person has no telephone event.')
  if (state.called.includes(personId)) return state
  return grantUnlocked(flow, { ...state, called: [...state.called, personId] })
}
