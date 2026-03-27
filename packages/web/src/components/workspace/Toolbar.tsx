import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useSeatingStore } from '@/stores/seating'
import { getSatisfactionColor } from '@/lib/satisfaction'
import { AvoidPairModal } from './AvoidPairModal'

export function Toolbar() {
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

  const handleRenameEvent = () => {
    const trimmed = renameEventValue.trim()
    if (trimmed) updateEventName(trimmed)
    setShowRenameEvent(false)
  }

  const handleAddTable = async () => {
    setAdding(true)
    const num = tables.length + 1
    const cols = Math.ceil(Math.sqrt(num + 1))
    const row = Math.floor(tables.length / cols)
    const col = tables.length % cols
    await addTable(`第${num}桌`, 200 + col * 250, 200 + row * 250)
    setAdding(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const name = `快照 ${new Date().toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
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

  const CATEGORY_BG: Record<string, string> = { '男方': '#DBEAFE', '女方': '#FEE2E2', '共同': '#F3F4F6' }
  const CATEGORY_CLR: Record<string, string> = { '男方': '#1E40AF', '女方': '#991B1B', '共同': '#374151' }
  const CATEGORY_BD: Record<string, string> = { '男方': '#BFDBFE', '女方': '#FECACA', '共同': '#D1D5DB' }

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

  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')
  const assigned = getTotalAssignedSeats()
  const total = getTotalConfirmedSeats()
  const seated = confirmed.filter((g) => g.assignedTableId)
  const previewScores = dragPreview?.previewScores ?? (recommendationPreviewScores.size > 0 ? recommendationPreviewScores : null)
  const getScore = (g: typeof confirmed[0]) => previewScores?.get(g.id) ?? g.satisfactionScore
  const t = seated.length
  const green = seated.filter((g) => getScore(g) >= 75).length
  const yellow = seated.filter((g) => getScore(g) >= 50 && getScore(g) < 75).length
  const orange = seated.filter((g) => getScore(g) >= 25 && getScore(g) < 50).length
  const red = seated.filter((g) => getScore(g) < 25).length

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
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--accent-light)]"
            style={{ color: 'var(--text-muted)', flexShrink: 0 }}
            title="修改活動名稱"
          >
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 1.5 8.5 3 3 8.5 1 9 1.5 7 7 1.5Z" />
              <path d="M6 2.5 7.5 4" />
            </svg>
          </button>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          {/* 安排進度 */}
          <div className="flex items-center gap-2">
            <div className="w-32 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(128,128,128,0.15)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: total > 0 ? `${Math.round((assigned / total) * 100)}%` : '0%',
                  background: total > 0 && assigned >= total ? '#16A34A' : assigned / total >= 0.5 ? '#CA8A04' : '#EA580C',
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
          <button
            onClick={handleAddTable}
            disabled={adding}
            className="px-3.5 py-1.5 text-sm font-semibold text-white rounded cursor-pointer disabled:opacity-50 hover:brightness-90"
            style={{ fontFamily: 'var(--font-display)', background: 'var(--accent)', borderRadius: 'var(--radius-sm)' }}
          >
            + 新桌
          </button>

          <div className="w-px h-5" style={{ background: 'var(--border)' }} />

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
          >
            {saving ? '儲存中...' : '儲存'}
          </button>

          <button
            onClick={handleRestore}
            disabled={snapshots.length === 0}
            className="px-3 py-1.5 text-sm font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
            title={snapshots.length > 0 ? `還原：${snapshots[0].name}` : '尚無快照'}
          >
            讀取
          </button>

          <div className="w-px h-5" style={{ background: 'var(--border)' }} />

          <button
            onClick={() => setShowAvoidModal(true)}
            className="px-3 py-1.5 text-sm font-medium rounded border cursor-pointer relative hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
          >
            避桌
            {avoidPairs.length > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 text-white text-[10px] rounded-full flex items-center justify-center"
                style={{ background: 'var(--error)' }}
              >
                {avoidPairs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowResetConfirm(true)}
            className="px-3 py-1.5 text-sm font-medium rounded border cursor-pointer hover:bg-red-50"
            style={{ fontFamily: 'var(--font-display)', color: '#EA580C', borderColor: '#FECACA', borderRadius: 'var(--radius-sm)' }}
          >
            重排
          </button>

          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="px-3 py-1.5 text-sm font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
            title="Ctrl+Z"
          >
            還原
          </button>

          <button
            onClick={() => navigate('/import')}
            className="px-3 py-1.5 text-sm font-medium rounded border cursor-pointer hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
          >
            匯入
          </button>
        </div>
      </div>

      {showAvoidModal && <AvoidPairModal onClose={() => setShowAvoidModal(false)} />}

      {showResetConfirm && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} onClick={() => setShowResetConfirm(false)} />
          <div style={{ position: 'relative', background: 'var(--bg-surface)', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '24px', width: '320px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>確定重排？</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>所有已安排的賓客將移回待排區。可按「還原」回復。</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowResetConfirm(false)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>取消</button>
              <button onClick={() => {
                setShowResetConfirm(false)
                animateResetToSidebar()
              }} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '13px', border: 'none', background: '#DC2626', color: 'white', cursor: 'pointer', fontWeight: 600 }}>重排</button>
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

      {showRestoreConfirm && snapshots.length > 0 && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowRestoreConfirm(false)}>
          <div
            className="bg-white w-full max-w-sm p-6"
            style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              讀取
            </h2>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              還原到：<span className="font-medium" style={{ color: 'var(--text-primary)' }}>{snapshots[0].name}</span>
            </p>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              當時全場平均滿意度：<span className="font-data font-bold">{snapshots[0].averageSatisfaction}</span>
            </p>
            <p className="text-sm mb-5" style={{ color: 'var(--warning)' }}>
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
      )}
    </>
  )
}
