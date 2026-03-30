import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDraggable } from '@dnd-kit/core'
import { useSeatingStore, type Guest } from '@/stores/seating'

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
    : 0

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `seat-${guest.id}-${seatIndex}`,
    data: { type: 'guest', guest, companionOffset },
  })
  const setHoveredGuest = useSeatingStore((s) => s.setHoveredGuest)
  const hoverSuppressedUntil = useSeatingStore((s) => s.hoverSuppressedUntil)
  const moveGuest = useSeatingStore((s) => s.moveGuest)
  const guestsWithRecommendations = useSeatingStore((s) => s.guestsWithRecommendations)
  const bestSwapTableId = useSeatingStore((s) => s.bestSwapTableId)
  const moveGuestToSeat = useSeatingStore((s) => s.moveGuestToSeat)
  const hasSwapRec = guestsWithRecommendations.has(guest.id)
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; r: number } | null>(null)
  const [longPressProgress, setLongPressProgress] = useState(false)
  const elRef = useRef<HTMLDivElement | null>(null)

  const size = radius * 2
  const displayName = guest.aliases?.length > 0 ? guest.aliases[0] : guest.name

  return (
    <>
    <div
      ref={(el) => { setNodeRef(el); elRef.current = el }}
      {...Object.fromEntries(Object.entries(listeners || {}).filter(([k]) => k !== 'onPointerDown'))}
      {...attributes}
      className="absolute rounded-full cursor-grab"
      style={{
        left: x - radius - 6,
        top: y - radius - 6,
        width: size + 12,
        height: size + 12,
        opacity: isDragging ? 0.3 : undefined,
        zIndex: 10,
        border: '1.5px dashed transparent',
        boxSizing: 'border-box',
        transition: 'border-color 150ms ease-out',
      }}
      onPointerDown={(e) => {
        // 長按 2 秒換位（與 dnd-kit 共存：不動 = 長按，移動 = 拖曳）
        if (hasSwapRec && bestSwapTableId) {
          setLongPressProgress(true)
          useSeatingStore.setState({ longPressActive: true })
          longPressRef.current = setTimeout(() => {
            setLongPressProgress(false)
            useSeatingStore.setState({ longPressActive: false })
            setTooltip(null)
            setHoveredGuest(null)
            // 找目標桌的第一個空位
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
        // 讓 dnd-kit 的 listener 也處理
        listeners?.onPointerDown?.(e as any)
      }}
      onPointerUp={() => {
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
        setLongPressProgress(false)
        useSeatingStore.setState({ longPressActive: false })
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setHoveredGuest(null)
        setTooltip(null)
        moveGuest(guest.id, null)
      }}
      onMouseEnter={(e) => {
        if (isDragging) return
        const el = e.currentTarget
        const remaining = hoverSuppressedUntil - Date.now()
        if (remaining > 0) {
          delayRef.current = setTimeout(() => {
            el.style.borderColor = '#B08D57'
            setHoveredGuest(guest.id)
          }, remaining)
        } else {
          el.style.borderColor = '#B08D57'
          setHoveredGuest(guest.id)
        }
        // 立刻顯示 tooltip
        const rect = el.getBoundingClientRect()
        setTooltip({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width / 2 })
      }}
      onMouseLeave={(e) => {
        if (delayRef.current) { clearTimeout(delayRef.current); delayRef.current = null }
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
        setLongPressProgress(false)
        useSeatingStore.setState({ longPressActive: false })
        e.currentTarget.style.borderColor = 'transparent'
        setHoveredGuest(null)
        setTooltip(null)
      }}
    />
    {tooltip && createPortal(
      <>
        {/* 右側：雙擊移除 */}
        <div style={{
          position: 'fixed',
          left: tooltip.x + tooltip.r + 6,
          top: tooltip.y,
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
          雙擊移除
        </div>
        {/* 左側：長按換位（僅有換位推薦時顯示） */}
        {hasSwapRec && (
          <div style={{
            position: 'fixed',
            left: tooltip.x - tooltip.r - 6,
            top: tooltip.y,
            transform: 'translate(-100%, -50%)',
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
            {/* 長按進度條 */}
            {longPressProgress && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255,255,255,0.3)',
                transformOrigin: 'left',
                animation: 'longpress-fill 1.5s linear forwards',
              }} />
            )}
            <span style={{ position: 'relative' }}>長按換位</span>
            <style>{`@keyframes longpress-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
          </div>
        )}
      </>,
      document.body,
    )}
    </>
  )
}
