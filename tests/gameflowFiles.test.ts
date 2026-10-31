import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DEFAULT_SAMPLE_DATASET, loadGameFlow, loadSampleDataset, loadSpreadsheetGameFlow, SAMPLE_DATASETS } from '../src/game/files.ts'
import { errorMessage, formatText, LocalizedError } from '../src/i18n/messages.ts'
import { createGame, isComplete, moveCard } from '../src/game/state.ts'

const sample = readFileSync(new URL('../public/sample_gameflow.json', import.meta.url), 'utf8')
const meisiSample = readFileSync(new URL('../public/sample_meisi_gameflow.json', import.meta.url), 'utf8')
const spreadsheet = { spreadsheetId: 'live-sheet', range: 'Live!A1:M3', apiKey: 'test-key' }
const sheetHeader = ['meishiID', 'year', 'fonts', 'peopleID', 'displayName', 'logo', 'companyID', 'company', 'department', 'position', 'misc', 'back', 'tegaki']
const sheetValues = [
  sheetHeader,
  [0, 2004, 'ignored', 42, 'Live Ada', 'LIVE', 7, 'Live Studio', 'Engineering', '', 'Front, details\nLine 2', 'Printed "details"', 'Handwritten\nclue'],
  [1, 2000, '', 42, 'Earlier Ada', '', 3, 'Earlier Studio', '', 'Developer', '', '', ''],
]

function sheetResponse(values: unknown = sheetValues): Response {
  return new Response(JSON.stringify({ range: spreadsheet.range, majorDimension: 'ROWS', values }), {
    headers: { 'content-type': 'application/json' },
  })
}

test('a successful live sheet is the top default and becomes a playable all-unlocked flow', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async (url: unknown) => {
    assert.ok(url instanceof URL)
    assert.equal(url.hostname, 'sheets.googleapis.com')
    return sheetResponse()
  })
  const result = await loadGameFlow(null, undefined, spreadsheet)
  assert.equal(fetch.mock.callCount(), 1)
  assert.equal(result.warning, undefined)
  assert.deepEqual(result.sourceMessage, { key: 'game.source.googleSheets', values: { range: spreadsheet.range } })
  assert.equal(result.flow.mode, 'all-unlocked')
  assert.deepEqual(result.flow.startingCards, [])
  assert.deepEqual(result.flow.persons.map((person) => ({ id: person.id, name: person.name, cards: person.namecards })), [
    { id: 42, name: 'Live Ada', cards: [1, 0] },
  ])
  const card = result.flow.namecards[0]
  assert.equal(card.personDisplayName, 'Live Ada')
  assert.equal(card.company, 'Live Studio')
  assert.equal(card.companyId, 7)
  assert.equal(card.department, 'Engineering')
  assert.equal(card.logo, 'LIVE')
  assert.equal(card.role, '')
  assert.equal(card.misc, 'Front, details\nLine 2\nPrinted "details"')
  assert.equal(card.backText, 'Handwritten\nclue')
  assert.deepEqual(card.unlocks, [result.flow.telephoneEvents[0].objectId])
  let state = createGame(result.flow)
  assert.deepEqual(state.bin, [0, 1])
  assert.deepEqual(state.owned, [0, 1])
  state = moveCard(result.flow, state, 1, { personId: 42, slot: 0 })
  state = moveCard(result.flow, state, 0, { personId: 42, slot: 1 })
  assert.ok(isComplete(result.flow, state))
  assert.deepEqual(state.bin, [])
  assert.deepEqual(state.viewedBacks, [])
  assert.deepEqual(state.called, [])
})

test('standalone spreadsheet loading prepends a reusable sample that can be reloaded without fetching', async (context) => {
  const previousDatasets = [...SAMPLE_DATASETS]
  const fetch = context.mock.method(globalThis, 'fetch', async () => sheetResponse())
  const result = await loadSpreadsheetGameFlow({ ...spreadsheet, spreadsheetId: 'cached-sheet' })
  const dataset = SAMPLE_DATASETS[0]
  assert.ok('loaded' in dataset)
  assert.equal('filename' in dataset, false)
  assert.deepEqual(SAMPLE_DATASETS.slice(1), previousDatasets)
  assert.equal(formatText('en', { key: dataset.titleKey, values: dataset.titleValues }), result.source)
  assert.match(formatText('ja', { key: dataset.titleKey, values: dataset.titleValues }), /Live!A1:M3/)
  const cached = await loadSampleDataset(dataset.id)
  assert.deepEqual(cached, result)
  assert.notStrictEqual(cached.flow, result.flow)
  result.flow.namecards[0].company = 'Edited game'
  cached.flow.namecards[0].company = 'Edited sample'
  assert.equal((await loadSampleDataset(dataset.id)).flow.namecards[0].company, 'Live Studio')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(loadSampleDataset(dataset.id, controller.signal), { name: 'AbortError' })
  assert.equal(fetch.mock.callCount(), 1)
})

