import { useState, useMemo } from 'react';
import { Info } from 'lucide-react';
import type { ParseResult } from '@/lib/csv-parser';
import {
  detectColumns,
  normalizeGuest,
  SYSTEM_FIELDS,
  type ColumnMapping,
  type MultiColumnMapping,
  type SystemField,
  type RawGuest,
} from '@/lib/column-detector';
import { diffGuests } from '@/lib/guest-diff';

/** 每個欄位的用途說明（tooltip 用） */
const FIELD_TOOLTIPS: Record<SystemField, string> = {
  rsvpStatus: '賓客是否確認出席（是/否）',
  name: '賓客的正式姓名',
  aliases: '暱稱或外號，用於「想同桌」配對',
  category: '男方、女方或共同賓客',
  subcategory: '更細的分組，如大學同學、公司同事',
  companionCount: '攜帶的額外人數，含大人和小孩（0-4）',
  dietaryNote: '素食、過敏或忌口需求',
  specialNote: '嬰兒椅、輪椅等特殊需求',
  seatPreferences: '希望同桌的人（最多 3 位）',
  avoidGuests: '不希望同桌的人',
};

interface Props {
  data: ParseResult
  onConfirm: (guests: RawGuest[]) => void
  onBack: () => void
  existingGuests?: Array<{ name: string; aliases: string[] }>
}

