import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyFlow, flowValidationIssues, isAutomaticRelation, parseGameFlow, readFlow, unreachableEventIds, validateFlow } from '../src/game/gameflow.ts'
import {
  addCard,
  addPerson,
  addTelephone,
  defaultEventPositions,
  readEditorDraft,
  removeCard,
  removeGraphSelection,
  removePerson,
  renamePerson,
  setStartingCard,
  setEventPositions,
  setUnlock,
  updateCard,
} from '../src/editor/model.ts'

function withCards(count: number) {
  let flow = addPerson(emptyFlow(), 'Ada')
  for (let index = 0; index < count; index++) {
    const id = flow.nextNamecardId
    flow = addCard(flow, 0)
    flow = updateCard(flow, id, { company: 'Archive', role: 'Designer', year: 2000 + index })
  }
  return flow
}

test('entity types count IDs independently from zero and share global objectIds; empty people get a telephone', () => {
  const first = addPerson(emptyFlow(), 'Ada')
  assert.equal(first.persons[0].id, 0)
  assert.deepEqual(first.persons[0].namecards, [])
  assert.equal(first.persons[0].objectId, 0)
  assert.deepEqual(first.telephoneEvents, [{ id: 0, objectId: 1, personId: 0, unlocks: [] }])
  const card = addCard(first, 0)
  assert.equal(card.namecards[0].id, 0)
  assert.equal(card.namecards[0].objectId, 2)
  assert.equal(card.nextId, 3)
  assert.equal(card.nextPersonId, 1)
  assert.equal(card.nextNamecardId, 1)
  assert.equal(card.nextTelephoneEventId, 1)
  assert.deepEqual(card.namecards[0].unlocks, [1])
  assert.deepEqual(validateFlow(first), [])
  assert.equal(renamePerson(first, 0, 'Grace').persons[0].name, 'Grace')
  assert.equal(first.persons[0].name, 'Ada')
})

test('answer keys sort by year then ID and every field can be updated', () => {
  const original = withCards(3)
  let flow = updateCard(original, 2, {
    year: 1990, personDisplayName: 'A. Example', company: 'Example', role: 'Lead', misc: 'Front details', backText: 'A clue',
  })
  flow = updateCard(flow, 1, { year: 1990 })
  assert.deepEqual(flow.persons[0].namecards, [1, 2, 0])
  assert.equal(flow.namecards[2].backText, 'A clue')
  assert.equal(flow.namecards[2].personDisplayName, 'A. Example')
  assert.equal(flow.namecards[2].company, 'Example')
  assert.equal(flow.namecards[2].role, 'Lead')
  assert.equal(flow.namecards[2].misc, 'Front details')
  assert.deepEqual(original.persons[0].namecards, [0, 1, 2])
  assert.throws(() => updateCard(flow, 2, { year: 1.5 }), /whole number/)
})

test('assignment enforces capacity, allows unassigned drafts, and derives telephone edges', () => {
  let flow = withCards(8)
  assert.throws(() => addCard(flow, 0), /eight cards/)
  flow = addCard(flow)
  const extraId = flow.nextNamecardId - 1
  assert.equal(flow.namecards.at(-1)?.personId, null)
  assert.throws(() => updateCard(flow, extraId, { personId: 0 }), /eight cards/)
  flow = updateCard(flow, 0, { personId: null })
  flow = updateCard(flow, extraId, { personId: 0 })
  assert.equal(flow.persons[0].namecards.length, 8)
  assert.deepEqual(flow.namecards.find((card) => card.id === 0)?.unlocks, [])
  assert.deepEqual(flow.namecards.find((card) => card.id === extraId)?.unlocks, [1])
  assert.throws(() => updateCard(flow, 0, { personId: 999 }), /existing person/)
  flow = addPerson(flow, 'Grace')
  const graceId = flow.persons[1].id
  flow = updateCard(flow, extraId, { personId: graceId })
  assert.deepEqual(flow.persons[1].namecards, [extraId])
  assert.deepEqual(flow.namecards.find((card) => card.id === extraId)?.unlocks, [flow.telephoneEvents[1].objectId])
})

