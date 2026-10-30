import assert from 'node:assert/strict'
import test from 'node:test'
import { addCard, addPerson, setStartingCard, updateCard } from '../src/editor/model.ts'
import { loadGameFlow } from '../src/game/files.ts'
import {
  ACTIVE_FLOWCHART_KEY,
  createFlowchart,
  editorFlowchartUrl,
  flowchartStorageKey,
  getFlowchart,
  getFlowcharts,
  playFlowchartUrl,
  renameFlowchart,
  saveFlowchart,
  type FlowchartStorage,
} from '../src/game/flowcharts.ts'
import { emptyFlow } from '../src/game/gameflow.ts'

function memoryStorage(): FlowchartStorage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    key(index) { return [...values.keys()][index] ?? null },
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, value) },
  }
}

function playableFlow(name: string) {
  const flow = addCard(addPerson(emptyFlow(), name), 0)
  return setStartingCard(updateCard(flow, 2, {
    company: `${name}'s studio`, role: 'Designer', year: 2000,
  }), 2, true)
}

test('new flowcharts have unique IDs, independent JSON, and their own entity ID sequences', () => {
  const flowcharts = Array.from({ length: 20 }, () => createFlowchart())
  assert.equal(new Set(flowcharts.map(({ id }) => id)).size, flowcharts.length)
  assert.ok(flowcharts.every(({ id, title, gameflow }) =>
    id.length > 0 && title === 'Untitled flowchart' && gameflow.nextId === 0))
  assert.notEqual(flowcharts[0].gameflow, flowcharts[1].gameflow)
  flowcharts[0].gameflow = addPerson(flowcharts[0].gameflow, 'Ada')
  assert.equal(flowcharts[0].gameflow.nextId, 2)
  assert.deepEqual(flowcharts[1].gameflow, emptyFlow())
})

test('each flowchart persists in its own ID-backed gameflow JSON and can be reopened', () => {
  const storage = memoryStorage()
  const first = createFlowchart(playableFlow('Ada'), 'First flow')
  const second = createFlowchart(playableFlow('Grace'), 'Second flow')
  saveFlowchart(first, storage)
  saveFlowchart(second, storage)
  storage.setItem(ACTIVE_FLOWCHART_KEY, second.id)
  storage.setItem('namecard-game.editor-draft.v1', JSON.stringify(emptyFlow()))

  assert.notEqual(flowchartStorageKey(first.id), flowchartStorageKey(second.id))
  assert.ok(flowchartStorageKey(first.id).endsWith('.gameflow.json'))
  assert.deepEqual(JSON.parse(storage.getItem(flowchartStorageKey(first.id))!), first)
  assert.deepEqual(getFlowcharts(storage), [
    { id: first.id, title: first.title },
    { id: second.id, title: second.title },
  ])
  assert.deepEqual(getFlowchart(first.id, storage), first)
  assert.deepEqual(getFlowchart(second.id, storage), second)
  assert.equal(storage.getItem(ACTIVE_FLOWCHART_KEY), second.id)
})

test('saving edits, layout, and incomplete drafts does not change any other flowchart', () => {
  const storage = memoryStorage()
  const first = createFlowchart(playableFlow('Ada'), 'First')
  const second = createFlowchart(playableFlow('Grace'), 'Second')
  saveFlowchart(first, storage)
  saveFlowchart(second, storage)
  const secondJson = storage.getItem(flowchartStorageKey(second.id))
  const draft = {
    ...first,
    gameflow: {
      ...addCard(first.gameflow),
      eventPositions: { 2: { x: -45.5, y: 120.25 } },
    },
  }
  saveFlowchart(draft, storage)

  assert.deepEqual(getFlowchart(first.id, storage), draft)
  assert.equal(getFlowchart(first.id, storage).gameflow.namecards.at(-1)?.personId, null)
  assert.equal(storage.getItem(flowchartStorageKey(second.id)), secondJson)
})

test('renaming changes only the display title, permits duplicate titles, and keeps the storage identity', () => {
  const storage = memoryStorage()
  const first = createFlowchart(playableFlow('Ada'), 'Original')
  const second = createFlowchart(playableFlow('Grace'), 'Renamed')
  saveFlowchart(first, storage)
  saveFlowchart(second, storage)
  const renamed = renameFlowchart(first, '  Renamed  ')
  saveFlowchart(renamed, storage)

  assert.equal(renamed.id, first.id)
  assert.equal(renamed.gameflow, first.gameflow)
  assert.equal(renamed.title, 'Renamed')
  assert.equal(first.title, 'Original')
  assert.equal(storage.length, 2)
  assert.deepEqual(getFlowchart(first.id, storage), renamed)
  assert.equal(getFlowcharts(storage).length, 2)
  assert.throws(() => renameFlowchart(first, ' \t '), /title cannot be blank/)
  assert.throws(() => createFlowchart(emptyFlow(), ''), /title cannot be blank/)
})

