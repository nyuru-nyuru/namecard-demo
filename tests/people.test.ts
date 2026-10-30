import assert from 'node:assert/strict'
import test from 'node:test'
import { people } from '../src/data/people.ts'

test('the fixture contains eight distinct named people', () => {
  assert.equal(people.length, 8)
  assert.equal(new Set(people.map((person) => person.id)).size, 8)
  assert.equal(new Set(people.map((person) => person.name)).size, 8)
  for (const person of people) {
    assert.ok(Number.isSafeInteger(person.id) && person.id > 0)
    assert.ok(person.name.trim().split(/\s+/).length >= 2)
  }
})

test('each person retains their once-randomized count of one to eight namecards', () => {
  assert.deepEqual(people.map((person) => person.namecards.length), [3, 7, 2, 2, 3, 1, 7, 2])
  for (const person of people) {
    assert.ok(person.namecards.length >= 1 && person.namecards.length <= 8)
  }
})

test('all 27 business cards have globally unique IDs and complete details', () => {
  const cards = people.flatMap((person) => person.namecards)
  assert.equal(cards.length, 27)
  assert.equal(new Set(cards.map((card) => card.id)).size, cards.length)
  for (const card of cards) {
    assert.ok(Number.isSafeInteger(card.id) && card.id > 0)
    assert.ok(card.company.trim().length > 0)
    assert.ok(card.role.trim().length > 0)
    assert.ok(Number.isInteger(card.year) && card.year >= 1980)
  }
})

test('legacy demo cards populate the expanded namecard model', () => {
  for (const person of people) {
    for (const card of person.namecards) {
      assert.equal(card.personId, person.id)
      assert.equal(card.personDisplayName, person.name)
      assert.equal(card.backText, '')
      assert.equal(card.backViewed, false)
    }
  }
})

test('career histories advance chronologically with role and company changes', () => {
  for (const person of people) {
    const cards = person.namecards
    for (let index = 1; index < cards.length; index++) {
      assert.ok(cards[index].year > cards[index - 1].year, person.name)
      assert.notEqual(cards[index].role, cards[index - 1].role, person.name)
    }
    if (cards.length > 1) {
      assert.ok(new Set(cards.map((card) => card.company)).size > 1, person.name)
    }
  }
})

test('exactly five people start in complementary 1980s game-development roles', () => {
  const roles = new Set([
    '6502 Game Programmer',
    'Game Designer',
    'Pixel Artist',
    'Game Music Composer',
    'Game Tester',
  ])
  const firstCards = people.map((person) => person.namecards[0])
  const gameStarters = firstCards.filter((card) => roles.has(card.role))
  assert.equal(gameStarters.length, 5)
  assert.deepEqual(new Set(gameStarters.map((card) => card.role)), roles)
  for (const card of gameStarters) {
    assert.ok(card.year >= 1980 && card.year <= 1989)
    assert.equal(card.company, 'Lantern Byte Games')
  }
  assert.equal(
    firstCards.filter((card) => card.company === 'Lantern Byte Games').length,
    5,
  )
})
