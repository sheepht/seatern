import { useCallback, useState, useRef, useEffect } from 'react'
import { useSeatingStore, type Guest } from '@/stores/seating'
import { recalculateAll } from '@/lib/satisfaction'
import { TableNode } from './TableNode'
import { SeatDropZone } from './SeatDropZone'
import { GuestSeatOverlay } from './GuestSeatOverlay'

interface Recommendation {
  tableId: string
  guestDelta: number
  tableDelta: number
  overallDelta: number
  /** 模擬後的桌次平均滿意度（未四捨五入） */
  newTableAvg: number
  /** 模擬後的賓客滿意度 */
  newGuestScore: number
  /** 模擬後的全場平均滿意度 */
  newOverallAvg: number
  /** 模擬後每位賓客的滿意度 */
  newGuestScores: Map<string, number>
}

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 800

interface ScreenSeat {
  tableId: string
  seatIndex: number
  guest: Guest | null // null = empty seat
  isCompanion: boolean // 眷屬位（可 drop 但不可 drag）
  x: number
  y: number
  radius: number
}

export function FloorPlan() {
  const tables = useSeatingStore((s) => s.tables)
  const guests = useSeatingStore((s) => s.guests)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const hoveredGuestId = useSeatingStore((s) => s.hoveredGuestId)
  const activeDragGuestId = useSeatingStore((s) => s.activeDragGuestId)
  const selectedTableId = useSeatingStore((s) => s.selectedTableId)
  const setSelectedTable = useSeatingStore((s) => s.setSelectedTable)
  const updateTablePosition = useSeatingStore((s) => s.updateTablePosition)
  const saveTablePosition = useSeatingStore((s) => s.saveTablePosition)

  // 智慧推薦虛線
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const recCacheRef = useRef<Map<string, Recommendation[]>>(new Map())
  const recCacheVersionRef = useRef(0)
  const throttleRef = useRef(false)

  // guests/tables 變動時清快取（例如移動了賓客）
  const dataVersion = guests.length + tables.length + guests.reduce((s, g) => s + (g.assignedTableId?.length ?? 0) + g.satisfactionScore, 0)
  useEffect(() => {
    recCacheRef.current.clear()
    recCacheVersionRef.current++
  }, [dataVersion])

  // 背景掃描：找出所有有更好位置的賓客（顯示💡）
  const bgScanVersionRef = useRef(0)
  useEffect(() => {
    const version = ++bgScanVersionRef.current
    const seatedGuests = guests.filter((g) => g.assignedTableId && g.rsvpStatus === 'confirmed')
    if (seatedGuests.length === 0 || tables.length === 0) {
      useSeatingStore.setState({ guestsWithRecommendations: new Set() })
      return
    }

    // 用 setTimeout 分批計算，避免阻塞 UI
    const result = new Set<string>()
    let idx = 0
    const batchSize = 3

    const processBatch = () => {
      if (bgScanVersionRef.current !== version) return // 資料已變，中止
      const end = Math.min(idx + batchSize, seatedGuests.length)

      for (; idx < end; idx++) {
        const guest = seatedGuests[idx]
        // 快取有結果就直接用
        const cached = recCacheRef.current.get(guest.id)
        if (cached) {
          if (cached.length > 0) result.add(guest.id)
          continue
        }

        // 簡化計算：只檢查是否存在任何雙贏桌（找到一個就停）
        let found = false
        const currentResult = recalculateAll(guests, tables, avoidPairs)
        const currentOverall = currentResult.overallAverage

        for (const t of tables) {
          if (t.id === guest.assignedTableId) continue
          const tableGuests = guests.filter((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed')
          const seatCount = tableGuests.reduce((s, g) => s + g.attendeeCount, 0)
          if (seatCount + guest.attendeeCount > t.capacity) continue

          const simGuests = guests.map((g) => g.id === guest.id ? { ...g, assignedTableId: t.id } : g)
          const simResult = recalculateAll(simGuests, tables, avoidPairs)
          const newGuestScore = simResult.guests.find((g) => g.id === guest.id)?.satisfactionScore ?? 0
          const guestDelta = newGuestScore - guest.satisfactionScore
          const rawTableDelta = (simResult.tables.find((ts) => ts.id === t.id)?.averageSatisfaction ?? 0) - t.averageSatisfaction
          const rawOverallDelta = simResult.overallAverage - currentOverall

          if (guestDelta > 0.1 && (rawTableDelta > 0.1 || rawOverallDelta > 0.1)) {
            found = true
            break
          }
        }
        if (found) result.add(guest.id)
      }

      if (idx < seatedGuests.length) {
        setTimeout(processBatch, 0) // 下一批
      } else {
        if (bgScanVersionRef.current === version) {
          useSeatingStore.setState({ guestsWithRecommendations: result })
        }
      }
    }

    // 延遲 500ms 後開始背景掃描（等 UI 穩定）
    const timer = setTimeout(processBatch, 500)
    return () => clearTimeout(timer)
  }, [dataVersion, guests, tables])

  useEffect(() => {
    const syncRecToStore = (recs: Recommendation[], guestId: string) => {
      const scores = new Map<string, number>()
      for (const rec of recs) scores.set(rec.tableId, rec.newTableAvg)
      const bestGuest = recs.length > 0 ? { guestId, score: recs[0].newGuestScore } : null
      const bestOverall = recs.length > 0 ? recs[0].newOverallAvg : null
      const bestPreviewScores = recs.length > 0 ? recs[0].newGuestScores : new Map<string, number>()
      useSeatingStore.setState({
        recommendationTableScores: scores,
        recommendationGuestScore: bestGuest,
        recommendationOverallScore: bestOverall,
        recommendationPreviewScores: bestPreviewScores,
      })
    }

    if (activeDragGuestId) {
      setRecommendations([])
      syncRecToStore([], '')
      return
    }

    if (!hoveredGuestId) {
      setRecommendations([])
      syncRecToStore([], '')
      throttleRef.current = false
      return
    }

    // 有快取 → 直接用
    const cached = recCacheRef.current.get(hoveredGuestId)
    if (cached) {
      setRecommendations(cached)
      syncRecToStore(cached, hoveredGuestId)
      return
    }

    // Throttle：第一次立即執行，後續 300ms 內忽略
    if (throttleRef.current) return
    throttleRef.current = true
    setTimeout(() => { throttleRef.current = false }, 300)

    const compute = () => {
      const guest = guests.find((g) => g.id === hoveredGuestId)
      if (!guest || !guest.assignedTableId || guest.rsvpStatus !== 'confirmed') return []

      const currentGuestScore = guest.satisfactionScore
      // 當前全場平均
      const currentResult = recalculateAll(guests, tables, avoidPairs)
      const currentOverall = currentResult.overallAverage
      const results: Recommendation[] = []

      for (const t of tables) {
        if (t.id === guest.assignedTableId) continue

        const tableGuests = guests.filter(
          (g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed',
        )
        const seatCount = tableGuests.reduce((s, g) => s + g.attendeeCount, 0)
        if (seatCount + guest.attendeeCount > t.capacity) continue

        const simGuests = guests.map((g) =>
          g.id === hoveredGuestId ? { ...g, assignedTableId: t.id } : g,
        )
        const simResult = recalculateAll(simGuests, tables, avoidPairs)

        const newGuestScore = simResult.guests.find((g) => g.id === hoveredGuestId)?.satisfactionScore ?? 0
        const newTableAvg = simResult.tables.find((ts) => ts.id === t.id)?.averageSatisfaction ?? 0

        const guestDelta = Math.round(newGuestScore - currentGuestScore)
        const rawTableDelta = newTableAvg - t.averageSatisfaction
        const rawOverallDelta = simResult.overallAverage - currentOverall

        // 賓客滿意度上升 AND（桌滿意度也上升 OR 全場平均上升）
        if (guestDelta > 0 && (rawTableDelta > 0.1 || rawOverallDelta > 0.1)) {
          const newGuestScores = new Map<string, number>()
          for (const gs of simResult.guests) newGuestScores.set(gs.id, gs.satisfactionScore)
          results.push({
            tableId: t.id,
            guestDelta,
            tableDelta: Math.round(rawTableDelta),
            overallDelta: Math.round(rawOverallDelta),
            newTableAvg,
            newGuestScore,
            newOverallAvg: simResult.overallAverage,
            newGuestScores,
          })
        }
      }

      results.sort((a, b) => (b.guestDelta + b.tableDelta) - (a.guestDelta + a.tableDelta))
      return results.slice(0, 3)
    }

    const result = compute()
    recCacheRef.current.set(hoveredGuestId, result)
    setRecommendations(result)
    syncRecToStore(result, hoveredGuestId)
  }, [hoveredGuestId, activeDragGuestId, guests, tables])

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
        // 檢查是否為眷屬座位
        let isCompanionSlot = false
        let companionOwner: Guest | null = null
        for (const g of tableGuests) {
          if (g.seatIndex !== null && g.attendeeCount > 1) {
            for (let c = 1; c < g.attendeeCount; c++) {
              if ((g.seatIndex + c) % totalSlots === i) {
                isCompanionSlot = true
                companionOwner = g
                break
              }
            }
          }
          if (isCompanionSlot) break
        }

        // 眷屬座位也可以當 drop target（shift 會保持群組完整）
        // 但不需要 draggable overlay（拖主人即可）
        const guest = isCompanionSlot ? companionOwner : (slotMap.get(i) || null)

        allScreenSeats.push({
          tableId: t.id,
          seatIndex: i,
          guest,
          isCompanion: isCompanionSlot,
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
        id="floorplan-svg"
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

        {/* 推薦虛線時需要 dim 的桌子 */}
        {(() => {
          // 計算哪些桌不需要 dim（來源桌 + 推薦目標桌）
          const highlightedIds = new Set<string>()
          if (recommendations.length > 0 && hoveredGuestId) {
            const g = guests.find((gg) => gg.id === hoveredGuestId)
            if (g?.assignedTableId) highlightedIds.add(g.assignedTableId)
            for (const rec of recommendations) highlightedIds.add(rec.tableId)
          }
          const shouldDim = highlightedIds.size > 0

          // 選中的桌子排到陣列最後，確保 SVG DOM 順序最後 = 圖層最上面
          const orderedTables = [
            ...tables.filter((t) => t.id !== selectedTableId),
            ...tables.filter((t) => t.id === selectedTableId),
          ]

          return (
            <>
              {orderedTables.map((table) => (
                <TableNode
                  key={table.id}
                  table={table}
                  isSelected={table.id === selectedTableId}
                  isDragging={draggingTableId === table.id}
                  isDimmed={shouldDim && !highlightedIds.has(table.id)}
                  onMouseDown={(e) => handleMouseDown(table.id, e)}
                />
              ))}
            </>
          )
        })()}

        {/* 智慧推薦虛線 */}
        {recommendations.length > 0 && hoveredGuestId && (() => {
          const guest = guests.find((g) => g.id === hoveredGuestId)
          if (!guest || guest.seatIndex === null || !guest.assignedTableId) return null
          const srcTable = tables.find((t) => t.id === guest.assignedTableId)
          if (!srcTable) return null

          // 計算賓客在 SVG 上的位置
          const srcRadius = Math.max(58 + Math.min(srcTable.capacity, 12) * 7, 88)
          const seatRadius = srcRadius - 34
          const totalSlots = srcTable.capacity
          const angle = ((2 * Math.PI) / totalSlots) * guest.seatIndex - Math.PI / 2
          const guestX = srcTable.positionX + Math.cos(angle) * seatRadius
          const guestY = srcTable.positionY + Math.sin(angle) * seatRadius

          return (
            <>
              {/* 虛線 + 箭頭 */}
              {recommendations.map((rec, i) => {
                const targetTable = tables.find((t) => t.id === rec.tableId)
                if (!targetTable) return null

                const tx = targetTable.positionX
                const ty = targetTable.positionY
                const targetRadius = Math.max(58 + Math.min(targetTable.capacity, 12) * 7, 88)
                const guestCircleR = 23

                const dx = tx - guestX
                const dy = ty - guestY
                const dist = Math.sqrt(dx * dx + dy * dy)
                const ux = dx / dist
                const uy = dy / dist

                const startX = guestX + ux * (guestCircleR + 4)
                const startY = guestY + uy * (guestCircleR + 4)
                const endX = tx - ux * (targetRadius + 4)
                const endY = ty - uy * (targetRadius + 4)
                const mx = (startX + endX) / 2
                const my = (startY + endY) / 2

                const arrowSize = 16
                const ax1 = endX - ux * arrowSize - uy * arrowSize * 0.5
                const ay1 = endY - uy * arrowSize + ux * arrowSize * 0.5
                const ax2 = endX - ux * arrowSize + uy * arrowSize * 0.5
                const ay2 = endY - uy * arrowSize - ux * arrowSize * 0.5

                return (
                  <g key={`rec-${i}`} opacity={0.9 - i * 0.15}>
                    {/* 流動虛線動畫 */}
                    <style>{`
                      @keyframes rec-flow-${i} {
                        from { stroke-dashoffset: 0; }
                        to { stroke-dashoffset: -16; }
                      }
                    `}</style>
                    <line
                      x1={startX} y1={startY} x2={endX} y2={endY}
                      stroke="#B08D57"
                      strokeWidth="2.5"
                      strokeDasharray="10 6"
                      style={{ animation: `rec-flow-${i} 0.6s linear infinite` }}
                    />
                    <polygon
                      points={`${endX},${endY} ${ax1},${ay1} ${ax2},${ay2}`}
                      fill="#B08D57"
                    />
                    {/* 賓客 +N（線的中點，放大版） */}
                    <g transform={`translate(${mx}, ${my - 12})`}>
                      <rect x={-20} y={-12} width={40} height={24} rx={12} fill="#16A34A" />
                      <text y={5} textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="'Plus Jakarta Sans', sans-serif">
                        +{rec.guestDelta}
                      </text>
                    </g>
                  </g>
                )
              })}
            </>
          )
        })()}

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
            isEmpty={ss.guest === null && !ss.isCompanion}
          />
        ))}

        {/* 賓客座位 draggable overlay（主人 + 眷屬都可拖，拖眷屬 = 拖整組） */}
        {screenSeats
          .filter((ss) => ss.guest !== null)
          .map((ss) => (
            <GuestSeatOverlay
              key={`drag-${ss.guest!.id}-${ss.seatIndex}`}
              guest={ss.guest!}
              seatIndex={ss.seatIndex}
              isCompanion={ss.isCompanion}
              x={ss.x}
              y={ss.y}
              radius={ss.radius}
            />
          ))}
      </div>
    </div>
  )
}
