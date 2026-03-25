import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSeatingStore } from '@/stores/seating'
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
  const navigate = useNavigate()

  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAvoidModal, setShowAvoidModal] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

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

  return (
    <>
      <div
        className="h-14 border-b bg-white px-5 flex items-center justify-between"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Left: Brand + Event name */}
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
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddTable}
            disabled={adding}
            className="px-3.5 py-1.5 text-xs font-semibold text-white rounded cursor-pointer disabled:opacity-50 hover:brightness-90"
            style={{ fontFamily: 'var(--font-display)', background: 'var(--accent)', borderRadius: 'var(--radius-sm)' }}
          >
            + 新增桌次
          </button>

          <div className="w-px h-5" style={{ background: 'var(--border)' }} />

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
          >
            {saving ? '儲存中...' : '儲存快照'}
          </button>

          <button
            onClick={handleRestore}
            disabled={snapshots.length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
            title={snapshots.length > 0 ? `還原：${snapshots[0].name}` : '尚無快照'}
          >
            還原快照
          </button>

          <div className="w-px h-5" style={{ background: 'var(--border)' }} />

          <button
            onClick={() => setShowAvoidModal(true)}
            className="px-3 py-1.5 text-xs font-medium rounded border cursor-pointer relative hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
          >
            避免同桌
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
            className="px-3 py-1.5 text-xs font-medium rounded border cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
            title="Ctrl+Z"
          >
            撤銷
          </button>

          <button
            onClick={() => navigate('/import')}
            className="px-3 py-1.5 text-xs font-medium rounded border cursor-pointer hover:bg-[var(--accent-light)]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-sm)' }}
          >
            匯入
          </button>
        </div>
      </div>

      {showAvoidModal && <AvoidPairModal onClose={() => setShowAvoidModal(false)} />}

      {showRestoreConfirm && snapshots.length > 0 && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowRestoreConfirm(false)}>
          <div
            className="bg-white w-full max-w-sm p-6"
            style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              還原快照
            </h2>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              還原到：<span className="font-medium" style={{ color: 'var(--text-primary)' }}>{snapshots[0].name}</span>
            </p>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              當時全場平均滿意度：<span className="font-data font-bold">{snapshots[0].averageSatisfaction}</span>
            </p>
            <p className="text-sm mb-5" style={{ color: 'var(--warning)' }}>
              目前的排位將被覆蓋，撤銷記錄會清空。
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
