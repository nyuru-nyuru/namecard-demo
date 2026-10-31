import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createMeisiSample } from '../scripts/generate-meisi-sample.ts'
import { addCard, addPerson, readEditorDraft, setEventPositions, setUnlock } from '../src/editor/model.ts'
import { eventLabel } from '../src/editor/labels.ts'
import { identityErrors, isAutomaticRelation, parseGameFlow, readFlow, unreachableEventIds } from '../src/game/gameflow.ts'
import { createGame } from '../src/game/state.ts'
import { parseMeisiCsv } from '../src/game/meisi.ts'

const csv = readFileSync(new URL('../meisi-data.csv', import.meta.url), 'utf8')
const sample = () => createMeisiSample(csv)
const header = 'year,peopleID,fonts,displayName,logo,companyID,company,department,position,misc,back,tegaki'

test('the checked-in meisi sample exactly matches the source CSV and is deterministic', () => {
  assert.strictEqual(createMeisiSample, parseMeisiCsv)
  const stored = JSON.parse(readFileSync(new URL('../public/sample_meisi_gameflow.json', import.meta.url), 'utf8'))
  assert.deepEqual(stored, sample())
  assert.deepEqual(readEditorDraft(stored), sample())
  assert.deepEqual(readFlow(stored), sample())
  assert.deepEqual(parseGameFlow(stored), sample())
})

test('meisi preserves peopleID, all 53 unlocked cards, chronological keys, and nine telephones', () => {
  const flow = sample()
  assert.equal(flow.mode, 'all-unlocked')
  assert.deepEqual(flow.persons.map((person) => person.id), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(flow.persons.map((person) => person.namecards.length), [5, 7, 7, 7, 7, 6, 6, 7, 1])
  assert.equal(flow.namecards.length, 53)
  assert.deepEqual(flow.namecards.map((card) => card.id), Array.from({ length: 53 }, (_, id) => id))
  assert.equal(flow.telephoneEvents.length, 9)
  assert.equal(flow.nextPersonId, 10)
  assert.equal(flow.nextNamecardId, 53)
  assert.equal(flow.nextTelephoneEventId, 9)
  assert.equal(flow.nextId, 71)
  assert.deepEqual(identityErrors(flow), [])
  assert.deepEqual(flow.startingCards, [])
  for (const person of flow.persons) {
    const cards = flow.namecards.filter((card) => card.personId === person.id).sort((a, b) => a.year - b.year || a.id - b.id)
    assert.deepEqual(person.namecards, cards.map((card) => card.id))
    assert.equal(person.name, cards.at(-1)?.personDisplayName)
    const phone = flow.telephoneEvents.find((phone) => phone.personId === person.id)!
    assert.deepEqual(phone.unlocks, [])
    for (const card of cards) assert.deepEqual(card.unlocks, [phone.objectId])
  }
  assert.deepEqual(unreachableEventIds(flow), [])
  const initial = createGame(flow)
  assert.deepEqual(initial.bin, flow.namecards.map((card) => card.id))
  assert.deepEqual(initial.owned, initial.bin)
  assert.deepEqual(parseGameFlow(flow), flow)
})

test('misc and back become front details, tegaki alone becomes back text, and position becomes role', () => {
  const flow = sample()
  const first = flow.namecards[0]
  assert.equal(first.role, '作曲・編曲')
  assert.equal(first.misc, '携帯：070-****-****\n  E-mail：endou@soundroom.***\nWeb：soundroom.***/works')
  assert.equal(first.backText, '請求先：タイガーテイル→本人')
  assert.equal(first.companyId, 7)
  assert.equal(first.personId, 2)
  const secondment = flow.namecards.find((card) => card.personId === 1 && card.year === 2005)!
  assert.ok(secondment.misc.endsWith('株式会社ミナモトインタラクティブより出向'))
  assert.equal(secondment.backText, '')
  assert.equal(secondment.companyId, null)
  const bird = flow.namecards.find((card) => card.personId === 3 && card.year === 2016)!
  assert.equal(bird.logo, '🐦')
  assert.ok(flow.namecards.some((card) => card.department === '開発部'))
  assert.equal(flow.namecards.filter((card) => card.role === '').length, 9)
  assert.ok(flow.namecards.every((card) => !('fonts' in card)))
})

test('CSV quoting handles multiline fields, commas, escaped quotes, BOM, and CRLF', () => {
  const flow = createMeisiSample(`\uFEFF${header}\r\n2001,12,Ignored,Ada,,3,Studio,Team,Lead,"line one\r\nline two, ""quoted""",Website,Handwriting\r\n`)
  assert.equal(flow.namecards[0].misc, 'line one\r\nline two, "quoted"\nWebsite')
  assert.equal(flow.namecards[0].backText, 'Handwriting')
  assert.equal(flow.namecards[0].role, 'Lead')
  assert.equal(flow.persons[0].id, 12)
})

test('malformed CSV and invalid numeric IDs fail explicitly', () => {
  assert.throws(() => createMeisiSample('wrong,header\n1,2'), /header/)
  assert.throws(() => createMeisiSample(header), /at least one card/)
  assert.throws(() => createMeisiSample(`${header}\n2000,1`), /12 columns/)
  assert.throws(() => createMeisiSample(`${header}\n2000,1,,Ada,,,Office,,Role,"broken`), /Unclosed/)
  assert.throws(() => createMeisiSample(`${header}\n2000,1,,Ada,,,Office,,Role,"a"b,,`), /after a quoted/)
  assert.throws(() => createMeisiSample(`${header}\n2000,no,,Ada,,,Office,,Role,,,`), /peopleID/)
  assert.throws(() => createMeisiSample(`${header}\n,1,,Ada,,,Office,,Role,,,`), /year/)
})

test('new entities continue independent IDs and graph actions use global objectIds, not overlapping IDs', () => {
  let flow = sample()
  flow = addPerson(flow, 'New person')
  assert.equal(flow.persons.at(-1)?.id, 10)
  assert.equal(flow.persons.at(-1)?.objectId, 71)
  assert.equal(flow.telephoneEvents.at(-1)?.id, 9)
  assert.equal(flow.telephoneEvents.at(-1)?.objectId, 72)
  flow = addCard(flow, 10)
  const card = flow.namecards.at(-1)!
  assert.equal(card.id, 53)
  assert.equal(card.objectId, 73)
  assert.deepEqual(card.unlocks, [72])
  flow = setUnlock(flow, 62, card.objectId, true)
  assert.deepEqual(flow.telephoneEvents[0].unlocks, [73])
  assert.equal(isAutomaticRelation(flow, card.objectId, 72), true)
  flow = setEventPositions(flow, { [card.objectId]: { x: 123, y: -12 } })
  assert.equal(flow.eventPositions?.[card.objectId].x, 123)
  assert.match(eventLabel(flow, 9), /^Card #0/)
  assert.match(eventLabel(flow, 62), /^Telephone #0/)
  assert.deepEqual(readEditorDraft(JSON.parse(JSON.stringify(flow))), flow)
})
