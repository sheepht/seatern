import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSeatingStore } from '@/stores/seating'
import { getSatisfactionColor } from '@/lib/satisfaction'
import { GuestChip } from './GuestChip'

function TableActions({ tableId, guestCount }: { tableId: string; guestCount: number }) {
  const moveGuest = useSeatingStore((s) => s.moveGuest)
  const getTableGuests = useSeatingStore((s) => s.getTableGuests)
  const setSelectedTable = useSeatingStore((s) => s.setSelectedTable)
  const removeTable = useSeatingStore((s) => s.removeTable)

  const handleClear = () => {
    const guests = getTableGuests(tableId)
    for (const g of guests) {
      moveGuest(g.id, null)
    }
    setSelectedTable(null)
  }

  const handleDelete = () => {
    removeTable(tableId)
  }

  return (
    <div className="flex items-center gap-2">
      {guestCount > 0 && (
        <button
          onClick={handleClear}
          className="text-[10px] hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
        >
          清空
        </button>
      )}
      <button
        onClick={handleDelete}
        className="text-[10px] hover:opacity-80"
        style={{ color: 'var(--error)' }}
      >
        刪除桌
      </button>
    </div>
  )
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  '男方': { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
  '女方': { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  '共同': { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' },
}

const CATEGORY_ORDER = ['男方', '女方', '共同']

export function SidePanel() {
  const guests = useSeatingStore((s) => s.guests)
  const getUnassignedGuests = useSeatingStore((s) => s.getUnassignedGuests)

  const [search, setSearch] = useState('')

  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')

  const unassignedGuests = getUnassignedGuests()
  const totalUnassignedSeats = unassignedGuests.reduce((s, g) => s + g.attendeeCount, 0)

  const { isOver, setNodeRef } = useDroppable({
    id: 'unassigned',
    data: { type: 'unassigned' },
  })

  // 依名字過濾
  const filteredGuests = search.trim()
    ? unassignedGuests.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : unassignedGuests

  // 依分類 → 標籤 兩層分組
  const allCategories = Array.from(new Set(unassignedGuests.map((g) => g.category ?? '其他')))
  const sortedCategories = [
    ...CATEGORY_ORDER.filter((c) => allCategories.includes(c)),
    ...allCategories.filter((c) => !CATEGORY_ORDER.includes(c)),
  ]
  const grouped = sortedCategories
    .map((cat) => {
      const catGuests = filteredGuests.filter((g) => (g.category ?? '其他') === cat)
      // 收集此分類下所有出現的標籤（依第一個標籤分組；無標籤歸入 null）
      const tagNames = Array.from(
        new Set(catGuests.flatMap((g) => g.guestTags.map((gt) => gt.tag.name)))
      )
      const subGroups = [
        ...tagNames.map((tagName) => ({
          tagName,
          guests: catGuests.filter((g) => g.guestTags.some((gt) => gt.tag.name === tagName)),
        })),
        // 無任何標籤的賓客
        {
          tagName: null,
          guests: catGuests.filter((g) => g.guestTags.length === 0),
        },
      ].filter((sg) => sg.guests.length > 0)
      return { category: cat, subGroups }
    })
    .filter((g) => g.subGroups.some((sg) => sg.guests.length > 0))

  // 選中桌的詳情

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-primary)' }}>



      {/* 未安排賓客 — 佔滿剩餘高度 */}
      <div
        ref={setNodeRef}
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          borderTop: '1px solid var(--border)',
          background: isOver ? 'var(--accent-light)' : 'transparent',
          transition: 'background 150ms ease',
        }}
      >
        {/* Header + 搜尋 */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>
                未安排
              </span>
              <span className="text-xs font-data font-medium" style={{ color: unassignedGuests.length > 0 ? '#EA580C' : 'var(--text-muted)' }}>
                {unassignedGuests.length} 人
              </span>
              {totalUnassignedSeats !== unassignedGuests.length && (
                <span className="text-[10px] font-data" style={{ color: 'var(--text-muted)' }}>
                  / {totalUnassignedSeats} 席
                </span>
              )}
            </div>
            {isOver && (
              <span className="text-[10px]" style={{ color: 'var(--accent-dark)' }}>放開以取消安排</span>
            )}
          </div>
          <input
            type="text"
            placeholder="搜尋賓客..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs px-2.5 py-1.5 rounded-md"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
        </div>

        {/* 賓客列表 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {unassignedGuests.length === 0 ? (
            <p className="text-xs py-1" style={{ color: '#16A34A' }}>所有賓客都已安排完畢</p>
          ) : grouped.length === 0 ? (
            <p className="text-xs py-1" style={{ color: 'var(--text-muted)' }}>找不到「{search}」</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ category, subGroups }) => {
                const style = CATEGORY_STYLES[category]
                const totalCount = subGroups.reduce((s, sg) => s + sg.guests.length, 0)
                return (
                  <div key={category}>
                    {/* 分類標頭 */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{
                          background: style?.bg ?? '#F3F4F6',
                          color: style?.text ?? '#374151',
                          border: `1px solid ${style?.border ?? '#D1D5DB'}`,
                        }}
                      >
                        {category}
                      </span>
                      <span className="text-[10px] font-data" style={{ color: 'var(--text-muted)' }}>
                        {totalCount}
                      </span>
                    </div>
                    {/* 標籤子分組 */}
                    <div className="space-y-2 pl-2" style={{ borderLeft: `2px solid ${style?.border ?? '#D1D5DB'}` }}>
                      {subGroups.map(({ tagName, guests: sgGuests }) => (
                        <div key={tagName ?? '__no_tag__'}>
                          {tagName && (
                            <div className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                              {tagName}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {sgGuests.map((g) => (
                              <GuestChip key={g.id} guest={g} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
