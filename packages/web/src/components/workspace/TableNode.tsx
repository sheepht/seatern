import { useSeatingStore, type Table, type Guest } from '@/stores/seating'

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
  onMouseDown: (e: React.MouseEvent) => void
}

/**
 * 取得姓名的後 2 個字
 */
function getDisplayName(name: string): string {
  if (name.length <= 2) return name
  return name.slice(-2)
}

export function TableNode({ table, isSelected, isDragging, onMouseDown }: Props) {
  const getTableGuests = useSeatingStore((s) => s.getTableGuests)
  const getTableSeatCount = useSeatingStore((s) => s.getTableSeatCount)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const hoveredGuestId = useSeatingStore((s) => s.hoveredGuestId)

  const guests = getTableGuests(table.id)
  const seatCount = getTableSeatCount(table.id)
  const isOverCapacity = seatCount > table.capacity

  // 檢查此桌是否有避免同桌違規
  const guestIds = guests.map((g) => g.id)
  const hasViolation = avoidPairs.some(
    (ap) => guestIds.includes(ap.guestAId) && guestIds.includes(ap.guestBId),
  )

  // 桌次大小依容量固定（要放得下所有座位圈圈）
  const baseRadius = 58 + Math.min(table.capacity, 12) * 7
  const radius = Math.max(baseRadius, 88)

  // 滿意度色環
  const satisfactionColor = getSatisfactionColor(table.averageSatisfaction)

  // 所有座位（含空位），依 capacity 固定數量
  const allSeats = buildSeatLayout(guests, table.capacity, radius)

  // 眷屬群組弧線
  const groupArcs = buildGroupArcs(guests, table.capacity, radius)

  return (
    <g
      transform={`translate(${table.positionX}, ${table.positionY})`}
      onMouseDown={onMouseDown}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      opacity={isDragging ? 0.6 : 1}
    >
      {/* 對話框 badge — 畫在桌子圓形之前，讓圓形蓋住尖角底部 */}
      {hasViolation && (
        <g transform={`translate(${radius * 0.8}, ${-radius - 8})`}>
          <rect x={0} y={0} width={88} height={32} rx={6} fill="#DC2626" />
          <polygon points="10,32 0,46 20,32" fill="#DC2626" />
          <text x={44} y={22} textAnchor="middle" fill="white" fontSize="16" fontWeight="600" fontFamily="'Noto Sans TC', sans-serif">
            避免同桌
          </text>
        </g>
      )}
      {isOverCapacity && (
        <g transform={`translate(${radius * 0.8}, ${hasViolation ? -radius - 44 : -radius - 8})`}>
          <rect x={0} y={0} width={88} height={32} rx={6} fill="#EA580C" />
          <polygon points="10,32 0,46 20,32" fill="#EA580C" />
          <text x={44} y={22} textAnchor="middle" fill="white" fontSize="16" fontWeight="600" fontFamily="'Noto Sans TC', sans-serif">
            超過容量{seatCount - table.capacity}
          </text>
        </g>
      )}

      {/* 桌次圓形 — 畫在 badge 之後，蓋住尖角底部 */}
      <circle
        r={radius}
        fill="white"
        stroke="#D6D3D1"
        strokeWidth="1.5"
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

      {/* 滿意度圓環進度條 + 中央數字 */}
      {(() => {
        const ringRadius = 28
        const strokeW = 5
        const circumference = 2 * Math.PI * ringRadius
        const score = guests.length > 0 ? Math.round(table.averageSatisfaction) : 0
        const progress = Math.min(score / 100, 1)

        return (
          <g>
            {/* 底圈（灰色軌道） */}
            <circle
              r={ringRadius}
              fill="none"
              stroke="#E7E5E4"
              strokeWidth={strokeW}
            />
            {/* 進度圈 */}
            {guests.length > 0 && (
              <circle
                r={ringRadius}
                fill="none"
                stroke={satisfactionColor}
                strokeWidth={strokeW}
                strokeLinecap="round"
                strokeDasharray={`${circumference * progress} ${circumference * (1 - progress)}`}
                strokeDashoffset={circumference * 0.25}
                transform="rotate(-90)"
              />
            )}
            {/* 中央數字 */}
            <text
              y={guests.length > 0 ? 8 : 6}
              textAnchor="middle"
              fill={guests.length > 0 ? satisfactionColor : '#A8A29E'}
              fontSize={guests.length > 0 ? '26' : '14'}
              fontWeight="800"
              fontFamily="'Plus Jakarta Sans', sans-serif"
            >
              {guests.length > 0 ? score : '空桌'}
            </text>
          </g>
        )
      })()}

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

      {/* 所有座位（含空位） */}
      {allSeats.map((seat, i) => {
        if (seat.type === 'empty') {
          // 空位：灰色虛線圈
          return (
            <circle
              key={`empty-${i}`}
              cx={seat.x}
              cy={seat.y}
              r={20}
              fill="none"
              stroke="#D6D3D1"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )
        }

        if (seat.type === 'companion' || seat.type === 'overflow-companion') {
          const bgColor = CATEGORY_COLORS[seat.guest!.category] || '#F3F4F6'
          const textColor = CATEGORY_TEXT[seat.guest!.category] || '#374151'
          const totalCompanions = seat.guest!.attendeeCount - 1
          const isLast = seat.companionIndex === totalCompanions
          return (
            <g key={`companion-${i}`}>
              <circle
                cx={seat.x}
                cy={seat.y}
                r={20}
                fill={bgColor}
                stroke="white"
                strokeWidth="1.5"
                opacity={0.6}
              />
              {isLast && (
                <text
                  x={seat.x}
                  y={seat.y + 6}
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

        // 賓客本人（不區分 overflow，所有人一視同仁）
        const bgColor = CATEGORY_COLORS[seat.guest!.category] || '#F3F4F6'
        const textColor = CATEGORY_TEXT[seat.guest!.category] || '#374151'
        const displayName = getDisplayName(seat.guest!.name)
        const guestScore = seat.guest!.satisfactionScore
        const guestSatColor = getSatisfactionColor(guestScore)
        const guestR = 20
        const guestRingR = guestR + 3
        const guestCircum = 2 * Math.PI * guestRingR
        const guestProgress = Math.min(guestScore / 100, 1)
        const isHovered = hoveredGuestId === seat.guest!.id

        return (
          <g key={`${seat.guest!.id}-${i}`}>
            {/* 滿意度進度圈（hover 時隱藏，由 HTML overlay 的虛線取代） */}
            {!isHovered && (
              <>
                <circle
                  cx={seat.x}
                  cy={seat.y}
                  r={guestRingR}
                  fill="none"
                  stroke="#E7E5E4"
                  strokeWidth="2"
                />
                {guestScore > 0 && (
                  <circle
                    cx={seat.x}
                    cy={seat.y}
                    r={guestRingR}
                    fill="none"
                    stroke={guestSatColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={`${guestCircum * guestProgress} ${guestCircum * (1 - guestProgress)}`}
                    strokeDashoffset={guestCircum * 0.25}
                    transform={`rotate(-90 ${seat.x} ${seat.y})`}
                  />
                )}
              </>
            )}
            {/* 賓客圓形 */}
            <circle
              cx={seat.x}
              cy={seat.y}
              r={guestR}
              fill={bgColor}
              stroke="white"
              strokeWidth="1.5"
            />
            <text
              x={seat.x}
              y={seat.y + 6}
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

    </g>
  )
}

interface Seat {
  type: 'guest' | 'companion' | 'empty' | 'overflow' | 'overflow-companion'
  guest: Guest | null
  companionIndex?: number // 第幾個眷屬（從 1 開始）
  x: number
  y: number
}

/**
 * 建立座位佈局：
 * - 依 capacity 固定基本座位數
 * - 超出容量的賓客也顯示（用 overflow 標記）
 * - 剩餘空位用 empty 標記
 */
function buildSeatLayout(
  guests: Guest[],
  capacity: number,
  tableRadius: number,
): Seat[] {
  // 計算實際需要的座位數（含超出的）
  let totalOccupied = 0
  for (const g of guests) {
    totalOccupied += g.attendeeCount
  }
  const totalSlots = Math.max(capacity, totalOccupied)

  const seatRadius = tableRadius - 34

  // 建立所有座位的角度位置
  const positions = Array.from({ length: totalSlots }, (_, i) => {
    const angle = ((2 * Math.PI) / totalSlots) * i - Math.PI / 2
    return {
      x: Math.cos(angle) * seatRadius,
      y: Math.sin(angle) * seatRadius,
    }
  })

  const seats: Seat[] = []
  let posIndex = 0
  let seatsFilled = 0

  for (const guest of guests) {
    if (posIndex >= totalSlots) break

    const isOverflow = seatsFilled >= capacity

    // 賓客本人
    seats.push({
      type: isOverflow ? 'overflow' : 'guest',
      guest,
      ...positions[posIndex],
    })
    posIndex++
    seatsFilled++

    // 眷屬佔位
    for (let c = 1; c < guest.attendeeCount; c++) {
      if (posIndex >= totalSlots) break
      const companionOverflow = seatsFilled >= capacity
      seats.push({
        type: companionOverflow ? 'overflow-companion' : 'companion',
        guest,
        companionIndex: c,
        ...positions[posIndex],
      })
      posIndex++
      seatsFilled++
    }
  }

  // 剩餘空位（只在沒超出時才有）
  while (posIndex < totalSlots) {
    seats.push({
      type: 'empty',
      guest: null,
      ...positions[posIndex],
    })
    posIndex++
  }

  return seats
}

interface GroupArc {
  path: string
  category: string
}

/**
 * 為帶眷屬的賓客建立弧線路徑
 * 像用圓頭筆刷畫一道弧形，標記同一組的座位
 */
function buildGroupArcs(
  guests: Guest[],
  capacity: number,
  tableRadius: number,
): GroupArc[] {
  let totalOccupied = 0
  for (const g of guests) {
    totalOccupied += g.attendeeCount
  }
  const totalSlots = Math.max(capacity, totalOccupied)

  const seatRadius = tableRadius - 34 // 跟座位同一圈
  const arcs: GroupArc[] = []

  let posIndex = 0
  for (const guest of guests) {
    if (posIndex >= totalSlots) break

    const seatCount = Math.min(guest.attendeeCount, totalSlots - posIndex)
    const startIndex = posIndex
    posIndex += seatCount

    if (seatCount < 2) continue

    const angleStep = (2 * Math.PI) / totalSlots
    const startAngle = angleStep * startIndex - Math.PI / 2
    const endAngle = angleStep * (startIndex + seatCount - 1) - Math.PI / 2

    const sweepAngle = endAngle - startAngle
    const largeArc = sweepAngle > Math.PI ? 1 : 0

    const x1 = Math.cos(startAngle) * seatRadius
    const y1 = Math.sin(startAngle) * seatRadius
    const x2 = Math.cos(endAngle) * seatRadius
    const y2 = Math.sin(endAngle) * seatRadius

    arcs.push({
      path: `M ${x1} ${y1} A ${seatRadius} ${seatRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
      category: guest.category,
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
