import { useDraggable } from '@dnd-kit/core'
import type { Guest } from '@/stores/seating'

const CATEGORY_BG: Record<string, string> = {
  '男方': 'bg-blue-50 border-blue-200',
  '女方': 'bg-red-50 border-red-200',
  '共同': 'bg-gray-50 border-gray-200',
}

interface Props {
  guest: Guest
}

export function GuestChip({ guest }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: guest.id,
    data: { type: 'guest', guest },
  })

  const chipClass = CATEGORY_BG[guest.category] || 'bg-gray-50 border-gray-200'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`px-2 py-0.5 rounded text-xs border ${chipClass} cursor-grab select-none whitespace-nowrap ${
        isDragging ? 'opacity-30' : ''
      }`}
      title={`${guest.name}${guest.attendeeCount > 1 ? ` (+${guest.attendeeCount - 1})` : ''}${guest.dietaryNote ? ` [${guest.dietaryNote}]` : ''}`}
    >
      {guest.name}
      {guest.attendeeCount > 1 && (
        <span className="text-gray-400 ml-0.5">+{guest.attendeeCount - 1}</span>
      )}
    </div>
  )
}
