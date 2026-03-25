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
      <div className="h-12 border-b border-gray-200 bg-white px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-bold text-gray-900">{eventName || 'Seatern'}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddTable}
            disabled={adding}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            + 新增桌次
          </button>

          <div className="w-px h-5 bg-gray-200" />

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? '儲存中...' : '儲存快照'}
          </button>

          <button
            onClick={handleRestore}
            disabled={snapshots.length === 0}
            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            title={snapshots.length > 0 ? `還原：${snapshots[0].name}` : '尚無快照'}
          >
            還原快照
            {snapshots.length > 0 && (
              <span className="text-gray-400 ml-1">({snapshots[0].name})</span>
            )}
          </button>

          <div className="w-px h-5 bg-gray-200" />

          <button
            onClick={() => setShowAvoidModal(true)}
            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 relative"
          >
            避免同桌
            {avoidPairs.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {avoidPairs.length}
              </span>
            )}
          </button>

          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            title="Ctrl+Z"
          >
            撤銷
          </button>

          <button
            onClick={() => navigate('/import')}
            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
          >
            匯入
          </button>
        </div>
      </div>

      {showAvoidModal && <AvoidPairModal onClose={() => setShowAvoidModal(false)} />}

      {/* 還原確認 modal */}
      {showRestoreConfirm && snapshots.length > 0 && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowRestoreConfirm(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-2">還原快照</h2>
            <p className="text-sm text-gray-600 mb-1">
              還原到：<span className="font-medium">{snapshots[0].name}</span>
            </p>
            <p className="text-sm text-gray-500 mb-1">
              當時全場平均滿意度：{snapshots[0].averageSatisfaction}
            </p>
            <p className="text-sm text-orange-600 mb-4">
              目前的排位將被覆蓋，撤銷記錄會清空。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRestoreConfirm(false)}
                className="flex-1 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={confirmRestore}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
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
