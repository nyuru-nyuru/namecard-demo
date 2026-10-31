import assert from 'node:assert/strict'
import test from 'node:test'
import { loadFromSpreadsheet } from '../src/game/files.ts'
import { LocalizedError } from '../src/i18n/messages.ts'
import { getGoogleSheetCsv } from '../src/network/googleSheets.ts'
import { HttpError } from '../src/network/http.ts'

const options = { spreadsheetId: 'spreadsheet-id', range: "'Name Cards'!A1:C5", apiKey: 'test-key' }
const json = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' },
})

test('values.get uses encoded paths, formatted rows, API-key headers, and the caller signal', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => json({
    range: options.range,
    majorDimension: 'ROWS',
    values: [
      ['name', 'note', 'count'],
      ['Ada', 'a,b "quoted"\r\nnext', 0],
      [false, 'single\rcarriage'],
      ['\u540d\u523a', 'line\nfeed', ''],
      [],
    ],
  }))
  const controller = new AbortController()
  const csv = await getGoogleSheetCsv({ ...options, signal: controller.signal })
  assert.equal(csv,
    'name,note,count\r\n' +
    'Ada,"a,b ""quoted""\r\nnext",0\r\n' +
    'false,"single\rcarriage",\r\n' +
    '\u540d\u523a,"line\nfeed",\r\n' +
    ',,\r\n',
  )
  const [url, init] = fetch.mock.calls[0].arguments
  assert.ok(url instanceof URL)
  assert.equal(url.origin, 'https://sheets.googleapis.com')
  assert.equal(url.pathname, `/v4/spreadsheets/spreadsheet-id/values/${encodeURIComponent(options.range)}`)
  assert.equal(url.searchParams.get('majorDimension'), 'ROWS')
  assert.equal(url.searchParams.get('valueRenderOption'), 'FORMATTED_VALUE')
  assert.equal(url.searchParams.has('key'), false)
  assert.ok(!url.href.includes(options.apiKey))
  assert.ok(init)
  assert.equal(init.method, 'GET')
  assert.equal(init.body, undefined)
  assert.strictEqual(init.signal, controller.signal)
  const headers = new Headers(init.headers)
  assert.equal(headers.get('X-Goog-Api-Key'), options.apiKey)
  assert.equal(headers.get('Authorization'), null)
  assert.equal(headers.get('Accept'), 'application/json')
})

test('the existing spreadsheet loader returns CSV using an OAuth bearer token', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => json({
    range: 'Sheet1!A1:B1',
    majorDimension: 'ROWS',
    values: [[0, false]],
  }))
  const csv = await loadFromSpreadsheet({
    spreadsheetId: 'spreadsheet-id',
    range: 'Sheet1!A1:B1',
    accessToken: 'test-access-token',
  })
  assert.equal(csv, '0,false\r\n')
  const [url, init] = fetch.mock.calls[0].arguments
  assert.ok(url instanceof URL)
  assert.ok(!url.href.includes('test-access-token'))
  const headers = new Headers(init?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer test-access-token')
  assert.equal(headers.get('X-Goog-Api-Key'), null)
})

test('empty Google ranges return empty CSV with no invented records', async (context) => {
  let payload: unknown
  context.mock.method(globalThis, 'fetch', async () => json(payload))
  for (const value of [
    { range: options.range, majorDimension: 'ROWS' },
    { range: options.range, majorDimension: 'ROWS', values: [] },
  ]) {
    payload = value
    assert.equal(await getGoogleSheetCsv(options), '')
  }
})

test('invalid inputs fail before making a network request', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Invalid inputs must not make requests')
  })
  for (const invalid of [
    { ...options, spreadsheetId: '' },
    { ...options, spreadsheetId: '  ' },
    { ...options, range: '' },
    { ...options, range: '  ' },
    { ...options, apiKey: '' },
    { spreadsheetId: 'spreadsheet-id', range: 'Sheet1', accessToken: '  ' },
  ]) {
    await assert.rejects(getGoogleSheetCsv(invalid), (error: unknown) => {
      assert.ok(error instanceof LocalizedError)
      assert.equal(error.localizedMessage.key, 'errors.googleSheetsRequired')
      return true
    })
  }
  // @ts-expect-error Missing credentials are also rejected for JavaScript callers.
  await assert.rejects(getGoogleSheetCsv({ spreadsheetId: 'spreadsheet-id', range: 'Sheet1' }), /exactly one/)
  // @ts-expect-error API keys and OAuth tokens are mutually exclusive.
  await assert.rejects(getGoogleSheetCsv({ ...options, accessToken: 'test-token' }), /exactly one/)
  assert.equal(fetch.mock.callCount(), 0)
})

test('malformed value ranges fail explicitly instead of producing misleading CSV', async (context) => {
  let payload: unknown
  context.mock.method(globalThis, 'fetch', async () => json(payload))
  for (const invalid of [
    null,
    [],
    {},
    { range: 42 },
    { range: '' },
    { range: options.range, majorDimension: 'COLUMNS', values: [['Ada']] },
    { range: options.range, values: null },
    { range: options.range, values: 'not rows' },
    { range: options.range, values: [42] },
    { range: options.range, values: [[null]] },
    { range: options.range, values: [[{}]] },
    { range: options.range, values: [[['nested']]] },
  ]) {
    payload = invalid
    await assert.rejects(getGoogleSheetCsv(options), (error: unknown) => {
      assert.ok(error instanceof LocalizedError)
      assert.equal(error.localizedMessage.key, 'errors.googleSheetsResponse')
      return true
    })
  }
})

test('non-finite cells and malformed JSON are rejected', async (context) => {
  let body = '{"range":"Sheet1!A1","values":[[1e309]]}'
  context.mock.method(globalThis, 'fetch', async () => new Response(body))
  await assert.rejects(getGoogleSheetCsv(options), /invalid value range/)
  body = '<html>Not JSON</html>'
  await assert.rejects(getGoogleSheetCsv(options), SyntaxError)
})

test('Google HTTP errors preserve their status and unread response body', async (context) => {
  const response = new Response(JSON.stringify({ error: { message: 'Permission denied' } }), { status: 403 })
  context.mock.method(globalThis, 'fetch', async () => response)
  await assert.rejects(getGoogleSheetCsv(options), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.strictEqual(error.response, response)
    assert.equal(error.response.status, 403)
    assert.ok(!error.message.includes(options.apiKey))
    return true
  })
  assert.equal(response.bodyUsed, false)
  assert.deepEqual(await response.json(), { error: { message: 'Permission denied' } })
})

test('network failures and cancellation propagate unchanged', async (context) => {
  for (const failure of [new TypeError('Network unavailable'), new DOMException('Cancelled', 'AbortError')]) {
    const fetch = context.mock.method(globalThis, 'fetch', async () => { throw failure })
    await assert.rejects(getGoogleSheetCsv(options), (error: unknown) => {
      assert.strictEqual(error, failure)
      return true
    })
    fetch.mock.restore()
  }
})