test('reassignment preserves manual edges but replaces automatic telephone relations', () => {
  let flow = addPerson(withCards(2), 'Grace')
  flow = setUnlock(flow, 2, 3, true)
  flow = updateCard(flow, 0, { personId: 1 })
  assert.deepEqual(flow.namecards[0].unlocks, [3, 5])
  assert.deepEqual(flow.persons[0].namecards, [1])
  assert.deepEqual(flow.persons[1].namecards, [0])
})

test('deleting a card removes every reference and does not reuse its ID', () => {
  let flow = withCards(2)
  flow = setStartingCard(flow, 1, true)
  flow = setUnlock(flow, 2, 3, true)
  flow = setUnlock(flow, 1, 3, true)
  flow = removeCard(flow, 1)
  assert.deepEqual(flow.startingCards, [])
  assert.deepEqual(flow.persons[0].namecards, [0])
  assert.deepEqual(flow.namecards[0].unlocks, [1])
  assert.deepEqual(flow.telephoneEvents[0].unlocks, [])
  assert.equal(flow.nextId, 4)
  assert.equal(addCard(flow).namecards.at(-1)?.id, 2)
})

test('removing a person preserves all cards as drafts and removes their phone references', () => {
  let flow = withCards(2)
  flow = setUnlock(flow, 2, 3, true)
  flow = setUnlock(flow, 1, 3, true)
  flow = setStartingCard(flow, 0, true)
  flow = removePerson(flow, 0)
  assert.equal(flow.persons.length, 0)
  assert.equal(flow.telephoneEvents.length, 0)
  assert.equal(flow.namecards.length, 2)
  assert.ok(flow.namecards.every((card) => card.personId === null))
  assert.deepEqual(flow.namecards[0].unlocks, [3])
  assert.deepEqual(flow.startingCards, [0])
  assert.equal(addPerson(flow).persons[0].id, 1)
})

test('manual relations are unique and editable; automatic relations are read-only', () => {
  let flow = withCards(2)
  flow = setUnlock(flow, 2, 3, true)
  flow = setUnlock(flow, 2, 3, true)
  assert.deepEqual(flow.namecards[0].unlocks, [3, 1])
  flow = setUnlock(flow, 1, 3, true)
  assert.deepEqual(flow.telephoneEvents[0].unlocks, [3])
  flow = setUnlock(flow, 1, 3, false)
  assert.deepEqual(flow.telephoneEvents[0].unlocks, [])
  flow = setUnlock(flow, 2, 3, false)
  assert.deepEqual(flow.namecards[0].unlocks, [1])
  assert.throws(() => setUnlock(flow, 2, 1, false), /automatic/)
  assert.throws(() => setUnlock(flow, 2, 2, true), /different existing card/)
  assert.throws(() => setUnlock(flow, 2, 900, true), /different existing card/)
})

test('starting cards are unique and are preserved through draft serialization', () => {
  let flow = setStartingCard(withCards(2), 0, true)
  flow = setStartingCard(flow, 0, true)
  assert.deepEqual(flow.startingCards, [0])
  assert.deepEqual(readEditorDraft(JSON.parse(JSON.stringify(flow))), flow)
  flow = setStartingCard(flow, 0, false)
  assert.deepEqual(flow.startingCards, [])
  assert.throws(() => setStartingCard(flow, 99, true), /existing cards/)
})

test('all-unlocked drafts need no starters or manual relations and retain automatic links when edited', () => {
  const flow = { ...withCards(2), mode: 'all-unlocked' as const }
  assert.deepEqual(validateFlow(flow), [])
  assert.deepEqual(unreachableEventIds(flow), [])
  assert.deepEqual(parseGameFlow(JSON.parse(JSON.stringify(flow))), flow)
  const edited = updateCard(addCard(flow, 0), 2, { company: 'Archive', role: 'Designer', year: 2002 })
  assert.equal(edited.mode, 'all-unlocked')
  assert.deepEqual(edited.startingCards, [])
  assert.deepEqual(edited.namecards[2].unlocks, [edited.telephoneEvents[0].objectId])
  assert.deepEqual(validateFlow(edited), [])
  assert.deepEqual(unreachableEventIds(edited), [])
})

