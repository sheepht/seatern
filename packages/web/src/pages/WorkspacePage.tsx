import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { useSeatingStore, type Guest, type AvoidPair } from '@/stores/seating'
import { Toolbar } from '@/components/workspace/Toolbar'
import { FloorPlan, type FloorPlanHandle } from '@/components/workspace/FloorPlan'
import { SidePanel } from '@/components/workspace/SidePanel'
import { DragOverlayContent } from '@/components/workspace/DragOverlayContent'
import { ViolationModal } from '@/components/workspace/ViolationModal'

function ExpandButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const [show, setShow] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const rect = btnRef.current?.getBoundingClientRect()
  return (
    <div
      ref={btnRef}
      className="shrink-0 flex items-center justify-center cursor-pointer bg-[var(--bg-primary)] hover:bg-[var(--accent-light)] overflow-hidden"
      style={{
        width: collapsed ? 28 : 0,
        borderRight: collapsed ? '1px solid var(--border)' : 'none',
        transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        zIndex: 20,
      }}
      onClick={onClick}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
      {show && collapsed && rect && createPortal(
        <div style={{
          position: 'fixed',
          left: rect.right + 8,
          top: rect.top + rect.height / 2,
          transform: 'translateY(-50%)',
          background: 'var(--bg-surface, #fff)',
          color: 'var(--text-secondary, #78716C)',
          border: '1px solid var(--border, #E7E5E4)',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 9999,
          fontFamily: 'var(--font-body)',
          boxShadow: '0 4px 12px rgba(28,25,23,0.08)',
        }}>
          展開待排區 <kbd style={{ background: '#F5F5F4', border: '1px solid var(--border, #E7E5E4)', borderRadius: 3, padding: '1px 4px', fontSize: 10, marginLeft: 4, color: 'var(--text-primary, #1C1917)' }}>Q</kbd>
        </div>,
        document.body,
      )}
    </div>
  )
}

