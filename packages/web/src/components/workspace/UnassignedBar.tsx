import { useDroppable } from '@dnd-kit/core'
import { useSeatingStore } from '@/stores/seating'
import { GuestChip } from './GuestChip'

export function UnassignedBar() {
  const getUnassignedGuests = useSeatingStore((s) => s.getUnassignedGuests)
  const unassigned = getUnassignedGuests()

  const { isOver, setNodeRef } = useDroppable({
    id: 'unassigned',
    data: { type: 'unassigned' },
  })

  const totalSeats = unassigned.reduce((s, g) => s + g.attendeeCount, 0)

  return (
    <div
      ref={setNodeRef}
      className={`border-t border-gray-200 bg-white px-4 py-3 transition-colors ${
        isOver ? 'bg-orange-50' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500">
          未安排（{unassigned.length} 人 / {totalSeats} 席）
        </span>
        {isOver && <span className="text-xs text-orange-600">放開以取消安排</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto min-h-[28px]">
        {unassigned.map((g) => (
          <GuestChip key={g.id} guest={g} />
        ))}
        {unassigned.length === 0 && (
          <span className="text-xs text-gray-400">所有賓客都已安排</span>
        )}
      </div>
    </div>
  )
}
