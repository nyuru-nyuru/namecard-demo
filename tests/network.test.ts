import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { errorMessage, formatText } from '../src/i18n/messages.ts'
import { HttpError, request } from '../src/network/http.ts'

test('request passes the URL through and returns an unread response', async (context) => {
  const response = new Response('Hello')
  const fetch = context.mock.method(globalThis, 'fetch', async () => response)
  const result = await request('/api/example')
  assert.strictEqual(result, response)
  assert.equal(result.bodyUsed, false)
  assert.equal(await result.text(), 'Hello')
  assert.deepEqual(fetch.mock.calls[0].arguments, ['/api/example', undefined])
})

test('request passes POST options, headers, credentials, and abort signals through and accepts empty responses', async (context) => {
  const response = new Response(null, { status: 204 })
  const fetch = context.mock.method(globalThis, 'fetch', async () => response)
  const controller = new AbortController()
  const options: RequestInit = {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json', 'X-Request-ID': 'test-request' }),
    body: JSON.stringify({ message: 'Hello' }),
    credentials: 'same-origin',
    signal: controller.signal,
  }
  assert.strictEqual(await request('/api/example', options), response)
  assert.strictEqual(fetch.mock.calls[0].arguments[1], options)
  assert.equal(response.status, 204)
  assert.equal(response.body, null)
})

test('HTTP errors preserve the response and body and support localized messages', async (context) => {
  const response = new Response(JSON.stringify({ error: 'Invalid input' }), { status: 422 })
  context.mock.method(globalThis, 'fetch', async () => response)
  await assert.rejects(request('/api/example'), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.name, 'HttpError')
    assert.strictEqual(error.response, response)
    assert.equal(error.response.status, 422)
    assert.equal(error.message, 'HTTP request to /api/example failed with status 422.')
    assert.match(formatText('ja', errorMessage(error)), /ステータス 422/)
    return true
  })
  assert.equal(response.bodyUsed, false)
  assert.deepEqual(await response.json(), { error: 'Invalid input' })
})

test('request supports URL and Request inputs without changing them', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))
  const url = 'https://example.test/cards'
  const inputs = [new URL(url), new Request(url)]
  for (const [index, input] of inputs.entries()) {
    await assert.rejects(request(input), (error: unknown) => {
      assert.ok(error instanceof HttpError)
      assert.equal(error.localizedMessage.values?.url, url)
      return true
    })
    assert.strictEqual(fetch.mock.calls[index].arguments[0], input)
  }
})

test('network failures and cancellation propagate without being replaced', async (context) => {
  for (const failure of [new TypeError('Network unavailable'), new DOMException('Cancelled', 'AbortError')]) {
    const fetch = context.mock.method(globalThis, 'fetch', async () => { throw failure })
    await assert.rejects(request('/api/example'), (error: unknown) => {
      assert.strictEqual(error, failure)
      return true
    })
    fetch.mock.restore()
  }
})

test('request makes a real HTTP GET to a local server', { timeout: 10_000 }, async (context) => {
  const server = createServer((incoming, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ method: incoming.method, path: incoming.url }))
  })
  await once(server.listen(0, '127.0.0.1'), 'listening')
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  }))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const response = await request(`http://127.0.0.1:${address.port}/ping`, { signal: context.signal })
  assert.deepEqual(await response.json(), { method: 'GET', path: '/ping' })
})
