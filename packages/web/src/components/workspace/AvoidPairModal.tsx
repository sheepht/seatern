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
      <div className="w-full max-w-md p-6" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>避免同桌管理</h2>

        {/* 現有的避免同桌 */}
        <div className="space-y-2 mb-6">
          {avoidPairs.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>尚未設定</p>
          )}
          {avoidPairs.map((ap) => (
            <div key={ap.id} className="flex items-center justify-between p-2 text-sm" style={{ background: '#FEF2F2', borderRadius: 'var(--radius-sm)' }}>
              <span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{getName(ap.guestAId)}</span>
                <span className="mx-1" style={{ color: 'var(--text-muted)' }}>與</span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{getName(ap.guestBId)}</span>
                {ap.reason && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>（{ap.reason}）</span>}
              </span>
              <button
                onClick={() => removeAvoidPair(ap.id)}
                className="text-xs hover:opacity-80"
                style={{ color: 'var(--error)' }}
              >
                移除
              </button>
            </div>
          ))}
        </div>

        {/* 新增 */}
        <div className="pt-4 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>新增避免同桌</h3>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={guestAId}
              onChange={(e) => setGuestAId(e.target.value)}
              className="text-sm px-2 py-1.5"
              style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="">選擇賓客 A</option>
              {confirmed.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <select
              value={guestBId}
              onChange={(e) => setGuestBId(e.target.value)}
              className="text-sm px-2 py-1.5"
              style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
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
            className="w-full text-sm px-2 py-1.5"
            style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
          >
            <option value="">原因（選填）</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!guestAId || !guestBId || guestAId === guestBId || adding}
            className="w-full py-1.5 text-white text-sm disabled:opacity-50 hover:opacity-90"
            style={{ background: 'var(--error)', borderRadius: 'var(--radius-sm)' }}
          >
            新增避免同桌
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-1.5 text-sm hover:opacity-80"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
        >
          關閉
        </button>
      </div>
    </div>
  )
}
