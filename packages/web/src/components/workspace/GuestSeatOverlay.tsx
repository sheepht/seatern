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
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)
  const elRef = useRef<HTMLDivElement | null>(null)

  const size = radius * 2
  const displayName = guest.aliases?.length > 0 ? guest.aliases[0] : guest.name

  return (
    <>
    <div
      ref={(el) => { setNodeRef(el); elRef.current = el }}
      {...listeners}
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
        setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 4 })
      }}
      onMouseLeave={(e) => {
        if (delayRef.current) { clearTimeout(delayRef.current); delayRef.current = null }
        e.currentTarget.style.borderColor = 'transparent'
        setHoveredGuest(null)
        setTooltip(null)
      }}
    />
    {tooltip && createPortal(
      <div style={{
        position: 'fixed',
        left: tooltip.x,
        top: tooltip.y,
        transform: 'translate(-50%, -100%)',
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
        {displayName} · 雙擊移除
      </div>,
      document.body,
    )}
    </>
  )
}
