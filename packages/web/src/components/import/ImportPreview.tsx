import { useState, useMemo } from 'react'
import type { ParseResult } from '@/lib/csv-parser'
import {
  detectColumns,
  normalizeGuest,
  SYSTEM_FIELDS,
  type ColumnMapping,
  type MultiColumnMapping,
  type SystemField,
  type RawGuest,
} from '@/lib/column-detector'

interface Props {
  data: ParseResult
  onConfirm: (guests: RawGuest[]) => void
  onBack: () => void
}

export function ImportPreview({ data, onConfirm, onBack }: Props) {
  const detection = useMemo(() => detectColumns(data.headers), [data.headers])

  // 可編輯的欄位對應
  const [mapping, setMapping] = useState<ColumnMapping>(detection.mapping)
  const [multiMapping] = useState<MultiColumnMapping>(detection.multiMapping)

  const updateMapping = (field: SystemField, header: string | null) => {
    setMapping((prev) => ({ ...prev, [field]: header }))
  }

  // 全部賓客
  const allGuests = useMemo(() => {
    return data.rows
      .map((row) => normalizeGuest(row, mapping, multiMapping))
      .filter((g): g is RawGuest => g !== null)
  }, [data.rows, mapping, multiMapping])

  const confirmedCount = allGuests.filter((g) => g.rsvpStatus === 'confirmed').length
  const declinedCount = allGuests.filter((g) => g.rsvpStatus === 'declined').length
  const totalSeats = allGuests
    .filter((g) => g.rsvpStatus === 'confirmed')
    .reduce((sum, g) => sum + g.attendeeCount, 0)

  // 必填欄位檢查
  const missingRequired = SYSTEM_FIELDS
    .filter((f) => f.required && !mapping[f.field])
    .map((f) => f.label)

  const canConfirm = missingRequired.length === 0 && allGuests.length > 0

  return (
    <div className="space-y-6">
      {/* 統計摘要 */}
      <div className="flex items-center gap-4">
        <div className="px-3 py-1.5 bg-green-50 text-green-700 rounded text-sm font-medium">
          偵測到 {allGuests.length} 位賓客
        </div>
        <span className="text-sm text-gray-500">
          確認 {confirmedCount} 人 / 婉拒 {declinedCount} 人 / 共 {totalSeats} 席
        </span>
      </div>

      {/* 欄位對應 */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">欄位對應</h3>
        <div className="grid grid-cols-2 gap-3">
          {SYSTEM_FIELDS.map((sf) => (
            <div key={sf.field} className="flex items-center gap-2">
              <label className="text-sm text-gray-600 w-32 flex-shrink-0">
                {sf.label}
                {sf.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {mapping[sf.field] === '__multi__' ? (
                <span className="text-sm text-blue-600">
                  多欄位模式（{multiMapping[sf.field].join(', ')}）
                </span>
              ) : (
                <select
                  className={`flex-1 text-sm px-2 py-1 border rounded ${
                    sf.required && !mapping[sf.field]
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-300'
                  }`}
                  value={mapping[sf.field] || ''}
                  onChange={(e) => updateMapping(sf.field, e.target.value || null)}
                >
                  <option value="">（未對應）</option>
                  {data.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 資料預覽 */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">資料預覽（共 {allGuests.length} 筆）</h3>
        <div className="overflow-x-auto max-h-80 overflow-y-auto border border-gray-200 rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">外號</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">分類</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">出席</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">人數</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">葷素</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">想同桌</th>
              </tr>
            </thead>
            <tbody>
              {allGuests.map((g, i) => (
                <tr key={i} className={`border-t border-gray-100 ${g.rsvpStatus === 'declined' ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{g.name}</td>
                  <td className="px-3 py-2 text-gray-500">{g.aliases.join(', ') || '—'}</td>
                  <td className="px-3 py-2">{g.category || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={g.rsvpStatus === 'confirmed' ? 'text-green-600' : g.rsvpStatus === 'declined' ? 'text-red-500' : 'text-gray-400'}>
                      {g.rsvpStatus === 'confirmed' ? '出席' : g.rsvpStatus === 'declined' ? '婉拒' : '待定'}
                    </span>
                  </td>
                  <td className="px-3 py-2">{g.attendeeCount} 席</td>
                  <td className="px-3 py-2 text-gray-500">{g.dietaryNote || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{g.rawPreferences.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 錯誤提示 */}
      {missingRequired.length > 0 && (
        <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
          以下必填欄位未對應：{missingRequired.join('、')}
        </div>
      )}

      {/* 操作按鈕 */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          返回
        </button>
        <button
          onClick={() => onConfirm(allGuests)}
          disabled={!canConfirm}
          className="px-6 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          確認匯入 {allGuests.length} 位賓客
        </button>
      </div>
    </div>
  )
}
