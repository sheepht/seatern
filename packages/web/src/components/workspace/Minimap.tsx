import { memo, useCallback } from 'react'
import type { Table, Guest } from '@/stores/seating'

interface Props {
  tables: Table[]
  guests: Guest[]
  zoom: number
  panX: number
  panY: number
  containerWidth: number
  containerHeight: number
  onNavigate: (logicalX: number, logicalY: number) => void
}

const MINIMAP_W = 160
const MINIMAP_H = 120
const PADDING = 40
const MIN_DOT_R = 3
const MAX_DOT_R = 8

// 分類顏色（跟 TableNode 的 CATEGORY_COLORS 對齊）
const CATEGORY_FILL: Record<string, string> = {
  '男方': '#BFDBFE',
  '女方': '#FECACA',
  '共同': '#D1D5DB',
}

function getTableColor(table: Table, guests: Guest[]): string {
  if (table.color) return table.color
  const tableGuests = guests.filter((g) => g.assignedTableId === table.id && g.rsvpStatus === 'confirmed')
  if (tableGuests.length === 0) return '#E7E5E4' // --border
  // 多數賓客的分類
  const counts = new Map<string, number>()
  for (const g of tableGuests) {
    const cat = g.category || '共同'
    counts.set(cat, (counts.get(cat) || 0) + 1)
  }
  let maxCat = '共同', maxCount = 0
  for (const [cat, count] of counts) {
    if (count > maxCount) { maxCat = cat; maxCount = count }
  }
  return CATEGORY_FILL[maxCat] || '#D1D5DB'
}

export const Minimap = memo(function Minimap({
  tables,
  guests,
  zoom,
  panX,
  panY,
  containerWidth,
  containerHeight,
  onNavigate,
}: Props) {
  if (tables.length === 0) return null

  // 計算桌子的 bounding box
  const R = 80
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const t of tables) {
    minX = Math.min(minX, t.positionX - R)
    minY = Math.min(minY, t.positionY - R)
    maxX = Math.max(maxX, t.positionX + R)
    maxY = Math.max(maxY, t.positionY + R)
  }
  const contentW = maxX - minX + PADDING * 2
  const contentH = maxY - minY + PADDING * 2
  const scale = Math.min(MINIMAP_W / contentW, MINIMAP_H / contentH)
  const offsetX = (MINIMAP_W - contentW * scale) / 2
  const offsetY = (MINIMAP_H - contentH * scale) / 2

  // 桌子位置 → minimap 座標
  const toMiniX = (x: number) => (x - minX + PADDING) * scale + offsetX
  const toMiniY = (y: number) => (y - minY + PADDING) * scale + offsetY

  // Viewport rect
  const vx = -panX / zoom
  const vy = -panY / zoom
  const vw = containerWidth / zoom
  const vh = containerHeight / zoom
  const rectX = toMiniX(vx)
  const rectY = toMiniY(vy)
  const rectW = vw * scale
  const rectH = vh * scale

  // 圓點大小
  const capacities = tables.map((t) => t.capacity)
  const minCap = Math.min(...capacities)
  const maxCap = Math.max(...capacities)
  const capRange = maxCap - minCap || 1
  const dotRadius = (cap: number) =>
    MIN_DOT_R + ((cap - minCap) / capRange) * (MAX_DOT_R - MIN_DOT_R)

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      // minimap 座標 → 邏輯座標
      const logicalX = (mx - offsetX) / scale + minX - PADDING
      const logicalY = (my - offsetY) / scale + minY - PADDING
      onNavigate(logicalX, logicalY)
    },
    [offsetX, offsetY, scale, minX, minY, onNavigate],
  )

  return (
    <div
      className="absolute bottom-4 right-4 rounded-lg border shadow-sm z-30 overflow-hidden"
      style={{
        width: MINIMAP_W,
        height: MINIMAP_H,
        background: 'var(--bg-surface, #fff)',
        borderColor: 'var(--border, #E7E5E4)',
        opacity: 0.9,
      }}
    >
      <svg
        width={MINIMAP_W}
        height={MINIMAP_H}
        viewBox={`0 0 ${MINIMAP_W} ${MINIMAP_H}`}
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
      >
        {/* Layer 1: Background */}
        <rect width={MINIMAP_W} height={MINIMAP_H} fill="transparent" />

        {/* Layer 2: Viewport rect */}
        <rect
          x={rectX}
          y={rectY}
          width={rectW}
          height={rectH}
          fill="rgba(176, 141, 87, 0.15)"
          stroke="#B08D57"
          strokeWidth={1.5}
          rx={2}
        />

        {/* Layer 3: Table circles (on top of viewport rect) */}
        {tables.map((t) => (
          <circle
            key={t.id}
            cx={toMiniX(t.positionX)}
            cy={toMiniY(t.positionY)}
            r={dotRadius(t.capacity)}
            fill={getTableColor(t, guests)}
            stroke="rgba(0,0,0,0.15)"
            strokeWidth={0.5}
          />
        ))}
      </svg>
    </div>
  )
})
