import { useState } from 'react'
import ReorderableGrid, {
  type GridDirection,
  type GridOrder,
} from './components/ReorderableGrid'
import { people } from './data/people'
import { useI18n } from './i18n/context.ts'
import { LocalizedError } from './i18n/messages.ts'
import './App.css'

function DemoApp() {
  const { t } = useI18n()
  const [persons, setPersons] = useState(people)
  const [selectedPersonId, setSelectedPersonId] = useState(people[0].id)
  const [columns, setColumns] = useState(1)
  const [columnInput, setColumnInput] = useState('1')
  const [order, setOrder] = useState<GridOrder>('row-wise')
  const [direction, setDirection] = useState<GridDirection>('ltr')
  const isColumnInputValid =
    Number.isSafeInteger(Number(columnInput)) && Number(columnInput) > 0
  const selectedPerson = persons.find((person) => person.id === selectedPersonId)

  if (!selectedPerson) {
    throw new LocalizedError('demo.personNotFound', { id: selectedPersonId })
  }

  return (
    <main>
      <h1>{t('demo.title')}</h1>
      <div className="grid-controls" role="group" aria-label={t('demo.controls')}>
        <label>
          {t('demo.person')}
          <select
            value={selectedPersonId}
            onChange={(event) => setSelectedPersonId(Number(event.currentTarget.value))}
          >
            {persons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('demo.columns')}
          <input
            type="number"
            min="1"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            required
            value={columnInput}
            aria-invalid={!isColumnInputValid}
            aria-describedby={!isColumnInputValid ? 'columns-error' : undefined}
            onChange={(event) => {
              const input = event.currentTarget
              setColumnInput(input.value)
              if (input.validity.valid && Number.isSafeInteger(input.valueAsNumber)) {
                setColumns(input.valueAsNumber)
              }
            }}
          />
        </label>
        <label>
          {t('demo.indexOrder')}
          <select
            value={order}
            onChange={(event) =>
              setOrder(event.currentTarget.value === 'column-wise' ? 'column-wise' : 'row-wise')
            }
          >
            <option value="row-wise">{t('demo.rowWise')}</option>
            <option value="column-wise">{t('demo.columnWise')}</option>
          </select>
        </label>
        <label>
          {t('demo.direction')}
          <select
            value={direction}
            onChange={(event) =>
              setDirection(event.currentTarget.value === 'rtl' ? 'rtl' : 'ltr')
            }
          >
            <option value="ltr">{t('demo.leftToRight')}</option>
            <option value="rtl">{t('demo.rightToLeft')}</option>
          </select>
        </label>
      </div>
      {!isColumnInputValid && (
        <p id="columns-error" className="grid-controls__error" role="alert">
          {t('demo.invalidColumns', { max: Number.MAX_SAFE_INTEGER })}
        </p>
      )}
      <ReorderableGrid
        key={selectedPerson.id}
        cards={selectedPerson.namecards}
        onReorder={(namecards) =>
          setPersons((current) =>
            current.map((person) =>
              person.id === selectedPersonId ? { ...person, namecards } : person,
            ),
          )
        }
        columns={columns}
        order={order}
        direction={direction}
      />
    </main>
  )
}

export default DemoApp