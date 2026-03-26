import { useCallback, useState, useRef, useEffect } from 'react'
import { useSeatingStore, type Guest } from '@/stores/seating'
import { TableNode } from './TableNode'
import { SeatDropZone } from './SeatDropZone'
import { GuestSeatOverlay } from './GuestSeatOverlay'

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 800

interface ScreenSeat {
  tableId: string
  seatIndex: number
  guest: Guest | null // null = empty seat
  x: number
  y: number
  radius: number
}

export function FloorPlan() {
  const tables = useSeatingStore((s) => s.tables)
  const guests = useSeatingStore((s) => s.guests)
  const selectedTableId = useSeatingStore((s) => s.selectedTableId)
  const setSelectedTable = useSeatingStore((s) => s.setSelectedTable)
  const updateTablePosition = useSeatingStore((s) => s.updateTablePosition)
  const saveTablePosition = useSeatingStore((s) => s.saveTablePosition)

  // 桌次拖曳狀態
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const didDragRef = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 螢幕座標的座位位置（給 HTML drop zone + draggable overlay 用）
  const [screenSeats, setScreenSeats] = useState<ScreenSeat[]>([])

  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const inverse = ctm.inverse()
    return {
      x: inverse.a * clientX + inverse.c * clientY + inverse.e,
      y: inverse.b * clientX + inverse.d * clientY + inverse.f,
    }
  }, [])

  // 把 SVG 座標轉成容器內的螢幕座標（給 HTML overlay 定位）
  const updateScreenPositions = useCallback(() => {
    const svg = svgRef.current
    const container = containerRef.current
    if (!svg || !container) return

    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const containerRect = container.getBoundingClientRect()

    const scale = ctm.a // 均勻縮放係數

    const allScreenSeats: ScreenSeat[] = []

    for (const t of tables) {
      const tableGuests = guests.filter((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed')
      const tableRadius = Math.max(58 + Math.min(t.capacity, 12) * 7, 88)
      const seatRadius = tableRadius - 34
      const tableCenterX = ctm.a * t.positionX + ctm.c * t.positionY + ctm.e - containerRect.left
      const tableCenterY = ctm.b * t.positionX + ctm.d * t.positionY + ctm.f - containerRect.top
      const totalSlots = t.capacity

      // 建立 slot map（哪個 seatIndex 有誰）
      const slotMap = new Map<number, Guest>()
      for (const g of tableGuests) {
        if (g.seatIndex !== null) {
          slotMap.set(g.seatIndex, g)
        }
      }

      // 為每個座位建立螢幕座標
      for (let i = 0; i < totalSlots; i++) {
        const angle = ((2 * Math.PI) / totalSlots) * i - Math.PI / 2
        const guest = slotMap.get(i) || null
        // 只顯示主人座位和空位的 overlay（眷屬位不需要獨立的 drag/drop）
        const isCompanion = guest && tableGuests.some(
          (g) => g.seatIndex !== null && g.id !== guest.id &&
            i > g.seatIndex && i < g.seatIndex + g.attendeeCount,
        )
        // 檢查是否為眷屬座位
        const occupant = guest // 這個 slot 的主人
        let isCompanionSlot = false
        for (const g of tableGuests) {
          if (g.seatIndex !== null && g.attendeeCount > 1) {
            for (let c = 1; c < g.attendeeCount; c++) {
              if ((g.seatIndex + c) % totalSlots === i) {
                isCompanionSlot = true
                break
              }
            }
          }
          if (isCompanionSlot) break
        }

        // 眷屬座位不需要 drop zone（拖到主人即可）
        if (isCompanionSlot) continue

        allScreenSeats.push({
          tableId: t.id,
          seatIndex: i,
          guest: slotMap.get(i) || null,
          x: tableCenterX + Math.cos(angle) * seatRadius * scale,
          y: tableCenterY + Math.sin(angle) * seatRadius * scale,
          radius: 20 * scale,
        })
      }
    }

    setScreenSeats(allScreenSeats)
  }, [tables, guests])

  // 桌次位置或大小改變時更新 overlay
  useEffect(() => {
    updateScreenPositions()
    window.addEventListener('resize', updateScreenPositions)
    return () => window.removeEventListener('resize', updateScreenPositions)
  }, [updateScreenPositions])

  const handleMouseDown = useCallback(
    (tableId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const table = tables.find((t) => t.id === tableId)
      if (!table) return

      const point = getSvgPoint(e.clientX, e.clientY)
      setDraggingTableId(tableId)
      dragOffsetRef.current = { x: point.x - table.positionX, y: point.y - table.positionY }
      didDragRef.current = false
      setSelectedTable(tableId)
    },
    [tables, getSvgPoint, setSelectedTable],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingTableId) return
      didDragRef.current = true
      const point = getSvgPoint(e.clientX, e.clientY)
      const offset = dragOffsetRef.current
      updateTablePosition(
        draggingTableId,
        Math.max(50, Math.min(CANVAS_WIDTH - 50, point.x - offset.x)),
        Math.max(50, Math.min(CANVAS_HEIGHT - 50, point.y - offset.y)),
      )
      updateScreenPositions()
    },
    [draggingTableId, getSvgPoint, updateTablePosition, updateScreenPositions],
  )

  const handleMouseUp = useCallback(() => {
    if (draggingTableId && didDragRef.current) {
      saveTablePosition(draggingTableId)
    }
    setDraggingTableId(null)
  }, [draggingTableId, saveTablePosition])

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'rect') {
        setSelectedTable(null)
      }
    },
    [setSelectedTable],
  )

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* SVG 平面圖 */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        className="w-full h-full bg-[#FAFAFA]"
        style={{ userSelect: 'none' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
      >
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#grid)" />

        {/* 選中的桌子最後畫（最上層） */}
        {tables.filter((t) => t.id !== selectedTableId).map((table) => (
          <TableNode
            key={table.id}
            table={table}
            isSelected={false}
            isDragging={draggingTableId === table.id}
            onMouseDown={(e) => handleMouseDown(table.id, e)}
          />
        ))}
        {selectedTableId && tables.filter((t) => t.id === selectedTableId).map((table) => (
          <TableNode
            key={table.id}
            table={table}
            isSelected={true}
            isDragging={draggingTableId === table.id}
            onMouseDown={(e) => handleMouseDown(table.id, e)}
          />
        ))}

        {tables.length === 0 && (
          <text x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT / 2} textAnchor="middle" fill="#9CA3AF" fontSize="16">
            尚未建立桌次，請點擊上方「新增桌次」
          </text>
        )}
      </svg>

      {/* HTML overlay 層（拖桌子時禁用） */}
      <div style={{ pointerEvents: draggingTableId ? 'none' : undefined }}>
        {/* 每個座位的 drop zone（含空位） */}
        {screenSeats.map((ss) => (
          <SeatDropZone
            key={`drop-${ss.tableId}-${ss.seatIndex}`}
            tableId={ss.tableId}
            seatIndex={ss.seatIndex}
            x={ss.x}
            y={ss.y}
            radius={ss.radius}
            isEmpty={ss.guest === null}
          />
        ))}

        {/* 賓客座位 draggable overlay（只有有人的位子） */}
        {screenSeats
          .filter((ss) => ss.guest !== null)
          .map((ss) => (
            <GuestSeatOverlay
              key={`drag-${ss.guest!.id}`}
              guest={ss.guest!}
              x={ss.x}
              y={ss.y}
              radius={ss.radius}
            />
          ))}
      </div>
    </div>
  )
}
