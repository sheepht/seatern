import { useRef, useLayoutEffect, useState, useEffect } from 'react'
import { useSeatingStore, type Table, type Guest } from '@/stores/seating'
import type { Slot } from '@/lib/seat-shift'

/**
 * 數字漸變動畫 hook — 值改變時平滑過渡
 */
function useAnimatedNumber(target: number, duration = 400): number {
  const [current, setCurrent] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = prevRef.current
    if (from === target) return
    prevRef.current = target

    const start = performance.now()
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setCurrent(Math.round(from + (target - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return current
}

const CATEGORY_COLORS: Record<string, string> = {
  '男方': '#DBEAFE',
  '女方': '#FEE2E2',
  '共同': '#F3F4F6',
}

const CATEGORY_TEXT: Record<string, string> = {
  '男方': '#1E40AF',
  '女方': '#991B1B',
  '共同': '#374151',
}

interface Props {
  table: Table
  isSelected: boolean
  isDragging: boolean
  isDimmed?: boolean
  onMouseDown: (e: React.MouseEvent) => void
}

/**
 * 取得姓名的後 2 個字
 */
function getDisplayName(name: string): string {
  if (name.length <= 2) return name
  return name.slice(-2)
}

/** 桌次中央滿意度圓環（數字 + 進度弧線帶動畫） */
function TableScoreRing({ score, originalScore, hasGuests }: { score: number; originalScore: number; hasGuests: boolean }) {
  const ringRadius = 28
  const strokeW = 5
  const circumference = 2 * Math.PI * ringRadius

  const roundedScore = Math.round(score)
  const animatedScore = useAnimatedNumber(roundedScore)
  const progress = Math.min(animatedScore / 100, 1)
  const color = getSatisfactionColor(animatedScore)

  // 用未四捨五入的值算差異，有意義的變化至少顯示 ±1
  const rawDelta = score - originalScore
  const delta = rawDelta > 0.1 ? Math.max(1, Math.round(rawDelta)) : rawDelta < -0.1 ? Math.min(-1, Math.round(rawDelta)) : 0
  const scale = rawDelta > 0.1 ? 1.25 : rawDelta < -0.1 ? 0.8 : 1

  return (
    <g>
      {/* 圓環 + 數字（帶縮放） */}
      <g style={{ transform: `scale(${scale})`, transition: 'transform 200ms ease-out', transformOrigin: '0 0' }}>
        <circle r={ringRadius} fill="none" stroke="#E7E5E4" strokeWidth={strokeW} />
        {hasGuests && (
          <circle
            r={ringRadius}
            fill="none"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDashoffset={circumference * 0.25}
            transform="rotate(-90)"
            style={{
              stroke: color,
              strokeDasharray: `${circumference * progress} ${circumference * (1 - progress)}`,
              transition: 'stroke 400ms ease-out',
            }}
          />
        )}
        <text
          y={hasGuests ? 8 : 6}
          textAnchor="middle"
          fontSize={hasGuests ? '26' : '14'}
          fontWeight="800"
          fontFamily="'Plus Jakarta Sans', sans-serif"
          style={{ fill: hasGuests ? color : '#A8A29E', transition: 'fill 400ms ease-out' }}
        >
          {hasGuests ? animatedScore : '空桌'}
        </text>
      </g>
      {/* ±N badge（在縮放 group 外面，不受影響） */}
      {delta !== 0 && (
        <g transform={`translate(0, ${ringRadius + 16})`}>
          <rect
            x={-22}
            y={-13}
            width={44}
            height={26}
            rx={13}
            fill={delta > 0 ? '#16A34A' : '#DC2626'}
          />
          <text
            y={5}
            textAnchor="middle"
            fill="white"
            fontSize="14"
            fontWeight="700"
            fontFamily="'Plus Jakarta Sans', sans-serif"
          >
            {delta > 0 ? '+' : ''}{delta}
          </text>
        </g>
      )}
    </g>
  )
}

export function TableNode({ table, isSelected, isDragging, isDimmed, onMouseDown }: Props) {
  const getTableGuests = useSeatingStore((s) => s.getTableGuests)
  const getTableSeatCount = useSeatingStore((s) => s.getTableSeatCount)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const dragPreview = useSeatingStore((s) => s.dragPreview)
  const activeDragGuestId = useSeatingStore((s) => s.activeDragGuestId)
  const dragRejectTableId = useSeatingStore((s) => s.dragRejectTableId)
  const recommendationTableScores = useSeatingStore((s) => s.recommendationTableScores)
  const recommendationGuestScore = useSeatingStore((s) => s.recommendationGuestScore)
  const guestsWithRecommendations = useSeatingStore((s) => s.guestsWithRecommendations)
  const allGuests = useSeatingStore((s) => s.guests)

  const guests = getTableGuests(table.id)
  const seatCount = getTableSeatCount(table.id)
  const isOverCapacity = seatCount > table.capacity

  // 檢查此桌是否有避免同桌違規，並記錄哪些賓客涉及
  const guestIds = guests.map((g) => g.id)
  const violatingGuestIds = new Set<string>()
  for (const ap of avoidPairs) {
    if (guestIds.includes(ap.guestAId) && guestIds.includes(ap.guestBId)) {
      violatingGuestIds.add(ap.guestAId)
      violatingGuestIds.add(ap.guestBId)
    }
  }
  // 拖曳預覽時：檢查被拖的賓客是否跟此桌的人有衝突
  const previewDragId = dragPreview?.tableId === table.id ? dragPreview.draggedGuestId : null
  if (previewDragId) {
    for (const ap of avoidPairs) {
      const isConflict =
        (ap.guestAId === previewDragId && guestIds.includes(ap.guestBId)) ||
        (ap.guestBId === previewDragId && guestIds.includes(ap.guestAId))
      if (isConflict) {
        violatingGuestIds.add(ap.guestAId)
        violatingGuestIds.add(ap.guestBId)
      }
    }
  }

  // 桌次大小依容量固定（要放得下所有座位圈圈）
  const baseRadius = 58 + Math.min(table.capacity, 12) * 7
  const radius = Math.max(baseRadius, 88)

  // 拖曳 hover 但無法放置（滿桌）
  const isRejectTable = dragRejectTableId === table.id

  // 是否有此桌的拖曳預覽
  const isPreviewTable = dragPreview?.tableId === table.id
  const previewSlots = isPreviewTable ? dragPreview.previewSlots : null
  // 預覽滿意度分數（拖曳中即時計算 — 適用於所有桌，不只目標桌）
  const previewScores = dragPreview ? dragPreview.previewScores : null
  const previewTableScore = dragPreview?.previewTableScores?.get(table.id)

  // 拖曳中的賓客一律不顯示在任何桌上（他跟著游標走）
  const filteredGuests = activeDragGuestId
    ? guests.filter((g) => g.id !== activeDragGuestId)
    : guests

  // 預覽時需要所有賓客資料（被位移的人可能需要查找）
  const guestPool = isPreviewTable ? allGuests.filter((g) => g.rsvpStatus === 'confirmed') : filteredGuests

  // 所有座位（含空位），依 capacity 固定數量
  const allSeats = buildSeatLayout(guestPool, table.capacity, radius, previewSlots)

  // FLIP 動畫：追蹤座位元素的前一次位置
  const seatRefsMap = useRef<Map<string, SVGGElement>>(new Map())
  const prevPositions = useRef<Map<string, { x: number; y: number }>>(new Map())

  // 在 DOM 更新前捕捉當前位置（FLIP: First）
  // 因為 React 在 render 後才更新 DOM，我們在這裡先記錄 "即將被替換" 的位置
  const currentPositions = new Map<string, { x: number; y: number }>()
  for (const seat of allSeats) {
    if (seat.guest) {
      const key = seat.type === 'companion' ? `guest-${seat.guest.id}-c${seat.companionIndex}` : `guest-${seat.guest.id}-main`
      currentPositions.set(key, { x: seat.x, y: seat.y })
    }
  }

  useLayoutEffect(() => {
    // FLIP: Last → Invert → Play
    const prev = prevPositions.current
    for (const [key, newPos] of currentPositions) {
      const oldPos = prev.get(key)
      if (!oldPos) continue

      const dx = oldPos.x - newPos.x
      const dy = oldPos.y - newPos.y
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue

      const el = seatRefsMap.current.get(key)
      if (!el) continue

      // Invert + Play：從舊位置動畫到新位置
      el.animate(
        [
          { transform: `translate(${newPos.x + dx}px, ${newPos.y + dy}px)` },
          { transform: `translate(${newPos.x}px, ${newPos.y}px)` },
        ],
        { duration: 200, easing: 'ease-out' },
      )
    }

    // 更新記錄
    prevPositions.current = currentPositions
  })

  // 眷屬群組弧線
  const groupArcs = buildGroupArcsFromSeats(allSeats, table.capacity, radius)

  return (
    <g
      transform={`translate(${table.positionX}, ${table.positionY})`}
      onMouseDown={onMouseDown}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      opacity={isDimmed ? 0.2 : isDragging ? 0.6 : 1}
      style={{ transition: 'opacity 200ms ease-out' }}
    >
      {/* 對話框 badge — 畫在桌子圓形之前，讓圓形蓋住尖角底部 */}
      {isOverCapacity && (
        <g transform={`translate(${radius * 0.8}, ${-radius - 8})`}>
          <rect x={0} y={0} width={88} height={32} rx={6} fill="#EA580C" />
          <polygon points="10,32 0,46 20,32" fill="#EA580C" />
          <text x={44} y={22} textAnchor="middle" fill="white" fontSize="16" fontWeight="600" fontFamily="'Noto Sans TC', sans-serif">
            超過容量{seatCount - table.capacity}
          </text>
        </g>
      )}
      {isRejectTable && (
        <g transform={`translate(${radius * 0.8}, ${-radius - 8 - (isOverCapacity ? 36 : 0)})`}>
          <rect x={0} y={0} width={64} height={32} rx={6} fill="#991B1B" />
          <polygon points="10,32 0,46 20,32" fill="#991B1B" />
          <text x={32} y={22} textAnchor="middle" fill="white" fontSize="16" fontWeight="600" fontFamily="'Noto Sans TC', sans-serif">
            滿桌
          </text>
        </g>
      )}

      {/* 桌次圓形 — 畫在 badge 之後，蓋住尖角底部 */}
      <circle
        r={radius}
        fill={isRejectTable ? '#FEF2F2' : 'white'}
        stroke={isRejectTable ? '#DC2626' : '#D6D3D1'}
        strokeWidth={isRejectTable ? 2 : 1.5}
      />

      {/* 選中時外圈虛線 */}
      {isSelected && (
        <circle
          r={radius + 6}
          fill="none"
          stroke="#B08D57"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
      )}

      {/* 桌名（沿桌子上方弧形彎曲） */}
      <defs>
        <path
          id={`table-name-path-${table.id}`}
          d={`M ${-(radius + 12)},0 A ${radius + 12},${radius + 12} 0 0,1 ${radius + 12},0`}
          fill="none"
        />
      </defs>
      <text
        fill="#1C1917"
        fontSize="20"
        fontWeight="bold"
        fontFamily="'Noto Sans TC', 'Plus Jakarta Sans', sans-serif"
      >
        <textPath
          href={`#table-name-path-${table.id}`}
          startOffset="50%"
          textAnchor="middle"
        >
          {table.name}
        </textPath>
      </text>

      {/* 滿意度圓環進度條 + 中央數字（帶動畫） */}
      <TableScoreRing
        score={guests.length > 0 ? (previewTableScore ?? recommendationTableScores.get(table.id) ?? table.averageSatisfaction) : 0}
        originalScore={guests.length > 0 ? table.averageSatisfaction : 0}
        hasGuests={guests.length > 0}
      />

      {/* 眷屬群組：圓頭筆刷弧線 */}
      {groupArcs.map((arc, i) => (
        <path
          key={`arc-${i}`}
          d={arc.path}
          fill="none"
          stroke={CATEGORY_COLORS[arc.category] || '#F3F4F6'}
          strokeWidth="40"
          strokeLinecap="round"
          opacity={0.5}
        />
      ))}

      {/* 空位（靜態，不需動畫，獨立一組避免干擾賓客的 DOM 順序） */}
      {allSeats.filter((s) => s.type === 'empty').map((seat) => (
        <circle
          key={`empty-${seat.seatIndex}`}
          cx={seat.x}
          cy={seat.y}
          r={20}
          fill="none"
          stroke="#D6D3D1"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
      ))}

      {/* 有人的座位（賓客 + 眷屬），用 guest ID 作為穩定 key + FLIP 動畫 */}
      {allSeats.filter((s) => s.type !== 'empty').map((seat) => {
        const key = `guest-${seat.guest!.id}-${seat.type === 'companion' ? `c${seat.companionIndex}` : 'main'}`
        const setRef = (el: SVGGElement | null) => {
          if (el) seatRefsMap.current.set(key, el)
          else seatRefsMap.current.delete(key)
        }

        if (seat.type === 'companion' || seat.type === 'overflow-companion') {
          const bgColor = CATEGORY_COLORS[seat.guest!.category] || '#F3F4F6'
          const textColor = CATEGORY_TEXT[seat.guest!.category] || '#374151'
          const totalCompanions = seat.guest!.attendeeCount - 1
          const isLast = seat.companionIndex === totalCompanions
          return (
            <g key={key} ref={setRef} style={{ transform: `translate(${seat.x}px, ${seat.y}px)` }}>
              <circle
                r={20}
                fill={bgColor}
                stroke="white"
                strokeWidth="1.5"
                opacity={0.6}
              />
              {isLast && (
                <text
                  y={6}
                  textAnchor="middle"
                  fill={textColor}
                  fontSize="14"
                  fontWeight="600"
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  opacity={0.7}
                >
                  +{totalCompanions}
                </text>
              )}
            </g>
          )
        }

        // 賓客本人
        const bgColor = CATEGORY_COLORS[seat.guest!.category] || '#F3F4F6'
        const textColor = CATEGORY_TEXT[seat.guest!.category] || '#374151'
        const displayName = getDisplayName(seat.guest!.name)
        const recGuestScore = recommendationGuestScore?.guestId === seat.guest!.id ? recommendationGuestScore.score : undefined
        const guestScore = previewScores?.get(seat.guest!.id) ?? recGuestScore ?? seat.guest!.satisfactionScore
        const guestSatColor = getSatisfactionColor(guestScore)
        const guestR = 20
        const guestRingR = guestR + 3
        const guestCircum = 2 * Math.PI * guestRingR
        const guestProgress = Math.min(guestScore / 100, 1)

        return (
          <g key={key} ref={setRef} style={{ transform: `translate(${seat.x}px, ${seat.y}px)` }}>
            {/* 滿意度進度圈（帶動畫，永遠顯示） */}
            <circle
              r={guestRingR}
              fill="none"
              stroke="#E7E5E4"
              strokeWidth="2"
            />
            {guestScore > 0 && (
              <circle
                r={guestRingR}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDashoffset={guestCircum * 0.25}
                transform="rotate(-90)"
                style={{
                  stroke: guestSatColor,
                  strokeDasharray: `${guestCircum * guestProgress} ${guestCircum * (1 - guestProgress)}`,
                  transition: 'stroke-dasharray 400ms ease-out, stroke 400ms ease-out',
                }}
              />
            )}
            {/* 賓客圓形 */}
            <circle
              r={guestR}
              fill={bgColor}
              stroke="white"
              strokeWidth={1.5}
            />
            <text
              y={6}
              textAnchor="middle"
              fill={textColor}
              fontSize="16"
              fontWeight="500"
              fontFamily="'Noto Sans TC', sans-serif"
            >
              {displayName}
            </text>
          </g>
        )
      })}

      {/* 圖示層：怒氣 + 推薦（在所有賓客之上，不會被其他賓客蓋住） */}
      {allSeats.filter((s) => s.type === 'guest' && s.guest).map((seat) => {
        const guestR = 20
        const hasViolation = violatingGuestIds.has(seat.guest!.id)
        const hasRecommendation = guestsWithRecommendations.has(seat.guest!.id) && !hasViolation

        if (!hasViolation && !hasRecommendation) return null

        return (
          <g key={`icon-${seat.guest!.id}`} style={{ transform: `translate(${seat.x}px, ${seat.y}px)` }}>
            {hasViolation && (
              <g transform={`translate(${guestR + 4}, ${-guestR - 4})`}>
                <path
                  d="M-9,7 A12,12 0 1,1 -5,10 L-14,16 Z"
                  fill="white"
                  stroke="#DC2626"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <g transform="translate(0,-1)">
                  <path
                    d="M-1.5,-6 Q-1.5,-1.5 -6,-1.5 M1.5,-6 Q1.5,-1.5 6,-1.5 M-1.5,6 Q-1.5,1.5 -6,1.5 M1.5,6 Q1.5,1.5 6,1.5"
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </g>
              </g>
            )}
            {hasRecommendation && (
              <g transform={`translate(${-guestR - 4}, ${-guestR - 4})`}>
                <path
                  d="M9,7 A12,12 0 1,0 5,10 L14,16 Z"
                  fill="white"
                  stroke="#B08D57"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <g transform="translate(0, 0)">
                  <path d="M6,0 A6.5,6.5 0 0,0 -4,-5" fill="none" stroke="#B08D57" strokeWidth="2.2" strokeLinecap="round" />
                  <polygon points="-2,-9 -7,-3.5 -1,-3" fill="#B08D57" />
                  <path d="M-6,0 A6.5,6.5 0 0,0 4,5" fill="none" stroke="#B08D57" strokeWidth="2.2" strokeLinecap="round" />
                  <polygon points="2,9 7,3.5 1,3" fill="#B08D57" />
                </g>
              </g>
            )}
          </g>
        )
      })}

    </g>
  )
}

interface Seat {
  type: 'guest' | 'companion' | 'empty' | 'overflow' | 'overflow-companion'
  guest: Guest | null
  companionIndex?: number // 第幾個眷屬（從 1 開始）
  seatIndex: number // 圓桌上的座位索引
  x: number
  y: number
}

/**
 * 計算座位角度位置
 */
function seatPosition(seatIndex: number, totalSlots: number, seatRadius: number) {
  const angle = ((2 * Math.PI) / totalSlots) * seatIndex - Math.PI / 2
  return {
    x: Math.cos(angle) * seatRadius,
    y: Math.sin(angle) * seatRadius,
  }
}

/**
 * 建立座位佈局（使用 seatIndex）：
 * - 統一走 Slot[] → Seat[] 的 code path（不管有沒有 preview）
 * - 確保 React 元素結構穩定，CSS transition 能正常運作
 */
function buildSeatLayout(
  guests: Guest[],
  capacity: number,
  tableRadius: number,
  previewSlots?: Slot[] | null,
): Seat[] {
  const totalSlots = capacity
  const seatRadius = tableRadius - 34

  // Step 1: 建立 Slot[] — preview 時直接用，正常時從 guests 建立
  let slots: Slot[]
  if (previewSlots) {
    slots = previewSlots
  } else {
    slots = new Array(totalSlots).fill(null)
    for (const guest of guests) {
      const startIdx = guest.seatIndex ?? 0
      const immovable = guest.attendeeCount > 1
      if (startIdx < totalSlots) {
        slots[startIdx] = { guestId: guest.id, isCompanion: false, immovable }
      }
      for (let c = 1; c < guest.attendeeCount; c++) {
        const idx = (startIdx + c) % totalSlots
        slots[idx] = { guestId: guest.id, isCompanion: true, immovable }
      }
    }
  }

  // Step 2: 統一 code path — 從 Slot[] 轉成 Seat[]
  const guestMap = new Map<string, Guest>()
  for (const g of guests) guestMap.set(g.id, g)

  const seats: Seat[] = []
  for (let i = 0; i < totalSlots; i++) {
    const slot = slots[i]
    const pos = seatPosition(i, totalSlots, seatRadius)

    if (!slot) {
      seats.push({ type: 'empty', guest: null, seatIndex: i, ...pos })
    } else if (slot.isCompanion) {
      const guest = guestMap.get(slot.guestId) || null
      // 計算 companionIndex（往前數同 guestId 的連續 slot）
      let companionIdx = 0
      for (let j = i - 1; j >= 0; j--) {
        if (slots[j]?.guestId === slot.guestId) companionIdx++
        else break
      }
      seats.push({ type: 'companion', guest, companionIndex: companionIdx, seatIndex: i, ...pos })
    } else {
      const guest = guestMap.get(slot.guestId) || null
      seats.push({ type: 'guest', guest, seatIndex: i, ...pos })
    }
  }

  return seats
}

interface GroupArc {
  path: string
  category: string
}

/**
 * 從 allSeats 建立眷屬群組弧線
 */
function buildGroupArcsFromSeats(
  allSeats: Seat[],
  capacity: number,
  tableRadius: number,
): GroupArc[] {
  const seatRadius = tableRadius - 34
  const totalSlots = capacity
  const arcs: GroupArc[] = []

  // 找出帶眷屬的賓客，取得他們的起始 seatIndex 和佔位數
  const processed = new Set<string>()

  for (const seat of allSeats) {
    if (!seat.guest || seat.type !== 'guest') continue
    if (processed.has(seat.guest.id)) continue
    processed.add(seat.guest.id)

    if (seat.guest.attendeeCount < 2) continue

    const startIndex = seat.seatIndex
    const seatCount = seat.guest.attendeeCount

    const angleStep = (2 * Math.PI) / totalSlots
    const startAngle = angleStep * startIndex - Math.PI / 2
    const endAngle = angleStep * ((startIndex + seatCount - 1) % totalSlots) - Math.PI / 2

    // 處理環形情況
    let sweepAngle = endAngle - startAngle
    if (sweepAngle < 0) sweepAngle += 2 * Math.PI
    const largeArc = sweepAngle > Math.PI ? 1 : 0

    const x1 = Math.cos(startAngle) * seatRadius
    const y1 = Math.sin(startAngle) * seatRadius
    const x2 = Math.cos(endAngle) * seatRadius
    const y2 = Math.sin(endAngle) * seatRadius

    arcs.push({
      path: `M ${x1} ${y1} A ${seatRadius} ${seatRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
      category: seat.guest.category,
    })
  }

  return arcs
}

function getSatisfactionColor(score: number): string {
  if (score >= 75) return '#16A34A'
  if (score >= 50) return '#CA8A04'
  if (score >= 26) return '#EA580C'
  return '#DC2626'
}
