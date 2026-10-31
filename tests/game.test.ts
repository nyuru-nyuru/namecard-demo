import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { incomingConditions, obtainableCards, parseGameFlow, readFlow, synchronizeFlow, validateFlow } from '../src/game/gameflow.ts'
import { callPerson, cardLocation, createGame, isComplete, moveCard, viewBack } from '../src/game/state.ts'
import { addCard, addPerson, setStartingCard, setUnlock, updateCard } from '../src/editor/model.ts'
import { emptyFlow } from '../src/game/gameflow.ts'

const sample = () => parseGameFlow(JSON.parse(readFileSync(new URL('../public/sample_gameflow.json', import.meta.url), 'utf8')))

function allUnlockedSample() {
  const flow = sample()
  return synchronizeFlow({
    ...flow,
    mode: 'all-unlocked',
    startingCards: [],
    namecards: flow.namecards.map((card) => ({ ...card, backText: '', unlocks: [] })),
    telephoneEvents: flow.telephoneEvents.map((event) => ({ ...event, unlocks: [] })),
  })
}

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

test('all-unlocked mode starts every card in the bin with only ownership-to-telephone links', () => {
  const flow = allUnlockedSample()
  assert.deepEqual(validateFlow(flow), [])
  const playable = parseGameFlow(JSON.parse(JSON.stringify(flow)))
  assert.deepEqual(playable, flow)
  const ids = flow.namecards.map((card) => card.id)
  const state = createGame(playable)
  assert.deepEqual(state.owned, ids)
  assert.deepEqual(state.bin, ids)
  assert.notStrictEqual(state.bin, state.owned)
  assert.ok(Object.values(state.pages).every((page) => page.length === 8 && page.every((id) => id === null)))
  assert.deepEqual([...obtainableCards(flow)], ids)
  assert.deepEqual(flow.startingCards, [])
})

test('all-unlocked histories can be completed without reading backs or making calls', () => {
  const flow = allUnlockedSample()
  let state = createGame(flow)
  for (const person of flow.persons) {
    for (const [slot, id] of person.namecards.entries()) {
      state = moveCard(flow, state, id, { personId: person.id, slot })
    }
  }
  assert.ok(isComplete(flow, state))
  assert.equal(state.locked.length, flow.persons.length)
  assert.deepEqual(state.bin, [])
  assert.deepEqual(state.viewedBacks, [])
  assert.deepEqual(state.called, [])
  assert.deepEqual(createGame(flow).bin, flow.namecards.map((card) => card.id))
})

test('all-unlocked mode ignores authored deadlocks and blank-back requirements without discarding relations', () => {
  const flow = sample()
  flow.mode = 'all-unlocked'
  flow.startingCards = []
  for (const card of flow.namecards) card.backText = ''
  flow.telephoneEvents[0].unlocks.push(flow.namecards[0].objectId)
  const original = JSON.stringify(flow)
  assert.deepEqual(validateFlow(flow), [])
  assert.equal(obtainableCards(flow).size, flow.namecards.length)
  assert.equal(JSON.stringify(flow), original)
  assert.ok(validateFlow({ ...flow, mode: 'progression' }).some((error) => error.includes('no information')))
})

test('reading backs and making calls in all-unlocked mode never duplicate or re-grant cards', () => {
  const flow = sample()
  flow.mode = 'all-unlocked'
  let state = createGame(flow)
  const owned = [...state.owned]
  state = viewBack(flow, state, flow.namecards[0].id)
  assert.deepEqual(state.owned, owned)
  assert.deepEqual(state.bin, owned)
  assert.deepEqual(viewBack(flow, state, flow.namecards[0].id), state)
  for (const [slot, id] of flow.persons[0].namecards.entries()) {
    state = moveCard(flow, state, id, { personId: flow.persons[0].id, slot })
  }
  const bin = [...state.bin]
  state = callPerson(flow, state, flow.persons[0].id)
  assert.deepEqual(state.owned, owned)
  assert.deepEqual(state.bin, bin)
  assert.deepEqual(callPerson(flow, state, flow.persons[0].id), state)
  assert.equal(new Set([...state.bin, ...Object.values(state.pages).flat().filter((id) => id !== null)]).size, owned.length)
})

test('all-unlocked mode still requires each card to link only to its own existing telephone', () => {
  const missingLink = allUnlockedSample()
  missingLink.namecards[0].unlocks = []
  assert.ok(validateFlow(missingLink).some((error) => error.includes("owner's telephone")))
  const wrongPhone = allUnlockedSample()
  wrongPhone.namecards[0].unlocks.push(wrongPhone.telephoneEvents[1].objectId)
  assert.ok(validateFlow(wrongPhone).some((error) => error.includes("another person's")))
  const missingPhone = allUnlockedSample()
  missingPhone.telephoneEvents.shift()
  assert.ok(validateFlow(missingPhone).some((error) => error.includes('exactly one telephone')))
})

