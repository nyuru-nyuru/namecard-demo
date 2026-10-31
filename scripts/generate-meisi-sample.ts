import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMeisiCsv } from '../src/game/meisi.ts'

export { parseMeisiCsv as createMeisiSample }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flow = parseMeisiCsv(readFileSync(new URL('../meisi-data.csv', import.meta.url), 'utf8'))
  writeFileSync(new URL('../public/sample_meisi_gameflow.json', import.meta.url), `${JSON.stringify(flow, null, 2)}\n`)
  console.log(`Generated meisi sample: ${flow.persons.length} people, ${flow.namecards.length} cards, ${flow.telephoneEvents.length} telephones.`)
}
