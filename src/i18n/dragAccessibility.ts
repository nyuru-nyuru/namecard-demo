import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core'
import type { Translator } from './messages.ts'

export function dragAccessibility(
  t: Translator,
  instructions: 'dnd.gameInstructions' | 'dnd.gridInstructions',
  describe: (id: UniqueIdentifier) => string,
): { announcements: Announcements; screenReaderInstructions: ScreenReaderInstructions } {
  return {
    screenReaderInstructions: { draggable: t(instructions) },
    announcements: {
      onDragStart: ({ active }) => t('dnd.started', { item: describe(active.id) }),
      onDragOver: ({ active, over }) => over
        ? t('dnd.over', { item: describe(active.id), target: describe(over.id) })
        : t('dnd.noTarget', { item: describe(active.id) }),
      onDragEnd: ({ active, over }) => over
        ? t('dnd.dropped', { item: describe(active.id), target: describe(over.id) })
        : t('dnd.droppedOutside', { item: describe(active.id) }),
      onDragCancel: ({ active }) => t('dnd.cancelled', { item: describe(active.id) }),
    },
  }
}
