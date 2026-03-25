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

  const guests = getTableGuests(table.id)
  const seatCount = getTableSeatCount(table.id)
  const isOverCapacity = seatCount > table.capacity

  // 檢查此桌是否有避免同桌違規
  const guestIds = guests.map((g) => g.id)
  const hasViolation = avoidPairs.some(
    (ap) => guestIds.includes(ap.guestAId) && guestIds.includes(ap.guestBId),
  )

  // 桌次大小依容量固定（要放得下所有座位圈圈）
  const baseRadius = 55 + Math.min(table.capacity, 12) * 7
  const radius = Math.max(baseRadius, 85)

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
            超過容量
          </text>
        </g>
      )}

      {/* 桌次圓形 — 畫在 badge 之後，蓋住尖角底部 */}
      <circle
        r={radius}
        fill="white"
        stroke={isSelected ? '#B08D57' : '#D6D3D1'}
        strokeWidth={isSelected ? 3 : 1.5}
      />

      {/* 桌名 */}
      <text
        y={guests.length > 0 ? -10 : -6}
        textAnchor="middle"
        fill="#1C1917"
        fontSize="15"
        fontWeight="bold"
        fontFamily="'Noto Sans TC', 'Plus Jakarta Sans', sans-serif"
      >
        {table.name}
      </text>

      {/* 平均滿意度 */}
      {guests.length > 0 && (
        <text
          y={10}
          textAnchor="middle"
          fill={satisfactionColor}
          fontSize="22"
          fontWeight="800"
          fontFamily="'Plus Jakarta Sans', sans-serif"
        >
          {Math.round(table.averageSatisfaction)}
        </text>
      )}

      {/* 席位數 */}
      <text
        y={guests.length > 0 ? 26 : 12}
        textAnchor="middle"
        fill={isOverCapacity ? '#DC2626' : '#A8A29E'}
        fontSize="12"
        fontFamily="'Plus Jakarta Sans', sans-serif"
      >
        {seatCount}/{table.capacity} 席
      </text>

      {/* 眷屬群組：甜甜圈扇形背景 */}
      {groupArcs.map((arc, i) => (
        <path
          key={`arc-${i}`}
          d={arc.path}
          fill={CATEGORY_COLORS[arc.category] || '#F3F4F6'}
          stroke={CATEGORY_TEXT[arc.category] || '#374151'}
          strokeWidth="1.5"
          opacity={0.45}
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
          // 眷屬位（不區分 overflow，所有人一視同仁）
          const bgColor = CATEGORY_COLORS[seat.guest!.category] || '#F3F4F6'
          const textColor = CATEGORY_TEXT[seat.guest!.category] || '#374151'
          return (
            <g key={`companion-${i}`}>
              <circle
                cx={seat.x}
                cy={seat.y}
                r={20}
                fill={bgColor}
                stroke="white"
                strokeWidth="1.5"
                opacity={0.5}
              />
              {/* 小人圖示 */}
              <circle cx={seat.x} cy={seat.y - 3} r={4} fill={textColor} opacity={0.4} />
              <path
                d={`M ${seat.x - 6} ${seat.y + 10} Q ${seat.x} ${seat.y + 2} ${seat.x + 6} ${seat.y + 10}`}
                fill="none"
                stroke={textColor}
                strokeWidth="2"
                strokeLinecap="round"
                opacity={0.4}
              />
            </g>
          )
        }

        // 賓客本人（不區分 overflow，所有人一視同仁）
        const bgColor = CATEGORY_COLORS[seat.guest!.category] || '#F3F4F6'
        const textColor = CATEGORY_TEXT[seat.guest!.category] || '#374151'
        const displayName = getDisplayName(seat.guest!.name)

        return (
          <g key={`${seat.guest!.id}-${i}`}>
            <circle
              cx={seat.x}
              cy={seat.y}
              r={20}
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

  const seatRadius = tableRadius - 28

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
 * 為帶眷屬的賓客建立甜甜圈扇形背景
 * 像圓餅圖中心挖空，佔 N/totalSlots 的扇形區域
 * totalSlots = max(capacity, 實際佔席) — 跟 buildSeatLayout 一致
 */
function buildGroupArcs(
  guests: Guest[],
  capacity: number,
  tableRadius: number,
): GroupArc[] {
  // 跟 buildSeatLayout 一樣的 totalSlots 計算
  let totalOccupied = 0
  for (const g of guests) {
    totalOccupied += g.attendeeCount
  }
  const totalSlots = Math.max(capacity, totalOccupied)

  const seatRadius = tableRadius - 28
  const innerR = seatRadius - 26
  const outerR = seatRadius + 26
  const arcs: GroupArc[] = []

  let posIndex = 0
  for (const guest of guests) {
    if (posIndex >= totalSlots) break

    const seatCount = Math.min(guest.attendeeCount, totalSlots - posIndex)
    const startIndex = posIndex
    posIndex += seatCount

    // 只有佔 2+ 個位子才畫扇形
    if (seatCount < 2) continue

    // 角度範圍：從第一個座位的前半到最後一個座位的後半
    const angleStep = (2 * Math.PI) / totalSlots
    const startAngle = angleStep * startIndex - Math.PI / 2 - angleStep * 0.45
    const endAngle = angleStep * (startIndex + seatCount - 1) - Math.PI / 2 + angleStep * 0.45

    const sweepAngle = endAngle - startAngle
    const largeArc = sweepAngle > Math.PI ? 1 : 0

    // 外弧起點/終點
    const ox1 = Math.cos(startAngle) * outerR
    const oy1 = Math.sin(startAngle) * outerR
    const ox2 = Math.cos(endAngle) * outerR
    const oy2 = Math.sin(endAngle) * outerR

    // 內弧起點/終點
    const ix1 = Math.cos(startAngle) * innerR
    const iy1 = Math.sin(startAngle) * innerR
    const ix2 = Math.cos(endAngle) * innerR
    const iy2 = Math.sin(endAngle) * innerR

    // 甜甜圈扇形路徑：外弧順時針 → 連到內弧 → 內弧逆時針 → 閉合
    arcs.push({
      path: [
        `M ${ox1} ${oy1}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2}`,
        `L ${ix2} ${iy2}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1}`,
        'Z',
      ].join(' '),
      category: guest.category,
    })
  }

  return arcs
}

function getSatisfactionColor(score: number): string {
  if (score >= 85) return '#16A34A'
  if (score >= 70) return '#CA8A04'
  if (score >= 55) return '#EA580C'
  return '#DC2626'
}
