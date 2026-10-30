import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadGameFlow } from '../src/game/files.ts'

const sample = readFileSync(new URL('../public/sample_gameflow.json', import.meta.url), 'utf8')

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

test('a missing file or Vite HTML fallback uses the checked-in sample', async (context) => {
  for (const response of [
    new Response('', { status: 404 }),
    new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
  ]) {
    const requested: unknown[] = []
    const mock = context.mock.method(globalThis, 'fetch', async (url: unknown) => {
      requested.push(url)
      return requested.length === 1 ? response : new Response(sample)
    })
    const result = await loadGameFlow()
    assert.match(result.source, /sample_gameflow/)
    assert.equal(result.flow.persons.length, 8)
    assert.deepEqual(requested, ['/gameflow.json', '/sample_gameflow.json'])
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
  await assert.rejects(loadGameFlow(), /sample_gameflow.json: HTTP 404/)
})
