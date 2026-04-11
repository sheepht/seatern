import { useState, useRef, useMemo } from 'react';
import { api } from '@/lib/api';
import { createPortal } from 'react-dom';
import { useDroppable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Wand2, Plus, Save, Undo2, Redo2, Shuffle, LayoutGrid, Trash2, Dices, History, FlaskConical } from 'lucide-react';
import { useSeatingStore, clearEventCache } from '@/stores/seating';
import TableLimitBanner from './TableLimitBanner';
import { estimateAutoAssignTimeInWorker } from '@/lib/auto-assign-client';
import { getSatisfactionColor } from '@/lib/satisfaction';
import { resetDemoFlag } from '@/lib/load-demo';
import { computeSnapshotStats, computeCurrentStats } from '@/lib/snapshot-stats';
import { findFreePosition, calculateGridLayout } from '@/lib/viewport';
import { GuestChip } from './GuestChip';
import { AvoidPairModal } from './AvoidPairModal';
import { getCategoryColor, loadCategoryColors } from '@/lib/category-colors';
import type { AutoAssignMode } from '@/lib/auto-assign';

function CollapseButton({ onCollapse }: { onCollapse: () => void }) {
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btnRef}
        onClick={onCollapse}
        onMouseEnter={() => { setRect(btnRef.current?.getBoundingClientRect() ?? null); setShow(true); }}
        onMouseLeave={() => setShow(false)}
        className="flex items-center justify-center w-6 h-6 rounded cursor-pointer hover:bg-[var(--accent-light)] text-[var(--text-muted)] shrink-0"
      >
        <ChevronLeft size={14} />
      </button>
      {show && rect && createPortal(
        <div
          className="fixed -translate-y-1/2 bg-[var(--bg-surface,#fff)] text-[var(--text-secondary,#78716C)] border border-[var(--border,#E7E5E4)] px-2.5 py-1 rounded-md text-xs whitespace-nowrap pointer-events-none z-[9999] font-[family-name:var(--font-body)] shadow-[0_4px_12px_rgba(28,25,23,0.08)]"
          style={{ left: rect.right + 8, top: rect.top + rect.height / 2 }}
        >
          收合待排區 <kbd className="bg-[#F5F5F4] border border-[var(--border,#E7E5E4)] rounded-sm px-1 py-px text-[10px] ml-1 text-[var(--text-primary,#1C1917)]">Q</kbd>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Popover tooltip（顯示在按鈕上方） */
function Tip({ text, children }: { text: string; children: React.ReactElement }) {
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} onMouseEnter={() => { setRect(ref.current?.getBoundingClientRect() ?? null); setShow(true); }} onMouseLeave={() => setShow(false)} className="inline-flex">
      {children}
      {show && rect && createPortal(
        <div
          className="fixed -translate-x-1/2 -translate-y-full bg-[var(--bg-surface,#fff)] text-[var(--text-secondary,#78716C)] border border-[var(--border,#E7E5E4)] px-2.5 py-1 rounded-md text-xs whitespace-nowrap pointer-events-none z-[9999] font-[family-name:var(--font-body)] shadow-[0_4px_12px_rgba(28,25,23,0.08)]"
          style={{ left: rect.left + rect.width / 2, top: rect.top - 8 }}
        >
          {text}
        </div>,
        document.body,
      )}
    </div>
  );
}

const CATEGORY_ORDER = ['男方', '女方', '共同'];

