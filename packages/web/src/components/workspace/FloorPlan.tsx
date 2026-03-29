import { useCallback, useState, useRef, useEffect, useLayoutEffect, useImperativeHandle, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { useSeatingStore, type Guest } from '@/stores/seating'
import { recalculateAll } from '@/lib/satisfaction'
import { computeAvoidancePath, getPathEndDirection } from '@/lib/path-routing'
import { calculateFitAll, centerOnPoint } from '@/lib/viewport'
import { TableNode } from './TableNode'
import { SeatDropZone } from './SeatDropZone'
import { GuestSeatOverlay } from './GuestSeatOverlay'
import { ZoomControls } from './ZoomControls'
import { Minimap } from './Minimap'

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
      if (!guest || guest.rsvpStatus !== 'confirmed') return []

      const isUnassigned = !guest.assignedTableId
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

        if (isUnassigned) {
          // 待排賓客：只要該桌能讓賓客得分 > 基礎分就推薦
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
          // 已入座賓客：滿意度上升 AND（桌滿意度也上升 OR 全場平均上升）
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
  }, [hoveredGuestId, activeDragGuestId, guests, tables])

  // 桌次拖曳狀態
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null)
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
  const spaceHeldRef = useRef(false)

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

  // Space 鍵追蹤（pan 模式）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const tag = (document.activeElement?.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        if (document.activeElement?.hasAttribute('contenteditable')) return
        if (document.activeElement?.closest('[role="dialog"]')) return
        e.preventDefault()
        spaceHeldRef.current = true
        setSpaceHeld(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

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
      // Space 按住或中鍵 → pan 模式，不拖桌子
      if (spaceHeldRef.current || e.button === 1) {
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

  // SVG 上的 mousedown（畫布背景拖曳 → pan，或 Space/中鍵）
  const handleSvgMouseDown = useCallback((e: React.MouseEvent) => {
    // Space 或中鍵 → 永遠 pan
    if (spaceHeldRef.current || e.button === 1) {
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
  const [spaceHeld, setSpaceHeld] = useState(false)

  const cursorStyle = isPanning ? 'grabbing'
    : spaceHeld ? 'grab'
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
          const shouldDim = highlightedIds.size > 0

          // 選中的桌子排到陣列最後，確保 SVG DOM 順序最後 = 圖層最上面
          const orderedTables = [
            ...tables.filter((t) => t.id !== selectedTableId),
            ...tables.filter((t) => t.id === selectedTableId),
          ]

          /* 智慧推薦虛線放在桌子下層，讓桌子蓋住穿過的部分 */
          const recLines = recommendations.length > 0 && hoveredGuestId && (() => {
          const guest = guests.find((g) => g.id === hoveredGuestId)
          if (!guest) return null

          const isUnassigned = !guest.assignedTableId

          // 待排賓客的推薦線改用 HTML overlay 渲染（見下方 unassignedRecOverlay）
          if (isUnassigned) return null

          if (guest.seatIndex === null) return null
          const srcTable = tables.find((t) => t.id === guest.assignedTableId)
          if (!srcTable) return null
          const srcRadius = Math.max(58 + Math.min(srcTable.capacity, 12) * 7, 88)
          const seatRadius = srcRadius - 34
          const totalSlots = srcTable.capacity
          const angle = ((2 * Math.PI) / totalSlots) * guest.seatIndex - Math.PI / 2
          const guestX = srcTable.positionX + Math.cos(angle) * seatRadius
          const guestY = srcTable.positionY + Math.sin(angle) * seatRadius

          // badge 顏色邏輯：1條綠、多條同分都黃、多條不同分最高綠其餘黃
          const seatedDeltas = recommendations.map((r) => r.guestDelta)
          const seatedMaxDelta = Math.max(...seatedDeltas)
          const seatedAllSame = new Set(seatedDeltas).size === 1
          const seatedOnlyOne = recommendations.length === 1

          return (
            <g style={{ pointerEvents: 'none' }}>
              {recommendations.map((rec, i) => {
                const targetTable = tables.find((t) => t.id === rec.tableId)
                if (!targetTable) return null

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

                return (
                  <g key={`rec-${i}`} opacity={0.9 - i * 0.15}>
                    <style>{`
                      @keyframes rec-flow-${i} {
                        from { stroke-dashoffset: 0; }
                        to { stroke-dashoffset: -16; }
                      }
                    `}</style>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth="2.5"
                      strokeDasharray="10 6"
                      style={{ animation: `rec-flow-${i} 0.6s linear infinite` }}
                    />
                    <polygon
                      points={`${endX},${endY} ${ax1},${ay1} ${ax2},${ay2}`}
                      fill={lineColor}
                    />
                    <g transform={`translate(${midpoint.x}, ${midpoint.y})`}>
                      <rect x={-20} y={-12} width={40} height={24} rx={12} fill={badgeColor} />
                      <text y={5} textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="'Plus Jakarta Sans', sans-serif">
                        +{rec.guestDelta}
                      </text>
                    </g>
                  </g>
                )
              })}
            </g>
          )
        })()

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
                />
              ))}
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

        // delta 顯示：guestDelta 對待排賓客是絕對分數，減去目前分數得 delta
        const currentScore = guest.satisfactionScore
        const deltas = recommendations.map((r) => r.guestDelta - currentScore)
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

              // badge 位置：貝茲曲線上箭頭前 ~50px
              const chordLen = Math.sqrt((endScreenX - startScreenX) ** 2 + (endScreenY - startScreenY) ** 2) || 1
              const bt = Math.max(0.5, 1 - 50 / chordLen)
              const badgeX = (1-bt)*(1-bt)*startScreenX + 2*(1-bt)*bt*cx + bt*bt*endScreenX
              const badgeY = (1-bt)*(1-bt)*startScreenY + 2*(1-bt)*bt*cy + bt*bt*endScreenY

              const delta = rec.guestDelta - currentScore
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
                  <g transform={`translate(${badgeX}, ${badgeY})`}>
                    <rect x={-20} y={-12} width={40} height={24} rx={12} fill={badgeColor} />
                    <text y={5} textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="'Plus Jakarta Sans', sans-serif">
                      +{delta}
                    </text>
                  </g>
                </g>
              )
            })}
          </svg>,
          document.body,
        )
      })()}

      {/* HTML overlay 層（拖桌子或重排動畫時禁用） */}
      <div style={{ pointerEvents: (draggingTableId || isResetting || flyingGuestIds.size > 0) ? 'none' : undefined }}>
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

      {/* Minimap — 畫布右下角 */}
      <Minimap
        tables={tables}
        guests={guests}
        zoom={zoom}
        panX={panX}
        panY={panY}
        containerWidth={cw}
        containerHeight={ch}
        onNavigate={(lx, ly) => {
          const { panX: px, panY: py } = centerOnPoint(lx, ly, zoom, cw, ch)
          animateViewport(zoom, px, py, 200)
        }}
      />

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
    </div>
  )
})
