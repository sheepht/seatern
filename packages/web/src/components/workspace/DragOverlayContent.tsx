import type { Guest } from '@/stores/seating'

const CATEGORY_STYLES: Record<string, { background: string; borderColor: string; color: string }> = {
  '男方': { background: '#DBEAFE', borderColor: '#BFDBFE', color: '#1E40AF' },
  '女方': { background: '#FEE2E2', borderColor: '#FECACA', color: '#991B1B' },
  '共同': { background: '#F3F4F6', borderColor: '#D1D5DB', color: '#374151' },
}
const DEFAULT_STYLE = { background: '#F3F4F6', borderColor: '#D1D5DB', color: '#374151' }

interface Props {
  guest: Guest
}

export function DragOverlayContent({ guest }: Props) {
  const catStyle = CATEGORY_STYLES[guest.category] || DEFAULT_STYLE

  return (
    <div
      className="px-3 py-1 text-sm cursor-grabbing whitespace-nowrap"
      style={{
        fontFamily: 'var(--font-body)',
        borderRadius: 'var(--radius-sm)',
        border: `2px solid ${catStyle.borderColor}`,
        backgroundColor: catStyle.background,
        color: catStyle.color,
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {guest.name}
      {guest.attendeeCount > 1 && (
        <span style={{ color: 'var(--text-secondary)' }} className="ml-1">+{guest.attendeeCount - 1}</span>
      )}
    </div>
  )
}
