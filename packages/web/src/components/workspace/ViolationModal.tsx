interface Props {
  guestName: string
  conflictName: string
  reason: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function ViolationModal({ guestName, conflictName, reason, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="w-full max-w-sm p-6" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }} onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">⚠️</div>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--error)' }}>避免同桌警告</h2>
        </div>

        <div className="text-sm space-y-2 mb-6" style={{ color: 'var(--text-primary)' }}>
          <p>
            <span className="font-medium">{guestName}</span> 與{' '}
            <span className="font-medium">{conflictName}</span> 被標記為「避免同桌」
          </p>
          {reason && (
            <p style={{ color: 'var(--text-secondary)' }}>原因：{reason}</p>
          )}
          <p style={{ color: 'var(--text-secondary)' }}>確定要將他們排在同一桌嗎？</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm hover:opacity-80"
            style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 text-sm text-white hover:opacity-90"
            style={{ background: 'var(--error)', borderRadius: 'var(--radius-sm)' }}
          >
            仍要安排
          </button>
        </div>
      </div>
    </div>
  )
}
