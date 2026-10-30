import { useState } from 'react'
import ReorderableGrid, {
  type GridDirection,
  type GridOrder,
} from './components/ReorderableGrid'
import { people } from './data/people'
import './App.css'

function DemoApp() {
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
    throw new Error(`Person ${selectedPersonId} was not found`)
  }

  return (
    <main>
      <h1>Namecards</h1>
      <div className="grid-controls" role="group" aria-label="Namecard controls">
        <label>
          Person
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
          Columns
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
          Index order
          <select
            value={order}
            onChange={(event) =>
              setOrder(event.currentTarget.value === 'column-wise' ? 'column-wise' : 'row-wise')
            }
          >
            <option value="row-wise">Row-wise</option>
            <option value="column-wise">Column-wise</option>
          </select>
        </label>
        <label>
          Direction
          <select
            value={direction}
            onChange={(event) =>
              setDirection(event.currentTarget.value === 'rtl' ? 'rtl' : 'ltr')
            }
          >
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </select>
        </label>
      </div>
      {!isColumnInputValid && (
        <p id="columns-error" className="grid-controls__error" role="alert">
          Enter a positive whole number of columns (at most {Number.MAX_SAFE_INTEGER}).
          The grid keeps the last valid layout.
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