import { english } from '../i18n/messages.ts'

export type GridOrder = 'row-wise' | 'column-wise'
export type GridDirection = 'ltr' | 'rtl'

type GridLayout = {
  columns: number
  order: GridOrder
  direction: GridDirection
}

export function getGridPositions(
  itemCount: number,
  { columns, order, direction }: GridLayout,
) {
  if (!Number.isSafeInteger(columns) || columns < 1) {
    throw new RangeError(english('demo.invalidColumnCount'))
  }

  const rows = Math.ceil(itemCount / columns)

  return Array.from({ length: itemCount }, (_, index) => {
    const row = order === 'row-wise' ? Math.floor(index / columns) : index % rows
    const column = order === 'row-wise' ? index % columns : Math.floor(index / rows)

    return {
      gridRow: row + 1,
      gridColumn: direction === 'ltr' ? column + 1 : columns - column,
    }
  })
}
