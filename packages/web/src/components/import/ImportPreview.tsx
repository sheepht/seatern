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
        <div className="px-3 py-1.5 text-sm font-medium" style={{ background: '#F0FDF4', color: 'var(--success)', borderRadius: 'var(--radius-sm)' }}>
          偵測到 <span className="font-data">{allGuests.length}</span> 位賓客
        </div>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          確認 <span className="font-data">{confirmedCount}</span> 人 / 婉拒 <span className="font-data">{declinedCount}</span> 人 / 共 <span className="font-data">{totalSeats}</span> 席
        </span>
      </div>

      {/* 欄位對應 */}
      <div>
        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>欄位對應</h3>
        <div className="grid grid-cols-2 gap-3">
          {SYSTEM_FIELDS.map((sf) => (
            <div key={sf.field} className="flex items-center gap-2">
              <label className="text-sm w-32 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {sf.label}
                {sf.required && <span className="ml-0.5" style={{ color: 'var(--error)' }}>*</span>}
              </label>
              {mapping[sf.field] === '__multi__' ? (
                <span className="text-sm" style={{ color: 'var(--accent)' }}>
                  多欄位模式（{multiMapping[sf.field].join(', ')}）
                </span>
              ) : (
                <select
                  className="flex-1 text-sm px-2 py-1"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    border: sf.required && !mapping[sf.field]
                      ? '1px solid #DC2626'
                      : '1px solid var(--border)',
                    background: sf.required && !mapping[sf.field]
                      ? '#FEF2F2'
                      : undefined,
                  }}
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
        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>資料預覽（共 <span className="font-data">{allGuests.length}</span> 筆）</h3>
        <div className="overflow-x-auto max-h-80 overflow-y-auto" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          <table className="min-w-full text-sm">
            <thead className="sticky top-0" style={{ background: 'var(--bg-primary)' }}>
              <tr>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>#</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>姓名</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>外號</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>分類</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>出席</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>人數</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>葷素</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>想同桌</th>
              </tr>
            </thead>
            <tbody>
              {allGuests.map((g, i) => (
                <tr key={i} className={g.rsvpStatus === 'declined' ? 'opacity-50' : ''} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 text-xs font-data" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{g.name}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{g.aliases.join(', ') || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{g.category || '—'}</td>
                  <td className="px-3 py-2">
                    <span style={{ color: g.rsvpStatus === 'confirmed' ? 'var(--success)' : g.rsvpStatus === 'declined' ? 'var(--error)' : 'var(--text-muted)' }}>
                      {g.rsvpStatus === 'confirmed' ? '出席' : g.rsvpStatus === 'declined' ? '婉拒' : '待定'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-data">{g.attendeeCount} 席</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{g.dietaryNote || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{g.rawPreferences.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 錯誤提示 */}
      {missingRequired.length > 0 && (
        <div className="p-3 text-sm" style={{ background: '#FEF2F2', color: 'var(--error)', borderRadius: 'var(--radius-sm)' }}>
          以下必填欄位未對應：{missingRequired.join('、')}
        </div>
      )}

      {/* 操作按鈕 */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
        >
          返回
        </button>
        <button
          onClick={() => onConfirm(allGuests)}
          disabled={!canConfirm}
          className="px-6 py-2 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          style={{ background: 'var(--accent)', borderRadius: 'var(--radius-sm)' }}
        >
          確認匯入 {allGuests.length} 位賓客
        </button>
      </div>
    </div>
  )
}
