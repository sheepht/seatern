import { useDroppable } from '@dnd-kit/core';
import { useSeatingStore } from '@/stores/seating';

interface Props {
  tableId: string
  seatIndex: number
  x: number
  y: number
  radius: number
  isEmpty: boolean
  isActive?: boolean
  tableCenterX?: number
  tableCenterY?: number
  onEmptyClick?: (tableId: string, seatIndex: number, seatX: number, seatY: number, tableCenterX: number, tableCenterY: number) => void
}

/**
 * HTML overlay positioned over an individual seat circle.
 * Each seat (occupied or empty) is a separate drop zone.
 * ID format: seat-drop-{tableId}-{seatIndex}
 */
export function SeatDropZone({ tableId, seatIndex, x, y, radius, isEmpty, isActive, tableCenterX, tableCenterY, onEmptyClick }: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: `seat-drop-${tableId}-${seatIndex}`,
    data: { type: 'seat', tableId, seatIndex },
  });
  const isTouchHover = useSeatingStore(
    (s) => s.touchHoverSeat?.tableId === tableId && s.touchHoverSeat?.seatIndex === seatIndex,
  );
  const showOverStyle = (isOver || isTouchHover) && isEmpty;

  const size = radius * 2;
  return (
    <div
      ref={setNodeRef}
      data-drop-table-id={tableId}
      data-drop-seat-index={seatIndex}
      data-drop-empty={isEmpty ? '1' : '0'}
      className="absolute rounded-full z-5 box-border transition-[background-color,border] duration-150"
      style={{
        left: x - radius,
        top: y - radius,
        width: size,
        height: size,
        cursor: isEmpty && onEmptyClick ? 'pointer' : undefined,
        // 空位顯示 hover 效果，有人的位子不顯示（由 shift 預覽處理）
        backgroundColor: isActive ? 'rgba(176, 141, 87, 0.3)' : showOverStyle ? 'rgba(176, 141, 87, 0.2)' : undefined,
        border: isActive ? '2px solid #B08D57' : showOverStyle ? '2px dashed #B08D57' : undefined,
      }}
      onClick={isEmpty && onEmptyClick ? (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const seatScreenX = rect.left + rect.width / 2;
        const seatScreenY = rect.top + rect.height / 2;
        // tableCenterX/Y 是容器內座標，轉成螢幕座標
        const container = e.currentTarget.offsetParent as HTMLElement | null;
        const cRect = container?.getBoundingClientRect();
        const tcScreenX = (cRect?.left ?? 0) + (tableCenterX ?? 0);
        const tcScreenY = (cRect?.top ?? 0) + (tableCenterY ?? 0);
        onEmptyClick(tableId, seatIndex, seatScreenX, seatScreenY, tcScreenX, tcScreenY);
      } : undefined}
    />
  );
}
