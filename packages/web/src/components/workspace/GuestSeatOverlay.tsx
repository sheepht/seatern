import { useDraggable } from '@dnd-kit/core'
import { useSeatingStore, type Guest } from '@/stores/seating'

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
  const setHoveredGuest = useSeatingStore((s) => s.setHoveredGuest)

  const size = radius * 2
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute rounded-full cursor-grab"
      style={{
        left: x - radius - 4,
        top: y - radius - 4,
        width: size + 8,
        height: size + 8,
        opacity: isDragging ? 0.3 : undefined,
        zIndex: 10,
        border: '1.5px dashed transparent',
        boxSizing: 'border-box',
        transition: 'border-color 150ms ease-out',
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.borderColor = '#B08D57'
          setHoveredGuest(guest.id)
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'transparent'
        setHoveredGuest(null)
      }}
    />
  )
}
