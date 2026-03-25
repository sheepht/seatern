import { useDraggable } from '@dnd-kit/core'
import type { Guest } from '@/stores/seating'

interface Props {
  guest: Guest
  x: number
  y: number
  radius: number
}

/**
 * HTML overlay positioned over an SVG guest seat circle.
 * Makes the guest draggable via @dnd-kit from inside the table.
 */
export function GuestSeatOverlay({ guest, x, y, radius }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `seat-${guest.id}`,
    data: { type: 'guest', guest },
  })

  const size = radius * 2
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute rounded-full cursor-grab transition-all duration-150"
      style={{
        left: x - radius,
        top: y - radius,
        width: size,
        height: size,
        opacity: isDragging ? 0.3 : undefined,
        zIndex: 10,
        border: '2px solid transparent',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.border = '2px solid #B08D57'
          e.currentTarget.style.boxShadow = '0 0 8px rgba(176,141,87,0.4)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.border = '2px solid transparent'
        e.currentTarget.style.boxShadow = 'none'
      }}
    />
  )
}
