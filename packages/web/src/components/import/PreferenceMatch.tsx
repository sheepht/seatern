import { useState, useMemo } from 'react'
import type { PreferenceMatch as PrefMatch } from '@/lib/preference-matcher'
import { summarizeMatches } from '@/lib/preference-matcher'

interface Props {
  matches: PrefMatch[]
  onConfirm: (resolved: PrefMatch[]) => void
  onSkipAll: () => void
  onBack: () => void
}

export function PreferenceMatch({ matches, onConfirm, onSkipAll, onBack }: Props) {
  const [resolved, setResolved] = useState<PrefMatch[]>(matches)

  const summary = useMemo(() => summarizeMatches(resolved), [resolved])

  // 需要手動處理的（fuzzy + unmatched）
  const needsAction = resolved.filter((m) => m.status !== 'exact' && m.selectedIndex === null)
  const allResolved = needsAction.length === 0

  const handleSelect = (matchIndex: number, candidateGuestIndex: number) => {
    setResolved((prev) =>
      prev.map((m, i) =>
        i === matchIndex ? { ...m, selectedIndex: candidateGuestIndex } : m,
      ),
    )
  }

  const handleDismiss = (matchIndex: number) => {
    setResolved((prev) =>
      prev.map((m, i) =>
        i === matchIndex ? { ...m, selectedIndex: -1 } : m, // -1 = 明確跳過
      ),
    )
  }

  // 只顯示 exact 全部配對成功的情況
  if (summary.fuzzy === 0 && summary.unmatched === 0) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-green-50 text-green-700 rounded-lg text-center">
          <p className="font-medium">所有偏好已自動配對！</p>
          <p className="text-sm mt-1">{summary.exact} 個「想同桌」偏好全部找到對應的人</p>
        </div>
        <div className="flex justify-between">
          <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            返回
          </button>
          <button
            onClick={() => onConfirm(resolved)}
            className="px-6 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            繼續
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 統計 */}
      <div className="flex items-center gap-3 flex-wrap">
        {summary.exact > 0 && (
          <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded text-sm">
            自動配對 {summary.exact} 個
          </span>
        )}
        {summary.fuzzy > 0 && (
          <span className="px-2.5 py-1 bg-yellow-50 text-yellow-700 rounded text-sm">
            需確認 {summary.fuzzy} 個
          </span>
        )}
        {summary.unmatched > 0 && (
          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded text-sm">
            無匹配 {summary.unmatched} 個
          </span>
        )}
      </div>

      {/* 需要處理的配對 */}
      <div className="space-y-3">
        {resolved.map((match, idx) => {
          // 跳過已自動配對和已明確跳過的
          if (match.status === 'exact') return null
          if (match.selectedIndex !== null && match.selectedIndex !== -1) return null
          if (match.selectedIndex === -1) return null

          return (
            <div key={idx} className="p-3 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">
                  <span className="font-medium">{match.fromName}</span>
                  <span className="text-gray-400 mx-1">想跟</span>
                  <span className="font-medium text-blue-600">「{match.rawText}」</span>
                  <span className="text-gray-400 ml-1">同桌</span>
                </span>
                <button
                  onClick={() => handleDismiss(idx)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  跳過
                </button>
              </div>

              {match.candidates.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {match.candidates.map((c) => (
                    <button
                      key={c.guestIndex}
                      onClick={() => handleSelect(idx, c.guestIndex)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-400"
                    >
                      {c.name}
                      <span className="text-gray-400 ml-1 text-xs">
                        {Math.round(c.score * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">找不到匹配的賓客</p>
              )}
            </div>
          )
        })}

        {/* 已處理的摘要 */}
        {resolved.filter((m) => m.selectedIndex !== null && m.selectedIndex >= 0 && m.status !== 'exact').length > 0 && (
          <div className="text-sm text-gray-500 pt-2 border-t">
            已確認配對：
            {resolved
              .filter((m) => m.selectedIndex !== null && m.selectedIndex >= 0 && m.status !== 'exact')
              .map((m, i) => (
                <span key={i} className="ml-2 text-green-600">
                  {m.fromName} → {m.candidates.find((c) => c.guestIndex === m.selectedIndex)?.name}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* 按鈕 */}
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
          返回
        </button>
        <div className="flex gap-3">
          <button
            onClick={onSkipAll}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded"
          >
            全部跳過
          </button>
          <button
            onClick={() => onConfirm(resolved)}
            className={`px-6 py-2 text-sm rounded ${
              allResolved
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {allResolved ? '確認並繼續' : `繼續（剩 ${needsAction.length} 個未處理）`}
          </button>
        </div>
      </div>
    </div>
  )
}
