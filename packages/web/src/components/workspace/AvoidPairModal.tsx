import { useState } from 'react'
import { useSeatingStore, type Guest } from '@/stores/seating'

interface Props {
  onClose: () => void
}

const REASONS = ['前任關係', '家庭糾紛', '工作嫌隙', '其他']

export function AvoidPairModal({ onClose }: Props) {
  const guests = useSeatingStore((s) => s.guests)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const addAvoidPair = useSeatingStore((s) => s.addAvoidPair)
  const removeAvoidPair = useSeatingStore((s) => s.removeAvoidPair)

  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')

  const [guestAId, setGuestAId] = useState('')
  const [guestBId, setGuestBId] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!guestAId || !guestBId || guestAId === guestBId) return
    setAdding(true)
    await addAvoidPair(guestAId, guestBId, reason || undefined)
    setGuestAId('')
    setGuestBId('')
    setReason('')
    setAdding(false)
  }

  const getName = (id: string) => guests.find((g) => g.id === id)?.name || '?'

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-4">避免同桌管理</h2>

        {/* 現有的避免同桌 */}
        <div className="space-y-2 mb-6">
          {avoidPairs.length === 0 && (
            <p className="text-sm text-gray-400">尚未設定</p>
          )}
          {avoidPairs.map((ap) => (
            <div key={ap.id} className="flex items-center justify-between p-2 bg-red-50 rounded text-sm">
              <span>
                <span className="font-medium">{getName(ap.guestAId)}</span>
                <span className="text-gray-400 mx-1">與</span>
                <span className="font-medium">{getName(ap.guestBId)}</span>
                {ap.reason && <span className="text-gray-400 ml-1">（{ap.reason}）</span>}
              </span>
              <button
                onClick={() => removeAvoidPair(ap.id)}
                className="text-red-400 hover:text-red-600 text-xs"
              >
                移除
              </button>
            </div>
          ))}
        </div>

        {/* 新增 */}
        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-700">新增避免同桌</h3>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={guestAId}
              onChange={(e) => setGuestAId(e.target.value)}
              className="text-sm px-2 py-1.5 border border-gray-300 rounded"
            >
              <option value="">選擇賓客 A</option>
              {confirmed.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <select
              value={guestBId}
              onChange={(e) => setGuestBId(e.target.value)}
              className="text-sm px-2 py-1.5 border border-gray-300 rounded"
            >
              <option value="">選擇賓客 B</option>
              {confirmed.filter((g) => g.id !== guestAId).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded"
          >
            <option value="">原因（選填）</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!guestAId || !guestBId || guestAId === guestBId || adding}
            className="w-full py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
          >
            新增避免同桌
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded"
        >
          關閉
        </button>
      </div>
    </div>
  )
}
