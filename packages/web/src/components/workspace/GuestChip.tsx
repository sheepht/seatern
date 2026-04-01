import { useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDraggable } from '@dnd-kit/core'
import { useSeatingStore, type Guest } from '@/stores/seating'
import { getCategoryColor, loadCategoryColors } from '@/lib/category-colors'

interface Props {
  guest: Guest
  animIndex?: number
}

export function GuestChip({ guest, animIndex }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: guest.id,
    data: { type: 'guest', guest },
  })
  const setHoveredGuest = useSeatingStore((s) => s.setHoveredGuest)
  const bestSwapTableId = useSeatingStore((s) => s.bestSwapTableId)
  const moveGuestToSeat = useSeatingStore((s) => s.moveGuestToSeat)
  const eventId = useSeatingStore((s) => s.eventId)

  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [longPressProgress, setLongPressProgress] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)

  const colors = useMemo(() => loadCategoryColors(eventId || ''), [eventId])
  const catColor = getCategoryColor(guest.category, colors)
  const categoryStyle = { background: catColor.background, borderColor: catColor.border, color: catColor.color }

  // 入場動畫已移除（人多時等太久）
  const animClass = ''
  const animDelay = undefined

  const cancelLongPress = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
    setLongPressProgress(false)
    useSeatingStore.setState({ longPressActive: false })
  }

  return (
    <>
    <div
      ref={setNodeRef}
      {...Object.fromEntries(Object.entries(listeners || {}).filter(([k]) => k !== 'onPointerDown'))}
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
      onPointerDown={(e) => {
        // 長按 1.5 秒自動分配到最佳推薦桌
        if (bestSwapTableId) {
          setLongPressProgress(true)
          useSeatingStore.setState({ longPressActive: true })
          longPressRef.current = setTimeout(() => {
            setLongPressProgress(false)
            useSeatingStore.setState({ longPressActive: false })
            setTooltip(null)
            setHoveredGuest(null)
            const targetTable = useSeatingStore.getState().tables.find((t) => t.id === bestSwapTableId)
            if (!targetTable) return
            const tableGuests = useSeatingStore.getState().guests.filter(
              (g) => g.assignedTableId === bestSwapTableId && g.rsvpStatus === 'confirmed',
            )
            const usedIndices = new Set<number>()
            for (const g of tableGuests) {
              if (g.seatIndex !== null) {
                usedIndices.add(g.seatIndex)
                for (let c = 1; c < g.attendeeCount; c++) usedIndices.add((g.seatIndex + c) % targetTable.capacity)
              }
            }
            let freeSeat = 0
            while (usedIndices.has(freeSeat)) freeSeat++
            moveGuestToSeat(guest.id, bestSwapTableId, freeSeat)
          }, 1500)
        }
        listeners?.onPointerDown?.(e as any)
      }}
      onPointerUp={() => cancelLongPress()}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setHoveredGuest(guest.id, rect.top + rect.height / 2)
        setTooltip({ x: rect.right + 6, y: rect.top + rect.height / 2 })
      }}
      onMouseLeave={() => {
        cancelLongPress()
        setHoveredGuest(null)
        setTooltip(null)
      }}
      title={`${guest.name}${guest.aliases.length > 0 ? ` (${guest.aliases[0]})` : ''}${guest.attendeeCount > 1 ? ` +${guest.attendeeCount - 1}` : ''}${guest.dietaryNote ? ` [${guest.dietaryNote}]` : ''}`}
    >
      {guest.aliases.length > 0 ? guest.aliases[0] : guest.name}
      {guest.attendeeCount > 1 && (
        <span style={{ color: 'var(--text-muted)' }} className="ml-0.5">+{guest.attendeeCount - 1}</span>
      )}
    </div>
    {tooltip && bestSwapTableId && createPortal(
      <div style={{
        position: 'fixed',
        left: tooltip.x,
        top: tooltip.y,
        transform: 'translateY(-50%)',
        background: '#B08D57',
        color: 'white',
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 12,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 9999,
        fontFamily: 'var(--font-body)',
        boxShadow: '0 4px 12px rgba(28,25,23,0.08)',
        overflow: 'hidden',
      }}>
        {longPressProgress && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,255,255,0.3)',
            transformOrigin: 'left',
            animation: 'longpress-fill 1.5s linear forwards',
          }} />
        )}
        <span style={{ position: 'relative' }}>長按入座</span>
        <style>{`@keyframes longpress-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
      </div>,
      document.body,
    )}
    </>
  )
}
