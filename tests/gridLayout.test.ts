import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getGridPositions,
  type GridDirection,
  type GridOrder,
} from '../src/components/gridLayout.ts'

const layouts: { order: GridOrder; direction: GridDirection; cells: number[][] }[] = [
  {
    order: 'row-wise',
    direction: 'ltr',
    cells: [[1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3], [3, 1]],
  },
  {
    order: 'row-wise',
    direction: 'rtl',
    cells: [[1, 3], [1, 2], [1, 1], [2, 3], [2, 2], [2, 1], [3, 3]],
  },
  {
    order: 'column-wise',
    direction: 'ltr',
    cells: [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [1, 3]],
  },
  {
    order: 'column-wise',
    direction: 'rtl',
    cells: [[1, 3], [2, 3], [3, 3], [1, 2], [2, 2], [3, 2], [1, 1]],
  },
]

for (const { order, direction, cells } of layouts) {
  const layout = { columns: 3, order, direction }

  test(`${order}, ${direction}: seven items leave trailing empty cells`, () => {
    assert.deepEqual(
      getGridPositions(7, layout),
      cells.map(([gridRow, gridColumn]) => ({ gridRow, gridColumn })),
    )
  })

  test(`${order}, ${direction}: empty, single-item and single-column grids`, () => {
    assert.deepEqual(getGridPositions(0, layout), [])
    assert.deepEqual(getGridPositions(1, layout), [
      { gridRow: 1, gridColumn: direction === 'ltr' ? 1 : 3 },
    ])
    assert.deepEqual(getGridPositions(3, { ...layout, columns: 1 }), [
      { gridRow: 1, gridColumn: 1 },
      { gridRow: 2, gridColumn: 1 },
      { gridRow: 3, gridColumn: 1 },
    ])
  })

  test(`${order}, ${direction}: extra columns remain empty at the end`, () => {
    assert.deepEqual(getGridPositions(2, { ...layout, columns: 4 }), [
      { gridRow: 1, gridColumn: direction === 'ltr' ? 1 : 4 },
      { gridRow: 1, gridColumn: direction === 'ltr' ? 2 : 3 },
    ])
  })

  test(`${order}, ${direction}: positions are unique and within the configured grid`, () => {
    for (const itemCount of [1, 2, 4, 6, 7, 10]) {
      for (const columns of [1, 2, 3, 4, 6]) {
        const positions = getGridPositions(itemCount, { ...layout, columns })
        assert.equal(positions.length, itemCount)
        assert.equal(
          new Set(positions.map(({ gridRow, gridColumn }) => `${gridRow}:${gridColumn}`)).size,
          itemCount,
        )
        for (const { gridRow, gridColumn } of positions) {
          assert.ok(gridRow >= 1 && gridRow <= Math.ceil(itemCount / columns))
          assert.ok(gridColumn >= 1 && gridColumn <= columns)
        }
      }
    }
  })
}

test('column-wise filling may leave an entire trailing column empty', () => {
  assert.deepEqual(
    getGridPositions(4, { columns: 3, order: 'column-wise', direction: 'ltr' }),
    [
      { gridRow: 1, gridColumn: 1 },
      { gridRow: 2, gridColumn: 1 },
      { gridRow: 1, gridColumn: 2 },
      { gridRow: 2, gridColumn: 2 },
    ],
  )
})

test('invalid column counts fail explicitly, including for an empty grid', () => {
  for (const columns of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    for (const itemCount of [0, 4]) {
      assert.throws(
        () => getGridPositions(itemCount, { columns, order: 'row-wise', direction: 'ltr' }),
        { name: 'RangeError', message: 'columns must be a positive safe integer' },
      )
    }
  }
})
