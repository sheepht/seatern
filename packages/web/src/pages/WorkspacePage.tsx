import { useEffect, useState, useRef, useMemo } from 'react';
import { api } from '@/lib/api';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { MobileWorkspace } from '@/components/mobile/MobileWorkspace';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useSeatingStore, type Guest, type AvoidPair } from '@/stores/seating';
import { FloorPlan, type FloorPlanHandle } from '@/components/workspace/FloorPlan';
import { SidePanel } from '@/components/workspace/SidePanel';
import { DragOverlayContent } from '@/components/workspace/DragOverlayContent';
import { ViolationModal } from '@/components/workspace/ViolationModal';
import GuestFormModal from '@/components/GuestFormModal';
import { loadCategoryColors } from '@/lib/category-colors';

function ExpandButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={btnRef}
      className="shrink-0 flex items-center justify-center cursor-pointer bg-[var(--bg-primary)] hover:bg-[var(--accent-light)] overflow-hidden relative z-20 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{
        width: collapsed ? 28 : 0,
        borderRight: collapsed ? '1px solid var(--border)' : 'none',
      }}
      onClick={onClick}
      onMouseEnter={() => { setRect(btnRef.current?.getBoundingClientRect() ?? null); }}
      onMouseLeave={() => { setRect(null); }}
    >
      <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
      {collapsed && rect && createPortal(
        <div
          className="fixed bg-[var(--bg-surface,#fff)] text-[var(--text-secondary,#78716C)] border border-[var(--border,#E7E5E4)] px-2.5 py-1 rounded-md text-xs whitespace-nowrap pointer-events-none z-[9999] font-[family-name:var(--font-body)] shadow-[0_4px_12px_rgba(28,25,23,0.08)]"
          style={{
            left: rect.right + 8,
            top: rect.top + rect.height / 2,
            transform: 'translateY(-50%)',
          }}>
          展開待排區 <kbd className="bg-[#F5F5F4] border border-[var(--border,#E7E5E4)] rounded-[3px] px-1 py-px text-[10px] ml-1 text-[var(--text-primary,#1C1917)]">Q</kbd>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function WorkspacePage() {
  const isMobile = useIsMobile();
  const guests = useSeatingStore((s) => s.guests);
  const tables = useSeatingStore((s) => s.tables);
  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const subcategories = useSeatingStore((s) => s.subcategories);
  const eventId = useSeatingStore((s) => s.eventId);
  const moveGuest = useSeatingStore((s) => s.moveGuest);
  const moveGuestToSeat = useSeatingStore((s) => s.moveGuestToSeat);
  const setActiveDragGuest = useSeatingStore((s) => s.setActiveDragGuest);
  const setDragPreview = useSeatingStore((s) => s.setDragPreview);
  const checkAvoidViolation = useSeatingStore((s) => s.checkAvoidViolation);
  const autoAssignProgress = useSeatingStore((s) => s.autoAssignProgress);
  const editingGuestId = useSeatingStore((s) => s.editingGuestId);
  const setEditingGuest = useSeatingStore((s) => s.setEditingGuest);
  const updateGuest = useSeatingStore((s) => s.updateGuest);
  const deleteGuest = useSeatingStore((s) => s.deleteGuest);
  const updateGuestPreferences = useSeatingStore((s) => s.updateGuestPreferences);
  const setGuestSubcategory = useSeatingStore((s) => s.setGuestSubcategory);
  const addAvoidPair = useSeatingStore((s) => s.addAvoidPair);
  const removeAvoidPair = useSeatingStore((s) => s.removeAvoidPair);

  const [activeGuest, setActiveGuest] = useState<Guest | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const floorPlanRef = useRef<FloorPlanHandle>(null);

  // GuestFormModal 需要的衍生資料
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);
  const eventCategories = useSeatingStore((s) => s.eventCategories);
  const categories = eventCategories.length > 0 ? eventCategories : ['男方', '女方', '共同'];
  const editGuest = editingGuestId ? guests.find((g) => g.id === editingGuestId) : null;

  // 快捷鍵 [ 或 ] toggle 待排區
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 違規確認 modal 狀態
  const [pendingMove, setPendingMove] = useState<{
    guestId: string
    guestName: string
    tableId: string
    seatIndex: number
    cursorBias?: 'left' | 'right'
    violation: AvoidPair
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  /** 從 drag event 取得賓客 ID */
  const getGuestId = (event: DragStartEvent | DragOverEvent | DragEndEvent): string => {
    const data = event.active.data.current;
    if (data?.type === 'guest' && data.guest) return data.guest.id;
    return event.active.id as string;
  };

  /** 取得眷屬偏移量（拖眷屬時回推主人的目標座位） */
  const getCompanionOffset = (event: DragOverEvent | DragEndEvent): number => {
    return event.active.data.current?.companionOffset ?? 0;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'guest') {
      setActiveGuest(active.data.current.guest);
      setActiveDragGuest(active.data.current.guest.id);
    }
  };

  /** 計算游標相對於座位的左右偏向（用於平手 tiebreaker） */
  const getCursorBias = (event: DragOverEvent | DragEndEvent): 'left' | 'right' | undefined => {
    const over = event.over;
    if (!over) return undefined;
    // 使用 dnd-kit 的 collision rect 計算偏向
    const overRect = over.rect;
    if (!overRect || !event.activatorEvent) return undefined;
    // delta 相對於 drop target 中心
    const overCenterX = overRect.left + overRect.width / 2;
    // 使用 active 的當前位置（拖曳中的座標）
    const activeRect = event.active.rect.current?.translated;
    if (!activeRect) return undefined;
    const activeCenterX = activeRect.left + activeRect.width / 2;
    return activeCenterX < overCenterX ? 'left' : 'right';
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over || !event.active.data.current) {
      setDragPreview(null);
      return;
    }

    const guestId = getGuestId(event);
    const overData = over.data.current;

    // 拖到側欄區域內 → 清除桌子預覽
    if (overData?.type === 'seat' && !sidebarCollapsed) {
      const activeRect = event.active.rect.current?.translated;
      if (activeRect && activeRect.left < 320) {
        setDragPreview(null);
        return;
      }
    }

    if (overData?.type === 'seat') {
      const tableId = overData.tableId as string;
      const dropSeatIndex = overData.seatIndex as number;
      const offset = getCompanionOffset(event);
      const table = useSeatingStore.getState().tables.find((t) => t.id === tableId);
      const capacity = table?.capacity ?? 10;
      // 回推主人的目標座位：眷屬座位 - 偏移量
      const mainSeatIndex = (dropSeatIndex - offset + capacity) % capacity;
      const cursorBias = getCursorBias(event);
      setDragPreview(tableId, mainSeatIndex, guestId, cursorBias);
    } else {
      setDragPreview(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveGuest(null);
    setActiveDragGuest(null);

    const { over } = event;
    if (!over || !event.active.data.current) return;

    const guestId = getGuestId(event);
    const overData = over.data.current;

    // 如果放開位置在側欄區域內，強制視為回到待排區
    if (overData?.type === 'seat' && !sidebarCollapsed) {
      const activeRect = event.active.rect.current?.translated;
      if (activeRect && activeRect.left < 320) {
        moveGuest(guestId, null);
        return;
      }
    }

    if (overData?.type === 'seat') {
      const tableId = overData.tableId as string;
      const dropSeatIndex = overData.seatIndex as number;
      const offset = getCompanionOffset(event);
      const table = useSeatingStore.getState().tables.find((t) => t.id === tableId);
      const capacity = table?.capacity ?? 10;
      const seatIndex = (dropSeatIndex - offset + capacity) % capacity;
      const cursorBias = getCursorBias(event);

      // 檢查避免同桌違規（同桌內換位不需要再提醒）
      const draggedGuest = guests.find((g) => g.id === guestId);
      const alreadyAtSameTable = draggedGuest?.assignedTableId === tableId;
      const violation = alreadyAtSameTable ? null : checkAvoidViolation(guestId, tableId);
      if (violation) {
        const guest = guests.find((g) => g.id === guestId);
        setPendingMove({
          guestId,
          guestName: guest?.name || '',
          tableId,
          seatIndex,
          cursorBias,
          violation: { ...violation },
        });
        return;
      }

      moveGuestToSeat(guestId, tableId, seatIndex, cursorBias);
    } else if (overData?.type === 'unassigned' || over.id === 'unassigned') {
      moveGuest(guestId, null);
    }
  };

  const handleViolationConfirm = () => {
    if (pendingMove) {
      moveGuestToSeat(pendingMove.guestId, pendingMove.tableId, pendingMove.seatIndex, pendingMove.cursorBias);
    }
    setPendingMove(null);
  };

  // 取得違規的衝突對象名稱
  const getConflictName = () => {
    if (!pendingMove) return '';
    const conflictId = pendingMove.violation.guestAId === pendingMove.guestId
      ? pendingMove.violation.guestBId
      : pendingMove.violation.guestAId;
    return guests.find((g) => g.id === conflictId)?.name || '';
  };

  if (isMobile) {
    return <MobileWorkspace />;
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex overflow-hidden">
          {/* 折疊時的展開條（永遠渲染，寬度跟側邊欄同步動畫） */}
          <ExpandButton collapsed={sidebarCollapsed} onClick={() => setSidebarCollapsed(false)} />
          {/* 側邊欄 — z-index 高於 SVG 溢出的推薦線 */}
          <div
            className="shrink-0 overflow-hidden relative z-10 bg-[var(--bg-primary)] transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              width: sidebarCollapsed ? 0 : 320,
              borderRight: sidebarCollapsed ? 'none' : '1px solid var(--border)',
            }}
          >
            <div
              className="w-[320px] h-full transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{
                transform: sidebarCollapsed ? 'translateX(-320px)' : 'none',
                opacity: autoAssignProgress ? 0.4 : 1,
                pointerEvents: autoAssignProgress ? 'none' : undefined,
              }}>
              <SidePanel onCollapse={() => setSidebarCollapsed(true)} onPanToTable={(x, y) => floorPlanRef.current?.panToPoint(x, y)} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <FloorPlan ref={floorPlanRef} />
          </div>
        </div>

      <DragOverlay dropAnimation={null}>
        {activeGuest && <DragOverlayContent guest={activeGuest} />}
      </DragOverlay>

      {/* 避免同桌違規確認 modal */}
      {pendingMove && (
        <ViolationModal
          guestName={pendingMove.guestName}
          conflictName={getConflictName()}
          reason={pendingMove.violation.reason}
          onConfirm={handleViolationConfirm}
          onCancel={() => setPendingMove(null)}
        />
      )}

      {/* 賓客編輯 modal（點擊桌上賓客或待排區賓客觸發） */}
      {editGuest && (
        <GuestFormModal
          mode="edit"
          guest={editGuest}
          tables={tables}
          guests={guests}
          avoidPairs={avoidPairs}
          categories={categories}
          subcategories={subcategories}
          categoryColors={categoryColors}
          onSubmit={async (data) => {
            await updateGuest(editGuest.id, {
              name: data.name,
              aliases: data.aliases,
              category: data.category,
              rsvpStatus: data.rsvpStatus,
              companionCount: data.companionCount,
              dietaryNote: data.dietaryNote,
              specialNote: data.specialNote,
            });
            if (data.assignedTableId !== (editGuest.assignedTableId || null)) {
              moveGuest(editGuest.id, data.assignedTableId);
            }
            const prefs = data.preferredGuestIds.map((gid, i) => ({ preferredGuestId: gid, rank: i + 1 }));
            await updateGuestPreferences(editGuest.id, prefs);
            const oldAvoidIds = avoidPairs
              .filter((ap) => ap.guestAId === editGuest.id || ap.guestBId === editGuest.id)
              .map((ap) => ({ pairId: ap.id, otherId: ap.guestAId === editGuest.id ? ap.guestBId : ap.guestAId }));
            for (const old of oldAvoidIds) {
              if (!data.avoidGuestIds.includes(old.otherId)) await removeAvoidPair(old.pairId);
            }
            for (const gid of data.avoidGuestIds) {
              if (!oldAvoidIds.some((o) => o.otherId === gid)) await addAvoidPair(editGuest.id, gid);
            }
            if (data.subcategoryName) {
              try {
                await api.post(`/events/${eventId}/subcategories/batch`, {
                  assignments: [{ guestId: editGuest.id, subcategoryName: data.subcategoryName, category: data.category }],
                });
              } catch { /* no-op */ }
            } else if (editGuest.subcategory) {
              await setGuestSubcategory(editGuest.id, null);
            }
            const { loadEvent } = useSeatingStore.getState();
            if (eventId) await loadEvent();
            setEditingGuest(null);
          }}
          onDelete={(gid) => { setEditingGuest(null); deleteGuest(gid); }}
          onClose={() => setEditingGuest(null)}
        />
      )}
    </DndContext>
  );
}
