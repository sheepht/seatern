import { useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import { useSeatingStore, type Guest } from '@/stores/seating';
import { getCategoryColor, loadCategoryColors } from '@/lib/category-colors';

interface Props {
  guest: Guest
  animIndex?: number
}

export function GuestChip({ guest, animIndex: _animIndex }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: guest.id,
    data: { type: 'guest', guest },
  });
  const setHoveredGuest = useSeatingStore((s) => s.setHoveredGuest);
  const bestSwapTableId = useSeatingStore((s) => s.bestSwapTableId);
  const moveGuestToSeat = useSeatingStore((s) => s.moveGuestToSeat);
  const setEditingGuest = useSeatingStore((s) => s.setEditingGuest);
  const eventId = useSeatingStore((s) => s.eventId);

  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressProgress, setLongPressProgress] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);

  const colors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);
  const catColor = getCategoryColor(guest.category, colors);
  const categoryStyle = { background: catColor.background, borderColor: catColor.border, color: catColor.color };

  // 入場動畫已移除（人多時等太久）
  const animClass = '';

  const cancelLongPress = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    setLongPressProgress(false);
    useSeatingStore.setState({ longPressActive: false });
  };

  return (
    <>
    <div
      ref={setNodeRef}
      {...Object.fromEntries(Object.entries(listeners || {}).filter(([k]) => k !== 'onPointerDown'))}
      {...attributes}
      data-guest-id={guest.id}
      className={`guest-chip px-2 py-0.5 text-sm cursor-grab select-none whitespace-nowrap font-[family-name:var(--font-body)] rounded-[var(--radius-sm)] ${
        isDragging ? 'opacity-30' : ''
      } ${animClass}`}
      style={{
        border: `1px solid ${categoryStyle.borderColor}`,
        backgroundColor: categoryStyle.background,
        color: categoryStyle.color,
      }}
      onPointerDown={(e) => {
        // 長按 1.5 秒自動分配到最佳推薦桌
        if (bestSwapTableId) {
          setLongPressProgress(true);
          useSeatingStore.setState({ longPressActive: true });
          longPressRef.current = setTimeout(() => {
            setLongPressProgress(false);
            useSeatingStore.setState({ longPressActive: false });
            setTooltip(null);
            setHoveredGuest(null);
            const targetTable = useSeatingStore.getState().tables.find((t) => t.id === bestSwapTableId);
            if (!targetTable) return;
            const tableGuests = useSeatingStore.getState().guests.filter(
              (g) => g.assignedTableId === bestSwapTableId && g.rsvpStatus === 'confirmed',
            );
            const usedIndices = new Set<number>();
            for (const g of tableGuests) {
              if (g.seatIndex !== null) {
                usedIndices.add(g.seatIndex);
                for (let c = 1; c < g.seatCount; c++) usedIndices.add((g.seatIndex + c) % targetTable.capacity);
              }
            }
            let freeSeat = 0;
            while (usedIndices.has(freeSeat)) freeSeat++;
            moveGuestToSeat(guest.id, bestSwapTableId, freeSeat);
          }, 1500);
        }
        listeners?.onPointerDown?.(e as unknown as Event);
      }}
      onPointerUp={() => cancelLongPress()}
      onClick={() => { if (!isDragging) setEditingGuest(guest.id); }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setHoveredGuest(guest.id, rect.top + rect.height / 2);
        setTooltip({ x: rect.right + 6, y: rect.top + rect.height / 2 });
      }}
      onMouseLeave={() => {
        cancelLongPress();
        setHoveredGuest(null);
        setTooltip(null);
      }}
      title={`${guest.name}${guest.aliases.length > 0 ? ` (${guest.aliases[0]})` : ''}${guest.companionCount > 0 ? ` +${guest.companionCount}` : ''}${guest.dietaryNote ? ` [${guest.dietaryNote}]` : ''}`}
    >
      {guest.aliases.length > 0 ? guest.aliases[0] : guest.name}
      {guest.companionCount > 0 && (
        <span className="ml-0.5 text-[var(--text-muted)]">+{guest.companionCount}</span>
      )}
    </div>
    {tooltip && bestSwapTableId && createPortal(
      <div
        className="fixed -translate-y-1/2 bg-[#B08D57] text-white px-2.5 py-1 rounded-md text-xs whitespace-nowrap pointer-events-none z-[9999] font-[family-name:var(--font-body)] shadow-[0_4px_12px_rgba(28,25,23,0.08)] overflow-hidden"
        style={{
          left: tooltip.x,
          top: tooltip.y,
        }}
      >
        {longPressProgress && (
          <div className="absolute inset-0 bg-white/30 origin-left animate-[longpress-fill_1.5s_linear_forwards]" />
        )}
        <span className="relative">長按入座</span>
        <style>{`@keyframes longpress-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
      </div>,
      document.body,
    )}
    </>
  );
}
