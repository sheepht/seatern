import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import { useSeatingStore, type Guest } from '@/stores/seating';

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
    : 0;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `seat-${guest.id}-${seatIndex}`,
    data: { type: 'guest', guest, companionOffset },
  });
  const setHoveredGuest = useSeatingStore((s) => s.setHoveredGuest);
  const hoverSuppressedUntil = useSeatingStore((s) => s.hoverSuppressedUntil);
  const touchDragActive = useSeatingStore((s) => s.touchDragActive);
  const moveGuest = useSeatingStore((s) => s.moveGuest);
  const setEditingGuest = useSeatingStore((s) => s.setEditingGuest);
  const guestsWithRecommendations = useSeatingStore((s) => s.guestsWithRecommendations);
  const bestSwapTableId = useSeatingStore((s) => s.bestSwapTableId);
  const moveGuestToSeat = useSeatingStore((s) => s.moveGuestToSeat);
  const hasSwapRec = guestsWithRecommendations.has(guest.id);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(false);
  const elRef = useRef<HTMLDivElement | null>(null);

  // 手機版手刻觸控拖曳（dnd-kit 在 iOS/Android 上對這個 overlay 不穩，所以自己來）
  const touchDragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
  const [touchGhost, setTouchGhost] = useState<{ x: number; y: number } | null>(null);

  // 即時計算 tooltip 位置（跟著元素移動）
  const getTooltipPos = useCallback(() => {
    if (!elRef.current) return null;
    const rect = elRef.current.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width / 2 };
  }, []);

  // showTooltip 為 true 時持續更新位置（RAF loop）
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; r: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!showTooltip) {
      // 延遲清除避免 cascading render
      const id = requestAnimationFrame(() => setTooltipPos(null));
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return () => cancelAnimationFrame(id);
    }
    const tick = () => {
      const pos = getTooltipPos();
      if (pos) setTooltipPos(pos);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [showTooltip, getTooltipPos]);

  const size = radius * 2;

  return (
    <>
    <div
      ref={(el) => { setNodeRef(el); elRef.current = el; }}
      {...Object.fromEntries(Object.entries(listeners || {}).filter(([k]) => k !== 'onPointerDown' && k !== 'onTouchStart' && k !== 'onTouchMove'))}
      {...attributes}
      data-seated-guest-id={guest.id}
      data-seated-table-id={guest.assignedTableId || ''}
      data-seated-seat-index={seatIndex}
      data-seated-is-companion={isCompanion ? '1' : '0'}
      className="absolute rounded-full cursor-grab z-10 box-border border-[1.5px] border-dashed border-transparent transition-[border-color] duration-150 ease-out"
      style={{
        left: x - radius - 6,
        top: y - radius - 6,
        width: size + 12,
        height: size + 12,
        opacity: isDragging || touchGhost ? 0.3 : undefined,
        // 手機觸控拖曳中：所有 overlay 都變透明以便 hit-test 下方的 SeatDropZone
        pointerEvents: touchDragActive && !touchGhost ? 'none' : undefined,
      }}
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return;
        e.stopPropagation();
        const t0 = e.touches[0];
        touchDragRef.current = { startX: t0.clientX, startY: t0.clientY, dragging: false };

        // 從螢幕座標找出手指下方的空座位（走 data 屬性）
        const findSeatAt = (clientX: number, clientY: number): { tableId: string; seatIndex: number } | null => {
          const el = document.elementFromPoint(clientX, clientY);
          if (!el) return null;
          const seatEl = (el as Element).closest('[data-drop-table-id]') as HTMLElement | null;
          if (!seatEl) return null;
          if (seatEl.dataset.dropEmpty !== '1') return null; // 只接受空位
          const tid = seatEl.dataset.dropTableId;
          const sidx = seatEl.dataset.dropSeatIndex;
          if (!tid || sidx == null) return null;
          return { tableId: tid, seatIndex: parseInt(sidx, 10) };
        };

        const handleMove = (ev: TouchEvent) => {
          const state = touchDragRef.current;
          if (!state || ev.touches.length !== 1) return;
          const t = ev.touches[0];
          const dx = t.clientX - state.startX;
          const dy = t.clientY - state.startY;
          if (!state.dragging && Math.sqrt(dx * dx + dy * dy) > 8) {
            state.dragging = true;
            // 啟動拖曳 → 取消長按換位
            if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
            setLongPressProgress(false);
            useSeatingStore.setState({ longPressActive: false, touchDragActive: true });
            setShowTooltip(false);
            setHoveredGuest(null);
          }
          if (state.dragging) {
            ev.preventDefault();
            setTouchGhost({ x: t.clientX, y: t.clientY });
            // Hit-test SeatDropZone via DOM
            const hover = findSeatAt(t.clientX, t.clientY);
            const cur = useSeatingStore.getState().touchHoverSeat;
            const changed = (hover?.tableId !== cur?.tableId) || (hover?.seatIndex !== cur?.seatIndex);
            if (changed) useSeatingStore.setState({ touchHoverSeat: hover });
          }
        };

        const handleEnd = (ev: TouchEvent) => {
          document.removeEventListener('touchmove', handleMove);
          document.removeEventListener('touchend', handleEnd);
          document.removeEventListener('touchcancel', handleEnd);
          const state = touchDragRef.current;
          touchDragRef.current = null;
          setTouchGhost(null);
          const hoverSeat = useSeatingStore.getState().touchHoverSeat;
          useSeatingStore.setState({ touchDragActive: false, touchHoverSeat: null });
          if (!state?.dragging) return;

          const end = ev.changedTouches[0];
          if (!end) return;

          // 優先：精確座位命中（拖到空位 → 放到那個位置）
          if (hoverSeat) {
            useSeatingStore.getState().moveGuestToSeat(guest.id, hoverSeat.tableId, hoverSeat.seatIndex);
            return;
          }

          // 後備：桌子幾何命中（拖到桌子範圍但沒落到空位 → 自動挑空位）
          const svg = document.getElementById('floorplan-svg') as SVGSVGElement | null;
          if (!svg) return;
          const ctm = svg.getScreenCTM();
          if (!ctm) return;
          const inv = ctm.inverse();
          const svgX = inv.a * end.clientX + inv.c * end.clientY + inv.e;
          const svgY = inv.b * end.clientX + inv.d * end.clientY + inv.f;

          const { tables } = useSeatingStore.getState();
          const hit = tables.find((tbl) => {
            const r = Math.max(58 + Math.min(tbl.capacity, 12) * 7, 88);
            const dxT = svgX - tbl.positionX;
            const dyT = svgY - tbl.positionY;
            return Math.sqrt(dxT * dxT + dyT * dyT) < r;
          });
          if (hit && hit.id !== guest.assignedTableId) {
            useSeatingStore.getState().moveGuest(guest.id, hit.id);
          }
        };

        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd);
        document.addEventListener('touchcancel', handleEnd);
      }}
      onPointerDown={(e) => {
        // 長按 2 秒換位（與 dnd-kit 共存：不動 = 長按，移動 = 拖曳）
        if (hasSwapRec && bestSwapTableId) {
          setLongPressProgress(true);
          useSeatingStore.setState({ longPressActive: true });
          longPressRef.current = setTimeout(() => {
            setLongPressProgress(false);
            useSeatingStore.setState({ longPressActive: false });
            setShowTooltip(false);
            setHoveredGuest(null);
            // 找目標桌的第一個空位
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
        // 讓 dnd-kit 的 listener 也處理
        listeners?.onPointerDown?.(e as unknown as Event);
      }}
      onPointerUp={() => {
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
        setLongPressProgress(false);
        useSeatingStore.setState({ longPressActive: false });
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isDragging) return;
        if (clickTimerRef.current) {
          // 第二次點擊 → 雙擊：移除賓客
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
          setHoveredGuest(null);
          setShowTooltip(false);
          moveGuest(guest.id, null);
        } else {
          // 第一次點擊 → 延遲判斷，等看有沒有雙擊
          clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null;
            setEditingGuest(guest.id);
          }, 250);
        }
      }}
      onMouseEnter={(e) => {
        if (isDragging) return;
        const el = e.currentTarget;
        const remaining = hoverSuppressedUntil - Date.now();
        if (remaining > 0) {
          delayRef.current = setTimeout(() => {
            el.style.borderColor = '#B08D57';
            setHoveredGuest(guest.id);
          }, remaining);
        } else {
          el.style.borderColor = '#B08D57';
          setHoveredGuest(guest.id);
        }
        // 立刻顯示 tooltip
        setShowTooltip(true);
      }}
      onMouseLeave={(e) => {
        if (delayRef.current) { clearTimeout(delayRef.current); delayRef.current = null; }
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
        setLongPressProgress(false);
        useSeatingStore.setState({ longPressActive: false });
        e.currentTarget.style.borderColor = 'transparent';
        setHoveredGuest(null);
        setShowTooltip(false);
      }}
    />
    {touchGhost && createPortal(
      <div
        className="fixed pointer-events-none z-[9999] rounded-full bg-[#B08D57] border-2 border-white shadow-[0_4px_12px_rgba(0,0,0,0.3)] flex items-center justify-center text-white text-xs font-[family-name:var(--font-body)]"
        style={{
          // 偏到手指右上角（+28 往右、-28-2r 往上），讓手指不擋住 ghost
          left: touchGhost.x + 28 - radius,
          top: touchGhost.y - 28 - radius * 2,
          width: radius * 2,
          height: radius * 2,
        }}
      >
        {(guest.aliases.length > 0 ? guest.aliases[0] : guest.name).slice(0, 3)}
      </div>,
      document.body,
    )}
    {showTooltip && tooltipPos && createPortal(
      <>
        {/* 上方：賓客基本資訊 */}
        <div
          className="fixed -translate-x-1/2 -translate-y-full bg-[var(--bg-surface,#fff)] border border-[var(--border,#E7E5E4)] px-2.5 py-[5px] rounded-md pointer-events-none z-[9999] font-[family-name:var(--font-body)] shadow-[0_4px_12px_rgba(28,25,23,0.08)] text-center max-w-[200px]"
          style={{
            left: tooltipPos.x,
            top: Math.max(8, tooltipPos.y - tooltipPos.r - 8),
          }}
        >
          <div className="text-[13px] font-medium text-[#1C1917] whitespace-nowrap overflow-hidden text-ellipsis">
            {guest.name}{guest.subcategory ? ` (${guest.subcategory.name})` : ''}
          </div>
          {(guest.dietaryNote || guest.specialNote) && (
            <div className="text-[11px] text-[#A8A29E] mt-px whitespace-nowrap overflow-hidden text-ellipsis">
              {[guest.dietaryNote, guest.specialNote].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        {/* 右側：雙擊移除 */}
        <div
          className="fixed -translate-y-1/2 bg-[var(--bg-surface,#fff)] text-[var(--text-secondary,#78716C)] border border-[var(--border,#E7E5E4)] py-1 px-2.5 rounded-md text-xs whitespace-nowrap pointer-events-none z-[9999] font-[family-name:var(--font-body)] shadow-[0_4px_12px_rgba(28,25,23,0.08)]"
          style={{
            left: tooltipPos.x + tooltipPos.r + 6,
            top: tooltipPos.y,
          }}
        >
          雙擊移除
        </div>
        {/* 左側：長按換位（僅有換位推薦時顯示） */}
        {hasSwapRec && (
          <div
            className="fixed -translate-x-full -translate-y-1/2 bg-[#B08D57] text-white py-1 px-2.5 rounded-md text-xs whitespace-nowrap pointer-events-none z-[9999] font-[family-name:var(--font-body)] shadow-[0_4px_12px_rgba(28,25,23,0.08)] overflow-hidden"
            style={{
              left: tooltipPos.x - tooltipPos.r - 6,
              top: tooltipPos.y,
            }}
          >
            {/* 長按進度條 */}
            {longPressProgress && (
              <div className="absolute inset-0 bg-white/30 origin-left animate-[longpress-fill_1.5s_linear_forwards]" />
            )}
            <span className="relative">長按換位</span>
            <style>{`@keyframes longpress-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
          </div>
        )}
      </>,
      document.body,
    )}
    </>
  );
}
