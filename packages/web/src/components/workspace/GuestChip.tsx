import { useDraggable } from '@dnd-kit/core'
import { useSeatingStore, type Guest } from '@/stores/seating'

const CATEGORY_STYLES: Record<string, { background: string; borderColor: string; color: string }> = {
  '男方': { background: '#DBEAFE', borderColor: '#BFDBFE', color: '#1E40AF' },
  '女方': { background: '#FEE2E2', borderColor: '#FECACA', color: '#991B1B' },
  '共同': { background: '#F3F4F6', borderColor: '#D1D5DB', color: '#374151' },
}
const DEFAULT_CATEGORY_STYLE = { background: '#F3F4F6', borderColor: '#D1D5DB', color: '#374151' }

interface Props {
  guest: Guest
  animIndex?: number
}

export function GuestChip({ guest, animIndex }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: guest.id,
    data: { type: 'guest', guest },
  })
  const lastResetAt = useSeatingStore((s) => s.lastResetAt)
  const setHoveredGuest = useSeatingStore((s) => s.setHoveredGuest)

  const categoryStyle = CATEGORY_STYLES[guest.category] || DEFAULT_CATEGORY_STYLE

  // 重排後 800ms 內顯示交錯入場動畫
  const isRecentReset = Date.now() - lastResetAt < 800
  const animClass = isRecentReset && animIndex !== undefined ? 'chip-enter' : ''
  const animDelay = isRecentReset && animIndex !== undefined ? `${animIndex * 25}ms` : undefined

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-guest-id={guest.id}
      className={`guest-chip px-2 py-0.5 text-sm cursor-grab select-none whitespace-nowrap ${
        isDragging ? 'opacity-30' : ''
      } ${animClass}`}
      style={{
        fontFamily: 'var(--font-body)',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${categoryStyle.borderColor}`,
        backgroundColor: categoryStyle.background,
        color: categoryStyle.color,
        animationDelay: animDelay,
      }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setHoveredGuest(guest.id, rect.top + rect.height / 2)
      }}
      onMouseLeave={() => setHoveredGuest(null)}
      title={`${guest.name}${guest.attendeeCount > 1 ? ` (+${guest.attendeeCount - 1})` : ''}${guest.dietaryNote ? ` [${guest.dietaryNote}]` : ''}`}
    >
      {guest.name}
      {guest.attendeeCount > 1 && (
        <span style={{ color: 'var(--text-muted)' }} className="ml-0.5">+{guest.attendeeCount - 1}</span>
      )}
    </div>
  )
}