test('reloading a spreadsheet reuses its first fetch and moves it first without duplicates', async (context) => {
  const previousDatasets = [...SAMPLE_DATASETS]
  let values = sheetValues
  const fetch = context.mock.method(globalThis, 'fetch', async () => sheetResponse(values))
  const options = { ...spreadsheet, spreadsheetId: 'refresh-sheet' }
  const first = await loadGameFlow(undefined, undefined, options)
  const firstDataset = SAMPLE_DATASETS[0]
  await loadGameFlow(undefined, undefined, { ...options, range: 'Other!A1:M3' })
  const otherDataset = SAMPLE_DATASETS[0]
  assert.notEqual(firstDataset.id, otherDataset.id)
  values = [sheetHeader, [0, 2026, '', 42, 'Updated Ada', '', '', 'Updated Studio', '', '', '', '', '']]
  const cached = await loadGameFlow(undefined, undefined, options)
  assert.equal(SAMPLE_DATASETS.length, previousDatasets.length + 2)
  assert.equal(SAMPLE_DATASETS[0].id, firstDataset.id)
  assert.strictEqual(SAMPLE_DATASETS[1], otherDataset)
  assert.deepEqual(SAMPLE_DATASETS.slice(2), previousDatasets)
  assert.deepEqual(cached, first)
  assert.notStrictEqual(cached.flow, first.flow)
  assert.deepEqual(await loadSampleDataset(firstDataset.id), cached)
  assert.equal((await loadSampleDataset(firstDataset.id)).flow.namecards[0].company, 'Live Studio')
  assert.equal((await loadSampleDataset(otherDataset.id)).flow.namecards[0].company, 'Live Studio')
  assert.equal(fetch.mock.callCount(), 2)
})

test('the first successful spreadsheet fetch is saved once in the tab cache without credentials', async (context) => {
  const storage = {
    getItem: context.mock.fn((_key: string) => null),
    setItem: context.mock.fn((_key: string, _value: string) => undefined),
  }
  const fetch = context.mock.method(globalThis, 'fetch', async () => sheetResponse())
  const options = { ...spreadsheet, spreadsheetId: 'session-write-sheet' }
  const first = await loadSpreadsheetGameFlow(options, storage)
  const cached = await loadSpreadsheetGameFlow(options, storage)
  assert.deepEqual(cached, first)
  assert.notStrictEqual(cached.flow, first.flow)
  assert.equal(fetch.mock.callCount(), 1)
  assert.equal(storage.getItem.mock.callCount(), 1)
  assert.equal(storage.setItem.mock.callCount(), 1)
  const [key, value] = storage.setItem.mock.calls[0].arguments
  assert.equal(key, `namecard-game.spreadsheet.v1.google-sheets:${JSON.stringify([options.spreadsheetId, options.range])}`)
  assert.deepEqual(JSON.parse(value), first.flow)
  assert.ok(!key.includes(options.apiKey))
  assert.ok(!value.includes(options.apiKey))
})

test('a spreadsheet restored from the tab cache is first in the sample list without an API request', async (context) => {
  const previousDatasets = [...SAMPLE_DATASETS]
  const storage = {
    getItem: context.mock.fn((_key: string) => meisiSample),
    setItem: context.mock.fn((_key: string, _value: string) => undefined),
  }
  const fetch = context.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected API request') })
  const options = { ...spreadsheet, spreadsheetId: 'session-read-sheet' }
  const result = await loadSpreadsheetGameFlow(options, storage)
  assert.equal(result.flow.namecards.length, 53)
  assert.equal(result.warning, undefined)
  assert.deepEqual(await loadSampleDataset(SAMPLE_DATASETS[0].id), result)
  assert.deepEqual(SAMPLE_DATASETS.slice(1), previousDatasets)
  assert.equal(storage.getItem.mock.callCount(), 1)
  assert.equal(storage.setItem.mock.callCount(), 0)
  assert.equal(fetch.mock.callCount(), 0)
})

