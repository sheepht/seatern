import { useDroppable } from '@dnd-kit/core'

interface Props {
  tableId: string
  seatIndex: number
  x: number
  y: number
  radius: number
  isEmpty: boolean
}

/**
 * HTML overlay positioned over an individual seat circle.
 * Each seat (occupied or empty) is a separate drop zone.
 * ID format: seat-drop-{tableId}-{seatIndex}
 */
export function SeatDropZone({ tableId, seatIndex, x, y, radius, isEmpty }: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: `seat-drop-${tableId}-${seatIndex}`,
    data: { type: 'seat', tableId, seatIndex },
  })

  const size = radius * 2
  return (
    <div
      ref={setNodeRef}
      className="absolute rounded-full"
      style={{
        left: x - radius,
        top: y - radius,
        width: size,
        height: size,
        zIndex: 5,
        // 空位顯示 hover 效果，有人的位子不顯示（由 shift 預覽處理）
        backgroundColor: isOver && isEmpty ? 'rgba(176, 141, 87, 0.2)' : undefined,
        border: isOver && isEmpty ? '2px dashed #B08D57' : undefined,
        boxSizing: 'border-box',
        borderRadius: '50%',
        transition: 'background-color 150ms, border 150ms',
      }}
    />
  )
}
