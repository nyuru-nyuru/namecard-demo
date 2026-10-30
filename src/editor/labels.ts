import type { GameCard, GameFlow } from '../game/gameflow.ts'

export function cardLabel(card: GameCard): string {
  return `#${card.id} · ${card.personDisplayName || 'Unnamed card'} · ${card.company || 'No company'} · ${card.year}`
}

export function eventLabel(flow: GameFlow, id: number): string {
  const card = flow.namecards.find((item) => item.id === id)
  if (card) return `Card ${cardLabel(card)}`
  const phone = flow.telephoneEvents.find((item) => item.id === id)
  if (phone) return `Telephone #${id} · ${flow.persons.find((person) => person.id === phone.personId)?.name || 'Unnamed person'}`
  return `Missing event #${id}`
}