test('switching to all-unlocked preserves authored starters and relations through draft serialization', () => {
  let flow = setStartingCard(withCards(2), 0, true)
  flow = setUnlock(setUnlock(flow, 2, 3, true), 1, 3, true)
  const unlocked = { ...flow, mode: 'all-unlocked' as const }
  assert.deepEqual(validateFlow(unlocked), [])
  assert.deepEqual(unreachableEventIds(unlocked), [])
  const restored = readEditorDraft(JSON.parse(JSON.stringify(unlocked)))
  assert.deepEqual(restored, unlocked)
  const progression = { ...restored, mode: 'progression' as const }
  assert.deepEqual(progression.startingCards, flow.startingCards)
  assert.deepEqual(progression.namecards, flow.namecards)
  assert.deepEqual(progression.telephoneEvents, flow.telephoneEvents)
  assert.ok(validateFlow(progression).some((error) => error.includes('no information')))
  assert.ok(unreachableEventIds(progression).length > 0)
})

test('validation issues identify card domain IDs and clear when the card is corrected', () => {
  const initial = { ...withCards(2), mode: 'all-unlocked' as const }
  const invalid = updateCard(initial, 1, { company: '', year: 0, role: '' })
  assert.notEqual(invalid.namecards[1].id, invalid.namecards[1].objectId)
  assert.deepEqual(flowValidationIssues(invalid).map(({ key, cardIds }) => ({ key, cardIds })), [
    { key: 'validation.cardFields', cardIds: [1] },
    { key: 'validation.cardYear', cardIds: [1] },
  ])
  const corrected = updateCard(invalid, 1, { company: 'Archive', year: 2001 })
  assert.deepEqual(flowValidationIssues(corrected), [])
  assert.deepEqual(validateFlow(corrected), [])
  const position = {
    ...corrected,
    eventPositions: { [corrected.namecards[1].objectId]: { x: NaN, y: 0 } },
  }
  assert.deepEqual(flowValidationIssues(position).map(({ key, cardIds }) => ({ key, cardIds })), [
    { key: 'validation.position', cardIds: [1] },
  ])
})

test('aggregate deadlock errors identify every listed card for highlighting', () => {
  let flow = setStartingCard(withCards(3), 0, true)
  flow = setUnlock(setUnlock(flow, 1, 3, true), 1, 4, true)
  const issues = flowValidationIssues(flow)
  assert.equal(issues.length, 1)
  assert.equal(issues[0].key, 'validation.unobtainable')
  assert.deepEqual(issues[0].cardIds, [1, 2])
  assert.equal(issues[0].values?.cards, '#1, #2')
  assert.deepEqual(flowValidationIssues(setStartingCard(setStartingCard(flow, 1, true), 2, true)), [])
})

test('dangling imported relations and invalid telephone targets can be removed', () => {
  const original = withCards(1)
  let flow = {
    ...original,
    namecards: [{ ...original.namecards[0], unlocks: [1, 900] }],
    telephoneEvents: [{ ...original.telephoneEvents[0], unlocks: [1, 900] }],
  }
  flow = setUnlock(flow, 2, 900, false)
  flow = setUnlock(flow, 1, 900, false)
  flow = setUnlock(flow, 1, 1, false)
  assert.deepEqual(flow.namecards[0].unlocks, [1])
  assert.deepEqual(flow.telephoneEvents[0].unlocks, [])
  assert.throws(() => setUnlock(flow, 1, 1, true), /different existing card/)
})

