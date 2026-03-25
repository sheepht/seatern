import { useSeatingStore, type Table } from '@/stores/seating'

const CATEGORY_COLORS: Record<string, string> = {
  '男方': '#DBEAFE',
  '女方': '#FEE2E2',
  '共同': '#F3F4F6',
}

interface Props {
  table: Table
  isSelected: boolean
  isDragging: boolean
  onMouseDown: (e: React.MouseEvent) => void
}

export function TableNode({ table, isSelected, isDragging, onMouseDown }: Props) {
  const getTableGuests = useSeatingStore((s) => s.getTableGuests)
  const getTableSeatCount = useSeatingStore((s) => s.getTableSeatCount)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)

  const guests = getTableGuests(table.id)
  const seatCount = getTableSeatCount(table.id)
  const isFull = seatCount >= table.capacity
  const isOverCapacity = seatCount > table.capacity

  // 檢查此桌是否有避免同桌違規
  const guestIds = guests.map((g) => g.id)
  const hasViolation = avoidPairs.some(
    (ap) => guestIds.includes(ap.guestAId) && guestIds.includes(ap.guestBId),
  )

  // 桌次大小依容量縮放
  const radius = 40 + Math.min(table.capacity, 12) * 2

  // 滿意度色環
  const satisfactionColor = getSatisfactionColor(table.averageSatisfaction)

  return (
    <g
      transform={`translate(${table.positionX}, ${table.positionY})`}
      onMouseDown={onMouseDown}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
    >
      {/* 違規紅色脈動光暈 */}
      {hasViolation && (
        <circle
          r={radius + 8}
          fill="none"
          stroke="#DC2626"
          strokeWidth="3"
          opacity="0.4"
        >
          <animate attributeName="opacity" values="0.4;0.15;0.4" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* 外圈色環（滿意度） */}
      <circle
        r={radius + 4}
        fill="none"
        stroke={hasViolation ? '#DC2626' : guests.length > 0 ? satisfactionColor : '#E5E7EB'}
        strokeWidth={isSelected ? 4 : 2}
        opacity={0.8}
      />

      {/* 桌次圓形 */}
      <circle
        r={radius}
        fill={hasViolation ? '#FEF2F2' : 'white'}
        stroke={isSelected ? '#2563EB' : hasViolation ? '#DC2626' : isOverCapacity ? '#DC2626' : '#D1D5DB'}
        strokeWidth={isSelected ? 2 : hasViolation ? 2 : 1}
      />

      {/* 桌名 */}
      <text
        y={-14}
        textAnchor="middle"
        fill="#1A1A1A"
        fontSize="13"
        fontWeight="bold"
      >
        {table.name}
      </text>

      {/* 平均滿意度 */}
      {guests.length > 0 && (
        <text
          y={4}
          textAnchor="middle"
          fill={satisfactionColor}
          fontSize="16"
          fontWeight="bold"
        >
          {Math.round(table.averageSatisfaction)}
        </text>
      )}

      {/* 席位數 */}
      <text
        y={20}
        textAnchor="middle"
        fill={isOverCapacity ? '#DC2626' : '#9CA3AF'}
        fontSize="11"
      >
        {seatCount}/{table.capacity} 席
      </text>

      {/* 賓客名字（最多顯示 4 個） */}
      {guests.slice(0, 4).map((g, i) => {
        const chipY = 32 + i * 16
        const bgColor = CATEGORY_COLORS[g.category] || '#F3F4F6'
        return (
          <g key={g.id}>
            <rect
              x={-30}
              y={chipY - 6}
              width={60}
              height={14}
              rx={3}
              fill={bgColor}
            />
            <text
              y={chipY + 4}
              textAnchor="middle"
              fill="#374151"
              fontSize="10"
            >
              {g.name.length > 4 ? g.name.slice(0, 4) + '…' : g.name}
            </text>
          </g>
        )
      })}
      {guests.length > 4 && (
        <text
          y={32 + 4 * 16 + 4}
          textAnchor="middle"
          fill="#9CA3AF"
          fontSize="10"
        >
          +{guests.length - 4} 人
        </text>
      )}

      {/* 容量超過警告 */}
      {isOverCapacity && (
        <text
          y={-radius - 10}
          textAnchor="middle"
          fill="#DC2626"
          fontSize="11"
          fontWeight="bold"
        >
          超過容量！
        </text>
      )}
    </g>
  )
}

function getSatisfactionColor(score: number): string {
  if (score >= 85) return '#16A34A' // green
  if (score >= 70) return '#CA8A04' // yellow
  if (score >= 55) return '#EA580C' // orange
  return '#DC2626' // red
}