test('corrupt tab caches are replaced by a fresh spreadsheet and reported visibly', async (context) => {
  for (const [spreadsheetId, value] of [
    ['invalid-json-cache', '{not json'],
    ['invalid-flow-cache', '{"version":2}'],
  ] as const) {
    const storage = {
      getItem: context.mock.fn((_key: string) => value),
      setItem: context.mock.fn((_key: string, _value: string) => undefined),
    }
    const fetch = context.mock.method(globalThis, 'fetch', async () => sheetResponse())
    const result = await loadSpreadsheetGameFlow({ ...spreadsheet, spreadsheetId }, storage)
    assert.equal(result.flow.namecards.length, 2)
    assert.equal(result.warning?.key, 'game.errors.spreadsheetCache')
    assert.equal(fetch.mock.callCount(), 1)
    assert.equal(storage.setItem.mock.callCount(), 1)
    assert.deepEqual(JSON.parse(storage.setItem.mock.calls[0].arguments[1]), result.flow)
    fetch.mock.restore()
  }
})

test('tab cache read or write failures do not replace a successful spreadsheet with local data', async (context) => {
  for (const operation of ['getItem', 'setItem'] as const) {
    const failure = new DOMException('Tab cache unavailable', 'SecurityError')
    const storage = {
      getItem(_key: string) {
        if (operation === 'getItem') throw failure
        return null
      },
      setItem(_key: string, _value: string) {
        if (operation === 'setItem') throw failure
      },
    }
    const fetch = context.mock.method(globalThis, 'fetch', async () => sheetResponse())
    const options = { ...spreadsheet, spreadsheetId: `cache-${operation}-failure` }
    const result = await loadSpreadsheetGameFlow(options, storage)
    assert.equal(result.flow.namecards.length, 2)
    assert.equal(result.sourceMessage?.key, 'game.source.googleSheets')
    assert.equal(result.warning?.key, 'game.errors.spreadsheetCache')
    assert.deepEqual(await loadGameFlow(undefined, undefined, options), result)
    assert.equal(fetch.mock.callCount(), 1)
    fetch.mock.restore()
  }
})

test('standalone spreadsheet failures leave samples unchanged without requesting a local fallback', async (context) => {
  const previousDatasets = [...SAMPLE_DATASETS]
  for (const [response, expected] of [
    [new Response('Unavailable', { status: 503 }), /503/],
    [sheetResponse([['wrong header']]), /header/],
  ] as const) {
    const fetch = context.mock.method(globalThis, 'fetch', async (url: unknown) => {
      assert.ok(url instanceof URL)
      assert.equal(url.hostname, 'sheets.googleapis.com')
      return response
    })
    await assert.rejects(loadSpreadsheetGameFlow({ ...spreadsheet, spreadsheetId: 'failed-editor-sheet' }), expected)
    assert.equal(fetch.mock.callCount(), 1)
    assert.deepEqual(SAMPLE_DATASETS, previousDatasets)
    fetch.mock.restore()
  }
})

test('a spreadsheet response arriving after cancellation is not registered as a sample', async (context) => {
  const previousDatasets = [...SAMPLE_DATASETS]
  const controller = new AbortController()
  const failure = new DOMException('Cancelled', 'AbortError')
  const fetch = context.mock.method(globalThis, 'fetch', async () => {
    controller.abort(failure)
    return sheetResponse()
  })
  const options = { ...spreadsheet, spreadsheetId: 'cancelled-response-sheet', signal: controller.signal }
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(loadSpreadsheetGameFlow(options), (error: unknown) => {
      assert.strictEqual(error, failure)
      return true
    })
  }
  assert.equal(fetch.mock.callCount(), 1)
  assert.deepEqual(SAMPLE_DATASETS, previousDatasets)
})