export function ImportPreview({ data, onConfirm, onBack, existingGuests }: Props) {
  const detection = useMemo(() => detectColumns(data.headers), [data.headers]);

  // 可編輯的欄位對應
  const [mapping, setMapping] = useState<ColumnMapping>(detection.mapping);
  const [multiMapping] = useState<MultiColumnMapping>(detection.multiMapping);

  const updateMapping = (field: SystemField, header: string | null) => {
    setMapping((prev) => ({ ...prev, [field]: header }));
  };

  // 全部賓客
  const allGuests = useMemo(() => {
    return data.rows
      .map((row) => normalizeGuest(row, mapping, multiMapping))
      .filter((g): g is RawGuest => g !== null);
  }, [data.rows, mapping, multiMapping]);

  // diff 計算（重新匯入時）
  const diff = useMemo(() => {
    if (!existingGuests || existingGuests.length === 0) return null;
    return diffGuests(allGuests, existingGuests);
  }, [allGuests, existingGuests]);

  const isReimport = !!diff;
  const newGuestNames = useMemo(() => {
    if (!diff) return new Set<string>();
    return new Set(diff.newGuests.map((g) => g.name.trim().toLowerCase()));
  }, [diff]);

  const confirmedCount = allGuests.filter((g) => g.rsvpStatus === 'confirmed').length;
  const declinedCount = allGuests.filter((g) => g.rsvpStatus === 'declined').length;
  const totalSeats = allGuests
    .filter((g) => g.rsvpStatus === 'confirmed')
    .reduce((sum, g) => sum + g.companionCount + 1, 0);

  // 必填欄位檢查
  const missingRequired = SYSTEM_FIELDS
    .filter((f) => f.required && !mapping[f.field])
    .map((f) => f.label);

  const importCount = diff ? diff.newGuests.length : allGuests.length;
  const canConfirm = missingRequired.length === 0 && importCount > 0;

  return (
    <div className="flex flex-col h-full">
      {/* 頂部：統計摘要 + 操作按鈕 */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold font-[family-name:var(--font-display)] text-[var(--text-primary)]">確認匯入資料</h2>
          <div className="px-3 py-1 text-sm font-medium bg-[#F0FDF4] text-[var(--success)] rounded-[var(--radius-sm)]">
            偵測到 <span className="font-data">{allGuests.length}</span> 位賓客
          </div>
          {isReimport && (
            <div className="px-3 py-1 text-sm font-medium bg-[var(--accent-light)] text-[var(--accent)] rounded-[var(--radius-sm)]">
              新增 <span className="font-data">{diff.newGuests.length}</span> 人 / 已存在 <span className="font-data">{diff.skippedGuests.length}</span> 人（跳過）
            </div>
          )}
          {!isReimport && (
            <span className="text-sm text-[var(--text-secondary)]">
              確認 <span className="font-data">{confirmedCount}</span> 人 / 婉拒 <span className="font-data">{declinedCount}</span> 人 / 共 <span className="font-data">{totalSeats}</span> 席
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="px-4 py-2 text-sm hover:opacity-80 text-[var(--text-secondary)]">
            返回
          </button>
          <button
            onClick={() => onConfirm(allGuests)}
            disabled={!canConfirm}
            className="px-6 py-2 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 bg-[var(--accent)] rounded-[var(--radius-sm)]"
          >
            {isReimport ? `匯入 ${importCount} 位新賓客` : `確認匯入 ${allGuests.length} 位賓客`}
          </button>
        </div>
      </div>

      {/* 錯誤提示 */}
      {missingRequired.length > 0 && (
        <div className="p-3 text-sm mb-4 bg-[#FEF2F2] text-[var(--error)] rounded-[var(--radius-sm)]">
          以下必填欄位未對應：{missingRequired.join('、')}
        </div>
      )}

      {/* 左右佈局：欄位對應 | 資料預覽 */}
      <div className="flex gap-6 flex-1 min-h-0">

        {/* 左側：欄位對應 */}
        <div className="flex-shrink-0 w-[340px]">
          <div className="p-4 h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-md)]">
            <h3 className="text-sm font-medium mb-4 text-[var(--text-primary)]">欄位對應</h3>
            <div className="space-y-2">
              {SYSTEM_FIELDS.map((sf) => {
                const isMulti = mapping[sf.field] === '__multi__';
                const isMissing = !mapping[sf.field];
                return (
                  <div key={sf.field} className="flex items-center gap-2">
                    <label className="text-sm flex-shrink-0 flex items-center gap-1 text-[var(--text-secondary)] whitespace-nowrap">
                      {sf.label}
                      {sf.required && <span className="text-[var(--error)]">*</span>}
                      <span className="relative group">
                        <Info size={11} className="text-[var(--text-muted)] cursor-help" />
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 z-50 hidden group-hover:block px-2 py-1 text-xs whitespace-nowrap bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]">
                          {FIELD_TOOLTIPS[sf.field]}
                        </span>
                      </span>
                    </label>
                    {isMulti ? (
                      <span className="text-xs text-[var(--accent)]">
                        多欄位（{multiMapping[sf.field].join(', ')}）
                      </span>
                    ) : (
                      <select
                        className="flex-1 text-sm px-2 py-1 rounded-[var(--radius-sm)]"
                        style={{
                          border: sf.required && isMissing
                            ? '1px solid #DC2626'
                            : !sf.required && isMissing
                            ? '1px solid #F59E0B'
                            : '1px solid var(--border)',
                          background: sf.required && isMissing
                            ? '#FEF2F2'
                            : !sf.required && isMissing
                            ? '#FFFBEB'
                            : undefined,
                        }}
                        value={mapping[sf.field] || ''}
                        onChange={(e) => updateMapping(sf.field, e.target.value || null)}
                      >
                        <option value="">{sf.required ? '⚠ 請選擇' : '（選填）'}</option>
                        {data.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右側：資料預覽表格 */}
        <div className="flex-1 min-w-0 overflow-auto border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--bg-surface)]">
          <table className="min-w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-[var(--bg-surface)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">#</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">姓名</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">外號</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">分類</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">子分類</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">出席</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">攜眷</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">葷素</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">想同桌</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">避免同桌</th>
              </tr>
            </thead>
            <tbody>
              {allGuests.map((g, i) => {
                const isNew = !isReimport || newGuestNames.has(g.name.trim().toLowerCase());
                const isSkipped = isReimport && !isNew;
                return (
                <tr key={i} className="border-t border-[var(--border)]" style={{ opacity: isSkipped ? 0.4 : g.rsvpStatus === 'declined' ? 0.5 : 1 }}>
                  <td className="px-3 py-2 text-xs font-data text-[var(--text-muted)]">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                    {g.name}
                    {isReimport && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[11px]" style={{
                        background: isNew ? '#F0FDF4' : 'var(--bg-primary)',
                        color: isNew ? 'var(--success)' : 'var(--text-muted)',
                      }}>
                        {isNew ? '新' : '已存在'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{g.aliases.join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-[var(--text-primary)]">{g.category || '—'}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{g.rawSubcategory || '—'}</td>
                  <td className="px-3 py-2">
                    <span style={{ color: g.rsvpStatus === 'confirmed' ? 'var(--success)' : g.rsvpStatus === 'declined' ? 'var(--error)' : 'var(--text-muted)' }}>
                      {g.rsvpStatus === 'confirmed' ? '出席' : g.rsvpStatus === 'declined' ? '婉拒' : '待定'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-data">{g.companionCount > 0 ? `+${g.companionCount}` : '—'}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{g.dietaryNote || '—'}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{g.rawPreferences.join(', ') || '—'}</td>
                  <td className="px-3 py-2" style={{ color: g.rawAvoids.length > 0 ? 'var(--error)' : 'var(--text-secondary)' }}>{g.rawAvoids.join(', ') || '—'}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