test('missing, corrupt, and mismatched saved documents fail explicitly without replacing stored data', () => {
  const storage = memoryStorage()
  const flowchart = createFlowchart()
  const key = flowchartStorageKey(flowchart.id)
  assert.throws(() => getFlowchart(flowchart.id, storage), /not found/)
  assert.throws(() => getFlowchart('', storage), /ID is required/)

  for (const serialized of [
    '{not json',
    JSON.stringify({ ...flowchart, id: 'a-different-id' }),
    JSON.stringify({ ...flowchart, title: '' }),
    JSON.stringify({ ...flowchart, gameflow: { version: 2 } }),
  ]) {
    storage.setItem(key, serialized)
    assert.throws(() => getFlowchart(flowchart.id, storage))
    assert.throws(() => getFlowcharts(storage))
    assert.equal(storage.getItem(key), serialized)
  }
})

test('storage read and write failures are surfaced and do not destroy a previous saved flowchart', () => {
  const storage = memoryStorage()
  const flowchart = createFlowchart(playableFlow('Ada'), 'Saved')
  saveFlowchart(flowchart, storage)
  const original = storage.getItem(flowchartStorageKey(flowchart.id))
  const unavailable: FlowchartStorage = {
    ...storage,
    getItem() { throw new Error('Storage access denied') },
    setItem() { throw new Error('Storage quota exceeded') },
  }
  assert.throws(() => getFlowchart(flowchart.id, unavailable), /Storage access denied/)
  assert.throws(() => saveFlowchart(renameFlowchart(flowchart, 'Not saved'), unavailable), /Storage quota exceeded/)
  assert.equal(storage.getItem(flowchartStorageKey(flowchart.id)), original)
})

test('playback loads the requested flowchart JSON rather than the public file or last-opened flowchart', async (context) => {
  const storage = memoryStorage()
  const first = createFlowchart(playableFlow('Ada'), 'Ada flow')
  const second = createFlowchart(playableFlow('Grace'), 'Grace flow')
  saveFlowchart(first, storage)
  saveFlowchart(second, storage)
  storage.setItem(ACTIVE_FLOWCHART_KEY, second.id)
  const fetch = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Playback must not request a public gameflow')
  })

  const loaded = await loadGameFlow(first.id, storage)
  assert.deepEqual(loaded.flow, first.gameflow)
  assert.deepEqual(loaded.flowchart, { id: first.id, title: first.title })
  assert.match(loaded.source, new RegExp(first.id))
  assert.equal(loaded.flow.persons[0].name, 'Ada')
  assert.equal(fetch.mock.callCount(), 0)

  saveFlowchart(renameFlowchart(first, 'New title'), storage)
  const renamed = await loadGameFlow(first.id, storage)
  assert.equal(renamed.flowchart?.title, 'New title')
  assert.deepEqual(renamed.flow, first.gameflow)
})

test('invalid, missing, and unreadable flowchart playback never falls back to another game', async (context) => {
  const storage = memoryStorage()
  const invalid = createFlowchart(addCard(addPerson(emptyFlow(), 'Draft'), 0))
  saveFlowchart(invalid, storage)
  const fetch = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected public-file fallback')
  })

  await assert.rejects(loadGameFlow('missing', storage), /not found/)
  await assert.rejects(loadGameFlow('', storage), /ID is required/)
  await assert.rejects(loadGameFlow(invalid.id, storage), /needs a company, role, and display name/)
  storage.setItem(flowchartStorageKey(invalid.id), '{not json')
  await assert.rejects(loadGameFlow(invalid.id, storage), SyntaxError)
  assert.equal(fetch.mock.callCount(), 0)
})

test('editor and play URLs preserve the flowchart ID rather than using its display title', () => {
  const flowchart = createFlowchart(playableFlow('Ada'), 'A title with spaces')
  const renamed = renameFlowchart(flowchart, 'Another title')
  assert.equal(editorFlowchartUrl(flowchart.id), editorFlowchartUrl(renamed.id))
  assert.equal(playFlowchartUrl(flowchart.id), playFlowchartUrl(renamed.id))
  for (const path of [editorFlowchartUrl(flowchart.id), playFlowchartUrl(flowchart.id)]) {
    const url = new URL(path, 'https://example.test')
    assert.equal(url.searchParams.get('flowchart'), flowchart.id)
    assert.ok(!url.href.includes('title'))
  }
})

test('editor links allow no flowchart ID and both URL helpers encode IDs without losing characters', () => {
  assert.equal(editorFlowchartUrl(), '/editor/')
  assert.equal(editorFlowchartUrl(''), '/editor/?flowchart=')
  const id = 'saved flow/#?&='
  assert.equal(editorFlowchartUrl(id), '/editor/?flowchart=saved%20flow%2F%23%3F%26%3D')
  assert.equal(playFlowchartUrl(id), '/?flowchart=saved%20flow%2F%23%3F%26%3D')
  assert.equal(new URL(editorFlowchartUrl(id), 'https://example.test').searchParams.get('flowchart'), id)
  assert.equal(new URL(playFlowchartUrl(id), 'https://example.test').searchParams.get('flowchart'), id)
})
