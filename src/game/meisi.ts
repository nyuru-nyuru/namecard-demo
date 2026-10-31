import { LocalizedError } from '../i18n/messages.ts'
import { synchronizeFlow, type GameFlow } from './gameflow.ts'

const columns = ['meishiID', 'year', 'fonts', 'peopleID', 'displayName', 'logo', 'companyID', 'company', 'department', 'position', 'misc', 'back', 'tegaki']

function csvRows(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let closed = false
  const finishField = () => { row.push(field); field = ''; closed = false }
  for (let index = 0; index < csv.length; index++) {
    const character = csv[index]
    if (quoted) {
      if (character !== '"') field += character
      else if (csv[index + 1] === '"') { field += '"'; index++ }
      else { quoted = false; closed = true }
    } else if (character === '"') {
      if (field || closed) throw new LocalizedError('errors.meisiQuote')
      quoted = true
    } else if (character === ',') {
      finishField()
    } else if (character === '\r' || character === '\n') {
      finishField()
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      if (character === '\r' && csv[index + 1] === '\n') index++
    } else {
      if (closed) throw new LocalizedError('errors.meisiQuotedText')
      field += character
    }
  }
  if (quoted) throw new LocalizedError('errors.meisiUnclosedQuote')
  if (field || row.length || closed) {
    finishField()
    if (row.some((value) => value !== '')) rows.push(row)
  }
  return rows
}

function numericCell(value: string, field: string, row: number): number {
  const number = Number(value)
  if (!value.trim() || !Number.isSafeInteger(number) || number < 0) {
    throw new LocalizedError('errors.meisiNumber', { row, field })
  }
  return number
}

export function parseMeisiCsv(csv: string): GameFlow {
  const [header, ...rows] = csvRows(csv.replace(/^\uFEFF/, ''))
  if (JSON.stringify(header) !== JSON.stringify(columns)) throw new LocalizedError('errors.meisiHeader')
  if (!rows.length) throw new LocalizedError('errors.meisiEmpty')
  const records = rows.map((cells, index) => {
    if (cells.length !== columns.length) {
      throw new LocalizedError('errors.meisiColumns', { row: index + 1, count: columns.length })
    }
    const row = Object.fromEntries(columns.map((column, columnIndex) => [column, cells[columnIndex]]))
    const year = numericCell(row.year, 'year', index + 1)
    if (year < 1 || year > 9999) throw new LocalizedError('errors.meisiYear', { row: index + 1 })
    if (!row.displayName.trim() || !row.company.trim()) {
      throw new LocalizedError('errors.meisiFields', { row: index + 1 })
    }
    return {
      personId: numericCell(row.peopleID, 'peopleID', index + 1),
      personDisplayName: row.displayName,
      year,
      company: row.company,
      companyId: row.companyID.trim() ? numericCell(row.companyID, 'companyID', index + 1) : null,
      department: row.department,
      logo: row.logo,
      role: row.position,
      misc: [row.misc, row.back].filter((value) => value !== '').join('\n'),
      backText: row.tegaki,
    }
  })
  const persons = [...new Set(records.map((card) => card.personId))].sort((a, b) => a - b).map((id, objectId) => {
    const cards = records.filter((card) => card.personId === id)
    if (cards.length > 8) throw new LocalizedError('errors.meisiCapacity', { id })
    const latest = cards.reduce((latest, card) => card.year > latest.year ? card : latest)
    return { id, objectId, name: latest.personDisplayName, namecards: [] }
  })
  const namecards = records.map((card, id) => ({ ...card, id, objectId: persons.length + id, unlocks: [] }))
  const telephoneEvents = persons.map((person, id) => ({
    id, objectId: persons.length + namecards.length + id, personId: person.id, unlocks: [],
  }))
  return synchronizeFlow({
    version: 1,
    mode: 'all-unlocked',
    nextId: persons.length + namecards.length + telephoneEvents.length,
    nextPersonId: Math.max(...persons.map((person) => person.id)) + 1,
    nextNamecardId: namecards.length,
    nextTelephoneEventId: telephoneEvents.length,
    persons,
    namecards,
    telephoneEvents,
    startingCards: [],
  })
}
