import assert from 'node:assert/strict'
import test from 'node:test'
import { appPathname, appUrl } from '../src/urls.ts'

test('local development URLs remain rooted at the origin', () => {
  assert.equal(appUrl(), '/')
  assert.equal(appUrl('editor/'), '/editor/')
  assert.equal(appUrl('gameflow.json'), '/gameflow.json')
  assert.equal(appUrl('sample_gameflow.json'), '/sample_gameflow.json')
})

test('GitHub Pages URLs keep routes, query parameters, and public files under the repository base', () => {
  const base = '/namecard-demo/'
  assert.equal(appUrl('', base), '/namecard-demo/')
  assert.equal(appUrl('editor/', base), '/namecard-demo/editor/')
  assert.equal(appUrl('demo/', base), '/namecard-demo/demo/')
  assert.equal(appUrl('?flowchart=saved-id', base), '/namecard-demo/?flowchart=saved-id')
  assert.equal(appUrl('gameflow.json', base), '/namecard-demo/gameflow.json')
  assert.equal(appUrl('sample_gameflow.json', base), '/namecard-demo/sample_gameflow.json')
})

test('route matching removes the development or deployment base and trailing slashes', () => {
  for (const base of ['/', '/namecard-demo/']) {
    assert.equal(appPathname(base, base), '/')
    assert.equal(appPathname(base.slice(0, -1), base), '/')
    assert.equal(appPathname(`${base}editor`, base), '/editor')
    assert.equal(appPathname(`${base}editor/`, base), '/editor')
    assert.equal(appPathname(`${base}demo`, base), '/demo')
    assert.equal(appPathname(`${base}demo///`, base), '/demo')
    assert.equal(appPathname(`${base}other`, base), '/other')
  }
})