test('draft import accepts incomplete fields and reconstructs derived keys and missing phones', () => {
  let flow = addCard(addPerson(emptyFlow()), 0)
  flow = { ...flow, persons: [{ ...flow.persons[0], namecards: [] }], telephoneEvents: [] }
  const imported = readEditorDraft(flow)
  assert.deepEqual(imported.persons[0].namecards, [0])
  assert.equal(imported.telephoneEvents[0].id, 1)
  assert.equal(imported.telephoneEvents[0].objectId, 3)
  assert.equal(imported.nextId, 4)
  // The missing event's old ID is a dangling draft edge, not silently discarded.
  assert.deepEqual(imported.namecards[0].unlocks, [1, 3])
  assert.ok(validateFlow(imported).length > 0)
  assert.throws(() => parseGameFlow(imported), /company/)
})

test('corrupted drafts and ambiguous IDs are rejected without modifying the input', () => {
  assert.throws(() => readEditorDraft({ version: 4 }), /version/)
  assert.throws(() => readEditorDraft({ ...emptyFlow(), namecards: [{}] }), /integer/)
  const flow = withCards(1)
  assert.throws(() => readEditorDraft({ ...flow, nextId: 2 }), /nextId/)
  assert.throws(() => readEditorDraft({ ...flow, nextId: -1 }), /nextId/)
  assert.throws(() => readEditorDraft({ ...flow, persons: [{ ...flow.persons[0], objectId: 1 }] }), /unique/)
  assert.throws(() => readEditorDraft({ ...flow, nextNamecardId: 0 }), /nextNamecardId/)
  assert.throws(() => readEditorDraft({ ...flow, nextPersonId: -1 }), /nextPersonId/)
  assert.throws(() => readEditorDraft({
    ...flow, nextId: 5, nextTelephoneEventId: 2,
    telephoneEvents: [...flow.telephoneEvents, { id: 1, objectId: 4, personId: 0, unlocks: [] }],
  }), /multiple telephone/)
  assert.throws(() => readEditorDraft({
    ...flow, telephoneEvents: [{ ...flow.telephoneEvents[0], personId: 90 }],
  }), /has no person/)
  assert.equal(flow.nextId, 3)
  assert.throws(() => addPerson({ ...emptyFlow(), nextId: Number.MAX_SAFE_INTEGER }), /allocate IDs/)
})

test('validation blocks AND deadlocks and accepts all reachable card conditions', () => {
  let flow = withCards(3)
  flow = updateCard(flow, 0, { backText: 'First clue' })
  flow = updateCard(flow, 1, { backText: 'Second clue' })
  flow = setStartingCard(flow, 0, true)
  flow = setUnlock(flow, 2, 3, true)
  flow = setUnlock(flow, 2, 4, true)
  flow = setUnlock(flow, 3, 4, true)
  assert.deepEqual(validateFlow(flow), [])
  assert.deepEqual(parseGameFlow(JSON.parse(JSON.stringify(flow))), flow)
  flow = setUnlock(flow, 1, 4, true)
  assert.ok(validateFlow(flow).some((error) => error.includes('Unobtainable')))
})

test('blank back card clues cannot export; completed-page phone unlocks need no back text', () => {
  let flow = withCards(1)
  flow = setStartingCard(flow, 0, true)
  flow = addPerson(flow, 'Grace')
  flow = addCard(flow, 1)
  flow = updateCard(flow, 1, { company: 'Office', role: 'Director' })
  flow = setUnlock(flow, 1, 5, true)
  assert.deepEqual(validateFlow(flow), [])
  flow = setUnlock(flow, 2, 5, true)
  assert.ok(validateFlow(flow).some((error) => error.includes('no information on its back')))
})

