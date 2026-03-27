import type { Guest } from '@/stores/seating'

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

interface Props {
  guest: Guest
}

export function DragOverlayContent({ guest }: Props) {
  const catStyle = CATEGORY_STYLES[guest.category] || DEFAULT_STYLE
  const displayName = getDisplayName(guest.name)
  return (
    <div className="relative cursor-grabbing">
      <div
        className="flex items-center justify-center"
        style={{
          width: 48,
          height: 48,
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
