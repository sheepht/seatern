import { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDroppable } from '@dnd-kit/core'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Wand2, Scale, Star, Plus, Save, Undo2, Redo2, Ban, Shuffle, LayoutGrid, Download, Trash2, Dices, History } from 'lucide-react'
import { useSeatingStore } from '@/stores/seating'
import { estimateAutoAssignTimeInWorker } from '@/lib/auto-assign-client'
import { getSatisfactionColor, recalculateAll } from '@/lib/satisfaction'
import { computeSnapshotStats, computeCurrentStats } from '@/lib/snapshot-stats'
import { findFreePosition, calculateGridLayout } from '@/lib/viewport'
import { GuestChip } from './GuestChip'
import { AvoidPairModal } from './AvoidPairModal'
import { getCategoryColor, loadCategoryColors } from '@/lib/category-colors'
import type { AutoAssignMode } from '@/lib/auto-assign'

function CollapseButton({ onCollapse }: { onCollapse: () => void }) {
  const [show, setShow] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const rect = btnRef.current?.getBoundingClientRect()
  return (
    <>
      <button
        ref={btnRef}
        onClick={onCollapse}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="flex items-center justify-center w-6 h-6 rounded cursor-pointer hover:bg-[var(--accent-light)]"
        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
      >
        <ChevronLeft size={14} />
      </button>
      {show && rect && createPortal(
        <div style={{
          position: 'fixed',
          left: rect.right + 8,
          top: rect.top + rect.height / 2,
          transform: 'translateY(-50%)',
          background: 'var(--bg-surface, #fff)',
          color: 'var(--text-secondary, #78716C)',
          border: '1px solid var(--border, #E7E5E4)',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 9999,
          fontFamily: 'var(--font-body)',
          boxShadow: '0 4px 12px rgba(28,25,23,0.08)',
        }}>
          收合待排區 <kbd style={{ background: '#F5F5F4', border: '1px solid var(--border, #E7E5E4)', borderRadius: 3, padding: '1px 4px', fontSize: 10, marginLeft: 4, color: 'var(--text-primary, #1C1917)' }}>Q</kbd>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Popover tooltip（顯示在按鈕上方） */
function Tip({ text, children }: { text: string; children: React.ReactElement }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const rect = ref.current?.getBoundingClientRect()
  return (
    <div ref={ref} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} style={{ display: 'inline-flex' }}>
      {children}
      {show && rect && createPortal(
        <div style={{
          position: 'fixed',
          left: rect.left + rect.width / 2,
          top: rect.top - 8,
          transform: 'translate(-50%, -100%)',
          background: 'var(--bg-surface, #fff)',
          color: 'var(--text-secondary, #78716C)',
          border: '1px solid var(--border, #E7E5E4)',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 9999,
          fontFamily: 'var(--font-body)',
          boxShadow: '0 4px 12px rgba(28,25,23,0.08)',
        }}>
          {text}
        </div>,
        document.body,
      )}
    </div>
  )
}

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

const CATEGORY_ORDER = ['男方', '女方', '共同']

export function SidePanel({ onCollapse, onPanToTable }: { onCollapse?: () => void; onPanToTable?: (x: number, y: number) => void }) {
  const guests = useSeatingStore((s) => s.guests)
  const tables = useSeatingStore((s) => s.tables)
  const eventId = useSeatingStore((s) => s.eventId)
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId])
  const getUnassignedGuests = useSeatingStore((s) => s.getUnassignedGuests)
  const autoAssignGuests = useSeatingStore((s) => s.autoAssignGuests)
  const autoAssignProgress = useSeatingStore((s) => s.autoAssignProgress)
  const addTable = useSeatingStore((s) => s.addTable)
  const undo = useSeatingStore((s) => s.undo)
  const undoStack = useSeatingStore((s) => s.undoStack)
  const saveSnapshot = useSeatingStore((s) => s.saveSnapshot)
  const snapshots = useSeatingStore((s) => s.snapshots)
  const resetAllSeats = useSeatingStore((s) => s.resetAllSeats)
  const removeTable = useSeatingStore((s) => s.removeTable)
  const autoArrangeTables = useSeatingStore((s) => s.autoArrangeTables)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const restoreSnapshot = useSeatingStore((s) => s.restoreSnapshot)

  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [showModeModal, setShowModeModal] = useState(false)
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAvoidModal, setShowAvoidModal] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [showArrangeConfirm, setShowArrangeConfirm] = useState(false)
  const [arranging, setArranging] = useState(false)
  const [adding, setAdding] = useState(false)

  const handleAddTable = async () => {
    setAdding(true)
    const num = tables.length + 1
    const pos = findFreePosition(tables)
    await addTable(`第${num}桌`, pos.x, pos.y)
    onPanToTable?.(pos.x, pos.y)
    setAdding(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const now = new Date()
    const name = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    await saveSnapshot(name)
    setSaving(false)
  }

  const isDev = import.meta.env.DEV

  const handleRandomAssign = () => {
    const { avoidPairs, undoStack } = useSeatingStore.getState()
    const allConfirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')
    const shuffled = [...allConfirmed]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    shuffled.length = Math.ceil(shuffled.length * 0.75)
    const remaining = new Map<string, number>()
    const nextSeat = new Map<string, number>()
    for (const t of tables) { remaining.set(t.id, t.capacity); nextSeat.set(t.id, 0) }
    const assignments = new Map<string, { tableId: string; seatIndex: number }>()
    for (const g of shuffled) {
      const avail = tables.find((t) => (remaining.get(t.id) || 0) >= g.attendeeCount)
      if (avail) {
        const seat = nextSeat.get(avail.id) || 0
        assignments.set(g.id, { tableId: avail.id, seatIndex: seat })
        remaining.set(avail.id, (remaining.get(avail.id) || 0) - g.attendeeCount)
        nextSeat.set(avail.id, seat + g.attendeeCount)
      }
    }
    const updatedGuests = guests.map((g) => {
      const a = assignments.get(g.id)
      if (a) return { ...g, assignedTableId: a.tableId, seatIndex: a.seatIndex }
      if (g.rsvpStatus === 'confirmed') return { ...g, assignedTableId: null as string | null | undefined, seatIndex: null }
      return g
    })
    const result = recalculateAll(updatedGuests, tables, avoidPairs)
    const finalGuests = updatedGuests.map((g) => { const s = result.guests.find((gs) => gs.id === g.id); return s ? { ...g, satisfactionScore: s.satisfactionScore } : g })
    const finalTables = tables.map((t) => { const s = result.tables.find((ts) => ts.id === t.id); return s ? { ...t, averageSatisfaction: s.averageSatisfaction } : t })
    useSeatingStore.setState({
      guests: finalGuests, tables: finalTables,
      undoStack: [...undoStack, { type: 'auto-assign' as const, assignments: allConfirmed.map((g) => ({ guestId: g.id, fromTableId: g.assignedTableId || null, fromSeatIndex: g.seatIndex })), createdTableIds: [] }],
    })
    const { eventId } = useSeatingStore.getState()
    if (eventId) {
      const confirmed = finalGuests.filter((g) => g.rsvpStatus === 'confirmed')
      fetch(`/api/events/${eventId}/guests/assign-batch`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ assignments: confirmed.map((g) => ({ guestId: g.id, tableId: g.assignedTableId ?? null, seatIndex: g.seatIndex ?? null })) }),
      }).catch(console.error)
    }
  }

  const handleDeleteEmptyTables = async () => {
    const emptyTables = tables.filter((t) => !guests.some((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed'))
    for (const t of emptyTables) await removeTable(t.id)
  }

  const handleAutoArrange = async () => {
    setArranging(true)
    setShowArrangeConfirm(false)
    try {
      const svg = document.getElementById('floorplan-svg') as SVGSVGElement | null
      const vb = svg?.viewBox.baseVal
      let positions: ReturnType<typeof calculateGridLayout>
      if (vb && vb.width > 0) {
        const padding = 100
        const areaW = vb.width - padding * 2
        const areaH = vb.height - padding * 2
        const cols = Math.ceil(Math.sqrt(tables.length))
        const rows = Math.ceil(tables.length / cols)
        const spacingX = cols > 1 ? areaW / (cols - 1) : 0
        const spacingY = rows > 1 ? areaH / (rows - 1) : 0
        positions = tables.map((t, i) => ({
          tableId: t.id,
          x: vb.x + padding + (i % cols) * spacingX,
          y: vb.y + padding + Math.floor(i / cols) * spacingY,
        }))
      } else {
        positions = calculateGridLayout(tables)
      }
      await autoArrangeTables(positions)
    } catch (err: any) {
      alert(err.message || '保存失敗，已恢復原排列')
    } finally {
      setArranging(false)
    }
  }

  const animateAutoAssign = async (mode: AutoAssignMode = 'balanced') => {
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

    // Step 2: 隱藏「待排賓客」的桌上圓圈 + 抑制互動
    // 只隱藏即將飛入的賓客，已在桌上的賓客保持可見
    const flyingIds = new Set(unassigned.map((g) => g.id))
    useSeatingStore.setState({
      flyingGuestIds: flyingIds,
      hoverSuppressedUntil: Date.now() + 5000, // 足夠長，cleanup 時會自然過期
      hoveredGuestId: null,
    })

    // Step 3: 執行分配
    try {
      await autoAssignGuests(mode)
    } catch (err: any) {
      useSeatingStore.setState({ flyingGuestIds: new Set() })
      alert(err.message || '自動分配失敗')
      setAssigning(false)
      return
    }

    // Step 4: 計算每位賓客在桌上的目標螢幕位置
    if (!svgEl || !ctm || chipPositions.size === 0) {
      useSeatingStore.setState({ flyingGuestIds: new Set() })
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
        background:${getCategoryColor(guest.category, categoryColors).background};
        color:${getCategoryColor(guest.category, categoryColors).color};
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
      useSeatingStore.setState({ flyingGuestIds: new Set() })
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
      const subcatNames = Array.from(
        new Set(catGuests.map((g) => g.subcategory?.name).filter(Boolean))
      ) as string[]
      const subGroups = [
        ...subcatNames.map((tagName) => ({
          tagName,
          guests: catGuests.filter((g) => g.subcategory?.name === tagName),
        })),
        // 無任何子分類的賓客
        {
          tagName: null,
          guests: catGuests.filter((g) => !g.subcategory),
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
              {unassignedGuests.length > 0 && (
                <button
                  onClick={async () => {
                    setShowModeModal(true)
                    setEstimatedTime(null)
                    const t = await estimateAutoAssignTimeInWorker(guests, tables, avoidPairs)
                    setEstimatedTime(t)
                  }}
                  disabled={assigning}
                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded cursor-pointer disabled:opacity-50 hover:brightness-90"
                  style={{ background: 'var(--accent)', color: 'white', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-display)' }}
                  title="自動分配所有待排賓客"
                >
                  <Wand2 size={12} />
                  自動分配
                </button>
              )}
              {isOver && (
                <span className="text-xs" style={{ color: 'var(--accent-dark)' }}>放開以取消安排</span>
              )}
              {onCollapse && <CollapseButton onCollapse={onCollapse} />}
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
                const catColor = getCategoryColor(category, categoryColors)
                const totalCount = subGroups.reduce((s, sg) => s + sg.guests.length, 0)
                return (
                  <div key={category}>
                    {/* 分類標頭 */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="text-sm font-medium px-1.5 py-0.5 rounded"
                        style={{
                          background: catColor.background,
                          color: catColor.color,
                          border: `1px solid ${catColor.border}`,
                        }}
                      >
                        {category}
                      </span>
                      <span className="text-sm font-data" style={{ color: 'var(--text-muted)' }}>
                        {totalCount}
                      </span>
                    </div>
                    {/* 標籤子分組 */}
                    <div className="space-y-2 pl-2" style={{ borderLeft: `2px solid ${catColor.border}` }}>
                      {subGroups.map(({ tagName, guests: sgGuests }) => (
                        <div key={tagName ?? '__no_subcat__'}>
                          <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
                            {tagName ?? '未分類'}
                          </div>
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

      {/* 操作列 */}
      <div className="shrink-0 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        {/* 第一列：儲存/讀取 + 還原/重做 */}
        <div className="flex gap-2 mb-2">
          <div className="flex" style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', borderRight: '1px solid var(--border)', fontSize: 14 }}>
              <Save size={14} /> {saving ? '儲存中...' : '儲存'}
            </button>
            <button onClick={() => setShowRestoreConfirm(true)} disabled={snapshots.length === 0} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontSize: 14 }}>
              <History size={14} /> 讀取
            </button>
          </div>
          <div className="flex" style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <button onClick={() => undo()} disabled={undoStack.length === 0} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', borderRight: '1px solid var(--border)', fontSize: 14 }}>
              <Undo2 size={14} /> 還原
            </button>
            <button disabled className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontSize: 14 }}>
              <Redo2 size={14} /> 重做
            </button>
          </div>
        </div>
        {/* 第二列：新桌/清桌、重排 */}
        <div className="flex flex-wrap gap-2">
          {/* 新桌 / 清桌 group */}
          <div className="flex" style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <Tip text="新增一張空桌">
              <button onClick={handleAddTable} disabled={adding} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', borderRight: '1px solid var(--border)', fontSize: 14 }}>
                <Plus size={14} /> 新桌
              </button>
            </Tip>
            <Tip text="刪除所有沒人坐的桌子">
              <button onClick={handleDeleteEmptyTables} disabled={tables.filter((t) => !guests.some((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed')).length === 0} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontSize: 14 }}>
                <Trash2 size={14} /> 清桌
              </button>
            </Tip>
          </div>
          {/* 重排 */}
          <Tip text="清除所有座位安排，賓客回到待排區">
            <button onClick={() => resetAllSeats()} disabled={guests.filter(g => g.assignedTableId).length === 0} className="flex items-center gap-1 px-2.5 py-1.5 font-medium rounded border cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)]" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-ui)', fontSize: 14 }}>
              <Shuffle size={14} /> 重排
            </button>
          </Tip>
        </div>
        {/* DEV 工具列 */}
        {isDev && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2" style={{ borderTop: '1px dashed var(--border)' }}>
            <button onClick={handleAutoArrange} disabled={tables.length === 0 || arranging} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-purple-50" style={{ color: '#7C3AED', borderColor: '#C4B5FD', borderRadius: 'var(--radius-sm)' }}>
              <LayoutGrid size={12} /> {arranging ? '排列中...' : '排列'}
            </button>
            {tables.length > 0 && (
              <button onClick={handleRandomAssign} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border cursor-pointer hover:bg-purple-50" style={{ color: '#7C3AED', borderColor: '#C4B5FD', borderRadius: 'var(--radius-sm)' }}>
                <Dices size={12} /> 隨機
              </button>
            )}
          </div>
        )}
      </div>

      {showAvoidModal && <AvoidPairModal onClose={() => setShowAvoidModal(false)} />}

      {showRestoreConfirm && snapshots.length > 0 && (() => {
        const snap = snapshots[0]
        const snapStats = computeSnapshotStats(snap.data, snap.averageSatisfaction)
        const currStats = computeCurrentStats(guests, tables)
        const satItems = [
          { key: 'green' as const, color: '#16A34A', label: '滿意' },
          { key: 'yellow' as const, color: '#CA8A04', label: '尚可' },
          { key: 'orange' as const, color: '#EA580C', label: '不滿' },
          { key: 'red' as const, color: '#DC2626', label: '糟糕' },
        ]
        const StatColumn = ({ label, stats }: { label: string; stats: typeof snapStats }) => {
          const seatedTotal = stats.green + stats.yellow + stats.orange + stats.red
          const assignPct = stats.total > 0 ? Math.round((stats.assigned / stats.total) * 100) : 0
          const assignBarColor = getSatisfactionColor(assignPct)
          const segments = satItems.filter(({ key }) => stats[key] > 0)
          return (
            <div className="flex-1 min-w-0">
              <div className="mb-3" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', fontFamily: 'var(--font-display)' }}>{label}</div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-data font-semibold" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{stats.assigned}/{stats.total} 人</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>已安排</span>
              </div>
              <div className="flex mb-3" style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--border)' }}>
                {assignPct > 0 && <div style={{ width: `${assignPct}%`, background: assignBarColor, transition: 'width 0.3s' }} />}
              </div>
              <div className="flex mb-2" style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--border)', gap: segments.length > 1 ? '1px' : 0 }}>
                {seatedTotal > 0 && segments.map(({ key, color }) => (
                  <div key={key} style={{ width: `${(stats[key] / seatedTotal) * 100}%`, background: color }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ fontSize: '11px' }}>
                {satItems.map(({ key, color, label: satLabel }) =>
                  stats[key] > 0 ? <span key={key} className="font-data" style={{ color }}>{satLabel} {stats[key]}人</span> : null
                )}
              </div>
              <div className="flex gap-3 mt-2" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>{stats.tableCount} 桌</span>
                {stats.overflowCount > 0 && <span style={{ color: 'var(--warning)' }}>溢出 {stats.overflowCount}人</span>}
              </div>
            </div>
          )
        }
        return createPortal(
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowRestoreConfirm(false)}>
            <div role="dialog" aria-modal="true" className="bg-white w-full max-w-md p-6 mx-4" style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>讀取快照</h2>
              <p className="mb-4" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                還原到：<span className="font-medium" style={{ color: 'var(--text-primary)' }}>{snap.name}</span>
              </p>
              <div className="flex gap-3 pb-4 mb-4 flex-col min-[480px]:flex-row min-[480px]:items-stretch" style={{ borderBottom: '1px solid var(--border)' }}>
                <StatColumn label="目前" stats={currStats} />
                <div className="hidden min-[480px]:flex items-center justify-center" style={{ width: '24px', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="flex min-[480px]:hidden items-center justify-center py-1">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M4 9l4 4 4-4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <StatColumn label="快照" stats={snapStats} />
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--warning)' }}>目前的排位將被覆蓋，還原記錄會清空。</p>
              <div className="flex gap-3">
                <button onClick={() => setShowRestoreConfirm(false)} className="flex-1 py-2 text-sm font-medium rounded border cursor-pointer hover:bg-[var(--bg-primary)]" style={{ borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>取消</button>
                <button onClick={() => { restoreSnapshot(snap.id); setShowRestoreConfirm(false) }} className="flex-1 py-2 text-sm font-semibold text-white rounded cursor-pointer hover:brightness-90" style={{ background: 'var(--accent)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-display)' }}>還原</button>
              </div>
            </div>
          </div>,
          document.body
        )
      })()}

      {showModeModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} onClick={() => setShowModeModal(false)} />
          <div style={{ position: 'relative', background: 'var(--bg-surface)', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '28px', width: '400px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', fontFamily: 'var(--font-display)' }}>
              選擇分配模式
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {estimatedTime !== null && (
                estimatedTime < 5 ? '預估幾秒內完成' :
                estimatedTime < 60 ? `預估約 ${estimatedTime} 秒` :
                `預估約 ${Math.ceil(estimatedTime / 60)} 分鐘`
              )}
              {estimatedTime !== null && ` · ${unassignedGuests.length} 位待排賓客 · ${tables.length} 桌`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 均衡模式 */}
              <button
                onClick={() => { setShowModeModal(false); animateAutoAssign('balanced') }}
                className="cursor-pointer hover:brightness-95"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '14px',
                  padding: '16px', borderRadius: '10px',
                  border: '1px solid var(--border)', background: 'var(--bg-primary)',
                  textAlign: 'left',
                }}
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: '2px', height: '72px', flexShrink: 0, marginTop: '2px' }}>
                  {[25, 50, 75, 100].map((pct) => (
                    <div key={pct} style={{ position: 'absolute', bottom: `${pct}%`, left: 0, right: 0, borderTop: '1px dashed #9CA3AF', opacity: 0.6 }} />
                  ))}
                  {[68, 70, 72, 75, 75, 75, 75, 75, 75, 75].map((h, i) => (
                    <div key={i} style={{
                      width: '4px', borderRadius: '1.5px', position: 'relative', zIndex: 1,
                      height: `${h}%`,
                      background: h >= 75 ? '#16A34A' : h >= 50 ? '#CA8A04' : h >= 25 ? '#EA580C' : '#DC2626',
                    }} />
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    均衡模式
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '8px' }}>
                    最大化全場平均滿意度，讓每個人都盡量滿意
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                    <div style={{ color: '#16A34A' }}>✓ 整體分數較高，落差較小</div>
                    <div style={{ color: '#EA580C' }}>△ 極高分的人可能較少</div>
                  </div>
                </div>
              </button>
              {/* 極致模式 */}
              <button
                onClick={() => { setShowModeModal(false); animateAutoAssign('maximize-happy') }}
                className="cursor-pointer hover:brightness-95"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '14px',
                  padding: '16px', borderRadius: '10px',
                  border: '1px solid var(--border)', background: 'var(--bg-primary)',
                  textAlign: 'left',
                }}
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: '2px', height: '72px', flexShrink: 0, marginTop: '2px' }}>
                  {[25, 50, 75, 100].map((pct) => (
                    <div key={pct} style={{ position: 'absolute', bottom: `${pct}%`, left: 0, right: 0, borderTop: '1px dashed #9CA3AF', opacity: 0.6 }} />
                  ))}
                  {[28, 32, 62, 66, 70, 74, 76, 78, 100, 100].map((h, i) => (
                    <div key={i} style={{
                      width: '4px', borderRadius: '1.5px', position: 'relative', zIndex: 1,
                      height: `${h}%`,
                      background: h >= 75 ? '#16A34A' : h >= 50 ? '#CA8A04' : h >= 25 ? '#EA580C' : '#DC2626',
                    }} />
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    極致模式
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '8px' }}>
                    盡量讓關係好的人湊在一起，衝高滿意度
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                    <div style={{ color: '#16A34A' }}>✓ 更多人達到極高滿意度</div>
                    <div style={{ color: '#EA580C' }}>△ 部分人的分數可能較低</div>
                  </div>
                </div>
              </button>
            </div>
            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button
                onClick={() => setShowModeModal(false)}
                className="cursor-pointer hover:bg-black/5"
                style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '14px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)' }}
              >
                取消
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
