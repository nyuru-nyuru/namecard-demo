import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import type { Namecard } from '../model/namecard'
import { getGridPositions, type GridDirection, type GridOrder } from './gridLayout'
import './ReorderableGrid.css'

export type { GridDirection, GridOrder } from './gridLayout'

export type ReorderableGridProps = {
  cards: Namecard[]
  onReorder: (cards: Namecard[]) => void
  columns?: number
  order?: GridOrder
  direction?: GridDirection
}

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

function SortableNamecard({
  card,
  position,
}: {
  card: Namecard
  position: Pick<CSSProperties, 'gridRow' | 'gridColumn'>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id })

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'namecard namecard--dragging' : 'namecard'}
      style={{ ...position, transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <span className="namecard__company">{card.company}</span>
      <span className="namecard__role">{card.role}</span>
      <span className="namecard__year">{card.year}</span>
    </li>
  )
}

export default function ReorderableGrid({
  cards,
  onReorder,
  columns = 1,
  order = 'row-wise',
  direction = 'ltr',
}: ReorderableGridProps) {
  const sensors = useSensors(
    // Small distance/delay thresholds keep clicks and touch scrolling from starting a drag.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const positions = getGridPositions(cards.length, { columns, order, direction })

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = cards.findIndex((c) => c.id === active.id)
    const to = cards.findIndex((c) => c.id === over.id)
    onReorder(arrayMove(cards, from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={columns === 1 ? [restrictToVerticalAxis] : undefined}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={cards} strategy={rectSortingStrategy}>
        <div className="reorderable-grid-viewport">
          <ul
            className="reorderable-grid"
            aria-label="Reorderable namecards"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(240px, 336px))` }}
          >
            {cards.map((card, index) => (
              <SortableNamecard key={card.id} card={card} position={positions[index]} />
            ))}
          </ul>
        </div>
      </SortableContext>
    </DndContext>
  )
}
