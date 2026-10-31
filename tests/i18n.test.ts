import assert from 'node:assert/strict'
import test from 'node:test'
import en from '../src/i18n/en.json' with { type: 'json' }
import ja from '../src/i18n/ja.json' with { type: 'json' }
import {
  createTranslator,
  english,
  errorMessage,
  formatText,
  LocalizedError,
  msg,
  translate,
  type MessageKey,
} from '../src/i18n/messages.ts'
import { addCard, addPerson, readEditorDraft, updateCard } from '../src/editor/model.ts'
import { cardLabel, eventLabel } from '../src/editor/labels.ts'
import { emptyFlow, identityErrors, parseGameFlow, validateFlow } from '../src/game/gameflow.ts'
import { cardLocation, createGame } from '../src/game/state.ts'

const japanese = createTranslator('ja')
const parameters = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

test('English and Japanese catalogs have identical nonempty keys and interpolation parameters', () => {
  assert.deepEqual(Object.keys(ja).sort(), Object.keys(en).sort())
  for (const key of Object.keys(en) as MessageKey[]) {
    assert.ok(en[key].trim(), `Empty English message: ${key}`)
    assert.ok(ja[key].trim(), `Empty Japanese message: ${key}`)
    assert.deepEqual(parameters(ja[key]), parameters(en[key]), `Parameters differ: ${key}`)
    const values = Object.fromEntries(parameters(en[key]).map((name) => [name, `value-${name}`]))
    for (const locale of ['en', 'ja'] as const) {
      assert.doesNotMatch(translate(locale, key, values), /\{\w+\}/, `Unresolved parameter: ${locale}:${key}`)
    }
  }
})

test('keyed translations interpolate numbers without changing character names or card content', () => {
  const values = { name: 'Ada {count}', role: 'Designer', year: 1982 }
  assert.equal(english('game.viewCard', values), 'View Ada {count}, Designer, 1982')
  assert.equal(japanese('game.viewCard', values), 'Ada {count}、Designer、1982 の名刺を見る')
  assert.equal(japanese('game.cardsDiscovered', { count: 5, total: 40 }), '発見した名刺：5 / 40')
  assert.equal(english('language.japanese'), '日本語')
  assert.equal(japanese('language.english'), 'English')
  assert.throws(() => japanese('game.cardsDiscovered', { count: 5 }), /Missing parameter "total"/)
})

test('saved notices and nested errors can be rendered in either language without recreating them', () => {
  const error = new LocalizedError('errors.cardMissing', { id: 17 })
  const notice = msg('editor.errors.import', { error: errorMessage(error) })
  assert.equal(error.message, 'Card #17 does not exist.')
  assert.equal(formatText('en', notice), 'Import failed; your current draft was kept: Card #17 does not exist.')
  assert.equal(formatText('ja', notice), '読み込みに失敗しました。現在の下書きは保持しています：名刺 #17 は存在しません。')
  const action = msg('game.notice.action', {
    message: msg('game.notice.information'),
    gained: msg('game.notice.gainedMany', { count: 2 }),
    completed: msg('game.notice.pageLocked'),
  })
  assert.match(formatText('en', action), /2 new cards added to the bin/)
  assert.match(formatText('ja', action), /新しい名刺が 2 枚/)
})

test('validation and schema errors remain English by default and support Japanese at display time', () => {
  const flow = emptyFlow()
  assert.deepEqual(validateFlow(flow), ['Add at least one person.'])
  assert.deepEqual(validateFlow(flow, japanese), ['人物を少なくとも1人追加してください。'])
  assert.throws(() => parseGameFlow(flow), (error: unknown) => {
    assert.ok(error instanceof LocalizedError)
    assert.equal(formatText('ja', errorMessage(error)), japanese('validation.personRequired'))
    return true
  })
  const invalid = { ...flow, nextId: -1 }
  assert.match(identityErrors(invalid)[0], /nextId/)
  assert.match(identityErrors(invalid, japanese)[0], /安全な整数/)
  assert.throws(() => readEditorDraft(invalid), (error: unknown) => {
    assert.match(formatText('ja', errorMessage(error)), /objectId より大きい/)
    return true
  })
})

test('multiple validation issues and gameplay errors retain their translation keys', () => {
  const flow = addCard(addPerson(emptyFlow(), 'Ada'), 0)
  assert.throws(() => parseGameFlow(flow), (error: unknown) => {
    const translated = formatText('ja', errorMessage(error))
    assert.match(translated, /会社と表示名/)
    assert.match(translated, /解除条件となるイベントもありません/)
    assert.ok(translated.includes('\n'))
    assert.match(formatText('en', errorMessage(error)), /needs a company/)
    return true
  })
  assert.throws(() => cardLocation(createGame(flow), 999), (error: unknown) => {
    assert.equal(formatText('ja', errorMessage(error)), '名刺 #999 はまだ入手していません。')
    return true
  })
})

test('editor event labels translate interface text while preserving authored content and identities', () => {
  let flow = addCard(addPerson(emptyFlow(), 'Ada'), 0)
  flow = updateCard(flow, 0, {
    company: 'Archive {id}', role: 'Designer', year: 1982,
    misc: 'Original details', backText: 'Original clue',
  })
  const original = JSON.stringify(flow)
  const card = flow.namecards[0]
  assert.equal(cardLabel(card, japanese), '#0 · Ada · Archive {id} · 1982')
  assert.equal(eventLabel(flow, card.objectId, japanese), '名刺 #0 · Ada · Archive {id} · 1982')
  assert.equal(eventLabel(flow, flow.telephoneEvents[0].objectId, japanese), '電話 #0 · Ada')
  assert.equal(eventLabel(flow, 999, japanese), '存在しないイベント #999')
  assert.equal(JSON.stringify(flow), original)
})

test('native parse and storage failures have translated explanations and unexpected details are not hidden', () => {
  assert.match(formatText('ja', errorMessage(new SyntaxError('Unexpected token'))), /JSON の形式が正しくありません/)
  assert.match(formatText('ja', errorMessage(new DOMException('Full', 'QuotaExceededError'))), /保存領域がいっぱい/)
  assert.match(formatText('ja', errorMessage(new DOMException('Denied', 'SecurityError'))), /アクセスできません/)
  assert.equal(formatText('ja', errorMessage(new Error('Device offline'))), '予期しないエラー：Device offline')
})
