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

  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAvoidModal, setShowAvoidModal] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
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
