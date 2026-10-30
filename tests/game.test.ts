import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { incomingConditions, obtainableCards, parseGameFlow, readFlow, synchronizeFlow, validateFlow } from '../src/game/gameflow.ts'
import { callPerson, cardLocation, createGame, isComplete, moveCard, viewBack } from '../src/game/state.ts'

const sample = () => parseGameFlow(JSON.parse(readFileSync(new URL('../public/sample_gameflow.json', import.meta.url), 'utf8')))

test('sample has eight people, forty cards, five starters from different people, and shared unique IDs', () => {
  const flow = sample()
  assert.equal(flow.persons.length, 8)
  assert.equal(flow.namecards.length, 40)
  assert.equal(flow.startingCards.length, 5)
  assert.equal(new Set(flow.startingCards.map((id) => flow.namecards.find((card) => card.id === id)?.personId)).size, 5)
  assert.equal(obtainableCards(flow).size, 40)
  assert.deepEqual(validateFlow(flow), [])
  assert.equal(new Set([...flow.persons, ...flow.namecards, ...flow.telephoneEvents].map((entity) => entity.id)).size, 56)
})

test('reading backs grants cards once, never auto-reads new cards, and ignores blank backs', () => {
  const flow = sample()
  const initial = createGame(flow)
  const next = viewBack(flow, initial, 2)
  assert.equal(initial.owned.length, 5)
  assert.ok(next.bin.includes(3))
  assert.ok(!next.owned.includes(4))
  assert.deepEqual(viewBack(flow, next, 2), next)
  assert.throws(() => viewBack(flow, initial, 3), /only view cards you own/)
  const blank = { ...next, owned: [...next.owned, 41], bin: [...next.bin, 41] }
  assert.deepEqual(viewBack(flow, blank, 41), blank)
})

test('all incoming card-back conditions are required', () => {
  const flow = sample()
  flow.namecards.find((card) => card.id === 9)!.unlocks.push(3)
  let state = viewBack(flow, createGame(flow), 2)
  assert.ok(!state.owned.includes(3))
  state = viewBack(flow, state, 9)
  assert.ok(state.owned.includes(3))
})

test('bin to page, page swapping, cross-page swapping and outside-to-bin preserve every owned card', () => {
  const flow = sample()
  let state = createGame(flow)
  state = moveCard(flow, state, 2, { personId: 0, slot: 1 })
  state = moveCard(flow, state, 9, { personId: 0, slot: 0 })
  state = moveCard(flow, state, 2, { personId: 0, slot: 0 })
  assert.deepEqual(state.pages[0].slice(0, 2), [2, 9])
  state = moveCard(flow, state, 16, { personId: 7, slot: 0 })
  state = moveCard(flow, state, 9, { personId: 7, slot: 0 })
  assert.equal(state.pages[0][1], 16)
  assert.equal(state.pages[7][0], 9)
  state = moveCard(flow, state, 23, { personId: 0, slot: 0 })
  assert.ok(state.bin.includes(2))
  state = moveCard(flow, state, 23, 'bin')
  assert.equal(state.pages[0][0], null)
  assert.ok(state.bin.includes(23))
  const filed = Object.values(state.pages).flat().filter((id) => id !== null)
  assert.deepEqual([...state.bin, ...filed].sort(), [...state.owned].sort())
  assert.throws(() => moveCard(flow, state, 999, 'bin'), /not in your collection/)
  assert.throws(() => moveCard(flow, state, 2, { personId: 0, slot: 8 }), /valid binder slot/)
})

test('only an exact gap-free answer key locks; locked cards stay inspectable and telephone requires completion', () => {
  const flow = sample()
  let state = createGame(flow)
  assert.throws(() => callPerson(flow, state, 0), /Complete/)
  for (const id of [2, 3, 4, 5]) state = viewBack(flow, state, id)
  for (const [index, id] of [2, 3, 4, 6, 5].entries()) state = moveCard(flow, state, id, { personId: 0, slot: index })
  assert.ok(!state.locked.includes(0))
  state = moveCard(flow, state, 5, { personId: 0, slot: 3 })
  assert.ok(state.locked.includes(0))
  assert.throws(() => moveCard(flow, state, 2, 'bin'), /locked/)
  assert.throws(() => moveCard(flow, state, 9, { personId: 0, slot: 5 }), /locked/)
  state = viewBack(flow, state, 6)
  assert.ok(!state.owned.includes(37))
  state = callPerson(flow, state, 0)
  assert.ok(state.bin.includes(37))
  assert.deepEqual(callPerson(flow, state, 0), state)
})