export function SidePanel({ onCollapse, onPanToTable }: { onCollapse?: () => void; onPanToTable?: (x: number, y: number) => void }) {
  const guests = useSeatingStore((s) => s.guests);
  const tables = useSeatingStore((s) => s.tables);
  const eventId = useSeatingStore((s) => s.eventId);
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);
  const getUnassignedGuests = useSeatingStore((s) => s.getUnassignedGuests);
  const autoAssignGuests = useSeatingStore((s) => s.autoAssignGuests);

  const addTable = useSeatingStore((s) => s.addTable);
  const undo = useSeatingStore((s) => s.undo);
  const undoStack = useSeatingStore((s) => s.undoStack);
  const saveAll = useSeatingStore((s) => s.saveAll);
  const isDirty = useSeatingStore((s) => s.isDirty);
  const isSaving = useSeatingStore((s) => s.isSaving);
  const snapshots = useSeatingStore((s) => s.snapshots);
  const resetAllSeats = useSeatingStore((s) => s.resetAllSeats);
  const autoArrangeTables = useSeatingStore((s) => s.autoArrangeTables);
  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const restoreSnapshot = useSeatingStore((s) => s.restoreSnapshot);

  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [showAvoidModal, setShowAvoidModal] = useState(false);
  const [_showResetConfirm, _setShowResetConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [_showArrangeConfirm, setShowArrangeConfirm] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleAddTable = () => {
    setAdding(true);
    const num = tables.length + 1;
    const pos = findFreePosition(tables);
    addTable(`第${num}桌`, pos.x, pos.y);
    onPanToTable?.(pos.x, pos.y);
    setAdding(false);
  };

  const handleSave = async () => {
    await saveAll();
  };

  const isDev = import.meta.env.DEV;

  const handleRandomAssign = () => useSeatingStore.getState().randomAssignGuests();

  const handleDeleteEmptyTables = async () => {
    const eventId = useSeatingStore.getState().eventId;
    if (!eventId) return;
    try {
      await api.delete(`/events/${eventId}/tables/empty`);
      const { reloadEvent } = useSeatingStore.getState();
      await reloadEvent();
    } catch { /* ignore */ }
  };

  const handleAutoArrange = async () => {
    setArranging(true);
    setShowArrangeConfirm(false);
    try {
      const svg = document.getElementById('floorplan-svg') as SVGSVGElement | null;
      const vb = svg?.viewBox.baseVal;
      let positions: ReturnType<typeof calculateGridLayout>;
      if (vb && vb.width > 0) {
        const padding = 100;
        const areaW = vb.width - padding * 2;
        const areaH = vb.height - padding * 2;
        const cols = Math.ceil(Math.sqrt(tables.length));
        const rows = Math.ceil(tables.length / cols);
        const spacingX = cols > 1 ? areaW / (cols - 1) : 0;
        const spacingY = rows > 1 ? areaH / (rows - 1) : 0;
        positions = tables.map((t, i) => ({
          tableId: t.id,
          x: vb.x + padding + (i % cols) * spacingX,
          y: vb.y + padding + Math.floor(i / cols) * spacingY,
        }));
      } else {
        positions = calculateGridLayout(tables);
      }
      autoArrangeTables(positions);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '保存失敗，已恢復原排列');
    } finally {
      setArranging(false);
    }
  };

  const animateAutoAssign = async (mode: AutoAssignMode = 'balanced') => {
    setAssigning(true);
    const svgEl = document.getElementById('floorplan-svg') as SVGSVGElement | null;
    const ctm = svgEl?.getScreenCTM();

    // Step 1: 記錄每位待排賓客在側欄的螢幕位置
    const unassigned = getUnassignedGuests();
    const chipPositions = new Map<string, { x: number; y: number }>();
    for (const g of unassigned) {
      const el = document.querySelector(`[data-guest-id="${g.id}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        chipPositions.set(g.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
    }

    // Step 2: 隱藏「待排賓客」的桌上圓圈 + 抑制互動
    // 只隱藏即將飛入的賓客，已在桌上的賓客保持可見
    const flyingIds = new Set(unassigned.map((g) => g.id));
    useSeatingStore.setState({
      flyingGuestIds: flyingIds,
      hoverSuppressedUntil: Date.now() + 5000, // 足夠長，cleanup 時會自然過期
      hoveredGuestId: null,
    });

    // Step 3: 執行分配
    try {
      await autoAssignGuests(mode);
    } catch (err: unknown) {
      useSeatingStore.setState({ flyingGuestIds: new Set() });
      alert(err instanceof Error ? err.message : '自動分配失敗');
      setAssigning(false);
      return;
    }

    // Step 4: 計算每位賓客在桌上的目標螢幕位置
    if (!svgEl || !ctm || chipPositions.size === 0) {
      useSeatingStore.setState({ flyingGuestIds: new Set() });
      setAssigning(false);
      return;
    }

    const latestGuests = useSeatingStore.getState().guests;
    const latestTables = useSeatingStore.getState().tables;
    const newCtm = svgEl.getScreenCTM();
    if (!newCtm) { setAssigning(false); return; }

    const vb = svgEl.viewBox.baseVal;
    const svgRect = svgEl.getBoundingClientRect();
    const svgScale = svgRect.width / vb.width;
    const circleSize = 40 * svgScale;
    const fontSize = Math.max(10, Math.round(16 * svgScale));

    // 建立浮動 overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
    document.body.appendChild(overlay);

    const chips: HTMLDivElement[] = [];
    const targets: Array<{ x: number; y: number }> = [];

    for (const [guestId, fromPos] of chipPositions) {
      const guest = latestGuests.find((g) => g.id === guestId);
      if (!guest?.assignedTableId) continue;

      const table = latestTables.find((t) => t.id === guest.assignedTableId);
      if (!table) continue;

      // 計算目標座位的螢幕位置
      const radius = Math.max(58 + Math.min(table.capacity, 12) * 7, 88);
      const seatRadius = radius - 34;
      const seatIndex = guest.seatIndex ?? 0;
      const angle = ((2 * Math.PI) / table.capacity) * seatIndex - Math.PI / 2;
      const seatSvgX = table.positionX + Math.cos(angle) * seatRadius;
      const seatSvgY = table.positionY + Math.sin(angle) * seatRadius;

      const pt = svgEl.createSVGPoint();
      pt.x = seatSvgX;
      pt.y = seatSvgY;
      const screenPt = pt.matrixTransform(newCtm);

      const displayName = guest.name.length <= 2 ? guest.name : guest.name.slice(-2);
      const chip = document.createElement('div');
      chip.textContent = displayName;
      chip.style.cssText = `
        position:fixed;
        left:${fromPos.x}px;
        top:${fromPos.y}px;
        transform:translate(-50%,-50%);
        width:${circleSize}px;
        height:${circleSize}px;
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:${fontSize}px;
        font-weight:500;
        font-family:'Noto Sans TC',sans-serif;
        background:${getCategoryColor(guest.category, categoryColors).background};
        color:${getCategoryColor(guest.category, categoryColors).color};
        border:1.5px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.15);
        pointer-events:none;
        transition:all 500ms cubic-bezier(0.4, 0, 0.2, 1);
        z-index:9999;
      `;
      overlay.appendChild(chip);
      chips.push(chip);
      targets.push({ x: screenPt.x, y: screenPt.y });
    }

    // Step 4: 觸發飛行動畫
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chips.forEach((chip, i) => {
          chip.style.left = `${targets[i].x}px`;
          chip.style.top = `${targets[i].y}px`;
          chip.style.transitionDelay = `${i * 20}ms`;
        });
      });
    });

    // 動畫結束後清理：等最後一個 chip 飛完再顯示
    // 總時間 = 最後一個 chip 的 delay + transition duration + buffer
    const totalAnimTime = chips.length * 20 + 500 + 100;
    setTimeout(() => {
      useSeatingStore.setState({ flyingGuestIds: new Set() });
      setTimeout(() => overlay.remove(), 200);
      setAssigning(false);
    }, totalAnimTime);
  };

  const unassignedGuests = getUnassignedGuests();
  const totalUnassignedSeats = unassignedGuests.reduce((s, g) => s + g.seatCount, 0);

  const { isOver, setNodeRef } = useDroppable({
    id: 'unassigned',
    data: { type: 'unassigned' },
  });

  // 依名字過濾
  const filteredGuests = search.trim()
    ? unassignedGuests.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : unassignedGuests;

  // 依分類 → 標籤 兩層分組
  const allCategories = Array.from(new Set(unassignedGuests.map((g) => g.category ?? '其他')));
  const sortedCategories = [
    ...CATEGORY_ORDER.filter((c) => allCategories.includes(c)),
    ...allCategories.filter((c) => !CATEGORY_ORDER.includes(c)),
  ];
  const grouped = sortedCategories
    .map((cat) => {
      const catGuests = filteredGuests.filter((g) => (g.category ?? '其他') === cat);
      // 收集此分類下所有出現的標籤（依第一個標籤分組；無標籤歸入 null）
      const subcatNames = Array.from(
        new Set(catGuests.map((g) => g.subcategory?.name).filter(Boolean))
      ) as string[];
      const subGroups = [
        ...subcatNames.map((tagName) => ({
          tagName,
          guests: catGuests.filter((g) => g.subcategory?.name === tagName),
        })),
        // 無任何子分類的賓客
        {
          tagName: null,
          guests: catGuests.filter((g) => !g.subcategory),
        },
      ].filter((sg) => sg.guests.length > 0);
      return { category: cat, subGroups };
    })
    .filter((g) => g.subGroups.some((sg) => sg.guests.length > 0));

  // 選中桌的詳情

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">

      <TableLimitBanner />

      {/* 未安排賓客 — 佔滿剩餘高度 */}
      <div
        ref={setNodeRef}
        data-testid="unassigned-bar"
        className="flex-1 flex flex-col overflow-hidden transition-[background] duration-150 ease-in-out"
        style={{ background: isOver ? 'var(--accent-light)' : 'transparent' }}
      >
        {/* Header + 搜尋 */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-medium uppercase tracking-wide font-[family-name:var(--font-display)] text-[var(--text-secondary)]">
                未安排
              </span>
              <span className="text-base font-data font-medium" style={{ color: unassignedGuests.length > 0 ? '#EA580C' : 'var(--text-muted)' }}>
                {unassignedGuests.length} 人
              </span>
              {totalUnassignedSeats !== unassignedGuests.length && (
                <span className="text-sm font-data text-[var(--text-muted)]">
                  / {totalUnassignedSeats} 席
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unassignedGuests.length > 0 && (
                <Tip text="只會分配待排區的賓客">
                  <button
                    onClick={async () => {
                      setShowModeModal(true);
                      setEstimatedTime(null);
                      const t = await estimateAutoAssignTimeInWorker(guests, tables, avoidPairs);
                      setEstimatedTime(t);
                    }}
                    disabled={assigning}
                    className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-[var(--radius-sm)] cursor-pointer disabled:opacity-50 hover:brightness-90 bg-[var(--accent)] text-white font-[family-name:var(--font-display)]"
                  >
                    <Wand2 size={12} />
                    自動分配
                  </button>
                </Tip>
              )}
              {isOver && (
                <span className="text-xs text-[var(--accent-dark)]">放開以取消安排</span>
              )}
              {onCollapse && <CollapseButton onCollapse={onCollapse} />}
            </div>
          </div>
          <input
            type="text"
            placeholder="搜尋賓客..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-base px-2.5 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] outline-none font-[inherit]"
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          />
        </div>

        {/* 賓客列表 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {guests.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-base text-[var(--text-muted)]">尚無賓客資料</p>
              <button
                onClick={() => navigate('/import')}
                className="px-4 py-2 text-sm font-medium hover:opacity-80 bg-[var(--accent)] text-white rounded-[var(--radius-sm)]"
              >
                匯入賓客名單
              </button>
            </div>
          ) : unassignedGuests.length === 0 ? (
            <p className="text-base py-1 text-[#16A34A]">所有賓客都已安排完畢</p>
          ) : grouped.length === 0 ? (
            <p className="text-base py-1 text-[var(--text-muted)]">找不到「{search}」</p>
          ) : (
            <div className="space-y-4">
              {(() => {
                // 計算全域動畫索引
                let globalIdx = 0;
                return grouped.map(({ category, subGroups }) => {
                const catColor = getCategoryColor(category, categoryColors);
                const totalCount = subGroups.reduce((s, sg) => s + sg.guests.length, 0);
                return (
                  <div key={category}>
                    {/* 分類標頭 */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="text-sm font-medium px-1.5 py-0.5 rounded"
                        style={{
                          background: catColor.background,
                          color: catColor.color,
                          border: `1px solid ${catColor.border}`,
                        }}
                      >
                        {category}
                      </span>
                      <span className="text-sm font-data text-[var(--text-muted)]">
                        {totalCount}
                      </span>
                    </div>
                    {/* 標籤子分組 */}
                    <div className="space-y-2 pl-2" style={{ borderLeft: `2px solid ${catColor.border}` }}>
                      {subGroups.map(({ tagName, guests: sgGuests }) => (
                        <div key={tagName ?? '__no_subcat__'}>
                          <div className="text-sm mb-1 text-[var(--text-muted)]">
                            {tagName ?? '未分類'}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {sgGuests.map((g) => (
                              <GuestChip key={g.id} guest={g} animIndex={globalIdx++} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* 操作列 */}
      <div className="shrink-0 px-4 py-3 border-t border-[var(--border)]">
        {/* 第一列：儲存/讀取 + 還原/重做 */}
        <div className="flex gap-2 mb-2">
          <div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden">
            <button onClick={handleSave} disabled={isSaving || !isDirty} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)] text-[var(--text-secondary)] font-[family-name:var(--font-ui)] border-r border-[var(--border)] text-sm">
              <Save size={14} /> {isSaving ? '儲存中...' : isDirty ? '儲存' : '已存'}
            </button>
            <button onClick={() => setShowRestoreConfirm(true)} disabled={snapshots.length === 0} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)] text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-sm">
              <History size={14} /> 讀取
            </button>
          </div>
          <div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden">
            <button onClick={() => undo()} disabled={undoStack.length === 0} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)] text-[var(--text-secondary)] font-[family-name:var(--font-ui)] border-r border-[var(--border)] text-sm">
              <Undo2 size={14} /> 還原
            </button>
            <button disabled className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)] text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-sm">
              <Redo2 size={14} /> 重做
            </button>
          </div>
        </div>
        {/* 第二列：新桌/清桌、重排 */}
        <div className="flex flex-wrap gap-2">
          {/* 新桌 / 清桌 group */}
          <div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden">
            <Tip text="新增一張空桌">
              <button onClick={handleAddTable} disabled={adding} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-light)] text-[var(--text-secondary)] font-[family-name:var(--font-ui)] border-r border-[var(--border)] text-sm">
                <Plus size={14} /> 新桌
              </button>
            </Tip>
            <Tip text="刪除所有沒人坐的桌子">
              <button onClick={handleDeleteEmptyTables} disabled={tables.filter((t) => !guests.some((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed')).length === 0} className="flex items-center gap-1 px-2.5 py-1.5 font-medium cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)] text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-sm">
                <Trash2 size={14} /> 清桌
              </button>
            </Tip>
          </div>
          {/* 重排 */}
          <Tip text="清除所有座位安排，賓客回到待排區">
            <button onClick={() => resetAllSeats()} disabled={guests.filter(g => g.assignedTableId).length === 0} className="flex items-center gap-1 px-2.5 py-1.5 font-medium rounded-[var(--radius-sm)] border border-[var(--border)] cursor-pointer disabled:opacity-40 hover:bg-[var(--accent-light)] text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-sm">
              <Shuffle size={14} /> 重排
            </button>
          </Tip>
        </div>
        {/* DEV 工具列 */}
        {isDev && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-dashed border-[var(--border)]">
            <button onClick={handleAutoArrange} disabled={tables.length === 0 || arranging} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-[#C4B5FD] cursor-pointer disabled:opacity-50 hover:bg-purple-50 text-[#7C3AED]">
              <LayoutGrid size={12} /> {arranging ? '排列中...' : '排列'}
            </button>
            {tables.length > 0 && (
              <button onClick={handleRandomAssign} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-[#C4B5FD] cursor-pointer hover:bg-purple-50 text-[#7C3AED]">
                <Dices size={12} /> 隨機
              </button>
            )}
            <button
              onClick={async () => {
                const eid = useSeatingStore.getState().eventId;
                if (eid) await api.delete(`/events/${eid}/reset`);
                resetDemoFlag();
                clearEventCache();
                window.location.reload();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-[#F59E0B] cursor-pointer hover:bg-amber-50 text-[#B45309]"
            >
              <FlaskConical size={12} /> 模擬新用戶
            </button>
          </div>
        )}
      </div>

      {showAvoidModal && <AvoidPairModal onClose={() => setShowAvoidModal(false)} />}

      {showRestoreConfirm && snapshots.length > 0 && (() => {
        const snap = snapshots[0];
        const snapStats = computeSnapshotStats(snap.data, snap.averageSatisfaction);
        const currStats = computeCurrentStats(guests, tables);
        const satItems = [
          { key: 'green' as const, color: '#16A34A', label: '滿意' },
          { key: 'yellow' as const, color: '#CA8A04', label: '尚可' },
          { key: 'orange' as const, color: '#EA580C', label: '不滿' },
          { key: 'red' as const, color: '#DC2626', label: '糟糕' },
        ];
        const StatColumn = ({ label, stats }: { label: string; stats: typeof snapStats }) => {
          const seatedTotal = stats.green + stats.yellow + stats.orange + stats.red;
          const assignPct = stats.total > 0 ? Math.round((stats.assigned / stats.total) * 100) : 0;
          const assignBarColor = getSatisfactionColor(assignPct);
          const segments = satItems.filter(({ key }) => stats[key] > 0);
          return (
            <div className="flex-1 min-w-0">
              <div className="mb-3 text-xs font-semibold text-[var(--text-muted)] tracking-wide font-[family-name:var(--font-display)]">{label}</div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-data font-semibold text-[13px] text-[var(--text-primary)]">{stats.assigned}/{stats.total} 人</span>
                <span className="text-[11px] text-[var(--text-muted)]">已安排</span>
              </div>
              <div className="flex mb-3 h-1.5 rounded-sm overflow-hidden bg-[var(--border)]">
                {assignPct > 0 && <div className="transition-[width] duration-300" style={{ width: `${assignPct}%`, background: assignBarColor }} />}
              </div>
              <div className="flex mb-2 h-1.5 rounded-sm overflow-hidden bg-[var(--border)]" style={{ gap: segments.length > 1 ? '1px' : 0 }}>
                {seatedTotal > 0 && segments.map(({ key, color }) => (
                  <div key={key} style={{ width: `${(stats[key] / seatedTotal) * 100}%`, background: color }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                {satItems.map(({ key, color, label: satLabel }) =>
                  stats[key] > 0 ? <span key={key} className="font-data" style={{ color }}>{satLabel} {stats[key]}人</span> : null
                )}
              </div>
              <div className="flex gap-3 mt-2 text-xs text-[var(--text-muted)]">
                <span>{stats.tableCount} 桌</span>
                {stats.overflowCount > 0 && <span className="text-[var(--warning)]">溢出 {stats.overflowCount}人</span>}
              </div>
            </div>
          );
        };
        return createPortal(
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowRestoreConfirm(false)}>
            <div role="dialog" aria-modal="true" className="bg-white w-full max-w-md p-6 mx-4 rounded-[var(--radius-lg)] shadow-[var(--shadow-md)]" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-1 font-[family-name:var(--font-display)] text-[var(--text-primary)]">讀取快照</h2>
              <p className="mb-4 text-[13px] text-[var(--text-secondary)]">
                還原到：<span className="font-medium text-[var(--text-primary)]">{snap.name}</span>
              </p>
              <div className="flex gap-3 pb-4 mb-4 flex-col min-[480px]:flex-row min-[480px]:items-stretch border-b border-[var(--border)]">
                <StatColumn label="目前" stats={currStats} />
                <div className="hidden min-[480px]:flex items-center justify-center w-6 shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="flex min-[480px]:hidden items-center justify-center py-1">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M4 9l4 4 4-4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <StatColumn label="快照" stats={snapStats} />
              </div>
              <p className="text-sm mb-4 text-[var(--warning)]">目前的排位將被覆蓋，還原記錄會清空。</p>
              <div className="flex gap-3">
                <button onClick={() => setShowRestoreConfirm(false)} className="flex-1 py-2 text-sm font-medium rounded-[var(--radius-sm)] border border-[var(--border-strong)] cursor-pointer hover:bg-[var(--bg-primary)] text-[var(--text-secondary)]">取消</button>
                <button onClick={() => { restoreSnapshot(snap.id); setShowRestoreConfirm(false); }} className="flex-1 py-2 text-sm font-semibold text-white rounded-[var(--radius-sm)] cursor-pointer hover:brightness-90 bg-[var(--accent)] font-[family-name:var(--font-display)]">還原</button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {showModeModal && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/25" onClick={() => setShowModeModal(false)} />
          <div className="relative bg-[var(--bg-surface)] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-7 w-[400px] border border-[var(--border)]">
            <p className="text-lg font-semibold text-[var(--text-primary)] mb-1 font-[family-name:var(--font-display)]">
              選擇分配模式
            </p>
            <p className="text-[13px] text-[var(--text-muted)] mb-4">
              {estimatedTime !== null && (
                estimatedTime < 5 ? '預估幾秒內完成' :
                estimatedTime < 60 ? `預估約 ${estimatedTime} 秒` :
                `預估約 ${Math.ceil(estimatedTime / 60)} 分鐘`
              )}
              {estimatedTime !== null && ` · ${unassignedGuests.length} 位待排賓客 · ${tables.length} 桌`}
            </p>
            <div className="flex flex-col gap-3">
              {/* 均衡模式 */}
              <button
                onClick={() => { setShowModeModal(false); animateAutoAssign('balanced'); }}
                className="flex items-start gap-3.5 p-4 rounded-[10px] border border-[var(--border)] bg-[var(--bg-primary)] text-left cursor-pointer hover:brightness-95"
              >
                <div className="relative flex items-end gap-0.5 h-[72px] shrink-0 mt-0.5">
                  {[25, 50, 75, 100].map((pct) => (
                    <div key={pct} className="absolute left-0 right-0 border-t border-dashed border-[#9CA3AF] opacity-60" style={{ bottom: `${pct}%` }} />
                  ))}
                  {[68, 70, 72, 75, 75, 75, 75, 75, 75, 75].map((h, i) => (
                    <div key={i} className="w-1 rounded-sm relative z-[1]" style={{
                      height: `${h}%`,
                      background: h >= 75 ? '#16A34A' : h >= 50 ? '#CA8A04' : h >= 25 ? '#EA580C' : '#DC2626',
                    }} />
                  ))}
                </div>
                <div>
                  <div className="text-base font-semibold text-[var(--text-primary)] mb-1.5">
                    均衡模式
                  </div>
                  <div className="text-sm text-[var(--text-secondary)] leading-normal mb-2">
                    最大化全場平均滿意度，讓每個人都盡量滿意
                  </div>
                  <div className="text-[13px] leading-[1.8]">
                    <div className="text-[#16A34A]">✓ 整體分數較高，落差較小</div>
                    <div className="text-[#EA580C]">△ 極高分的人可能較少</div>
                  </div>
                </div>
              </button>
              {/* 極致模式 */}
              <button
                onClick={() => { setShowModeModal(false); animateAutoAssign('maximize-happy'); }}
                className="flex items-start gap-3.5 p-4 rounded-[10px] border border-[var(--border)] bg-[var(--bg-primary)] text-left cursor-pointer hover:brightness-95"
              >
                <div className="relative flex items-end gap-0.5 h-[72px] shrink-0 mt-0.5">
                  {[25, 50, 75, 100].map((pct) => (
                    <div key={pct} className="absolute left-0 right-0 border-t border-dashed border-[#9CA3AF] opacity-60" style={{ bottom: `${pct}%` }} />
                  ))}
                  {[28, 32, 62, 66, 70, 74, 76, 78, 100, 100].map((h, i) => (
                    <div key={i} className="w-1 rounded-sm relative z-[1]" style={{
                      height: `${h}%`,
                      background: h >= 75 ? '#16A34A' : h >= 50 ? '#CA8A04' : h >= 25 ? '#EA580C' : '#DC2626',
                    }} />
                  ))}
                </div>
                <div>
                  <div className="text-base font-semibold text-[var(--text-primary)] mb-1.5">
                    極致模式
                  </div>
                  <div className="text-sm text-[var(--text-secondary)] leading-normal mb-2">
                    盡量讓關係好的人湊在一起，衝高滿意度
                  </div>
                  <div className="text-[13px] leading-[1.8]">
                    <div className="text-[#16A34A]">✓ 更多人達到極高滿意度</div>
                    <div className="text-[#EA580C]">△ 部分人的分數可能較低</div>
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-4 text-right">
              <button
                onClick={() => setShowModeModal(false)}
                className="px-[18px] py-2 rounded-md text-sm border border-[var(--border)] bg-transparent text-[var(--text-secondary)] cursor-pointer hover:bg-black/5"
              >
                取消
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
