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
  const undo = useSeatingStore((s) => s.undo)
  const checkAvoidViolation = useSeatingStore((s) => s.checkAvoidViolation)

  const [activeGuest, setActiveGuest] = useState<Guest | null>(null)

  // 違規確認 modal 狀態
  const [pendingMove, setPendingMove] = useState<{
    guestId: string
    guestName: string
    tableId: string
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
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveGuest(null)
    const { active, over } = event

    if (!over || !active.data.current) return

    const guestId = active.id as string
    const overData = over.data.current

    if (overData?.type === 'table') {
      const tableId = overData.tableId as string

      // 檢查避免同桌違規
      const violation = checkAvoidViolation(guestId, tableId)
      if (violation) {
        const guest = guests.find((g) => g.id === guestId)
        const conflictId = violation.guestAId === guestId ? violation.guestBId : violation.guestAId
        const conflict = guests.find((g) => g.id === conflictId)

        setPendingMove({
          guestId,
          guestName: guest?.name || '',
          tableId,
          violation: { ...violation },
        })
        return // 不直接移動，等用戶確認
      }

      moveGuest(guestId, tableId)
    } else if (overData?.type === 'unassigned' || over.id === 'unassigned') {
      moveGuest(guestId, null)
    }
  }

  const handleViolationConfirm = () => {
    if (pendingMove) {
      moveGuest(pendingMove.guestId, pendingMove.tableId)
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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