test('telephone and card-back conditions are distinct and can combine with AND', () => {
  const flow = sample()
  flow.namecards.find((card) => card.id === 9)!.unlocks.push(37)
  let state = createGame(flow)
  for (const id of [2, 3, 4, 5]) state = viewBack(flow, state, id)
  for (const [index, id] of flow.persons[0].namecards.entries()) state = moveCard(flow, state, id, { personId: 0, slot: index })
  state = callPerson(flow, state, 0)
  assert.ok(!state.owned.includes(37))
  state = viewBack(flow, state, 9)
  assert.ok(state.owned.includes(37))
})

test('the entire sample can be solved through real gameplay actions', () => {
  const flow = sample()
  let state = createGame(flow)
  let rounds = 0
  while (!isComplete(flow, state) && rounds++ < 50) {
    for (const id of [...state.owned]) state = viewBack(flow, state, id)
    for (const person of flow.persons) {
      if (state.locked.includes(person.id) || !person.namecards.every((id) => state.owned.includes(id))) continue
      for (const [slot, id] of person.namecards.entries()) state = moveCard(flow, state, id, { personId: person.id, slot })
    }
    for (const id of state.locked) state = callPerson(flow, state, id)
  }
  assert.ok(isComplete(flow, state))
  assert.equal(state.owned.length, 40)
  assert.equal(state.bin.length, 0)
  assert.equal(state.locked.length, 8)
  assert.deepEqual(cardLocation(state, 55), { personId: 49, slot: 4 })
})

test('schema rejects malformed JSON, duplicate global IDs, dangling edges, excessive ownership and stale keys', () => {
  assert.throws(() => readFlow(null), /must be an object/)
  assert.throws(() => readFlow({ version: 2 }), /version/)
  const invalidArray = { ...sample(), startingCards: ['2'] }
  assert.throws(() => parseGameFlow(invalidArray), /safe integer/)
  const duplicate = sample()
  duplicate.persons[0].id = duplicate.namecards[0].id
  assert.ok(validateFlow(duplicate).some((error) => error.includes('unique')))
  const dangling = sample()
  dangling.namecards[0].unlocks.push(999)
  assert.ok(validateFlow(dangling).some((error) => error.includes('missing unlock target')))
  const stale = sample()
  stale.persons[0].namecards.reverse()
  assert.ok(validateFlow(stale).some((error) => error.includes('answer key')))
  const excessive = sample()
  excessive.namecards.filter((card) => card.personId === 7).forEach((card) => { card.personId = 0 })
  assert.ok(validateFlow(synchronizeFlow(excessive)).some((error) => error.includes('more than eight')))
})

test('validation rejects deadlocks, missing conditions, blank clues, and invalid phone edges', () => {
  const circular = sample()
  circular.telephoneEvents[0].unlocks.push(3)
  assert.ok(validateFlow(circular).some((error) => error.includes('Unobtainable')))
  const missing = sample()
  missing.namecards[0].unlocks = [1]
  assert.ok(validateFlow(missing).some((error) => error.includes('neither a starting card')))
  const blank = sample()
  blank.namecards[0].backText = ' '
  assert.ok(validateFlow(blank).some((error) => error.includes('no information')))
  const badPhone = sample()
  badPhone.namecards[0].unlocks.push(8)
  assert.ok(validateFlow(badPhone).some((error) => error.includes("another person's")))
})

test('synchronization maintains ownership, chronology, and the automatic telephone edges', () => {
  const flow = sample()
  flow.namecards[0].personId = 7
  flow.namecards[0].year = 1981
  const next = synchronizeFlow(flow)
  assert.equal(next.persons[1].namecards[0], 2)
  assert.ok(!next.persons[0].namecards.includes(2))
  assert.deepEqual(next.namecards[0].unlocks, [3, 8])
  assert.deepEqual(incomingConditions(next, 44), [8, 15])
})

test('zero-card people have completed pages and can be called; equal-year ordering is deterministic by ID', () => {
  const flow = sample()
  flow.persons.push({ id: 56, name: 'Empty Person', namecards: [] })
  flow.telephoneEvents.push({ id: 57, personId: 56, unlocks: [] })
  flow.nextId = 58
  assert.deepEqual(validateFlow(flow), [])
  let state = createGame(flow)
  assert.ok(state.locked.includes(56))
  state = callPerson(flow, state, 56)
  assert.ok(state.called.includes(56))
  flow.namecards[1].year = flow.namecards[0].year
  assert.deepEqual(synchronizeFlow(flow).persons[0].namecards, [2, 3, 4, 5, 6])
})

test('an empty person without a telephone is valid and cannot be called', () => {
  const flow = sample()
  flow.persons.push({ id: 56, name: 'Empty Person', namecards: [] })
  flow.nextId = 57
  assert.deepEqual(validateFlow(flow), [])
  const state = createGame(flow)
  assert.ok(state.locked.includes(56))
  assert.throws(() => callPerson(flow, state, 56), /no telephone event/)
})
