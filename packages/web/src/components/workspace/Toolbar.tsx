import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Pencil, Menu, History, Ban, Shuffle, Download, Lock, Plus, Save, Undo2, LayoutGrid, Trash2, Dices } from 'lucide-react'
import { useSeatingStore } from '@/stores/seating'
import { getSatisfactionColor, recalculateAll } from '@/lib/satisfaction'
import { calculateGridLayout, findFreePosition } from '@/lib/viewport'
import { AvoidPairModal } from './AvoidPairModal'
import { computeSnapshotStats, computeCurrentStats } from '@/lib/snapshot-stats'

interface ToolbarProps {
  onFitAll?: () => void
  onPanToTable?: (x: number, y: number) => void
}

export function Toolbar({ onFitAll, onPanToTable }: ToolbarProps = {}) {
  const eventName = useSeatingStore((s) => s.eventName)
  const tables = useSeatingStore((s) => s.tables)
  const addTable = useSeatingStore((s) => s.addTable)
  const undo = useSeatingStore((s) => s.undo)
  const undoStack = useSeatingStore((s) => s.undoStack)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const snapshots = useSeatingStore((s) => s.snapshots)
  const saveSnapshot = useSeatingStore((s) => s.saveSnapshot)
  const restoreSnapshot = useSeatingStore((s) => s.restoreSnapshot)
  const guests = useSeatingStore((s) => s.guests)
  const getTotalAssignedSeats = useSeatingStore((s) => s.getTotalAssignedSeats)
  const getTotalConfirmedSeats = useSeatingStore((s) => s.getTotalConfirmedSeats)
  const dragPreview = useSeatingStore((s) => s.dragPreview)
  const recommendationPreviewScores = useSeatingStore((s) => s.recommendationPreviewScores)
  const navigate = useNavigate()

  const updateEventName = useSeatingStore((s) => s.updateEventName)

  const resetAllSeats = useSeatingStore((s) => s.resetAllSeats)

  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAvoidModal, setShowAvoidModal] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showRenameEvent, setShowRenameEvent] = useState(false)
  const [renameEventValue, setRenameEventValue] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showArrangeConfirm, setShowArrangeConfirm] = useState(false)
  const [arranging, setArranging] = useState(false)
  const autoArrangeTables = useSeatingStore((s) => s.autoArrangeTables)
  const removeTable = useSeatingStore((s) => s.removeTable)
  const isDev = import.meta.env.DEV

  const handleRenameEvent = () => {
    const trimmed = renameEventValue.trim()
    if (trimmed) updateEventName(trimmed)
    setShowRenameEvent(false)
  }

  const handleAddTable = async () => {
    setAdding(true)
    const num = tables.length + 1
    const pos = findFreePosition(tables)
    await addTable(`第${num}桌`, pos.x, pos.y)
    // 畫面平移到新桌子（不改 zoom）
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

  const handleRestore = () => {
    if (snapshots.length === 0) return
    setShowRestoreConfirm(true)
  }

  const confirmRestore = () => {
    restoreSnapshot(snapshots[0].id)
    setShowRestoreConfirm(false)
  }

  const handleAutoArrange = async () => {
    setArranging(true)
    setShowArrangeConfirm(false)
    try {
      const positions = calculateGridLayout(tables)
      await autoArrangeTables(positions)
      // 排完後自動 fit-all
      onFitAll?.()
    } catch (err: any) {
      alert(err.message || '保存失敗，已恢復原排列')
    } finally {
      setArranging(false)
    }
  }

  const CATEGORY_BG: Record<string, string> = { '男方': '#DBEAFE', '女方': '#FEE2E2', '共同': '#F3F4F6' }
  const CATEGORY_CLR: Record<string, string> = { '男方': '#1E40AF', '女方': '#991B1B', '共同': '#374151' }
  const CATEGORY_BD: Record<string, string> = { '男方': '#BFDBFE', '女方': '#FECACA', '共同': '#D1D5DB' }

  // 計算賓客在桌上的螢幕位置
  const getSeatScreenPos = (
    svgEl: SVGSVGElement,
    ctm: DOMMatrix,
    table: { positionX: number; positionY: number; capacity: number },
    seatIndex: number,
  ) => {
    const radius = Math.max(58 + Math.min(table.capacity, 12) * 7, 88)
    const seatRadius = radius - 34
    const angle = ((2 * Math.PI) / table.capacity) * seatIndex - Math.PI / 2
    const seatSvgX = table.positionX + Math.cos(angle) * seatRadius
    const seatSvgY = table.positionY + Math.sin(angle) * seatRadius
    const pt = svgEl.createSVGPoint()
    pt.x = seatSvgX
    pt.y = seatSvgY
    return pt.matrixTransform(ctm)
  }

  // 建立浮動圓圈元素
  const createChip = (
    guest: typeof guests[0],
    screenX: number,
    screenY: number,
    circleSize: number,
    fontSize: number,
  ) => {
    const displayName = guest.name.length <= 2 ? guest.name : guest.name.slice(-2)
    const chip = document.createElement('div')
    chip.textContent = displayName
    chip.style.cssText = `
      position:fixed;
      left:${screenX}px;
      top:${screenY}px;
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
    return chip
  }

  const animateUndo = () => {
    if (undoStack.length === 0) return

    // 非賓客移動（新增桌、移動桌）直接 undo，不需飛行動畫
    const last = undoStack[undoStack.length - 1]
    if (last.type === 'add-table' || last.type === 'rename-table') { undo(); return }

    // 移動桌子：用 SVG 動畫滑回原位
    if (last.type === 'move-table') {
      const tableEl = document.querySelector(`[data-table-id="${last.tableId}"]`) as SVGGElement | null
      if (!tableEl) { undo(); return }
      const { fromX, fromY, toX, toY } = last
      tableEl.animate(
        [
          { transform: `translate(${toX}px, ${toY}px)` },
          { transform: `translate(${fromX}px, ${fromY}px)` },
        ],
        { duration: 400, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      ).onfinish = () => undo()
      return
    }

    const svgEl = document.getElementById('floorplan-svg') as SVGSVGElement | null
    if (!svgEl) { undo(); return }
    const ctm = svgEl.getScreenCTM()
    if (!ctm) { undo(); return }

    const vb = svgEl.viewBox.baseVal
    const svgRect = svgEl.getBoundingClientRect()
    const svgScale = svgRect.width / vb.width
    const circleSize = 40 * svgScale
    const fontSize = Math.max(10, Math.round(16 * svgScale))

    // 找出即將被 undo 的 entries（last 已在上方宣告，且 add-table 已 early return）
    const entriesToUndo = 'batchId' in last && last.batchId
      ? undoStack.filter((e) => e.batchId === last.batchId)
      : [last]

    // sidebar 位置（用於 unassigned 賓客）
    const sidebarEl = document.querySelector('[data-droppable-id="unassigned"]') || document.querySelector('.overflow-y-auto')
    const sidebarRect = sidebarEl?.getBoundingClientRect()
    const sidebarX = 144
    const sidebarTop = sidebarRect ? sidebarRect.top + 20 : 100
    const sidebarHeight = sidebarRect ? sidebarRect.height - 40 : 400

    // 收集每個受影響賓客的 起點 & 終點
    type AnimItem = { guest: typeof guests[0]; fromX: number; fromY: number; toX: number; toY: number }
    const animItems: AnimItem[] = []

    for (const entry of entriesToUndo) {
      const guest = guests.find((g) => g.id === entry.guestId)
      if (!guest) continue

      // 起點：賓客目前的位置
      let fromX: number, fromY: number
      const currentTable = guest.assignedTableId ? tables.find((t) => t.id === guest.assignedTableId) : null
      if (currentTable && guest.seatIndex !== null) {
        const pos = getSeatScreenPos(svgEl, ctm, currentTable, guest.seatIndex)
        fromX = pos.x
        fromY = pos.y
      } else {
        // 在 sidebar 中 — 嘗試找到 DOM 元素位置
        const chipEl = document.querySelector(`[data-guest-id="${guest.id}"]`)
        if (chipEl) {
          const r = chipEl.getBoundingClientRect()
          fromX = r.left + r.width / 2
          fromY = r.top + r.height / 2
        } else {
          fromX = sidebarX
          fromY = sidebarTop + Math.random() * sidebarHeight
        }
      }

      // 終點：undo 後賓客回到的位置
      let toX: number, toY: number
      const targetTable = entry.fromTableId ? tables.find((t) => t.id === entry.fromTableId) : null
      const targetSeatIndex = entry.prevSeatIndices.get(guest.id) ?? 0
      if (targetTable && entry.fromTableId) {
        const pos = getSeatScreenPos(svgEl, ctm, targetTable, targetSeatIndex)
        toX = pos.x
        toY = pos.y
      } else {
        // 回到 sidebar
        toX = sidebarX
        toY = sidebarTop + Math.random() * sidebarHeight
      }

      animItems.push({ guest, fromX, fromY, toX, toY })
    }

    if (animItems.length === 0) { undo(); return }

    // 隱藏受影響的賓客（批量用 isResetting，單個用 flyingGuestIds）
    const isBatch = animItems.length > 3
    const flyingIds = new Set(animItems.map((item) => item.guest.id))
    if (isBatch) {
      useSeatingStore.setState({ isResetting: true })
    } else {
      useSeatingStore.setState({ flyingGuestIds: flyingIds })
    }

    // 建立 overlay
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
    document.body.appendChild(overlay)

    const chips: HTMLDivElement[] = []
    for (const item of animItems) {
      const chip = createChip(item.guest, item.fromX, item.fromY, circleSize, fontSize)
      overlay.appendChild(chip)
      chips.push(chip)
    }

    // 觸發飛行動畫
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chips.forEach((chip, i) => {
          const item = animItems[i]
          chip.style.left = `${item.toX}px`
          chip.style.top = `${item.toY}px`
          chip.style.transitionDelay = `${i * 20}ms`
        })
      })
    })

    // 動畫快結束時執行真正的 undo
    setTimeout(() => {
      undo()
      // 延遲清除 flyingGuestIds，等 React render + useLayoutEffect (FLIP) 跑完再清
      requestAnimationFrame(() => {
        if (isBatch) {
          useSeatingStore.setState({ isResetting: false })
        } else {
          useSeatingStore.setState({ flyingGuestIds: new Set() })
        }
      })
      setTimeout(() => overlay.remove(), 200)
    }, 450)
  }

  // Ctrl+Z 鍵盤快捷鍵
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        animateUndo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const animateResetToSidebar = () => {
    const svgEl = document.getElementById('floorplan-svg') as SVGSVGElement | null
    if (!svgEl) { resetAllSeats(); return }

    const ctm = svgEl.getScreenCTM()
    if (!ctm) { resetAllSeats(); return }

    const assignedGuests = guests.filter((g) => g.assignedTableId && g.rsvpStatus === 'confirmed')
    if (assignedGuests.length === 0) { resetAllSeats(); return }

    // 計算 SVG 單位到螢幕 px 的縮放比（用於圓圈大小）
    const vb = svgEl.viewBox.baseVal
    const svgRect = svgEl.getBoundingClientRect()
    const svgScale = svgRect.width / vb.width
    const circleSize = 40 * svgScale  // r=20 → 直徑 40 SVG 單位

    // 立刻隱藏桌上的 SVG 賓客，讓浮動圓圈「取代」它們
    useSeatingStore.setState({ isResetting: true })

    // sidebar 目標位置（左側面板中央偏上）
    const sidebarEl = document.querySelector('[data-droppable-id="unassigned"]') || document.querySelector('.overflow-y-auto')
    const targetX = 144  // w-72 / 2
    const targetY = sidebarEl ? sidebarEl.getBoundingClientRect().top + 40 : 200

    // 建立浮動 overlay
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
    document.body.appendChild(overlay)

    const chips: HTMLDivElement[] = []
    assignedGuests.forEach((guest) => {
      const table = tables.find((t) => t.id === guest.assignedTableId)
      if (!table) return

      // 計算座位在 SVG 中的位置
      const radius = Math.max(58 + Math.min(table.capacity, 12) * 7, 88)
      const seatRadius = radius - 34
      const seatIndex = guest.seatIndex ?? 0
      const angle = ((2 * Math.PI) / table.capacity) * seatIndex - Math.PI / 2
      const seatSvgX = table.positionX + Math.cos(angle) * seatRadius
      const seatSvgY = table.positionY + Math.sin(angle) * seatRadius

      // SVG 座標 → 螢幕座標（用 CTM 正確處理 viewBox + preserveAspectRatio）
      const pt = svgEl.createSVGPoint()
      pt.x = seatSvgX
      pt.y = seatSvgY
      const screenPt = pt.matrixTransform(ctm)
      const screenX = screenPt.x
      const screenY = screenPt.y

      const displayName = guest.name.length <= 2 ? guest.name : guest.name.slice(-2)
      const fontSize = Math.max(10, Math.round(16 * svgScale))
      const chip = document.createElement('div')
      chip.textContent = displayName
      chip.style.cssText = `
        position:fixed;
        left:${screenX}px;
        top:${screenY}px;
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
    })

    // sidebar 的可見範圍高度
    const sidebarRect = sidebarEl?.getBoundingClientRect()
    const sidebarTop = sidebarRect ? sidebarRect.top + 20 : 100
    const sidebarHeight = sidebarRect ? sidebarRect.height - 40 : 400

    // 下一幀觸發飛行動畫
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chips.forEach((chip, i) => {
          const randomY = sidebarTop + Math.random() * sidebarHeight
          chip.style.left = `${targetX}px`
          chip.style.top = `${randomY}px`
          chip.style.opacity = '0'
          chip.style.transform = 'translate(-50%,-50%)'
          chip.style.transitionDelay = `${i * 20}ms`
        })
      })
    })

    // 動畫快結束時執行真正的 reset
    setTimeout(() => {
      resetAllSeats()
      setTimeout(() => overlay.remove(), 200)
    }, 450)
  }

  const isResetting = useSeatingStore((s) => s.isResetting)

  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')
  const liveAssigned = getTotalAssignedSeats()
  const liveTotal = getTotalConfirmedSeats()
  const seated = confirmed.filter((g) => g.assignedTableId)
  const previewScores = dragPreview?.previewScores ?? (recommendationPreviewScores.size > 0 ? recommendationPreviewScores : null)
  const getScore = (g: typeof confirmed[0]) => previewScores?.get(g.id) ?? g.satisfactionScore
  const liveT = seated.length
  const liveGreen = seated.filter((g) => getScore(g) >= 75).length
  const liveYellow = seated.filter((g) => getScore(g) >= 50 && getScore(g) < 75).length
  const liveOrange = seated.filter((g) => getScore(g) >= 25 && getScore(g) < 50).length
  const liveRed = seated.filter((g) => getScore(g) < 25).length

  // 飛行動畫期間（isResetting）凍結數值，等動畫結束才更新
  const frozenStats = useRef({ assigned: liveAssigned, total: liveTotal, t: liveT, green: liveGreen, yellow: liveYellow, orange: liveOrange, red: liveRed })
  if (!isResetting) {
    frozenStats.current = { assigned: liveAssigned, total: liveTotal, t: liveT, green: liveGreen, yellow: liveYellow, orange: liveOrange, red: liveRed }
  }
  const { assigned, total, t, green, yellow, orange, red } = frozenStats.current

  return (
    <>
      <div
        className="h-14 border-b bg-white px-5 flex items-center justify-between"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Left: Brand + Event name + stats */}
        <div className="flex items-center gap-3">
          <span
            className="text-lg font-extrabold tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
          >
            Seatern
          </span>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {eventName || '未命名活動'}
          </span>
          <button
            onClick={() => { setRenameEventValue(eventName); setShowRenameEvent(true) }}
            className="flex items-center justify-center w-5 h-5 rounded cursor-pointer hover:bg-[var(--accent-light)]"
            style={{ color: 'var(--text-muted)', flexShrink: 0 }}
            title="修改活動名稱"
          >
            <Pencil size={12} />
          </button>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          {/* 安排進度 */}
          <div className="flex items-center gap-2">
            <div className="w-32 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(128,128,128,0.15)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: total > 0 ? `${Math.round((assigned / total) * 100)}%` : '0%',
                  background: getSatisfactionColor(total > 0 ? (assigned / total) * 100 : 0),
                }}
              />
            </div>
            <span className="text-sm font-data font-semibold" style={{ color: 'var(--text-secondary)' }}>{assigned}/{total} 席</span>
          </div>
          {t > 0 && <>
            <span style={{ color: 'var(--border-strong)' }}>|</span>
            {/* 滿意度分佈 */}
            <div className="flex items-center gap-2">
              <div className="w-32 h-1.5 rounded-full overflow-hidden flex" style={{ background: 'rgba(128,128,128,0.15)', gap: '1px' }}>
                {green > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(green / t) * 100}%`, background: '#16A34A' }} />}
                {yellow > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(yellow / t) * 100}%`, background: '#CA8A04' }} />}
                {orange > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(orange / t) * 100}%`, background: '#EA580C' }} />}
                {red > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(red / t) * 100}%`, background: '#DC2626' }} />}
              </div>
              <div className="flex gap-2">
                {[
                  { color: '#16A34A', label: '滿意', count: green },
                  { color: '#CA8A04', label: '尚可', count: yellow },
                  { color: '#EA580C', label: '不滿', count: orange },
                  { color: '#DC2626', label: '糟糕', count: red },
                ].map(({ color, label, count }) => (
                  <span key={color} className="flex items-center gap-0.5">
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <span className="text-sm font-data font-semibold" style={{ color: 'var(--text-secondary)' }}>{count}人</span>
                  </span>
                ))}
              </div>
            </div>
          </>}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* DEV: 刪空桌 */}
          {isDev && (() => {
            const emptyCount = tables.filter((t) => !guests.some((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed')).length
            if (emptyCount === 0) return null
            return (
              <button
                onClick={async () => {
                  const emptyTables = tables.filter((t) => !guests.some((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed'))
                  for (const t of emptyTables) await removeTable(t.id)
                }}
                className="flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 text-xs font-medium rounded border cursor-pointer hover:bg-red-50"
                style={{ color: '#EA580C', borderColor: '#FDBA74', borderRadius: 'var(--radius-sm)' }}
                title="刪除所有空桌（DEV）"
              >
                <Trash2 size={12} /> 刪空桌 {emptyCount}
              </button>
            )
          })()}

          {/* DEV: 隨機打亂 */}
          {isDev && tables.length > 0 && (
            <button
              onClick={() => {
                const { avoidPairs, undoStack } = useSeatingStore.getState()
                const allConfirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')

                // 打亂賓客順序
                const shuffled = [...allConfirmed]
                for (let i = shuffled.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
                }

                // 建立每桌的剩餘容量 & 下一個可用 seatIndex
                const remaining = new Map<string, number>()
                const nextSeat = new Map<string, number>()
                for (const t of tables) {
                  remaining.set(t.id, t.capacity)
                  nextSeat.set(t.id, 0)
                }

                // 依序塞入，分配連續 seatIndex（眷屬連位）
                const assignments = new Map<string, { tableId: string; seatIndex: number }>()
                for (const g of shuffled) {
                  const availableTable = tables.find((t) => (remaining.get(t.id) || 0) >= g.attendeeCount)
                  if (availableTable) {
                    const seat = nextSeat.get(availableTable.id) || 0
                    assignments.set(g.id, { tableId: availableTable.id, seatIndex: seat })
                    remaining.set(availableTable.id, (remaining.get(availableTable.id) || 0) - g.attendeeCount)
                    nextSeat.set(availableTable.id, seat + g.attendeeCount)
                  }
                }

                // 一次更新 store
                const updatedGuests = guests.map((g) => {
                  const a = assignments.get(g.id)
                  if (a) return { ...g, assignedTableId: a.tableId, seatIndex: a.seatIndex }
                  if (g.rsvpStatus === 'confirmed') return { ...g, assignedTableId: null as string | null | undefined, seatIndex: null }
                  return g
                })

                const result = recalculateAll(updatedGuests, tables, avoidPairs)
                const finalGuests = updatedGuests.map((g) => {
                  const score = result.guests.find((gs) => gs.id === g.id)
                  return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
                })
                const finalTables = tables.map((t) => {
                  const score = result.tables.find((ts) => ts.id === t.id)
                  return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t
                })

                useSeatingStore.setState({
                  guests: finalGuests,
                  tables: finalTables,
                  undoStack: [...undoStack, { type: 'auto-assign' as const, assignments: allConfirmed.map((g) => ({ guestId: g.id, fromTableId: g.assignedTableId || null, fromSeatIndex: g.seatIndex })), createdTableIds: [] }],
                })

                // 存 DB
                const { eventId } = useSeatingStore.getState()
                if (eventId) {
                  Promise.all(
                    finalGuests
                      .filter((g) => g.rsvpStatus === 'confirmed')
                      .map((g) =>
                        fetch(`/api/events/${eventId}/guests/${g.id}/table`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ tableId: g.assignedTableId ?? null, seatIndex: g.seatIndex ?? null }),
                        }).catch(console.error),
                      ),
                  )
                }
              }}
              className="flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 text-xs font-medium rounded border cursor-pointer hover:bg-purple-50"
              style={{ color: '#7C3AED', borderColor: '#C4B5FD', borderRadius: 'var(--radius-sm)' }}
              title="隨機打亂座位（DEV）"
            >
              <Dices size={12} /> 隨機
            </button>
          )}

          {/* Auto-arrange */}
          <div className="relative">
            <button
              onClick={() => setShowArrangeConfirm(!showArrangeConfirm)}
              disabled={tables.length === 0 || arranging}
              className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
              title="自動排列桌次"
            >
              <LayoutGrid size={14} /> {arranging ? '排列中...' : '排列'}
            </button>
            {showArrangeConfirm && (
              <div
                className="absolute top-full right-0 mt-1.5 rounded-lg border shadow-md p-3 z-50 min-w-[200px]"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', fontSize: 13 }}
              >
                <div className="mb-2" style={{ color: 'var(--text-primary)' }}>
                  重新排列所有桌次？
                </div>
                <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                  可以復原（Ctrl+Z）
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowArrangeConfirm(false)}
                    className="px-3 py-1 text-sm rounded border cursor-pointer hover:bg-black/5"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAutoArrange}
                    className="px-3 py-1 text-sm font-semibold text-white rounded cursor-pointer hover:brightness-90"
                    style={{ background: 'var(--accent)', borderRadius: 'var(--radius-sm)' }}
                  >
                    排列
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleAddTable}
            disabled={adding}
            className="flex items-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 text-sm font-semibold text-white rounded cursor-pointer disabled:opacity-50 hover:brightness-90"
            style={{ fontFamily: 'var(--font-display)', background: 'var(--accent)', borderRadius: 'var(--radius-sm)' }}
          >
            <Plus size={14} /> 新桌
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
          >
            <Save size={14} /> {saving ? '儲存中...' : '儲存'}
          </button>

          <button
            onClick={animateUndo}
            disabled={undoStack.length === 0}
            className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
            title="Ctrl+Z"
          >
            <Undo2 size={14} /> 還原
          </button>

          {/* ☰ 選單按鈕 */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center justify-center w-8 h-8 rounded cursor-pointer hover:bg-[var(--accent-light)] relative"
              style={{ color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}
              title="更多"
            >
              <Menu size={18} />
              {avoidPairs.length > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-white text-[9px] rounded-full flex items-center justify-center"
                  style={{ background: 'var(--error)' }}
                >
                  {avoidPairs.length}
                </span>
              )}
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-1 z-50 py-1 min-w-[200px]"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md, 8px)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                  }}
                >
                  {/* 讀取 */}
                  <button
                    onClick={() => { setShowMenu(false); handleRestore() }}
                    disabled={snapshots.length === 0}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)]"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                  >
                    <History size={16} className="shrink-0" />
                    <span>讀取</span>
                    {snapshots.length > 0 && (
                      <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{snapshots[0].name}</span>
                    )}
                  </button>

                  {/* 避桌 */}
                  <button
                    onClick={() => { setShowMenu(false); setShowAvoidModal(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--accent-light)]"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                  >
                    <Ban size={16} className="shrink-0" />
                    <span>避桌</span>
                    {avoidPairs.length > 0 && (
                      <span className="ml-auto text-xs font-data" style={{ color: 'var(--error)' }}>{avoidPairs.length} 組</span>
                    )}
                  </button>

                  {/* 重排 */}
                  <button
                    onClick={() => { setShowMenu(false); setShowResetConfirm(true) }}
                    disabled={assigned === 0}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)]"
                    style={{ color: '#EA580C', fontFamily: 'var(--font-body)' }}
                  >
                    <Shuffle size={16} className="shrink-0" />
                    <span>重排</span>
                  </button>

                  {/* 匯入 */}
                  <button
                    onClick={() => { setShowMenu(false); navigate('/import') }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--accent-light)]"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                  >
                    <Download size={16} className="shrink-0" />
                    <span>匯入</span>
                  </button>

                  {/* 分隔線 */}
                  <div className="my-1" style={{ borderTop: '1px solid var(--border)' }} />

                  {/* 登入（未來擴充） */}
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--accent-light)]"
                    style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                    disabled
                  >
                    <Lock size={16} className="shrink-0" />
                    <span>登入</span>
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>即將推出</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showAvoidModal && <AvoidPairModal onClose={() => setShowAvoidModal(false)} />}

      {showResetConfirm && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} onClick={() => setShowResetConfirm(false)} />
          <div style={{ position: 'relative', background: 'var(--bg-surface)', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '24px', width: '320px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>確定重排？</p>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>所有已安排的賓客將移回待排區。可按「還原」回復。</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowResetConfirm(false)} style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '14px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>取消</button>
              <button onClick={() => {
                setShowResetConfirm(false)
                animateResetToSidebar()
              }} style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '14px', border: 'none', background: '#DC2626', color: 'white', cursor: 'pointer', fontWeight: 600 }}>重排</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showRenameEvent && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} onClick={() => setShowRenameEvent(false)} />
          <div style={{ position: 'relative', background: 'var(--bg-surface)', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '24px', width: '320px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>修改活動名稱</p>
            <input
              autoFocus
              value={renameEventValue}
              onChange={(e) => setRenameEventValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameEvent(); if (e.key === 'Escape') setShowRenameEvent(false) }}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--accent)', borderRadius: '6px', fontSize: '13px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setShowRenameEvent(false)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>取消</button>
              <button onClick={handleRenameEvent} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>確認</button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
          // 進度條顏色依安排百分比，用滿意度色彩邏輯
          const assignBarColor = getSatisfactionColor(assignPct)
          // 分佈條：只收集有值的 segment
          const segments = satItems.filter(({ key }) => stats[key] > 0)
          return (
            <div className="flex-1 min-w-0">
              <div className="mb-3" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', fontFamily: 'var(--font-display)' }}>
                {label}
              </div>
              {/* 已安排進度 */}
              <div className="flex items-center gap-2 mb-1">
                <span className="font-data font-semibold" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  {stats.assigned}/{stats.total} 人
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>已安排</span>
              </div>
              <div className="flex mb-3" style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--border)' }}>
                {assignPct > 0 && (
                  <div style={{ width: `${assignPct}%`, background: assignBarColor, transition: 'width 0.3s' }} />
                )}
              </div>
              {/* 滿意度分佈條（色塊之間 1px 間距） */}
              <div className="flex mb-2" style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--border)', gap: segments.length > 1 ? '1px' : 0 }}>
                {seatedTotal > 0 && segments.map(({ key, color }) => (
                  <div key={key} style={{ width: `${(stats[key] / seatedTotal) * 100}%`, background: color }} />
                ))}
              </div>
              {/* 分佈標籤 */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ fontSize: '11px' }}>
                {satItems.map(({ key, color, label: satLabel }) =>
                  stats[key] > 0 ? (
                    <span key={key} className="font-data" style={{ color }}>
                      {satLabel} {stats[key]}人
                    </span>
                  ) : null
                )}
              </div>
              {/* 桌數 + 溢出 */}
              <div className="flex gap-3 mt-2" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>{stats.tableCount} 桌</span>
                {stats.overflowCount > 0 && (
                  <span style={{ color: 'var(--warning)' }}>溢出 {stats.overflowCount}人</span>
                )}
              </div>
            </div>
          )
        }

        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowRestoreConfirm(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="restore-modal-title"
              className="bg-white w-full max-w-md p-6 mx-4"
              style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="restore-modal-title" className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                讀取快照
              </h2>
              <p className="mb-4" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                還原到：<span className="font-medium" style={{ color: 'var(--text-primary)' }}>{snap.name}</span>
              </p>
              {/* 對比區域 */}
              <div className="flex gap-3 pb-4 mb-4 flex-col min-[480px]:flex-row min-[480px]:items-stretch" style={{ borderBottom: '1px solid var(--border)' }}>
                <StatColumn label="目前" stats={currStats} />
                {/* 箭頭分隔 */}
                <div className="hidden min-[480px]:flex items-center justify-center" style={{ width: '24px', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex min-[480px]:hidden items-center justify-center py-1">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M4 9l4 4 4-4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <StatColumn label="快照" stats={snapStats} />
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--warning)' }}>
                目前的排位將被覆蓋，還原記錄會清空。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRestoreConfirm(false)}
                  className="flex-1 py-2 text-sm font-medium rounded border cursor-pointer hover:bg-[var(--bg-primary)]"
                  style={{ borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
                >
                  取消
                </button>
                <button
                  onClick={confirmRestore}
                  className="flex-1 py-2 text-sm font-semibold text-white rounded cursor-pointer hover:brightness-90"
                  style={{ background: 'var(--accent)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-display)' }}
                >
                  還原
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