test('deleting the last card removes its telephone and all attached edges but keeps its person', () => {
  let flow = addPerson(withCards(1), 'Grace')
  flow = addCard(flow, 1)
  flow = setStartingCard(flow, 0, true)
  flow = setUnlock(flow, 1, 5, true)
  flow = setUnlock(flow, 5, 2, true)
  flow = setEventPositions(flow, { 1: { x: 300, y: 0 }, 2: { x: 0, y: 0 }, 5: { x: 0, y: 200 } })
  const removed = removeCard(flow, 0)
  assert.deepEqual(removed.persons[0], { id: 0, objectId: 0, name: 'Ada', namecards: [] })
  assert.ok(!removed.telephoneEvents.some((event) => event.personId === 0))
  assert.deepEqual(removed.namecards[0].unlocks, [4])
  assert.deepEqual(removed.startingCards, [])
  assert.deepEqual(removed.eventPositions, { 5: { x: 0, y: 200 } })
  assert.deepEqual(readEditorDraft(JSON.parse(JSON.stringify(removed))), removed)
  const recreated = addCard(removed, 0)
  assert.equal(recreated.namecards.at(-1)?.id, 2)
  assert.equal(recreated.namecards.at(-1)?.objectId, 6)
  assert.deepEqual(recreated.telephoneEvents.find((event) => event.personId === 0), { id: 2, objectId: 7, personId: 0, unlocks: [] })
  assert.deepEqual(recreated.namecards.at(-1)?.unlocks, [7])
  assert.equal(recreated.nextId, 8)
  assert.ok(flow.telephoneEvents.some((event) => event.objectId === 1))
  assert.throws(() => removeCard(removed, 0), /does not exist/)
})

test('assigning a card to an empty person recreates a missing telephone without reusing IDs', () => {
  let flow = removeCard(withCards(1), 0)
  flow = addCard(flow)
  const id = flow.nextNamecardId - 1
  flow = updateCard(flow, id, { personId: 0 })
  assert.deepEqual(flow.telephoneEvents, [{ id: 1, objectId: 4, personId: 0, unlocks: [] }])
  assert.deepEqual(flow.namecards[0].unlocks, [4])
  const missingPhone = { ...withCards(1), telephoneEvents: [] }
  assert.deepEqual(updateCard(missingPhone, 0, { personId: null }).telephoneEvents, [])
})

test('deleting a telephone node removes its person, preserves cards as drafts, and cleans every reference', () => {
  let flow = withCards(2)
  flow = setUnlock(flow, 1, 3, true)
  flow = setUnlock(flow, 2, 3, true)
  flow = setEventPositions(flow, { 1: { x: 600, y: 0 }, 2: { x: 0, y: 0 } })
  const removed = removeGraphSelection(flow, [1])
  assert.deepEqual(removed.persons, [])
  assert.deepEqual(removed.telephoneEvents, [])
  assert.ok(removed.namecards.every((card) => card.personId === null))
  assert.deepEqual(removed.namecards[0].unlocks, [3])
  assert.deepEqual(removed.namecards[1].unlocks, [])
  assert.deepEqual(removed.eventPositions, { 2: { x: 0, y: 0 } })
  assert.throws(() => removeGraphSelection(flow, [900]), /no longer exists/)
})

test('mixed graph deletion honors explicitly selected telephones before last-card cleanup', () => {
  const flow = setEventPositions(withCards(1), { 1: { x: 300, y: 0 }, 2: { x: 0, y: 0 } })
  const removed = removeGraphSelection(flow, [2, 1], [{ sourceId: 2, targetId: 1 }])
  assert.deepEqual(removed.persons, [])
  assert.deepEqual(removed.namecards, [])
  assert.deepEqual(removed.telephoneEvents, [])
  assert.deepEqual(removed.eventPositions, {})
  assert.equal(removed.nextId, flow.nextId)
})