test('Sheets HTTP or network failures use the configured local flow with a visible warning', async (context) => {
  const previousDatasets = [...SAMPLE_DATASETS]
  for (const failure of [new Response('Unavailable', { status: 503 }), new TypeError('Sheets offline')]) {
    const requested: unknown[] = []
    const mock = context.mock.method(globalThis, 'fetch', async (url: unknown) => {
      requested.push(url)
      if (url instanceof URL) {
        if (failure instanceof Error) throw failure
        return failure
      }
      return new Response(sample)
    })
    const result = await loadGameFlow(undefined, undefined, { ...spreadsheet, spreadsheetId: 'failed-game-sheet' })
    assert.equal(result.source, 'gameflow.json')
    assert.equal(result.flow.namecards.length, 40)
    assert.equal(result.flow.mode, undefined)
    assert.ok(result.warning)
    assert.equal(result.warning.key, 'game.errors.googleSheetsFallback')
    assert.match(formatText('en', result.warning), /Using the local gameflow/)
    assert.match(formatText('ja', result.warning), /ローカル/)
    assert.deepEqual(requested.slice(1), ['/gameflow.json'])
    assert.deepEqual(SAMPLE_DATASETS, previousDatasets)
    mock.mock.restore()
  }
})

test('invalid or unplayable Sheets CSV uses the bundled fallback and reports the cause', async (context) => {
  const previousDatasets = [...SAMPLE_DATASETS]
  for (const [values, cause] of [
    [[['wrong header']], /header/],
    [[sheetHeader, [0, 2000, '', Number.MAX_SAFE_INTEGER, 'Ada', '', '', 'Studio', '', '', '', '', '']], /nextPersonId/],
  ] as const) {
    const controller = new AbortController()
    const requested: unknown[] = []
    const mock = context.mock.method(globalThis, 'fetch', async (url: unknown) => {
      requested.push(url)
      if (url instanceof URL) return sheetResponse(values)
      return url === '/gameflow.json' ? new Response('', { status: 404 }) : new Response(meisiSample)
    })
    const result = await loadGameFlow(undefined, undefined, { ...spreadsheet, spreadsheetId: 'invalid-sheet', signal: controller.signal })
    assert.equal(result.sourceMessage?.key, 'game.source.sample')
    assert.equal(result.flow.namecards.length, 53)
    assert.equal(result.flow.mode, 'all-unlocked')
    assert.ok(result.warning)
    assert.match(formatText('en', result.warning), cause)
    assert.deepEqual(requested.slice(1), ['/gameflow.json', '/sample_meisi_gameflow.json'])
    assert.ok(mock.mock.calls.every((call) => call.arguments[1]?.signal === controller.signal))
    assert.deepEqual(SAMPLE_DATASETS, previousDatasets)
    mock.mock.restore()
  }
})

test('cancelled Sheets loads do not start a local fallback', async (context) => {
  const previousDatasets = [...SAMPLE_DATASETS]
  const controller = new AbortController()
  const failure = new DOMException('Cancelled', 'AbortError')
  const fetch = context.mock.method(globalThis, 'fetch', async () => {
    controller.abort(failure)
    throw failure
  })
  await assert.rejects(loadGameFlow(undefined, undefined, { ...spreadsheet, spreadsheetId: 'cancelled-sheet', signal: controller.signal }), (error: unknown) => {
    assert.strictEqual(error, failure)
    return true
  })
  assert.equal(fetch.mock.callCount(), 1)
  await assert.rejects(loadGameFlow(undefined, undefined, { ...spreadsheet, spreadsheetId: 'cancelled-sheet', signal: controller.signal }), (error: unknown) => {
    assert.strictEqual(error, failure)
    return true
  })
  assert.equal(fetch.mock.callCount(), 1)
  assert.deepEqual(SAMPLE_DATASETS, previousDatasets)
})

test('failures of both Sheets and local loading are reported together', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async (url: unknown) =>
    new Response('Unavailable', { status: url instanceof URL ? 503 : 500 }),
  )
  await assert.rejects(loadGameFlow(undefined, undefined, { ...spreadsheet, spreadsheetId: 'unavailable-sheet' }), (error: unknown) => {
    assert.ok(error instanceof LocalizedError)
    assert.equal(error.localizedMessage.key, 'errors.googleSheetsAndLocalFailed')
    for (const locale of ['en', 'ja'] as const) {
      const message = formatText(locale, errorMessage(error))
      assert.match(message, /503/)
      assert.match(message, /500/)
    }
    return true
  })
  assert.equal(fetch.mock.callCount(), 2)
})

