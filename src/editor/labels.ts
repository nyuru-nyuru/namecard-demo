import type { GameCard, GameFlow } from '../game/gameflow.ts'
import { english, type Translator } from '../i18n/messages.ts'

export function cardLabel(card: GameCard, t: Translator = english): string {
  return t('editor.cardLabel', {
    id: card.id, name: card.personDisplayName || t('common.unnamedCard'),
    company: card.company || t('common.noCompany'), year: card.year,
  })
}

export function eventLabel(flow: GameFlow, id: number, t: Translator = english): string {
  const card = flow.namecards.find((item) => item.objectId === id)
  if (card) return t('editor.cardEventLabel', { card: cardLabel(card, t) })
  const phone = flow.telephoneEvents.find((item) => item.objectId === id)
  if (phone) return t('editor.telephoneEventLabel', {
    id: phone.id, name: flow.persons.find((person) => person.id === phone.personId)?.name || t('common.unnamedPerson'),
  })
  return t('editor.missingEvent', { id })
}
