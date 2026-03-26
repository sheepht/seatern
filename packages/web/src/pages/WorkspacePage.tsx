import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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
import { FloorPlan } from '@/components/workspace/FloorPlan'
import { SidePanel } from '@/components/workspace/SidePanel'
import { UnassignedBar } from '@/components/workspace/UnassignedBar'
import { DragOverlayContent } from '@/components/workspace/DragOverlayContent'
import { ViolationModal } from '@/components/workspace/ViolationModal'

export default function WorkspacePage() {
  const { eventId } = useParams<{ eventId: string }>()
  const loadEvent = useSeatingStore((s) => s.loadEvent)
  const loading = useSeatingStore((s) => s.loading)
  const guests = useSeatingStore((s) => s.guests)
  const moveGuest = useSeatingStore((s) => s.moveGuest)
  const moveGuestToSeat = useSeatingStore((s) => s.moveGuestToSeat)
  const setActiveDragGuest = useSeatingStore((s) => s.setActiveDragGuest)
  const setDragPreview = useSeatingStore((s) => s.setDragPreview)
  const undo = useSeatingStore((s) => s.undo)
  const checkAvoidViolation = useSeatingStore((s) => s.checkAvoidViolation)

  const [activeGuest, setActiveGuest] = useState<Guest | null>(null)

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo])

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    if (active.data.current?.type === 'guest') {
      setActiveGuest(active.data.current.guest)
      // 從 seat-{guestId} 或直接 guestId 取得 ID
      const rawId = active.id as string
      const guestId = rawId.startsWith('seat-') ? rawId.slice(5) : rawId
      setActiveDragGuest(guestId)
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
    const { active, over } = event
    if (!over || !active.data.current) {
      setDragPreview(null)
      return
    }

    const rawId = active.id as string
    const guestId = rawId.startsWith('seat-') ? rawId.slice(5) : rawId
    const overData = over.data.current

    if (overData?.type === 'seat') {
      const tableId = overData.tableId as string
      const seatIndex = overData.seatIndex as number
      const cursorBias = getCursorBias(event)
      setDragPreview(tableId, seatIndex, guestId, cursorBias)
    } else {
      setDragPreview(null)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveGuest(null)
    setActiveDragGuest(null)

    const { active, over } = event
    if (!over || !active.data.current) return

    const rawId = active.id as string
    const guestId = rawId.startsWith('seat-') ? rawId.slice(5) : rawId
    const overData = over.data.current

    if (overData?.type === 'seat') {
      const tableId = overData.tableId as string
      const seatIndex = overData.seatIndex as number
      const cursorBias = getCursorBias(event)

      // 檢查避免同桌違規
      const violation = checkAvoidViolation(guestId, tableId)
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
        <Toolbar />

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-0">
            <FloorPlan />
          </div>
          <div className="w-72 border-l border-gray-200 bg-gray-50 shrink-0">
            <SidePanel />
          </div>
        </div>

        <UnassignedBar />
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
