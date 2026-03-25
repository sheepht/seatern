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
    id: guest.id,
    data: { type: 'guest', guest },
  })

  const size = radius * 2
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute rounded-full cursor-grab"
      style={{
        left: x - radius,
        top: y - radius,
        width: size,
        height: size,
        opacity: isDragging ? 0.3 : 0,
        zIndex: 10,
      }}
    />
  )
}
