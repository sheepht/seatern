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

  const totalSeats = unassigned.reduce((s, g) => s + g.seatCount, 0)

  return (
    <div
      ref={setNodeRef}
      className="px-4 py-3 transition-colors"
      style={{
        borderTop: '1px solid var(--border)',
        background: isOver ? 'var(--accent-light)' : 'var(--bg-surface)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          未安排（<span className="font-data">{unassigned.length}</span> 人 / <span className="font-data">{totalSeats}</span> 席）
        </span>
        {isOver && <span className="text-xs" style={{ color: 'var(--accent-dark)' }}>放開以取消安排</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto min-h-[28px]">
        {unassigned.map((g) => (
          <GuestChip key={g.id} guest={g} />
        ))}
        {unassigned.length === 0 && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>所有賓客都已安排</span>
        )}
      </div>
    </div>
  )
}
