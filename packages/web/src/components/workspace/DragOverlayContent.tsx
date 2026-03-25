import type { Guest } from '@/stores/seating'

const CATEGORY_BG: Record<string, string> = {
  '男方': 'bg-blue-100 border-blue-300',
  '女方': 'bg-red-100 border-red-300',
  '共同': 'bg-gray-100 border-gray-300',
}

interface Props {
  guest: Guest
}

export function DragOverlayContent({ guest }: Props) {
  const chipClass = CATEGORY_BG[guest.category] || 'bg-gray-100 border-gray-300'

  return (
    <div
      className={`px-3 py-1 rounded text-sm border-2 ${chipClass} shadow-lg cursor-grabbing whitespace-nowrap`}
    >
      {guest.name}
      {guest.attendeeCount > 1 && (
        <span className="text-gray-500 ml-1">+{guest.attendeeCount - 1}</span>
      )}
    </div>
  )
}