test('gameflow modes round-trip, reject unsupported values, and preserve legacy progression', () => {
  for (const mode of ['progression', 'all-unlocked'] as const) {
    const flow = { ...sample(), mode }
    assert.deepEqual(readFlow(JSON.parse(JSON.stringify(flow))), flow)
  }
  for (const mode of [null, '', 'unknown', 0, true, {}]) {
    assert.throws(() => readFlow({ ...sample(), mode }), /gameflow mode/)
  }
  const legacy = sample()
  assert.equal(legacy.mode, undefined)
  assert.deepEqual(createGame({ ...legacy, mode: 'progression' }), createGame(legacy))
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

test('bin cards reorder to the exact final index in both directions and outside drops append', () => {
  const flow = sample()
  const initial = createGame(flow)
  const original = JSON.stringify(initial)
  let state = moveCard(flow, initial, 2, { binIndex: 3 })
  assert.deepEqual(state.bin, [9, 16, 23, 2, 30])
  state = moveCard(flow, state, 30, { binIndex: 1 })
  assert.deepEqual(state.bin, [9, 30, 16, 23, 2])
  assert.strictEqual(moveCard(flow, state, 16, { binIndex: 2 }), state)
  state = moveCard(flow, state, 9, 'bin')
  assert.deepEqual(state.bin, [30, 16, 23, 2, 9])
  assert.deepEqual(state.owned, initial.owned)
  assert.deepEqual(state.pages, initial.pages)
  assert.deepEqual(state.viewedBacks, initial.viewedBacks)
  assert.deepEqual(state.called, initial.called)
  assert.deepEqual(state.locked, initial.locked)
  assert.equal(JSON.stringify(initial), original)
})

test('binder cards insert at the first, middle, last, or empty-bin position without swapping', () => {
  const flow = sample()
  const initial = createGame(flow)
  for (const binIndex of [0, 2, 4]) {
    const filed = moveCard(flow, initial, 2, { personId: 0, slot: 7 })
    const returned = moveCard(flow, filed, 2, { binIndex })
    const expected = [9, 16, 23, 30]
    expected.splice(binIndex, 0, 2)
    assert.deepEqual(returned.bin, expected)
    assert.equal(returned.pages[0][7], null)
    assert.deepEqual(returned.owned, initial.owned)
    assert.deepEqual(filed.bin, [9, 16, 23, 30])
    assert.equal(filed.pages[0][7], 2)
  }
  let emptyBin = initial
  for (const [slot, id] of initial.bin.entries()) {
    emptyBin = moveCard(flow, emptyBin, id, { personId: 0, slot })
  }
  assert.deepEqual(emptyBin.bin, [])
  const returned = moveCard(flow, emptyBin, 16, { binIndex: 0 })
  assert.deepEqual(returned.bin, [16])
  assert.equal(returned.pages[0][2], null)
})

test('bin destinations reject invalid indexes and locked cards without mutating state', () => {
  const flow = sample()
  const state = createGame(flow)
  const original = JSON.stringify(state)
  for (const binIndex of [-1, 0.5, NaN, Infinity, state.bin.length]) {
    assert.throws(() => moveCard(flow, state, 2, { binIndex }), /valid card-bin position/)
  }
  assert.equal(JSON.stringify(state), original)
  const single = createGame({ ...flow, startingCards: [2] })
  assert.strictEqual(moveCard(flow, single, 2, { binIndex: 0 }), single)
  assert.strictEqual(moveCard(flow, single, 2, 'bin'), single)
  assert.throws(() => moveCard(flow, single, 2, { binIndex: 1 }), /valid card-bin position/)
  const filed = moveCard(flow, state, 2, { personId: 0, slot: 7 })
  assert.throws(() => moveCard(flow, filed, 2, { binIndex: filed.bin.length + 1 }), /valid card-bin position/)
  assert.equal(filed.pages[0][7], 2)
  const unlocked = allUnlockedSample()
  let locked = createGame(unlocked)
  for (const [slot, id] of unlocked.persons[0].namecards.entries()) {
    locked = moveCard(unlocked, locked, id, { personId: unlocked.persons[0].id, slot })
  }
  assert.throws(() => moveCard(unlocked, locked, unlocked.persons[0].namecards[0], { binIndex: 0 }), /locked/)
})

test('binder displacement and newly unlocked cards append without resetting a reordered bin', () => {
  const flow = sample()
  let state = moveCard(flow, createGame(flow), 30, { binIndex: 0 })
  state = moveCard(flow, state, 9, { personId: 0, slot: 7 })
  state = moveCard(flow, state, 16, { personId: 0, slot: 7 })
  assert.deepEqual(state.bin, [30, 2, 23, 9])
  state = viewBack(flow, state, 2)
  assert.deepEqual(state.bin, [30, 2, 23, 9, 3])
  const collection = [...state.bin, ...Object.values(state.pages).flat().filter((id) => id !== null)]
  assert.equal(new Set(collection).size, state.owned.length)
  assert.deepEqual(collection.sort((a, b) => a - b), [...state.owned].sort((a, b) => a - b))
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

test('playable and exportable flows allow blank or omitted roles in both modes', () => {
  for (const mode of ['progression', 'all-unlocked'] as const) {
    const flow = sample()
    flow.mode = mode
    flow.namecards[0].role = ''
    flow.namecards[1].role = ' \t'
    assert.deepEqual(validateFlow(flow), [])
    assert.deepEqual(parseGameFlow(JSON.parse(JSON.stringify(flow))), flow)
    const omitted = parseGameFlow({
      ...flow,
      namecards: flow.namecards.map((card) => ({ ...card, role: undefined })),
    })
    assert.ok(omitted.namecards.every((card) => card.role === ''))
    assert.deepEqual(validateFlow(omitted), [])
    for (const role of [null, 42, true]) {
      assert.throws(() => readFlow({
        ...flow,
        namecards: flow.namecards.map((card) => ({ ...card, role })),
      }), /Namecard.role must be text/)
    }
    const missingCompany = { ...flow, namecards: flow.namecards.map((card) => ({ ...card, company: '' })) }
    assert.throws(() => parseGameFlow(missingCompany), /needs a company and display name/)
    const missingName = { ...flow, namecards: flow.namecards.map((card) => ({ ...card, personDisplayName: '' })) }
    assert.throws(() => parseGameFlow(missingName), /needs a company and display name/)
  }
})

test('schema rejects malformed JSON, duplicate objectIds, dangling edges, excessive ownership and stale keys', () => {
  assert.throws(() => readFlow(null), /must be an object/)
  assert.throws(() => readFlow({ version: 2 }), /version/)
  const invalidArray = { ...sample(), startingCards: ['2'] }
  assert.throws(() => parseGameFlow(invalidArray), /safe integer/)
  const duplicate = sample()
  duplicate.persons[0].objectId = duplicate.namecards[0].objectId
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
  flow.persons.push({ id: 56, objectId: 56, name: 'Empty Person', namecards: [] })
  flow.telephoneEvents.push({ id: 57, objectId: 57, personId: 56, unlocks: [] })
  flow.nextId = 58
  flow.nextPersonId = 57
  flow.nextTelephoneEventId = 58
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
  flow.persons.push({ id: 56, objectId: 56, name: 'Empty Person', namecards: [] })
  flow.nextId = 57
  flow.nextPersonId = 57
  assert.deepEqual(validateFlow(flow), [])
  const state = createGame(flow)
  assert.ok(state.locked.includes(56))
  assert.throws(() => callPerson(flow, state, 56), /no telephone event/)
})

test('overlapping domain IDs do not confuse card-back and telephone AND conditions', () => {
  let flow = addPerson(addPerson(emptyFlow(), 'Ada'), 'Grace')
  flow = addCard(flow, 0)
  flow = addCard(flow, 1)
  flow = addCard(flow, 0)
  for (const card of flow.namecards) {
    flow = updateCard(flow, card.id, { company: 'Studio', role: 'Designer', backText: 'Clue', year: 2000 + card.id })
  }
  flow = setStartingCard(setStartingCard(flow, 0, true), 1, true)
  flow = setUnlock(setUnlock(flow, 4, 6, true), 3, 6, true)
  assert.deepEqual(validateFlow(flow), [])
  assert.deepEqual(incomingConditions(flow, 2), [4, 3])
  let state = viewBack(flow, createGame(flow), 0)
  assert.ok(!state.owned.includes(2))
  state = viewBack(flow, state, 1)
  assert.ok(!state.owned.includes(2))
  state = moveCard(flow, state, 1, { personId: 1, slot: 0 })
  state = callPerson(flow, state, 1)
  assert.ok(state.owned.includes(2))
  assert.deepEqual(state.viewedBacks, [0, 1])
  assert.equal(obtainableCards(flow).size, 3)
})
