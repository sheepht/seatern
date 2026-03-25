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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">⚠️</div>
          <h2 className="text-lg font-bold text-red-700">避免同桌警告</h2>
        </div>

        <div className="text-sm text-gray-700 space-y-2 mb-6">
          <p>
            <span className="font-medium">{guestName}</span> 與{' '}
            <span className="font-medium">{conflictName}</span> 被標記為「避免同桌」
          </p>
          {reason && (
            <p className="text-gray-500">原因：{reason}</p>
          )}
          <p className="text-gray-500">確定要將他們排在同一桌嗎？</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
          >
            仍要安排
          </button>
        </div>
      </div>
    </div>
  )
}
