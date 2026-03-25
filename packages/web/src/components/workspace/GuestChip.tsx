import { useDraggable } from '@dnd-kit/core'
import type { Guest } from '@/stores/seating'

const CATEGORY_STYLES: Record<string, { background: string; borderColor: string; color: string }> = {
  '男方': { background: '#DBEAFE', borderColor: '#BFDBFE', color: '#1E40AF' },
  '女方': { background: '#FEE2E2', borderColor: '#FECACA', color: '#991B1B' },
  '共同': { background: '#F3F4F6', borderColor: '#D1D5DB', color: '#374151' },
}
const DEFAULT_CATEGORY_STYLE = { background: '#F3F4F6', borderColor: '#D1D5DB', color: '#374151' }

interface Props {
  guest: Guest
}

export function GuestChip({ guest }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: guest.id,
    data: { type: 'guest', guest },
  })

  const categoryStyle = CATEGORY_STYLES[guest.category] || DEFAULT_CATEGORY_STYLE

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`px-2 py-0.5 text-xs cursor-grab select-none whitespace-nowrap ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{
        fontFamily: 'var(--font-body)',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${categoryStyle.borderColor}`,
        backgroundColor: categoryStyle.background,
        color: categoryStyle.color,
      }}
      title={`${guest.name}${guest.attendeeCount > 1 ? ` (+${guest.attendeeCount - 1})` : ''}${guest.dietaryNote ? ` [${guest.dietaryNote}]` : ''}`}
    >
      {guest.name}
      {guest.attendeeCount > 1 && (
        <span style={{ color: 'var(--text-muted)' }} className="ml-0.5">+{guest.attendeeCount - 1}</span>
      )}
    </div>
  )
}
