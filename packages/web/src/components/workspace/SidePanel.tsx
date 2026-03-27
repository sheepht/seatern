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
  const tables = useSeatingStore((s) => s.tables)
  const getTotalAssignedSeats = useSeatingStore((s) => s.getTotalAssignedSeats)
  const getTotalConfirmedSeats = useSeatingStore((s) => s.getTotalConfirmedSeats)
  const dragPreview = useSeatingStore((s) => s.dragPreview)
  const recommendationPreviewScores = useSeatingStore((s) => s.recommendationPreviewScores)
  const getUnassignedGuests = useSeatingStore((s) => s.getUnassignedGuests)

  const [search, setSearch] = useState('')

  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')
  const assigned = getTotalAssignedSeats()
  const total = getTotalConfirmedSeats()
  const unassigned = total - assigned

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

      {/* 全場統計 */}
      <div className="p-4 shrink-0">
        <div className="p-3" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          {/* 安排進度 */}
          <div className="mt-1 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>安排進度</span>
              <span className="font-data" style={{ color: 'var(--text-muted)' }}>{assigned}/{total} 席</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(128,128,128,0.15)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: total > 0 ? `${Math.round((assigned / total) * 100)}%` : '0%',
                  background: total > 0 && assigned >= total ? '#16A34A' : assigned / total >= 0.5 ? '#CA8A04' : '#EA580C',
                }}
              />
            </div>
          </div>
          {/* 滿意度分佈 */}
          {confirmed.length > 0 && (() => {
            const seated = confirmed.filter((g) => g.assignedTableId)
            if (seated.length === 0) return null
            const baseGreen = seated.filter((g) => g.satisfactionScore >= 75).length
            const baseYellow = seated.filter((g) => g.satisfactionScore >= 50 && g.satisfactionScore < 75).length
            const baseOrange = seated.filter((g) => g.satisfactionScore >= 25 && g.satisfactionScore < 50).length
            const baseRed = seated.filter((g) => g.satisfactionScore < 25).length
            const previewScores = dragPreview?.previewScores ?? (recommendationPreviewScores.size > 0 ? recommendationPreviewScores : null)
            const getScore = (g: typeof confirmed[0]) => previewScores?.get(g.id) ?? g.satisfactionScore
            const green = seated.filter((g) => getScore(g) >= 75).length
            const yellow = seated.filter((g) => getScore(g) >= 50 && getScore(g) < 75).length
            const orange = seated.filter((g) => getScore(g) >= 25 && getScore(g) < 50).length
            const red = seated.filter((g) => getScore(g) < 25).length
            const t = seated.length
            const hasPreview = previewScores !== null
            const dGreen = green - baseGreen
            const dYellow = yellow - baseYellow
            const dOrange = orange - baseOrange
            const dRed = red - baseRed

            const deltaBadge = (d: number) => d !== 0 && hasPreview ? (
              <span className="font-data font-bold ml-0.5 px-1 py-px rounded-full" style={{
                background: d > 0 ? '#16A34A' : '#DC2626',
                color: 'white',
                fontSize: '11px',
                lineHeight: '16px',
              }}>{d > 0 ? '+' : ''}{d}</span>
            ) : null

            return (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>滿意度分佈</span>
                  <span className="font-data" style={{ color: 'var(--text-muted)' }}>{seated.length} 人</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(128,128,128,0.15)', gap: '1px' }}>
                  {green > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(green / t) * 100}%`, background: '#16A34A' }} />}
                  {yellow > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(yellow / t) * 100}%`, background: '#CA8A04' }} />}
                  {orange > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(orange / t) * 100}%`, background: '#EA580C' }} />}
                  {red > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(red / t) * 100}%`, background: '#DC2626' }} />}
                </div>
                <div className="flex gap-3 text-xs items-center" style={{ color: 'var(--text-muted)' }}>
                  {[
                    { color: '#16A34A', label: '讚', count: green, delta: dGreen },
                    { color: '#CA8A04', label: '可', count: yellow, delta: dYellow },
                    { color: '#EA580C', label: '爛', count: orange, delta: dOrange },
                    { color: '#DC2626', label: '慘', count: red, delta: dRed },
                  ].map(({ color, label, count, delta }) => (
                    <span key={color} className="flex items-center gap-0.5">
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block', marginRight: 3 }} />
                      <span className="font-data" style={{ color: 'var(--text-muted)' }}>{count}人</span>
                      {deltaBadge(delta)}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}
          {/* 桌次統計 */}
          <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            桌次 <span className="font-medium font-data" style={{ color: 'var(--text-primary)' }}>{tables.length}</span> 桌
          </div>
        </div>
      </div>


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
              <span className="text-xs font-data font-medium" style={{ color: unassigned > 0 ? '#EA580C' : 'var(--text-muted)' }}>
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
