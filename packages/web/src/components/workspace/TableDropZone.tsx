import { useDroppable } from '@dnd-kit/core';

interface Props {
  tableId: string
  x: number
  y: number
  radius: number
}

/**
 * HTML overlay positioned over an SVG table circle.
 * Acts as a drop zone for @dnd-kit.
 */
export function TableDropZone({ tableId, x, y, radius }: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: `table-${tableId}`,
    data: { type: 'table', tableId },
  });

  const size = radius * 2;
  return (
    <div
      ref={setNodeRef}
      className={`absolute rounded-full pointer-events-none transition-colors ${
        isOver ? 'bg-blue-200/40 ring-2 ring-blue-400' : ''
      }`}
      style={{
        left: x - radius,
        top: y - radius,
        width: size,
        height: size,
      }}
    />
  );
}