test('graph deletion cannot remove automatic edges on their own but allows deleting attached nodes', () => {
  let flow = withCards(2)
  assert.equal(isAutomaticRelation(flow, 2, 1), true)
  assert.equal(isAutomaticRelation(flow, 1, 2), false)
  assert.throws(() => removeGraphSelection(flow, [], [{ sourceId: 2, targetId: 1 }]), /automatic/)
  flow = setUnlock(flow, 2, 3, true)
  flow = removeGraphSelection(flow, [], [{ sourceId: 2, targetId: 3 }])
  assert.deepEqual(flow.namecards[0].unlocks, [1])
  flow = removeGraphSelection(flow, [2], [{ sourceId: 2, targetId: 1 }])
  assert.deepEqual(flow.persons[0].namecards, [1])
  assert.deepEqual(flow.telephoneEvents, [{ id: 0, objectId: 1, personId: 0, unlocks: [] }])
})

test('flowchart positions survive draft and game export/import and accept fractional or negative coordinates', () => {
  const flow = setEventPositions(setStartingCard(withCards(1), 0, true), {
    1: { x: 400.25, y: -30 },
    2: { x: -120, y: 80.5 },
  })
  assert.deepEqual(parseGameFlow(JSON.parse(JSON.stringify(flow))), flow)
  assert.deepEqual(readEditorDraft(JSON.parse(JSON.stringify(flow))), flow)
  assert.throws(() => setEventPositions(flow, { 900: { x: 0, y: 0 } }), /missing event/)
  assert.throws(() => setEventPositions(flow, { 2: { x: NaN, y: 0 } }), /finite/)
  assert.throws(() => readFlow({ ...flow, eventPositions: { 2: { x: '0', y: 0 } } }), /finite/)
  assert.throws(() => readFlow({ ...flow, eventPositions: { 2: { x: Infinity, y: 0 } } }), /finite/)
  assert.throws(() => readFlow({ ...flow, eventPositions: { nope: { x: 0, y: 0 } } }), /event IDs/)
  assert.ok(validateFlow({ ...flow, eventPositions: { 900: { x: 0, y: 0 } } }).some((error) => error.includes('Layout position')))
})

test('default flowchart layout orders career cards before telephones and includes unassigned drafts', () => {
  let flow = updateCard(withCards(2), 1, { year: 1990 })
  flow = addCard(flow)
  const positions = defaultEventPositions(flow)
  assert.deepEqual(Object.keys(positions).map(Number).sort(), [1, 2, 3, 4])
  assert.ok(positions[3].x < positions[2].x)
  assert.ok(positions[2].x < positions[1].x)
  assert.ok(positions[4].y > positions[1].y)
  assert.deepEqual(defaultEventPositions(flow), positions)
})

test('unreachable warnings include blocked telephones and respect AND rather than simple graph paths', () => {
  let flow = withCards(3)
  flow = setStartingCard(flow, 0, true)
  flow = updateCard(flow, 0, { backText: 'First clue' })
  flow = updateCard(flow, 1, { backText: 'Second clue' })
  flow = setUnlock(flow, 2, 3, true)
  flow = setUnlock(flow, 2, 4, true)
  flow = setUnlock(flow, 3, 4, true)
  assert.deepEqual(unreachableEventIds(flow), [])
  flow = setUnlock(flow, 1, 4, true)
  assert.deepEqual(unreachableEventIds(flow), [1, 4])
  flow = addCard(flow)
  assert.ok(validateFlow(flow).some((error) => error.includes('must belong')))
  assert.deepEqual(unreachableEventIds(flow), [1, 4, 5])
  assert.deepEqual(unreachableEventIds(addPerson(emptyFlow())), [])
})

test('empty people can remain without telephones after automatic cleanup', () => {
  const flow = removeCard(withCards(1), 0)
  assert.deepEqual(validateFlow(flow), [])
  assert.deepEqual(parseGameFlow(JSON.parse(JSON.stringify(flow))), flow)
  assert.deepEqual(readEditorDraft(flow), flow)
  const restored = addTelephone(flow, 0)
  assert.deepEqual(restored.telephoneEvents, [{ id: 1, objectId: 3, personId: 0, unlocks: [] }])
  assert.deepEqual(validateFlow(restored), [])
  assert.throws(() => addTelephone(restored, 0), /already has/)
  assert.throws(() => addTelephone(flow, 900), /existing person/)
})
