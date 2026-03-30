import { useCallback, useState, useRef, useEffect, useLayoutEffect, useImperativeHandle, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { useSeatingStore, type Guest } from '@/stores/seating'
import { recalculateAll, getSatisfactionColor } from '@/lib/satisfaction'
import { computeAvoidancePath, getPathEndDirection } from '@/lib/path-routing'
import { calculateFitAll, centerOnPoint } from '@/lib/viewport'
import { TableNode } from './TableNode'
import { SeatPopover } from './SeatPopover'
import { SeatDropZone } from './SeatDropZone'
import { GuestSeatOverlay } from './GuestSeatOverlay'
import { ZoomControls } from './ZoomControls'

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

export interface FloorPlanHandle {
  fitAll: (animated?: boolean) => void
  panToPoint: (x: number, y: number) => void
}

export const FloorPlan = forwardRef<FloorPlanHandle>(function FloorPlan(_props, ref) {
  const tables = useSeatingStore((s) => s.tables)
  const guests = useSeatingStore((s) => s.guests)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const hoveredGuestId = useSeatingStore((s) => s.hoveredGuestId)
  const hoveredGuestScreenY = useSeatingStore((s) => s.hoveredGuestScreenY)
  const activeDragGuestId = useSeatingStore((s) => s.activeDragGuestId)
  const flyingGuestIds = useSeatingStore((s) => s.flyingGuestIds)
  const isResetting = useSeatingStore((s) => s.isResetting)
  const autoAssignProgress = useSeatingStore((s) => s.autoAssignProgress)
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

  // 桌次拖曳狀態
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null)
  const [seatPopover, setSeatPopover] = useState<{ tableId: string; seatIndex: number; x: number; y: number; tableCenterX: number; tableCenterY: number } | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartPosRef = useRef({ x: 0, y: 0 })
  const didDragRef = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ─── Zoom / Pan 狀態 ──────────────────────────────────
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [containerSize, setContainerSize] = useState({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT })

  // Ref mirrors：讓 wheel handler 能在 useCallback([]) 中讀取最新值
  const zoomRef = useRef(zoom)
  const panXRef = useRef(panX)
  const panYRef = useRef(panY)
  zoomRef.current = zoom
  panXRef.current = panX
  panYRef.current = panY

  // ─── 智慧推薦計算（需要 zoom 定義後）──────────────────
  useEffect(() => {
    const syncRecToStore = (recs: Recommendation[], guestId: string) => {
      const scores = new Map<string, number>()
      for (const rec of recs) scores.set(rec.tableId, rec.newTableAvg)
      const bestGuest = recs.length > 0 ? { guestId, score: recs[0].newGuestScore } : null
      const bestOverall = recs.length > 0 ? recs[0].newOverallAvg : null
      const bestPreviewScores = recs.length > 0 ? recs[0].newGuestScores : new Map<string, number>()

      // 長按換位：選最佳目標桌（分數最高 → 整體提升最多 → 第一條）
      let bestSwapTableId: string | null = null
      if (recs.length > 0) {
        const sorted = [...recs].sort((a, b) => {
          if (b.guestDelta !== a.guestDelta) return b.guestDelta - a.guestDelta
          if (b.overallDelta !== a.overallDelta) return b.overallDelta - a.overallDelta
          return 0
        })
        bestSwapTableId = sorted[0].tableId
      }

      useSeatingStore.setState({
        recommendationTableScores: scores,
        recommendationGuestScore: bestGuest,
        recommendationOverallScore: bestOverall,
        recommendationPreviewScores: bestPreviewScores,
        bestSwapTableId,
      })
    }

    if (activeDragGuestId) {
      setRecommendations([])
      syncRecToStore([], '')
      return
    }

    // zoom < 0.7 時：已入座賓客的桌上 overlay 消失，清除其 hover 狀態
    // 但待排賓客的側欄 chip 不受 zoom 影響，保留推薦計算
    if (zoom < 0.7 && hoveredGuestId) {
      const hovered = guests.find((g) => g.id === hoveredGuestId)
      if (hovered?.assignedTableId) {
        // 已入座賓客 → 清除推薦
        setRecommendations([])
        syncRecToStore([], '')
        useSeatingStore.getState().setHoveredGuest(null)
        return
      }
      // 待排賓客 → 繼續計算推薦（不 return）
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
      if (!guest || guest.rsvpStatus !== 'confirmed') return []

      const isUnassigned = !guest.assignedTableId
      const currentGuestScore = guest.satisfactionScore
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

        if (isUnassigned) {
          if (newGuestScore > 55) {
            const newGuestScores = new Map<string, number>()
            for (const gs of simResult.guests) newGuestScores.set(gs.id, gs.satisfactionScore)
            results.push({
              tableId: t.id,
              guestDelta: Math.round(newGuestScore),
              tableDelta: Math.round(rawTableDelta),
              overallDelta: Math.round(rawOverallDelta),
              newTableAvg,
              newGuestScore,
              newOverallAvg: simResult.overallAverage,
              newGuestScores,
            })
          }
        } else {
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
      }

      results.sort((a, b) => (b.guestDelta + b.tableDelta) - (a.guestDelta + a.tableDelta))
      return results.slice(0, 3)
    }

    const result = compute()
    recCacheRef.current.set(hoveredGuestId, result)
    setRecommendations(result)
    syncRecToStore(result, hoveredGuestId)
  }, [hoveredGuestId, activeDragGuestId, guests, tables, zoom])

  // ResizeObserver 追蹤容器大小
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setContainerSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ViewBox 計算（division-by-zero guard）
  const cw = containerSize.w || CANVAS_WIDTH
  const ch = containerSize.h || CANVAS_HEIGHT
  const viewBoxX = -panX / zoom
  const viewBoxY = -panY / zoom
  const viewBoxW = cw / zoom
  const viewBoxH = ch / zoom
  const viewBoxStr = `${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`

  // Pan 狀態追蹤
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Wheel zoom — 用 native listener 確保 non-passive（trackpad pinch 需要 preventDefault）
  const wheelRafRef = useRef<number | null>(null)
  const handleWheelNative = useCallback((e: WheelEvent) => {
    e.preventDefault() // 阻止瀏覽器預設縮放（trackpad pinch）和捲動
    if (wheelRafRef.current) return

    const clientX = e.clientX
    const clientY = e.clientY
    const deltaY = e.deltaY
    const isPinch = e.ctrlKey // trackpad pinch → ctrlKey=true

    wheelRafRef.current = requestAnimationFrame(() => {
      wheelRafRef.current = null
      const svg = svgRef.current
      if (!svg) return

      const prevZoom = zoomRef.current
      const prevPanX = panXRef.current
      const prevPanY = panYRef.current

      const delta = isPinch ? -deltaY * 0.01 : -deltaY * 0.001
      const nextZoom = Math.max(0.25, Math.min(1, prevZoom * (1 + delta)))
      if (nextZoom === prevZoom) return

      const rect = svg.getBoundingClientRect()
      const cx = clientX - rect.left
      const cy = clientY - rect.top
      const scale = nextZoom / prevZoom
      const nextPanX = Math.round(cx - scale * (cx - prevPanX))
      const nextPanY = Math.round(cy - scale * (cy - prevPanY))

      setZoom(nextZoom)
      setPanX(nextPanX)
      setPanY(nextPanY)
    })
  }, [])

  // 掛載 native wheel listener（non-passive），確保 trackpad pinch 的 preventDefault 生效
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheelNative, { passive: false })
    return () => el.removeEventListener('wheel', handleWheelNative)
  }, [handleWheelNative])


  // ─── Viewport 動畫 ──────────────────────────────────
  const animRef = useRef<number | null>(null)

  const animateViewport = useCallback((
    targetZoom: number,
    targetPanX: number,
    targetPanY: number,
    duration = 300,
  ) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    // 從 ref 讀取起始值（避免 stale closure）
    const startZoom = zoomRef.current, startPanX = panXRef.current, startPanY = panYRef.current
    const startTime = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setZoom(startZoom + (targetZoom - startZoom) * ease)
      setPanX(Math.round(startPanX + (targetPanX - startPanX) * ease))
      setPanY(Math.round(startPanY + (targetPanY - startPanY) * ease))
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        animRef.current = null
      }
    }
    animRef.current = requestAnimationFrame(tick)
  }, [])

  // cleanup animation on unmount
  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current) }, [])

  const fitAll = useCallback((animated = true) => {
    const { zoom: z, panX: px, panY: py } = calculateFitAll(tables, cw, ch)
    if (animated) {
      animateViewport(z, px, py, 300)
    } else {
      setZoom(z)
      setPanX(px)
      setPanY(py)
    }
  }, [tables, cw, ch, animateViewport])

  const panToPoint = useCallback((x: number, y: number) => {
    const z = zoomRef.current
    const { panX: px, panY: py } = centerOnPoint(x, y, z, cw, ch)
    animateViewport(z, px, py, 300)
  }, [cw, ch, animateViewport])

  useImperativeHandle(ref, () => ({ fitAll, panToPoint }), [fitAll, panToPoint])

  // 初始載入時 fit-all（等桌子載完）
  const initialFitDoneRef = useRef(false)
  useEffect(() => {
    if (tables.length > 0 && !initialFitDoneRef.current) {
      initialFitDoneRef.current = true
      const { zoom: z, panX: px, panY: py } = calculateFitAll(tables, cw, ch)
      setZoom(z)
      setPanX(px)
      setPanY(py)
    }
  }, [tables.length, cw, ch])

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

  // 桌次位置、大小、或 zoom/pan 改變時更新 overlay
  // useLayoutEffect 確保在 paint 前更新，避免 overlay 閃爍
  useLayoutEffect(() => {
    updateScreenPositions()
  }, [updateScreenPositions, zoom, panX, panY])

  useEffect(() => {
    window.addEventListener('resize', updateScreenPositions)
    return () => window.removeEventListener('resize', updateScreenPositions)
  }, [updateScreenPositions])

  // 開始 pan（共用邏輯）
  const startPan = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isPanningRef.current = true
    setIsPanning(true)
    panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY }
  }, [panX, panY])

  const handleMouseDown = useCallback(
    (tableId: string, e: React.MouseEvent) => {
      // 中鍵 → pan 模式，不拖桌子
      if (e.button === 1) {
        startPan(e)
        return
      }
      e.stopPropagation()

      const table = tables.find((t) => t.id === tableId)
      if (!table) return

      const point = getSvgPoint(e.clientX, e.clientY)
      setDraggingTableId(tableId)
      dragOffsetRef.current = { x: point.x - table.positionX, y: point.y - table.positionY }
      dragStartPosRef.current = { x: table.positionX, y: table.positionY }
      didDragRef.current = false
      setSelectedTable(tableId)
    },
    [tables, getSvgPoint, setSelectedTable, startPan],
  )

  // SVG 上的 mousedown（畫布背景拖曳 → pan，或中鍵）
  const handleSvgMouseDown = useCallback((e: React.MouseEvent) => {
    // 中鍵 → 永遠 pan
    if (e.button === 1) {
      startPan(e)
      return
    }
    // 左鍵點擊畫布背景 → 也觸發 pan（不是點在桌子上）
    const target = e.target as SVGElement
    if (target === svgRef.current || target.tagName === 'rect' || target.tagName === 'pattern') {
      startPan(e)
    }
  }, [startPan])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Pan 模式
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.x
        const dy = e.clientY - panStartRef.current.y
        setPanX(Math.round(panStartRef.current.panX + dx))
        setPanY(Math.round(panStartRef.current.panY + dy))
        return
      }
      // 桌子拖曳
      if (!draggingTableId) return
      didDragRef.current = true
      const point = getSvgPoint(e.clientX, e.clientY)
      const offset = dragOffsetRef.current
      // 不再限制 CANVAS_WIDTH/HEIGHT，zoom/pan 下畫布無界
      updateTablePosition(draggingTableId, point.x - offset.x, point.y - offset.y)
      updateScreenPositions()
    },
    [draggingTableId, getSvgPoint, updateTablePosition, updateScreenPositions],
  )

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      const didMove = Math.abs(dx) > 3 || Math.abs(dy) > 3
      isPanningRef.current = false
      setIsPanning(false)
      // 只有真的拖動過才算 pan（防止 click 取消選中被吞掉）
      wasPanningRef.current = didMove
      return
    }
    if (draggingTableId && didDragRef.current) {
      // Grid snap: 桌子位置吸附到最近的 50px 格線
      const table = tables.find((t) => t.id === draggingTableId)
      if (table) {
        const snappedX = Math.round(table.positionX / 50) * 50
        const snappedY = Math.round(table.positionY / 50) * 50
        if (snappedX !== table.positionX || snappedY !== table.positionY) {
          updateTablePosition(draggingTableId, snappedX, snappedY)
          updateScreenPositions()
        }
      }
      saveTablePosition(draggingTableId, dragStartPosRef.current.x, dragStartPosRef.current.y)
    }
    setDraggingTableId(null)
  }, [draggingTableId, saveTablePosition, tables, updateTablePosition, updateScreenPositions])

  const wasPanningRef = useRef(false)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // pan 結束後不觸發（真的拖動過才算）
      if (wasPanningRef.current) { wasPanningRef.current = false; return }
      // 點在桌子的 <g> 裡面 → 不取消選取（由 TableNode 處理）
      const target = e.target as SVGElement
      const isOnTable = target.closest?.('[data-table-id]')
      if (!isOnTable) {
        setSelectedTable(null)
      }
    },
    [setSelectedTable],
  )

  // 追蹤滑鼠在容器中的位置（+/- 快捷鍵 zoom 以滑鼠為中心）
  const mousePosRef = useRef({ x: 0, y: 0 })
  const handleGlobalMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  // 以滑鼠位置為中心的 animated zoom helper
  const zoomByFactor = useCallback((factor: number) => {
    const prev = zoomRef.current
    const next = Math.max(0.25, Math.min(1, prev * factor))
    if (next === prev) return
    const scale = next / prev
    const cx = mousePosRef.current.x
    const cy = mousePosRef.current.y
    const targetPanX = Math.round(cx - scale * (cx - panXRef.current))
    const targetPanY = Math.round(cy - scale * (cy - panYRef.current))
    animateViewport(next, targetPanX, targetPanY, 150)
  }, [animateViewport])

  // ─── 鍵盤快捷鍵（window listener，不依賴 SVG focus）─────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 輸入框、dialog 內不攔截
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (document.activeElement?.hasAttribute('contenteditable')) return
      if (document.activeElement?.closest('[role="dialog"]')) return

      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomByFactor(1.25)
      } else if (e.key === '-') {
        e.preventDefault()
        zoomByFactor(1 / 1.25)
      } else if (e.key === '0') {
        e.preventDefault()
        fitAll(true)
      } else if (e.key === '1') {
        e.preventDefault()
        // 100% zoom，保持當前視圖中心
        const cx = (-panXRef.current + cw / 2) / zoomRef.current
        const cy = (-panYRef.current + ch / 2) / zoomRef.current
        const { panX: px, panY: py } = centerOnPoint(cx, cy, 1, cw, ch)
        animateViewport(1, px, py, 200)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        animateViewport(zoomRef.current, panXRef.current + 100, panYRef.current, 150)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        animateViewport(zoomRef.current, panXRef.current - 100, panYRef.current, 150)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        animateViewport(zoomRef.current, panXRef.current, panYRef.current + 100, 150)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        animateViewport(zoomRef.current, panXRef.current, panYRef.current - 100, 150)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomByFactor, fitAll, animateViewport])

  // Pan 游標狀態（用 state 而非 ref，確保 re-render 更新游標）
  const [isPanning, setIsPanning] = useState(false)

  const cursorStyle = isPanning ? 'grabbing'
    : draggingTableId ? 'default'
    : undefined

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ cursor: cursorStyle, clipPath: 'inset(0 0 0 -200px)' }} onMouseMove={handleGlobalMouseMove}>
      {/* SVG 平面圖 — tabIndex={0} 讓畫布可以接收 focus 和鍵盤事件 */}
      <svg
        id="floorplan-svg"
        ref={svgRef}
        tabIndex={0}
        viewBox={viewBoxStr}
        className="w-full h-full bg-[#FAFAFA] outline-none"
        style={{ userSelect: 'none', overflow: 'visible', cursor: cursorStyle }}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
      >
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
          </pattern>
          {/* 裁切推薦虛線，不讓線跑到側欄後面 */}
          <clipPath id="viewbox-clip">
            <rect x={viewBoxX} y={viewBoxY} width={viewBoxW} height={viewBoxH} />
          </clipPath>
        </defs>
        {/* Grid 背景覆蓋大範圍，確保 zoom/pan 時都有格線 */}
        <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid)" />

        {/* 推薦虛線時需要 dim 的桌子 */}
        {(() => {
          // 計算哪些桌不需要 dim（來源桌 + 推薦目標桌）
          const highlightedIds = new Set<string>()
          if (recommendations.length > 0 && hoveredGuestId) {
            const g = guests.find((gg) => gg.id === hoveredGuestId)
            if (g?.assignedTableId) highlightedIds.add(g.assignedTableId)
            for (const rec of recommendations) highlightedIds.add(rec.tableId)
          }
          const shouldDim = highlightedIds.size > 0 && zoom >= 0.7

          // 選中的桌子排到陣列最後，確保 SVG DOM 順序最後 = 圖層最上面
          const orderedTables = [
            ...tables.filter((t) => t.id !== selectedTableId),
            ...tables.filter((t) => t.id === selectedTableId),
          ]

          /* 智慧推薦虛線：線+箭頭在桌子下層，badge 在桌子上層 */
          /* zoom < 0.7 時名字已淡出，無法辨識賓客，關閉推薦線 */
          const recData: Array<{ pathD: string; endX: number; endY: number; ax1: number; ay1: number; ax2: number; ay2: number; midpoint: { x: number; y: number }; badgeColor: string; lineColor: string; opacity: number; delta: number; animIdx: number }> = []
          if (recommendations.length > 0 && hoveredGuestId && zoom >= 0.7) {
            const guest = guests.find((g) => g.id === hoveredGuestId)
            if (guest && guest.assignedTableId && guest.seatIndex !== null) {
              const srcTable = tables.find((t) => t.id === guest.assignedTableId)
              if (srcTable) {
                const srcRadius = Math.max(58 + Math.min(srcTable.capacity, 12) * 7, 88)
                const seatRadius = srcRadius - 34
                const totalSlots = srcTable.capacity
                const angle = ((2 * Math.PI) / totalSlots) * guest.seatIndex - Math.PI / 2
                const guestX = srcTable.positionX + Math.cos(angle) * seatRadius
                const guestY = srcTable.positionY + Math.sin(angle) * seatRadius

                const seatedDeltas = recommendations.map((r) => r.guestDelta)
                const seatedMaxDelta = Math.max(...seatedDeltas)
                const seatedAllSame = new Set(seatedDeltas).size === 1
                const seatedOnlyOne = recommendations.length === 1

                recommendations.forEach((rec, i) => {
                  const targetTable = tables.find((t) => t.id === rec.tableId)
                  if (!targetTable) return

                  const tx = targetTable.positionX
                  const ty = targetTable.positionY
                  const targetRadius = Math.max(58 + Math.min(targetTable.capacity, 12) * 7, 88)

                  const dx0 = tx - guestX
                  const dy0 = ty - guestY
                  const dist0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1
                  const ux0 = dx0 / dist0
                  const uy0 = dy0 / dist0

                  const startX = guestX + ux0 * 27
                  const startY = guestY + uy0 * 27
                  const endX = tx - ux0 * (targetRadius + 4)
                  const endY = ty - uy0 * (targetRadius + 4)

                  const obstacles = tables
                    .filter((t) => t.id !== rec.tableId)
                    .map((t) => ({
                      cx: t.positionX,
                      cy: t.positionY,
                      r: Math.max(58 + Math.min(t.capacity, 12) * 7, 88),
                    }))

                  const srcObstacle = { cx: srcTable.positionX, cy: srcTable.positionY, r: srcRadius }

                  const { d: pathD, midpoint } = computeAvoidancePath(
                    { x: startX, y: startY },
                    { x: endX, y: endY },
                    obstacles,
                    srcObstacle,
                    Math.max(CANVAS_WIDTH, ...tables.map((t) => t.positionX + 200)),
                    Math.max(CANVAS_HEIGHT, ...tables.map((t) => t.positionY + 200)),
                  )

                  const { ux, uy } = getPathEndDirection(pathD)
                  const arrowSize = 16
                  const ax1 = endX - ux * arrowSize - uy * arrowSize * 0.5
                  const ay1 = endY - uy * arrowSize + ux * arrowSize * 0.5
                  const ax2 = endX - ux * arrowSize + uy * arrowSize * 0.5
                  const ay2 = endY - uy * arrowSize - ux * arrowSize * 0.5

                  const badgeColor = seatedOnlyOne ? '#16A34A' : (seatedAllSame ? '#CA8A04' : (rec.guestDelta === seatedMaxDelta ? '#16A34A' : '#CA8A04'))
                  const lineColor = badgeColor === '#16A34A' ? '#16A34A' : '#B08D57'

                  recData.push({ pathD, endX, endY, ax1, ay1, ax2, ay2, midpoint, badgeColor, lineColor, opacity: 0.9 - i * 0.15, delta: rec.guestDelta, animIdx: i })
                })
              }
            }
          }

          const recLines = recData.length > 0 ? (
            <g style={{ pointerEvents: 'none' }}>
              {recData.map((r) => (
                <g key={`rec-line-${r.animIdx}`} opacity={r.opacity}>
                  <style>{`
                    @keyframes rec-flow-${r.animIdx} {
                      from { stroke-dashoffset: 0; }
                      to { stroke-dashoffset: -16; }
                    }
                  `}</style>
                  <path d={r.pathD} fill="none" stroke={r.lineColor} strokeWidth="2.5" strokeDasharray="10 6" style={{ animation: `rec-flow-${r.animIdx} 0.6s linear infinite` }} />
                  <polygon points={`${r.endX},${r.endY} ${r.ax1},${r.ay1} ${r.ax2},${r.ay2}`} fill={r.lineColor} />
                </g>
              ))}
            </g>
          ) : null

          const recBadges = recData.length > 0 ? (
            <g style={{ pointerEvents: 'none' }}>
              {recData.map((r) => (
                <g key={`rec-badge-${r.animIdx}`} opacity={r.opacity} transform={`translate(${r.midpoint.x}, ${r.midpoint.y})`}>
                  <rect x={-20} y={-12} width={40} height={24} rx={12} fill={r.badgeColor} />
                  <text y={5} textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="'Plus Jakarta Sans', sans-serif">
                    +{r.delta}
                  </text>
                </g>
              ))}
            </g>
          ) : null

          return (
            <>
              {recLines}
              {orderedTables.map((table) => (
                <TableNode
                  key={table.id}
                  table={table}
                  isSelected={table.id === selectedTableId}
                  isDragging={draggingTableId === table.id}
                  isDimmed={shouldDim && !highlightedIds.has(table.id)}
                  zoom={zoom}
                  onMouseDown={(e) => handleMouseDown(table.id, e)}
                  onEmptySeatClick={(tableId, seatIndex, e) => {
                    setSeatPopover({ tableId, seatIndex, x: e.clientX, y: e.clientY })
                  }}
                />
              ))}
              {recBadges}
            </>
          )
        })()}

        {tables.length === 0 && (
          <text x={viewBoxX + viewBoxW / 2} y={viewBoxY + viewBoxH / 2} textAnchor="middle" fill="#9CA3AF" fontSize="16">
            尚未建立桌次，請點擊上方「新增桌次」
          </text>
        )}
      </svg>

      {/* 待排賓客的推薦虛線 — 用 HTML overlay 渲染，讓線從側欄賓客 chip 出發 */}
      {recommendations.length > 0 && hoveredGuestId && (() => {
        const guest = guests.find((g) => g.id === hoveredGuestId)
        if (!guest || guest.assignedTableId) return null // 只處理待排賓客

        const svgEl = svgRef.current
        const chipEl = document.querySelector(`[data-guest-id="${guest.id}"]`)
        if (!svgEl || !chipEl) return null
        const chipRect = chipEl.getBoundingClientRect()
        const ctm = svgEl.getScreenCTM()
        if (!ctm) return null

        // 起點：賓客 chip 的右邊緣
        const startScreenX = chipRect.right + 4
        const startScreenY = chipRect.top + chipRect.height / 2

        // 待排賓客的 guestDelta 是絕對分數（newGuestScore），直接當 +N 顯示
        const deltas = recommendations.map((r) => r.guestDelta)
        const maxDelta = Math.max(...deltas)
        const allSame = new Set(deltas).size === 1

        return createPortal(
          <svg
            style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9998 }}
          >
            <style>{`
              @keyframes rec-overlay-flow {
                from { stroke-dashoffset: 0; }
                to { stroke-dashoffset: -16; }
              }
            `}</style>
            {recommendations.map((rec, i) => {
              const targetTable = tables.find((t) => t.id === rec.tableId)
              if (!targetTable) return null

              const targetRadius = Math.max(58 + Math.min(targetTable.capacity, 12) * 7, 88)

              // 目標桌邊緣的螢幕座標
              const pt = svgEl.createSVGPoint()
              pt.x = targetTable.positionX
              pt.y = targetTable.positionY
              const tableScreen = pt.matrixTransform(ctm)

              // 從起點到桌心的方向
              const dx = tableScreen.x - startScreenX
              const dy = tableScreen.y - startScreenY
              const dist = Math.sqrt(dx * dx + dy * dy) || 1
              const ux = dx / dist
              const uy = dy / dist

              // 終點在桌邊緣
              const screenRadius = targetRadius * (ctm.a) // SVG scale → screen scale
              const endScreenX = tableScreen.x - ux * (screenRadius + 4)
              const endScreenY = tableScreen.y - uy * (screenRadius + 4)

              // 簡單的二次貝茲曲線（垂直偏移 12%）
              const mx = (startScreenX + endScreenX) / 2
              const my = (startScreenY + endScreenY) / 2
              const offset = dist * 0.12
              const cx = mx - uy * offset
              const cy = my + ux * offset

              const pathD = `M${startScreenX},${startScreenY} Q${cx},${cy} ${endScreenX},${endScreenY}`

              // 箭頭
              const arrowSize = 12
              const ax1 = endScreenX - ux * arrowSize - uy * arrowSize * 0.5
              const ay1 = endScreenY - uy * arrowSize + ux * arrowSize * 0.5
              const ax2 = endScreenX - ux * arrowSize + uy * arrowSize * 0.5
              const ay2 = endScreenY - uy * arrowSize - ux * arrowSize * 0.5

              const delta = rec.guestDelta
              // 只有1條 → 綠色；多條且分數都一樣 → 都黃色；多條不同分 → 最高綠色其餘黃色
              const onlyOne = recommendations.length === 1
              const badgeColor = onlyOne ? '#16A34A' : (allSame ? '#CA8A04' : (delta === maxDelta ? '#16A34A' : '#CA8A04'))
              const lineColor = badgeColor === '#16A34A' ? '#16A34A' : '#B08D57'

              return (
                <g key={`rec-overlay-${i}`} opacity={0.9 - i * 0.15}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="2.5"
                    strokeDasharray="10 6"
                    style={{ animation: `rec-overlay-flow 0.6s linear infinite` }}
                  />
                  <polygon
                    points={`${endScreenX},${endScreenY} ${ax1},${ay1} ${ax2},${ay2}`}
                    fill={lineColor}
                  />
                  {(() => {
                    // badge 位置：貝茲曲線上靠近出發點（待排區賓客）~50px 處
                    const chordLen = Math.sqrt((endScreenX - startScreenX) ** 2 + (endScreenY - startScreenY) ** 2) || 1
                    const bt = Math.min(0.4, 200 / chordLen)
                    const badgeX = (1-bt)*(1-bt)*startScreenX + 2*(1-bt)*bt*cx + bt*bt*endScreenX
                    const badgeY = (1-bt)*(1-bt)*startScreenY + 2*(1-bt)*bt*cy + bt*bt*endScreenY
                    return (
                      <g transform={`translate(${badgeX}, ${badgeY})`}>
                        <rect x={-20} y={-12} width={40} height={24} rx={12} fill={badgeColor} />
                        <text y={5} textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="'Plus Jakarta Sans', sans-serif">
                          +{delta}
                        </text>
                      </g>
                    )
                  })()}
                </g>
              )
            })}
          </svg>,
          document.body,
        )
      })()}

      {/* 畫布外的推薦目的桌指示器 */}
      {recommendations.length > 0 && hoveredGuestId && (() => {
        const svg = svgRef.current
        const container = containerRef.current
        if (!svg || !container) return null
        const ctm = svg.getScreenCTM()
        if (!ctm) return null
        const cRect = container.getBoundingClientRect()
        const margin = 12 // 邊緣內縮

        const indicators: Array<{ x: number; y: number; name: string; delta: number; color: string; edge: 'left' | 'right' | 'top' | 'bottom' }> = []

        for (const rec of recommendations) {
          const t = tables.find((tb) => tb.id === rec.tableId)
          if (!t) continue

          // 桌子的螢幕座標（相對於容器）
          const screenX = ctm.a * t.positionX + ctm.c * t.positionY + ctm.e - cRect.left
          const screenY = ctm.b * t.positionX + ctm.d * t.positionY + ctm.f - cRect.top
          const tableRadius = Math.max(58 + Math.min(t.capacity, 12) * 7, 88) * ctm.a

          // 檢查桌子是否在可見範圍內（含半徑）
          if (screenX + tableRadius > 0 && screenX - tableRadius < cw &&
              screenY + tableRadius > 0 && screenY - tableRadius < ch) continue

          // 桌子在畫布外 — 計算指示器位置（容器邊緣）
          const cx = cw / 2
          const cy = ch / 2
          const dx = screenX - cx
          const dy = screenY - cy
          const absDx = Math.abs(dx)
          const absDy = Math.abs(dy)

          let edgeX: number, edgeY: number, edge: 'left' | 'right' | 'top' | 'bottom'
          // 用斜率判斷碰到哪個邊
          if (absDx / (cw / 2) > absDy / (ch / 2)) {
            // 碰左右邊
            edge = dx > 0 ? 'right' : 'left'
            edgeX = dx > 0 ? cw - margin : margin
            edgeY = cy + dy * ((edgeX - cx) / dx)
          } else {
            // 碰上下邊
            edge = dy > 0 ? 'bottom' : 'top'
            edgeY = dy > 0 ? ch - margin : margin
            edgeX = cx + dx * ((edgeY - cy) / dy)
          }
          edgeX = Math.max(margin, Math.min(cw - margin, edgeX))
          edgeY = Math.max(margin + 10, Math.min(ch - margin - 10, edgeY))

          const onlyOne = recommendations.length === 1
          const deltas = recommendations.map((r) => r.guestDelta)
          const maxDelta = Math.max(...deltas)
          const allSame = new Set(deltas).size === 1
          const badgeColor = onlyOne ? '#16A34A' : (allSame ? '#CA8A04' : (rec.guestDelta === maxDelta ? '#16A34A' : '#CA8A04'))

          indicators.push({ x: edgeX, y: edgeY, name: t.name, delta: rec.guestDelta, color: badgeColor, edge })
        }

        if (indicators.length === 0) return null

        return indicators.map((ind, i) => (
          <div
            key={`offscreen-${i}`}
            style={{
              position: 'absolute',
              left: ind.edge === 'right' ? undefined : ind.edge === 'left' ? ind.x : ind.x,
              right: ind.edge === 'right' ? margin : undefined,
              top: ind.edge === 'bottom' ? undefined : ind.y,
              bottom: ind.edge === 'bottom' ? margin : undefined,
              transform: ind.edge === 'left' ? 'translateY(-50%)' : ind.edge === 'right' ? 'translateY(-50%)' : 'translateX(-50%)',
              background: ind.color,
              color: 'white',
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 30,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            {ind.name} +{ind.delta}
          </div>
        ))
      })()}

      {/* HTML overlay 層（拖桌子或重排動畫時禁用） */}
      <div style={{ pointerEvents: (draggingTableId || isResetting || flyingGuestIds.size > 0) ? 'none' : undefined }}>
        {/* 每個座位的 drop zone（含空位） */}
        {screenSeats.map((ss) => {
          // 計算桌子中心螢幕座標（從同桌所有座位的幾何中心推算）
          const tableSiblings = screenSeats.filter((s) => s.tableId === ss.tableId)
          const tcx = tableSiblings.reduce((s, s2) => s + s2.x, 0) / tableSiblings.length
          const tcy = tableSiblings.reduce((s, s2) => s + s2.y, 0) / tableSiblings.length
          return (
            <SeatDropZone
              key={`drop-${ss.tableId}-${ss.seatIndex}`}
              tableId={ss.tableId}
              seatIndex={ss.seatIndex}
              x={ss.x}
              y={ss.y}
              radius={ss.radius}
              isEmpty={ss.guest === null && !ss.isCompanion}
              isActive={seatPopover?.tableId === ss.tableId && seatPopover?.seatIndex === ss.seatIndex}
              tableCenterX={tcx}
              tableCenterY={tcy}
              onEmptyClick={(tableId, seatIndex, seatX, seatY, cx, cy) => {
                // 桌子右邊緣 + popover 寬度（280 + 32 gap + 16 margin）
                const tableScreenRadius = Math.abs(seatX - cx) > Math.abs(seatY - cy)
                  ? Math.abs(seatX - cx) : Math.abs(seatY - cy)
                const popoverRight = cx + tableScreenRadius + 32 + 280 + 16
                const overflow = popoverRight - cw
                if (overflow > 0) {
                  // 平移畫布讓 popover 不超出右邊
                  animateViewport(zoomRef.current, panXRef.current - overflow - 20, panYRef.current, 200)
                  // 延遲打開 popover，等平移完成後座標才正確
                  setTimeout(() => {
                    // 重新計算平移後的螢幕座標
                    const svg = svgRef.current
                    const container = containerRef.current
                    if (!svg || !container) return
                    const ctm = svg.getScreenCTM()
                    if (!ctm) return
                    const t = tables.find((tb) => tb.id === tableId)
                    if (!t) return
                    const cRect = container.getBoundingClientRect()
                    const newCx = ctm.a * t.positionX + ctm.c * t.positionY + ctm.e - cRect.left
                    const newCy = ctm.b * t.positionX + ctm.d * t.positionY + ctm.f - cRect.top
                    setSeatPopover({ tableId, seatIndex, x: seatX - overflow - 20, y: seatY, tableCenterX: newCx + cRect.left, tableCenterY: newCy + cRect.top })
                  }, 220)
                } else {
                  setSeatPopover({ tableId, seatIndex, x: seatX, y: seatY, tableCenterX: cx, tableCenterY: cy })
                }
              }}
            />
          )
        })}

        {/* 賓客座位 draggable overlay（主人 + 眷屬都可拖，拖眷屬 = 拖整組） */}
        {/* zoom < 0.7 時名字已淡出，賓客無法辨識，隱藏互動 overlay */}
        {zoom >= 0.7 && screenSeats
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


      {/* Zoom Controls — 畫布左下角 */}
      {tables.length > 0 && (
        <ZoomControls
          zoom={zoom}
          onZoomIn={() => zoomByFactor(1.25)}
          onZoomOut={() => zoomByFactor(1 / 1.25)}
          onFitAll={() => fitAll(true)}
          onSetZoom={(targetZoom) => {
            const { panX: px, panY: py } = centerOnPoint(
              viewBoxX + viewBoxW / 2,
              viewBoxY + viewBoxH / 2,
              targetZoom,
              cw,
              ch,
            )
            animateViewport(targetZoom, px, py, 200)
          }}
        />
      )}

      {/* 空位點擊 → 選擇賓客 popover */}
      {/* 自動分配進度 overlay — 全畫布遮罩 + 中央進度卡 */}
      {autoAssignProgress && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(250,250,250,0.6)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-surface, #fff)',
            border: '1px solid var(--border, #E7E5E4)',
            borderRadius: 'var(--radius-lg, 12px)',
            boxShadow: '0 8px 30px rgba(28,25,23,0.12)',
            padding: '28px 36px',
            fontFamily: 'var(--font-body)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            minWidth: 280,
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #1C1917)' }}>
              {autoAssignProgress.label}
            </div>
            {/* 進度條 — 顏色依進度百分比 */}
            <div style={{ width: '100%', height: 8, background: '#E7E5E4', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: getSatisfactionColor(autoAssignProgress.progress * 100),
                borderRadius: 4,
                width: `${Math.max(3, autoAssignProgress.progress * 100)}%`,
                transition: 'width 200ms ease-out, background 400ms ease-out',
              }} />
            </div>
            {autoAssignProgress.detail && (() => {
              const parts = autoAssignProgress.detail.split(' · ')
              return (
                <div style={{ textAlign: 'center' }}>
                  {parts.map((p, i) => (
                    <div key={i} style={{ fontSize: 14, color: 'var(--text-secondary, #78716C)', lineHeight: 1.6 }}>{p}</div>
                  ))}
                </div>
              )
            })()}
            <div style={{ fontSize: 14, color: 'var(--text-muted, #A8A29E)' }}>
              {autoAssignProgress.remainingSeconds !== null && autoAssignProgress.remainingSeconds > 0 ? (
                autoAssignProgress.remainingSeconds < 60
                  ? `預計剩餘 ${autoAssignProgress.remainingSeconds} 秒`
                  : `預計剩餘約 ${Math.ceil(autoAssignProgress.remainingSeconds / 60)} 分鐘`
              ) : '計算中...'}
            </div>
            <button
              onClick={() => useSeatingStore.getState().cancelAutoAssign()}
              className="cursor-pointer hover:bg-black/5"
              style={{
                padding: '6px 20px',
                borderRadius: 6,
                fontSize: 13,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {seatPopover && (
        <SeatPopover
          tableId={seatPopover.tableId}
          seatIndex={seatPopover.seatIndex}
          seatX={seatPopover.x}
          seatY={seatPopover.y}
          tableCenterX={seatPopover.tableCenterX}
          tableCenterY={seatPopover.tableCenterY}
          onClose={() => setSeatPopover(null)}
        />
      )}
    </div>
  )
})
