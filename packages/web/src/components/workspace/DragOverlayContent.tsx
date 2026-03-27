import { useSeatingStore, type Guest } from '@/stores/seating'

const CATEGORY_STYLES: Record<string, { background: string; borderColor: string; color: string }> = {
  '男方': { background: '#DBEAFE', borderColor: '#BFDBFE', color: '#1E40AF' },
  '女方': { background: '#FEE2E2', borderColor: '#FECACA', color: '#991B1B' },
  '共同': { background: '#F3F4F6', borderColor: '#D1D5DB', color: '#374151' },
}
const DEFAULT_STYLE = { background: '#F3F4F6', borderColor: '#D1D5DB', color: '#374151' }

function getDisplayName(name: string): string {
  if (name.length <= 2) return name
  return name.slice(-2)
}

function getSatisfactionColor(score: number): string {
  if (score >= 75) return '#16A34A'
  if (score >= 50) return '#CA8A04'
  if (score >= 26) return '#EA580C'
  return '#DC2626'
}

interface Props {
  guest: Guest
}

export function DragOverlayContent({ guest }: Props) {
  const dragPreview = useSeatingStore((s) => s.dragPreview)
  const catStyle = CATEGORY_STYLES[guest.category] || DEFAULT_STYLE
  const displayName = getDisplayName(guest.name)

  // 預覽分數：hover 到座位時即時計算的分數
  const previewScore = dragPreview?.previewScores?.get(guest.id)
  const score = previewScore ?? guest.satisfactionScore
  const satColor = getSatisfactionColor(score)

  // 分數變化 → 微調大小
  const delta = previewScore !== undefined ? previewScore - guest.satisfactionScore : 0
  const scale = delta > 0 ? 1.1 : delta < 0 ? 0.9 : 1

  const size = 48
  const ringR = size / 2 + 3
  const circumference = 2 * Math.PI * ringR
  const progress = Math.min(score / 100, 1)

  return (
    <div
      className="relative cursor-grabbing"
      style={{ transform: `scale(${scale})`, transition: 'transform 200ms ease-out' }}
    >
      {/* 滿意度進度圈 */}
      <svg
        width={size + 12}
        height={size + 12}
        style={{
          position: 'absolute',
          left: -6,
          top: -6,
          pointerEvents: 'none',
        }}
      >
        <circle
          cx={size / 2 + 6}
          cy={size / 2 + 6}
          r={ringR}
          fill="none"
          stroke="#E7E5E4"
          strokeWidth="2.5"
        />
        {score > 0 && (
          <circle
            cx={size / 2 + 6}
            cy={size / 2 + 6}
            r={ringR}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDashoffset={circumference * 0.25}
            transform={`rotate(-90 ${size / 2 + 6} ${size / 2 + 6})`}
            style={{
              stroke: satColor,
              strokeDasharray: `${circumference * progress} ${circumference * (1 - progress)}`,
              transition: 'stroke-dasharray 200ms ease-out, stroke 200ms ease-out',
            }}
          />
        )}
      </svg>

      {/* 賓客圓形 */}
      <div
        className="flex items-center justify-center"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          fontFamily: 'var(--font-body)',
          fontSize: '16px',
          fontWeight: 500,
          border: `2px solid ${catStyle.borderColor}`,
          backgroundColor: catStyle.background,
          color: catStyle.color,
          boxShadow: '0 4px 16px rgba(28,25,23,0.2)',
        }}
      >
        {displayName}
      </div>

      {/* 眷屬 badge */}
      {guest.attendeeCount > 1 && (
        <div
          className="absolute flex items-center justify-center"
          style={{
            top: -6,
            right: -6,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#B08D57',
            color: 'white',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'var(--font-data)',
            border: '2px solid white',
          }}
        >
          +{guest.attendeeCount - 1}
        </div>
      )}
    </div>
  )
}