export default function WorkspacePage() {
  const { eventId } = useParams<{ eventId: string }>()
  const loadEvent = useSeatingStore((s) => s.loadEvent)
  const loading = useSeatingStore((s) => s.loading)
  const guests = useSeatingStore((s) => s.guests)
  const moveGuest = useSeatingStore((s) => s.moveGuest)
  const moveGuestToSeat = useSeatingStore((s) => s.moveGuestToSeat)
  const setActiveDragGuest = useSeatingStore((s) => s.setActiveDragGuest)
  const setDragPreview = useSeatingStore((s) => s.setDragPreview)
  const checkAvoidViolation = useSeatingStore((s) => s.checkAvoidViolation)
  const autoAssignProgress = useSeatingStore((s) => s.autoAssignProgress)

  const [activeGuest, setActiveGuest] = useState<Guest | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const floorPlanRef = useRef<FloorPlanHandle>(null)

  // 快捷鍵 [ 或 ] toggle 待排區
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        setSidebarCollapsed((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 違規確認 modal 狀態
  const [pendingMove, setPendingMove] = useState<{
    guestId: string
    guestName: string
    tableId: string
    seatIndex: number
    cursorBias?: 'left' | 'right'
    violation: AvoidPair
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  useEffect(() => {
    if (eventId) loadEvent(eventId)
  }, [eventId, loadEvent])

  /** 從 drag event 取得賓客 ID */
  const getGuestId = (event: DragStartEvent | DragOverEvent | DragEndEvent): string => {
    const data = event.active.data.current
    if (data?.type === 'guest' && data.guest) return data.guest.id
    return event.active.id as string
  }

  /** 取得眷屬偏移量（拖眷屬時回推主人的目標座位） */
  const getCompanionOffset = (event: DragOverEvent | DragEndEvent): number => {
    return event.active.data.current?.companionOffset ?? 0
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    if (active.data.current?.type === 'guest') {
      setActiveGuest(active.data.current.guest)
      setActiveDragGuest(active.data.current.guest.id)
    }
  }

  /** 計算游標相對於座位的左右偏向（用於平手 tiebreaker） */
  const getCursorBias = (event: DragOverEvent | DragEndEvent): 'left' | 'right' | undefined => {
    const over = event.over
    if (!over) return undefined
    // 使用 dnd-kit 的 collision rect 計算偏向
    const overRect = over.rect
    if (!overRect || !event.activatorEvent) return undefined
    // delta 相對於 drop target 中心
    const overCenterX = overRect.left + overRect.width / 2
    // 使用 active 的當前位置（拖曳中的座標）
    const activeRect = event.active.rect.current?.translated
    if (!activeRect) return undefined
    const activeCenterX = activeRect.left + activeRect.width / 2
    return activeCenterX < overCenterX ? 'left' : 'right'
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over || !event.active.data.current) {
      setDragPreview(null)
      return
    }

    const guestId = getGuestId(event)
    const overData = over.data.current

    // 拖到側欄區域內 → 清除桌子預覽
    if (overData?.type === 'seat' && !sidebarCollapsed) {
      const activeRect = event.active.rect.current?.translated
      if (activeRect && activeRect.left < 320) {
        setDragPreview(null)
        return
      }
    }

    if (overData?.type === 'seat') {
      const tableId = overData.tableId as string
      const dropSeatIndex = overData.seatIndex as number
      const offset = getCompanionOffset(event)
      const table = useSeatingStore.getState().tables.find((t) => t.id === tableId)
      const capacity = table?.capacity ?? 10
      // 回推主人的目標座位：眷屬座位 - 偏移量
      const mainSeatIndex = (dropSeatIndex - offset + capacity) % capacity
      const cursorBias = getCursorBias(event)
      setDragPreview(tableId, mainSeatIndex, guestId, cursorBias)
    } else {
      setDragPreview(null)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveGuest(null)
    setActiveDragGuest(null)

    const { over } = event
    if (!over || !event.active.data.current) return

    const guestId = getGuestId(event)
    const overData = over.data.current

    // 如果放開位置在側欄區域內，強制視為回到待排區
    if (overData?.type === 'seat' && !sidebarCollapsed) {
      const activeRect = event.active.rect.current?.translated
      if (activeRect && activeRect.left < 320) {
        moveGuest(guestId, null)
        return
      }
    }

    if (overData?.type === 'seat') {
      const tableId = overData.tableId as string
      const dropSeatIndex = overData.seatIndex as number
      const offset = getCompanionOffset(event)
      const table = useSeatingStore.getState().tables.find((t) => t.id === tableId)
      const capacity = table?.capacity ?? 10
      const seatIndex = (dropSeatIndex - offset + capacity) % capacity
      const cursorBias = getCursorBias(event)

      // 檢查避免同桌違規（同桌內換位不需要再提醒）
      const draggedGuest = guests.find((g) => g.id === guestId)
      const alreadyAtSameTable = draggedGuest?.assignedTableId === tableId
      const violation = alreadyAtSameTable ? null : checkAvoidViolation(guestId, tableId)
      if (violation) {
        const guest = guests.find((g) => g.id === guestId)
        setPendingMove({
          guestId,
          guestName: guest?.name || '',
          tableId,
          seatIndex,
          cursorBias,
          violation: { ...violation },
        })
        return
      }

      moveGuestToSeat(guestId, tableId, seatIndex, cursorBias)
    } else if (overData?.type === 'unassigned' || over.id === 'unassigned') {
      moveGuest(guestId, null)
    }
  }

  const handleViolationConfirm = () => {
    if (pendingMove) {
      moveGuestToSeat(pendingMove.guestId, pendingMove.tableId, pendingMove.seatIndex, pendingMove.cursorBias)
    }
    setPendingMove(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">載入中...</p>
      </div>
    )
  }

  // 取得違規的衝突對象名稱
  const getConflictName = () => {
    if (!pendingMove) return ''
    const conflictId = pendingMove.violation.guestAId === pendingMove.guestId
      ? pendingMove.violation.guestBId
      : pendingMove.violation.guestAId
    return guests.find((g) => g.id === conflictId)?.name || ''
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="h-screen flex flex-col bg-gray-50">
        <Toolbar
          onFitAll={() => floorPlanRef.current?.fitAll(true)}
          onPanToTable={(x, y) => floorPlanRef.current?.panToPoint(x, y)}
        />

        <div className="flex-1 flex overflow-hidden">
          {/* 折疊時的展開條（永遠渲染，寬度跟側邊欄同步動畫） */}
          <ExpandButton collapsed={sidebarCollapsed} onClick={() => setSidebarCollapsed(false)} />
          {/* 側邊欄 — z-index 高於 SVG 溢出的推薦線 */}
          <div
            className="shrink-0 overflow-hidden relative z-10"
            style={{
              width: sidebarCollapsed ? 0 : 320,
              borderRight: sidebarCollapsed ? 'none' : '1px solid var(--border)',
              background: 'var(--bg-primary)',
              transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div style={{
              width: 320,
              height: '100%',
              transform: sidebarCollapsed ? 'translateX(-320px)' : 'none',
              transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms',
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
    </DndContext>
  )
}