test('loads configured gameflow without requesting the fallback', async (context) => {
  const requested: unknown[] = []
  context.mock.method(globalThis, 'fetch', async (url: unknown) => {
    requested.push(url)
    return new Response(sample, { headers: { 'content-type': 'application/json' } })
  })
  const result = await loadGameFlow()
  assert.equal(result.source, 'gameflow.json')
  assert.equal(result.flow.namecards.length, 40)
  assert.deepEqual(requested, ['/gameflow.json'])
})

test('a missing file or Vite HTML fallback uses the Meisi sample by default', async (context) => {
  for (const response of [
    new Response('', { status: 404 }),
    new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
  ]) {
    const requested: unknown[] = []
    const mock = context.mock.method(globalThis, 'fetch', async (url: unknown) => {
      requested.push(url)
      return requested.length === 1 ? response : new Response(meisiSample)
    })
    const result = await loadGameFlow()
    assert.equal(result.source, 'sample_meisi_gameflow.json (no gameflow.json found)')
    assert.deepEqual(result.sourceMessage, {
      key: 'game.source.sample',
      values: { filename: 'sample_meisi_gameflow.json' },
    })
    assert.equal(result.flow.persons.length, 9)
    assert.equal(result.flow.namecards.length, 53)
    assert.equal(result.flow.mode, 'all-unlocked')
    assert.deepEqual(requested, ['/gameflow.json', '/sample_meisi_gameflow.json'])
    mock.mock.restore()
  }
})

test('configured malformed, invalid, and server-error flows are not silently replaced', async (context) => {
  for (const response of [
    new Response('{not json'),
    new Response('{"version":2}'),
    new Response('Server error', { status: 500 }),
  ]) {
    let calls = 0
    const mock = context.mock.method(globalThis, 'fetch', async () => {
      calls++
      return response
    })
    await assert.rejects(loadGameFlow())
    assert.equal(calls, 1)
    mock.mock.restore()
  }
})

test('network failures and a missing sample produce explicit errors', async (context) => {
  const mock = context.mock.method(globalThis, 'fetch', async () => { throw new Error('Offline') })
  await assert.rejects(loadGameFlow(), /Offline/)
  mock.mock.restore()
  context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }))
  await assert.rejects(loadGameFlow(), /sample_meisi_gameflow.json: HTTP 404/)
})

test('the sample registry loads each selected dataset independently and preserves their modes', async (context) => {
  const requested: unknown[] = []
  context.mock.method(globalThis, 'fetch', async (url: unknown) => {
    requested.push(url)
    const dataset = SAMPLE_DATASETS.find((dataset) => 'filename' in dataset && `/${dataset.filename}` === url)
    assert.ok(dataset && 'filename' in dataset)
    return new Response(readFileSync(new URL(`../public/${dataset.filename}`, import.meta.url), 'utf8'))
  })
  assert.equal(new Set(SAMPLE_DATASETS.map((dataset) => dataset.id)).size, SAMPLE_DATASETS.length)
  assert.equal(DEFAULT_SAMPLE_DATASET.id, 'meisi')
  assert.equal(DEFAULT_SAMPLE_DATASET.filename, 'sample_meisi_gameflow.json')
  assert.deepEqual(SAMPLE_DATASETS.filter((dataset) => 'filename' in dataset).map((dataset) => dataset.id), ['meisi', 'careers'])
  const careers = await loadSampleDataset('careers')
  const meisi = await loadSampleDataset('meisi')
  assert.equal(careers.flow.namecards.length, 40)
  assert.equal(meisi.flow.namecards.length, 53)
  assert.equal(meisi.flow.persons.length, 9)
  assert.equal(meisi.flow.mode, 'all-unlocked')
  assert.deepEqual(meisi.flow.startingCards, [])
  assert.deepEqual(requested, ['/sample_gameflow.json', '/sample_meisi_gameflow.json'])
  await assert.rejects(loadSampleDataset('missing'), /Unknown sample dataset/)
  assert.equal(requested.length, 2)
})

test('selected-sample failures are explicit and do not request another dataset', async (context) => {
  for (const response of [
    new Response('', { status: 404 }),
    new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
    new Response('{"version":4}'),
  ]) {
    const mock = context.mock.method(globalThis, 'fetch', async () => response)
    await assert.rejects(loadSampleDataset('meisi'))
    assert.equal(mock.mock.callCount(), 1)
    mock.mock.restore()
  }
})
