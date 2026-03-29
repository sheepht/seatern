import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ChevronLeft, Wand2 } from 'lucide-react'
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

export function SidePanel({ onCollapse }: { onCollapse?: () => void }) {
  const guests = useSeatingStore((s) => s.guests)
  const tables = useSeatingStore((s) => s.tables)
  const getUnassignedGuests = useSeatingStore((s) => s.getUnassignedGuests)
  const autoAssignGuests = useSeatingStore((s) => s.autoAssignGuests)

  const [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState(false)

  const CATEGORY_BG: Record<string, string> = { '男方': '#DBEAFE', '女方': '#FEE2E2', '共同': '#F3F4F6' }
  const CATEGORY_CLR: Record<string, string> = { '男方': '#1E40AF', '女方': '#991B1B', '共同': '#374151' }

  const animateAutoAssign = async () => {
    setAssigning(true)
    const svgEl = document.getElementById('floorplan-svg') as SVGSVGElement | null
    const ctm = svgEl?.getScreenCTM()

    // Step 1: 記錄每位待排賓客在側欄的螢幕位置
    const unassigned = getUnassignedGuests()
    const chipPositions = new Map<string, { x: number; y: number }>()
    for (const g of unassigned) {
      const el = document.querySelector(`[data-guest-id="${g.id}"]`)
      if (el) {
        const rect = el.getBoundingClientRect()
        chipPositions.set(g.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      }
    }

    // Step 2: 預先隱藏整個賓客圖層 + 抑制所有互動
    // isResetting 隱藏整個賓客 <g> 層（含 arcs、icons、空位）
    useSeatingStore.setState({
      isResetting: true,
      hoverSuppressedUntil: Date.now() + 5000, // 足夠長，cleanup 時會自然過期
      hoveredGuestId: null,
    })

    // Step 3: 執行分配
    try {
      await autoAssignGuests()
    } catch (err: any) {
      useSeatingStore.setState({ isResetting: false })
      alert(err.message || '自動分配失敗')
      setAssigning(false)
      return
    }

    // Step 4: 計算每位賓客在桌上的目標螢幕位置
    if (!svgEl || !ctm || chipPositions.size === 0) {
      useSeatingStore.setState({ isResetting: false })
      setAssigning(false)
      return
    }

    const latestGuests = useSeatingStore.getState().guests
    const latestTables = useSeatingStore.getState().tables
    const newCtm = svgEl.getScreenCTM()
    if (!newCtm) { setAssigning(false); return }

    const vb = svgEl.viewBox.baseVal
    const svgRect = svgEl.getBoundingClientRect()
    const svgScale = svgRect.width / vb.width
    const circleSize = 40 * svgScale
    const fontSize = Math.max(10, Math.round(16 * svgScale))

    // 建立浮動 overlay
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
    document.body.appendChild(overlay)

    const chips: HTMLDivElement[] = []
    const targets: Array<{ x: number; y: number }> = []

    for (const [guestId, fromPos] of chipPositions) {
      const guest = latestGuests.find((g) => g.id === guestId)
      if (!guest?.assignedTableId) continue

      const table = latestTables.find((t) => t.id === guest.assignedTableId)
      if (!table) continue

      // 計算目標座位的螢幕位置
      const radius = Math.max(58 + Math.min(table.capacity, 12) * 7, 88)
      const seatRadius = radius - 34
      const seatIndex = guest.seatIndex ?? 0
      const angle = ((2 * Math.PI) / table.capacity) * seatIndex - Math.PI / 2
      const seatSvgX = table.positionX + Math.cos(angle) * seatRadius
      const seatSvgY = table.positionY + Math.sin(angle) * seatRadius

      const pt = svgEl.createSVGPoint()
      pt.x = seatSvgX
      pt.y = seatSvgY
      const screenPt = pt.matrixTransform(newCtm)

      const displayName = guest.name.length <= 2 ? guest.name : guest.name.slice(-2)
      const chip = document.createElement('div')
      chip.textContent = displayName
      chip.style.cssText = `
        position:fixed;
        left:${fromPos.x}px;
        top:${fromPos.y}px;
        transform:translate(-50%,-50%);
        width:${circleSize}px;
        height:${circleSize}px;
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:${fontSize}px;
        font-weight:500;
        font-family:'Noto Sans TC',sans-serif;
        background:${CATEGORY_BG[guest.category] || '#F3F4F6'};
        color:${CATEGORY_CLR[guest.category] || '#374151'};
        border:1.5px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.15);
        pointer-events:none;
        transition:all 500ms cubic-bezier(0.4, 0, 0.2, 1);
        z-index:9999;
      `
      overlay.appendChild(chip)
      chips.push(chip)
      targets.push({ x: screenPt.x, y: screenPt.y })
    }

    // Step 4: 觸發飛行動畫
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chips.forEach((chip, i) => {
          chip.style.left = `${targets[i].x}px`
          chip.style.top = `${targets[i].y}px`
          chip.style.transitionDelay = `${i * 20}ms`
        })
      })
    })

    // 動畫結束後清理：等最後一個 chip 飛完再顯示
    // 總時間 = 最後一個 chip 的 delay + transition duration + buffer
    const totalAnimTime = chips.length * 20 + 500 + 100
    setTimeout(() => {
      useSeatingStore.setState({ isResetting: false })
      setTimeout(() => overlay.remove(), 200)
      setAssigning(false)
    }, totalAnimTime)
  }

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
          background: isOver ? 'var(--accent-light)' : 'transparent',
          transition: 'background 150ms ease',
        }}
      >
        {/* Header + 搜尋 */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-medium uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>
                未安排
              </span>
              <span className="text-base font-data font-medium" style={{ color: unassignedGuests.length > 0 ? '#EA580C' : 'var(--text-muted)' }}>
                {unassignedGuests.length} 人
              </span>
              {totalUnassignedSeats !== unassignedGuests.length && (
                <span className="text-sm font-data" style={{ color: 'var(--text-muted)' }}>
                  / {totalUnassignedSeats} 席
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unassignedGuests.length > 0 && tables.length > 0 && (
                <button
                  onClick={animateAutoAssign}
                  disabled={assigning}
                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded cursor-pointer disabled:opacity-50 hover:brightness-90"
                  style={{ background: 'var(--accent)', color: 'white', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-display)' }}
                  title="自動分配所有待排賓客"
                >
                  <Wand2 size={12} />
                  {assigning ? '分配中...' : '自動分配'}
                </button>
              )}
              {isOver && (
                <span className="text-xs" style={{ color: 'var(--accent-dark)' }}>放開以取消安排</span>
              )}
              {onCollapse && (
                <button
                  onClick={onCollapse}
                  className="flex items-center justify-center w-6 h-6 rounded cursor-pointer hover:bg-[var(--accent-light)]"
                  style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                  title="收合側邊欄"
                >
                  <ChevronLeft size={14} />
                </button>
              )}
            </div>
          </div>
          <input
            type="text"
            placeholder="搜尋賓客..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-base px-2.5 py-2 rounded-md"
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
            <p className="text-base py-1" style={{ color: '#16A34A' }}>所有賓客都已安排完畢</p>
          ) : grouped.length === 0 ? (
            <p className="text-base py-1" style={{ color: 'var(--text-muted)' }}>找不到「{search}」</p>
          ) : (
            <div className="space-y-4">
              {(() => {
                // 計算全域動畫索引
                let globalIdx = 0
                return grouped.map(({ category, subGroups }) => {
                const style = CATEGORY_STYLES[category]
                const totalCount = subGroups.reduce((s, sg) => s + sg.guests.length, 0)
                return (
                  <div key={category}>
                    {/* 分類標頭 */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="text-sm font-medium px-1.5 py-0.5 rounded"
                        style={{
                          background: style?.bg ?? '#F3F4F6',
                          color: style?.text ?? '#374151',
                          border: `1px solid ${style?.border ?? '#D1D5DB'}`,
                        }}
                      >
                        {category}
                      </span>
                      <span className="text-sm font-data" style={{ color: 'var(--text-muted)' }}>
                        {totalCount}
                      </span>
                    </div>
                    {/* 標籤子分組 */}
                    <div className="space-y-2 pl-2" style={{ borderLeft: `2px solid ${style?.border ?? '#D1D5DB'}` }}>
                      {subGroups.map(({ tagName, guests: sgGuests }) => (
                        <div key={tagName ?? '__no_tag__'}>
                          {tagName && (
                            <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
                              {tagName}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {sgGuests.map((g) => (
                              <GuestChip key={g.id} guest={g} animIndex={globalIdx++} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
