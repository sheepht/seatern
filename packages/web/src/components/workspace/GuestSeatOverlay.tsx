import { useDraggable } from '@dnd-kit/core'
import { useSeatingStore, type Guest } from '@/stores/seating'

interface Props {
  guest: Guest
  seatIndex: number
  isCompanion: boolean
  x: number
  y: number
  radius: number
}

/**
 * HTML overlay positioned over an SVG guest seat circle.
 * Makes the guest draggable via @dnd-kit from inside the table.
 * 眷屬位用 seatIndex 區分，但 data 始終指向主人（拖眷屬 = 拖整組）。
 */
export function GuestSeatOverlay({ guest, seatIndex, isCompanion, x, y, radius }: Props) {
  // 眷屬偏移量：拖 B1 → offset=1，目標座位會回推主人位置
  const companionOffset = isCompanion && guest.seatIndex !== null
    ? (seatIndex - guest.seatIndex + 100) % 100  // 簡單差值，環形桌上不會超過 100
    : 0

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `seat-${guest.id}-${seatIndex}`,
    data: { type: 'guest', guest, companionOffset },
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
