import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Map as MapIcon, List, Search, X, Zap, Save, Pencil, Undo2, Redo2, Plus, Trash2, Shuffle, History, LayoutGrid, Dices } from 'lucide-react';
import { useSeatingStore } from '@/stores/seating';
import { getSatisfactionColor, calculateSatisfaction } from '@/lib/satisfaction';
import { getTableRecommendations, getGuestRecommendations, type TableRecommendation } from '@/lib/recommend';
import { getCategoryColor, loadCategoryColors } from '@/lib/category-colors';
import { findFreePosition, calculateGridLayout } from '@/lib/viewport';
import { api } from '@/lib/api';
import { FloorPlan, type FloorPlanHandle } from '@/components/workspace/FloorPlan';
import GuestFormModal from '@/components/GuestFormModal';
import type { Guest } from '@/stores/seating';

// ─── Dashboard ─────────────────────────────────────

function MobileDashboard() {
  const guests = useSeatingStore((s) => s.guests);
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed');
  const assigned = confirmed.filter((g) => g.assignedTableId);
  const unassigned = confirmed.filter((g) => !g.assignedTableId);
  const unassignedSeats = unassigned.reduce((s, g) => s + g.seatCount, 0);
  const [showTip, setShowTip] = useState(false);

  const green = assigned.filter((g) => g.satisfactionScore >= 75).length;
  const yellow = assigned.filter((g) => g.satisfactionScore >= 50 && g.satisfactionScore < 75).length;
  const orange = assigned.filter((g) => g.satisfactionScore >= 25 && g.satisfactionScore < 50).length;
  const red = assigned.filter((g) => g.satisfactionScore < 25).length;

  const total = assigned.length || 1;

  return (
    <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)] shrink-0">
      {/* Top row: unassigned (left) + satisfaction legend (right) */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTip((v) => !v)}
            className="flex items-center gap-1.5 text-left"
          >
            <span className="text-sm text-[var(--text-muted)] font-[family-name:var(--font-body)]">未安排</span>
            <span
              className="text-lg font-[family-name:var(--font-data)] font-bold tabular-nums"
              style={{ color: unassigned.length > 0 ? '#EA580C' : 'var(--text-muted)' }}
            >
              {unassigned.length}
            </span>
            <span className="text-sm text-[var(--text-muted)] font-[family-name:var(--font-body)]">人</span>
            {unassignedSeats !== unassigned.length && (
              <>
                <span className="text-sm text-[var(--text-muted)] font-[family-name:var(--font-body)]">/</span>
                <span className="text-base font-[family-name:var(--font-data)] font-medium tabular-nums text-[var(--text-muted)]">
                  {unassignedSeats}
                </span>
                <span className="text-sm text-[var(--text-muted)] font-[family-name:var(--font-body)]">席</span>
              </>
            )}
            <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-[var(--text-muted)] border border-[var(--border-strong)]">?</span>
          </button>
          {showTip && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowTip(false)} />
              <div className="absolute left-0 top-full mt-2 z-50 rounded-[var(--radius-sm)] bg-[var(--bg-elevated,#1f2937)] text-white text-xs px-3 py-2 shadow-lg leading-relaxed whitespace-nowrap">
                「人」＝賓客數（不含眷屬）<br />
                「席」＝賓客本人 + 眷屬（含嬰兒）的總座位數<br />
                <span className="opacity-80">例：王小明帶 1 位伴侶 + 1 位嬰兒 → 算 1 人、3 席</span>
              </div>
            </>
          )}
        </div>
        {assigned.length > 0 && (
          <span className="flex items-center gap-2 text-sm font-[family-name:var(--font-body)] text-[var(--text-muted)]">
            {green > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--satisfaction-green)' }} />好{green}人</span>}
            {yellow > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--satisfaction-yellow)' }} />可{yellow}人</span>}
            {orange > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--satisfaction-orange)' }} />普{orange}人</span>}
            {red > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--satisfaction-red)' }} />差{red}人</span>}
          </span>
        )}
      </div>
      {/* Bar chart */}
      {assigned.length > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden gap-px">
          {green > 0 && <div style={{ flex: green / total, background: 'var(--satisfaction-green)' }} />}
          {yellow > 0 && <div style={{ flex: yellow / total, background: 'var(--satisfaction-yellow)' }} />}
          {orange > 0 && <div style={{ flex: orange / total, background: 'var(--satisfaction-orange)' }} />}
          {red > 0 && <div style={{ flex: red / total, background: 'var(--satisfaction-red)' }} />}
        </div>
      )}
    </div>
  );
}

// ─── Table Card ────────────────────────────────────

function MobileTableCard({ tableId, onAddGuest, onGuestLongPress, recommendCount }: {
  tableId: string
  onAddGuest: (tableId: string) => void
  onGuestLongPress: (guest: Guest, tableId: string) => void
  recommendCount: number
}) {
  const table = useSeatingStore((s) => s.tables.find((t) => t.id === tableId))!;
  const guests = useSeatingStore((s) => s.guests);
  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const eventId = useSeatingStore((s) => s.eventId);
  const updateTableName = useSeatingStore((s) => s.updateTableName);
  const updateTableCapacity = useSeatingStore((s) => s.updateTableCapacity);
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);

  const [showEditModal, setShowEditModal] = useState(false);
  const [nameDraft, setNameDraft] = useState(table.name);
  const [capacityDraft, setCapacityDraft] = useState(table.capacity);

  const tableGuests = guests
    .filter((g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed')
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

  const seatCount = tableGuests.reduce((s, g) => s + g.seatCount, 0);
  const avgSat = tableGuests.length > 0
    ? tableGuests.reduce((s, g) => s + g.satisfactionScore, 0) / tableGuests.length
    : 0;
  const satColor = avgSat > 0 ? getSatisfactionColor(avgSat) : 'var(--text-muted)';

  // 滿意度即時回饋：顯示 delta
  const prevSatRef = useRef(avgSat);
  const [satDelta, setSatDelta] = useState<number | null>(null);
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const prev = prevSatRef.current;
    prevSatRef.current = avgSat;
    if (prev > 0 && avgSat > 0 && Math.abs(avgSat - prev) >= 0.5) {
      setSatDelta(avgSat - prev);
      if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current);
      deltaTimerRef.current = setTimeout(() => setSatDelta(null), 2000);
    }
  }, [avgSat]);


  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-lg,12px)] bg-[var(--bg-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="font-[family-name:var(--font-display)] font-semibold text-[var(--text-primary)]">{table.name}</span>
          <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-data)] tabular-nums">{seatCount}/{table.capacity}</span>
          <button
            onClick={() => { setNameDraft(table.name); setCapacityDraft(table.capacity); setShowEditModal(true); }}
            className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm,4px)] bg-transparent border-none cursor-pointer text-[var(--text-muted)] active:bg-[var(--accent-light)]"
          >
            <Pencil size={12} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {recommendCount > 0 && seatCount < table.capacity && (
            <span className="text-[11px] font-[family-name:var(--font-ui)] font-medium px-1.5 py-px rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
              推薦{recommendCount}
            </span>
          )}
          {satDelta !== null && (
            <span
              className="text-xs font-[family-name:var(--font-data)] font-semibold tabular-nums animate-[fadeInOut_2s_ease-out_forwards]"
              style={{ color: satDelta > 0 ? 'var(--satisfaction-green)' : 'var(--satisfaction-red)' }}
            >
              {satDelta > 0 ? '+' : ''}{satDelta.toFixed(1)}
            </span>
          )}
          <span className="font-[family-name:var(--font-data)] font-bold tabular-nums text-sm" style={{ color: satColor }}>
            {avgSat > 0 ? avgSat.toFixed(0) : '—'}
          </span>
        </div>
      </div>

      {/* Edit table modal */}
      {showEditModal && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={() => setShowEditModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[var(--bg-surface)] rounded-[var(--radius-lg,12px)] p-5 w-[85%] max-w-[320px] shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
            <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--text-primary)] mb-4">編輯桌次</h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-[var(--text-secondary)] font-[family-name:var(--font-ui)] mb-1 block">桌名</label>
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[var(--radius-sm,4px)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>

              <div>
                <label className="text-sm text-[var(--text-secondary)] font-[family-name:var(--font-ui)] mb-1 block">可坐數</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCapacityDraft((v) => Math.max(Math.max(8, seatCount), v - 1))}
                    disabled={capacityDraft <= Math.max(8, seatCount)}
                    className="w-10 h-10 rounded-[var(--radius-sm,4px)] border border-[var(--border)] flex items-center justify-center text-lg bg-[var(--bg-surface)] cursor-pointer disabled:opacity-30 disabled:cursor-default text-[var(--text-secondary)]"
                  >−</button>
                  <span className="font-[family-name:var(--font-data)] font-bold tabular-nums text-xl min-w-[40px] text-center text-[var(--text-primary)]">{capacityDraft}</span>
                  <button
                    onClick={() => setCapacityDraft((v) => Math.min(12, v + 1))}
                    disabled={capacityDraft >= 12}
                    className="w-10 h-10 rounded-[var(--radius-sm,4px)] border border-[var(--border)] flex items-center justify-center text-lg bg-[var(--bg-surface)] cursor-pointer disabled:opacity-30 disabled:cursor-default text-[var(--text-secondary)]"
                  >+</button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-2.5 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--bg-surface)] text-sm font-[family-name:var(--font-ui)] text-[var(--text-secondary)] cursor-pointer"
              >取消</button>
              <button
                onClick={() => {
                  if (nameDraft.trim()) updateTableName(tableId, nameDraft.trim());
                  updateTableCapacity(tableId, capacityDraft);
                  setShowEditModal(false);
                }}
                className="flex-1 py-2.5 rounded-[var(--radius-sm,4px)] border-none bg-[var(--accent)] text-white text-sm font-[family-name:var(--font-ui)] font-medium cursor-pointer"
              >確認</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Seat layout: guests + companions + empty seats */}
      <div className="px-3 py-2 flex flex-wrap gap-1.5">
        {(() => {
          // Build seat slots like the canvas does
          const r = 17;
          const strokeW = 2.5;
          const ringR = r + strokeW / 2 + 1;
          const circum = 2 * Math.PI * ringR;
          const size = (ringR + strokeW) * 2;

          // Group guests with their companions, then empty seats
          type SeatGroup =
            | { type: 'guest-group'; guest: Guest; companionCount: number }
            | { type: 'empty' };

          const groups: SeatGroup[] = [];
          for (const g of tableGuests) {
            groups.push({ type: 'guest-group', guest: g, companionCount: g.companionCount });
          }
          const emptyCount = Math.max(0, table.capacity - seatCount);
          for (let i = 0; i < emptyCount; i++) {
            groups.push({ type: 'empty' });
          }

          return groups.map((group, idx) => {
            if (group.type === 'empty') {
              return (
                <div key={`empty-${idx}`} onClick={() => onAddGuest(tableId)} className="flex flex-col items-center gap-0.5 cursor-pointer active:opacity-70">
                  <svg width={size} height={size} className="block">
                    <g transform={`translate(${size / 2}, ${size / 2})`}>
                      <circle r={r} fill="none" stroke="var(--border)" strokeWidth={1.5} strokeDasharray="4 3" />
                      <text y={5} textAnchor="middle" fill="var(--text-muted)" fontSize={16} fontWeight="300">+</text>
                    </g>
                  </svg>
                  <span className="text-xs text-transparent">空</span>
                </div>
              );
            }

            // Guest group: main guest + companions in a connected container
            const g = group.guest;
            const cc = getCategoryColor(g.category, categoryColors);
            const score = g.satisfactionScore;
            const color = getSatisfactionColor(score);
            const progress = Math.min(score / 100, 1);
            const displayName = g.aliases.length > 0 ? g.aliases[0] : g.name;
            const hasAvoidViolation = avoidPairs.some((ap) => {
              const isInvolved = ap.guestAId === g.id || ap.guestBId === g.id;
              if (!isInvolved) return false;
              const otherId = ap.guestAId === g.id ? ap.guestBId : ap.guestAId;
              return tableGuests.some((tg) => tg.id === otherId);
            });
            const hasCompanions = group.companionCount > 0;

            return (
              <div key={g.id} className="flex flex-col items-center gap-0.5">
                {/* Circles row: guest + companions wrapped in category color */}
                <div
                  className="flex items-center"
                  style={hasCompanions ? { background: cc.background, borderRadius: size / 2, gap: 6 } : undefined}
                >
                  {/* Main guest circle */}
                  <svg width={size} height={size} className="block cursor-pointer" onClick={() => onGuestLongPress(g, tableId)}>
                    <g transform={`translate(${size / 2}, ${size / 2})`}>
                      <circle r={ringR} fill="none" stroke="var(--border)" strokeWidth={strokeW} />
                      {score > 0 && (
                        <circle
                          r={ringR}
                          fill="none"
                          stroke={color}
                          strokeWidth={strokeW}
                          strokeLinecap="round"
                          strokeDasharray={`${circum * progress} ${circum * (1 - progress)}`}
                          strokeDashoffset={circum * 0.25}
                          transform="rotate(-90)"
                        />
                      )}
                      <circle r={r} fill={cc.background} stroke={cc.border} strokeWidth={1} />
                      <text y={6} textAnchor="middle" fill={color} fontSize={15} fontWeight="700" fontFamily="'Plus Jakarta Sans', sans-serif">
                        {score > 0 ? score.toFixed(0) : '—'}
                      </text>
                      {hasAvoidViolation && (
                        <text x={r - 2} y={-r + 4} fontSize={12} textAnchor="middle">💢</text>
                      )}
                    </g>
                  </svg>

                  {/* Companion circles */}
                  {Array.from({ length: group.companionCount }, (_, c) => (
                    <svg key={`comp-${g.id}-${c}`} width={size} height={size} className="block">
                      <g transform={`translate(${size / 2}, ${size / 2})`}>
                        <circle r={r} fill={cc.background} stroke="white" strokeWidth={1.5} opacity={0.6} />
                        {c === group.companionCount - 1 && (
                          <text y={5} textAnchor="middle" fill={cc.color} fontSize={13} fontWeight="600" fontFamily="'Plus Jakarta Sans', sans-serif" opacity={0.7}>
                            +{group.companionCount}
                          </text>
                        )}
                      </g>
                    </svg>
                  ))}
                </div>

                {/* Name below the group */}
                <span className="text-xs text-[var(--text-secondary)] font-[family-name:var(--font-body)] max-w-[48px] truncate text-center leading-tight">
                  {displayName}
                </span>
              </div>
            );
          });
        })()}
      </div>

    </div>
  );
}

// ─── Bottom Sheet (add guest) ──────────────────────

function AddGuestSheet({ tableId, onClose, recommendedGuestIds }: { tableId: string; onClose: () => void; recommendedGuestIds: Set<string> }) {
  const guests = useSeatingStore((s) => s.guests);
  const tables = useSeatingStore((s) => s.tables);
  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const moveGuest = useSeatingStore((s) => s.moveGuest);
  const eventId = useSeatingStore((s) => s.eventId);
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);
  const [search, setSearch] = useState('');

  const table = tables.find((t) => t.id === tableId);
  const tableName = table?.name || '';
  const tableGuests = guests.filter((g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed');
  const seatUsed = tableGuests.reduce((s, g) => s + g.seatCount, 0);
  const remaining = (table?.capacity ?? 10) - seatUsed;

  // 目前桌子平均滿意度
  const currentTableAvg = tableGuests.length > 0
    ? tableGuests.reduce((s, g) => s + g.satisfactionScore, 0) / tableGuests.length
    : 0;

  // 預算每位賓客加入後的分數（useMemo 避免重複計算）
  const predictions = useMemo(() => {
    const map = new Map<string, { guestScore: number; tableDelta: number }>();
    const unassigned = guests.filter((g) => !g.assignedTableId && g.rsvpStatus === 'confirmed');
    for (const g of unassigned) {
      if (g.seatCount > remaining) continue;
      const simGuest = { ...g, assignedTableId: tableId };
      const simAll = guests.map((gg) => (gg.id === g.id ? simGuest : gg));
      const guestScore = calculateSatisfaction(simGuest, simAll, tables, avoidPairs);
      // 模擬後的桌子平均
      const simTableGuests = simAll.filter((gg) => gg.assignedTableId === tableId && gg.rsvpStatus === 'confirmed');
      const simAvg = simTableGuests.length > 0
        ? simTableGuests.reduce((s, gg) => s + (gg.id === g.id ? guestScore : gg.satisfactionScore), 0) / simTableGuests.length
        : 0;
      map.set(g.id, { guestScore, tableDelta: simAvg - currentTableAvg });
    }
    return map;
  }, [guests, tables, avoidPairs, tableId, remaining, currentTableAvg]);

  const unassigned = guests.filter((g) => !g.assignedTableId && g.rsvpStatus === 'confirmed');
  const searched = search
    ? unassigned.filter((g) => {
        const q = search.toLowerCase();
        return g.name.toLowerCase().includes(q) || g.aliases.some((a) => a.toLowerCase().includes(q));
      })
    : unassigned;
  // Sort: recommended first
  const filtered = [...searched].sort((a, b) => {
    const aRec = recommendedGuestIds.has(a.id) ? 0 : 1;
    const bRec = recommendedGuestIds.has(b.id) ? 0 : 1;
    return aRec - bRec;
  });

  const handleAdd = (guestId: string) => {
    moveGuest(guestId, tableId);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-[var(--bg-surface)] rounded-t-2xl max-h-[70vh] flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-[var(--border-strong)]" />
        </div>

        {/* Header */}
        <div className="px-4 pb-2 flex items-center justify-between">
          <span className="font-[family-name:var(--font-display)] font-semibold text-[var(--text-primary)]">
            加入到{tableName}
          </span>
          <span className="text-xs text-[var(--text-muted)]">{unassigned.length} 人待排</span>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋賓客..."
              className="w-full py-2 pl-8 pr-2.5 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--bg-primary)] text-sm font-[family-name:var(--font-body)] text-[var(--text-primary)] outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[var(--text-muted)] p-0">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Guest list */}
        <div className="overflow-auto flex-1 min-h-0 px-4 pb-4">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-sm text-[var(--text-muted)]">
              {unassigned.length === 0 ? '所有賓客已排座' : '沒有符合的賓客'}
            </div>
          )}
          {filtered.map((g) => {
            const cc = getCategoryColor(g.category, categoryColors);
            const wouldExceed = g.seatCount > remaining;
            const pred = predictions.get(g.id);
            const guestScore = pred?.guestScore ?? 0;
            const tableDelta = pred?.tableDelta ?? 0;
            return (
              <button
                key={g.id}
                onClick={() => !wouldExceed && handleAdd(g.id)}
                disabled={wouldExceed}
                className={`w-full flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)] bg-transparent text-left ${wouldExceed ? 'opacity-30 cursor-default' : 'cursor-pointer active:bg-[var(--accent-light)]'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-[family-name:var(--font-body)] text-[var(--text-primary)] truncate">
                    {g.aliases.length > 0 ? <>{g.aliases[0]} <span className="text-[var(--text-muted)]">({g.name})</span></> : g.name}
                    {g.companionCount > 0 && <span className="text-[var(--text-muted)]"> +{g.companionCount}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {g.category && (
                      <span className="px-1.5 py-px rounded-[var(--radius-sm,4px)] text-[11px] font-[family-name:var(--font-ui)]" style={{ background: cc.background, border: `1px solid ${cc.border}`, color: cc.color }}>
                        {g.category}
                      </span>
                    )}
                    {g.subcategory?.name && (
                      <span className="text-[11px] text-[var(--text-muted)]">{g.subcategory.name}</span>
                    )}
                    {recommendedGuestIds.has(g.id) && (
                      <span className="px-1.5 py-px rounded-full text-[10px] font-[family-name:var(--font-ui)] font-medium bg-[var(--accent-light)] text-[var(--accent)]">推薦</span>
                    )}
                  </div>
                </div>
                {/* Score predictions */}
                {pred && !wouldExceed && (
                  <div className="shrink-0 text-right">
                    <div className="font-[family-name:var(--font-data)] font-bold tabular-nums text-sm" style={{ color: getSatisfactionColor(guestScore) }}>
                      {guestScore.toFixed(0)}
                    </div>
                    <div className="text-[11px] font-[family-name:var(--font-data)] tabular-nums" style={{ color: tableDelta >= 0 ? 'var(--satisfaction-green)' : 'var(--satisfaction-red)' }}>
                      桌{tableDelta >= 0 ? '+' : ''}{tableDelta.toFixed(1)}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Context Menu ──────────────────────────────────

function GuestContextMenu({ guest, tableId, onClose }: {
  guest: Guest; tableId: string; onClose: () => void
}) {
  const tables = useSeatingStore((s) => s.tables);
  const moveGuest = useSeatingStore((s) => s.moveGuest);
  const setEditingGuest = useSeatingStore((s) => s.setEditingGuest);
  const deleteGuest = useSeatingStore((s) => s.deleteGuest);
  const [showMoveList, setShowMoveList] = useState(false);
  const [closing, setClosing] = useState(false);

  const otherTables = tables.filter((t) => t.id !== tableId);

  const animatedClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  const handleMove = (targetTableId: string) => {
    moveGuest(guest.id, targetTableId);
    animatedClose();
  };

  const handleUnassign = () => {
    moveGuest(guest.id, null);
    animatedClose();
  };

  const handleEdit = () => {
    setEditingGuest(guest.id);
    animatedClose();
  };

  const handleDelete = () => {
    deleteGuest(guest.id);
    animatedClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999]" onClick={animatedClose}>
      <div
        className="absolute inset-0 bg-black/30 transition-opacity duration-250"
        style={{ opacity: closing ? 0 : 1 }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--bg-surface)] rounded-t-2xl transition-transform duration-250 ease-out"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: closing ? 'translateY(100%)' : 'translateY(0)',
          animation: closing ? undefined : 'slideUp 250ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-[var(--border-strong)]" />
        </div>
        <div className="px-4 pb-2">
          <span className="font-[family-name:var(--font-display)] font-semibold text-[var(--text-primary)]">
            {guest.aliases.length > 0 ? guest.aliases[0] : guest.name}
          </span>
        </div>

        {!showMoveList ? (
          <div className="px-2 pb-3">
            <button onClick={() => setShowMoveList(true)} className="w-full text-left px-4 py-3 text-sm text-[var(--text-primary)] bg-transparent border-none cursor-pointer active:bg-[var(--accent-light)] rounded-[var(--radius-md,8px)]">
              移到其他桌...
            </button>
            <button onClick={handleUnassign} className="w-full text-left px-4 py-3 text-sm text-[var(--text-primary)] bg-transparent border-none cursor-pointer active:bg-[var(--accent-light)] rounded-[var(--radius-md,8px)]">
              移回待排區
            </button>
            <button onClick={handleEdit} className="w-full text-left px-4 py-3 text-sm text-[var(--text-primary)] bg-transparent border-none cursor-pointer active:bg-[var(--accent-light)] rounded-[var(--radius-md,8px)]">
              編輯賓客
            </button>
            <div className="border-t border-[var(--border)] mx-2 my-1" />
            <button onClick={handleDelete} className="w-full text-left px-4 py-3 text-sm text-[var(--error)] bg-transparent border-none cursor-pointer active:bg-red-50 rounded-[var(--radius-md,8px)]">
              刪除
            </button>
          </div>
        ) : (
          <div className="px-2 pb-3 max-h-[50vh] overflow-auto">
            <button onClick={() => setShowMoveList(false)} className="w-full text-left px-4 py-2 text-xs text-[var(--text-muted)] bg-transparent border-none cursor-pointer">
              ← 返回
            </button>
            {otherTables.map((t) => {
              const used = useSeatingStore.getState().guests
                .filter((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed')
                .reduce((s, g) => s + g.seatCount, 0);
              const full = used >= t.capacity;
              return (
                <button
                  key={t.id}
                  onClick={() => !full && handleMove(t.id)}
                  disabled={full}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm bg-transparent border-none cursor-pointer active:bg-[var(--accent-light)] rounded-[var(--radius-md,8px)] disabled:opacity-40 disabled:cursor-default"
                >
                  <span className="text-[var(--text-primary)]">{t.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">{used}/{t.capacity}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Guided Assign (無腦排位) ───────────────────────

function GuidedAssign({ onClose }: { onClose: () => void }) {
  const guests = useSeatingStore((s) => s.guests);
  const tables = useSeatingStore((s) => s.tables);
  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const moveGuest = useSeatingStore((s) => s.moveGuest);
  const eventId = useSeatingStore((s) => s.eventId);
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);

  const unassigned = guests.filter((g) => !g.assignedTableId && g.rsvpStatus === 'confirmed');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [assigned, setAssigned] = useState(0);
  const [done, setDone] = useState(false);

  // Current guest to assign
  const remaining = unassigned.filter((g) => !skipped.has(g.id));
  const currentGuest = remaining[0] ?? null;

  // Get recommendations for current guest
  const recs = useMemo(() => {
    if (!currentGuest) return [];
    return getGuestRecommendations(currentGuest, tables, guests, avoidPairs, 3);
  }, [currentGuest, tables, guests, avoidPairs]);

  const handleAssign = (tableId: string) => {
    if (!currentGuest) return;
    moveGuest(currentGuest.id, tableId);
    setAssigned((n) => n + 1);
  };

  const handleSkip = () => {
    if (!currentGuest) return;
    setSkipped((s) => new Set(s).add(currentGuest.id));
  };

  const handleFinish = () => {
    setDone(true);
  };

  const totalUnassigned = unassigned.length + assigned;
  const isFinished = done || (remaining.length === 0 && (assigned > 0 || skipped.size > 0));
  const progress = totalUnassigned > 0 ? (assigned + skipped.size) / totalUnassigned : 0;

  // Summary view
  if (isFinished) {
    const avgSat = (() => {
      const assignedGuests = guests.filter((g) => g.assignedTableId && g.rsvpStatus === 'confirmed');
      if (assignedGuests.length === 0) return 0;
      return assignedGuests.reduce((s, g) => s + g.satisfactionScore, 0) / assignedGuests.length;
    })();

    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-[var(--bg-primary)] flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--text-primary)] mb-2">排位完成</h2>
          <p className="text-[var(--text-secondary)] mb-6 font-[family-name:var(--font-body)]">
            已排 {assigned} 人{skipped.size > 0 ? `，跳過 ${skipped.size} 人` : ''}
          </p>
          <div className="mb-8">
            <span className="text-5xl font-[family-name:var(--font-data)] font-bold tabular-nums" style={{ color: avgSat > 0 ? getSatisfactionColor(avgSat) : 'var(--text-muted)' }}>
              {avgSat > 0 ? avgSat.toFixed(1) : '—'}
            </span>
            <p className="text-sm text-[var(--text-muted)] mt-1">全場平均滿意度</p>
          </div>
          <button
            onClick={onClose}
            className="px-8 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)] font-medium cursor-pointer border-none"
          >
            完成
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  // No guest to assign
  if (!currentGuest) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-[var(--bg-primary)] flex flex-col items-center justify-center px-6">
        <p className="text-[var(--text-secondary)] mb-4">沒有待排賓客</p>
        <button onClick={onClose} className="px-6 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)] font-medium cursor-pointer border-none">
          返回
        </button>
      </div>,
      document.body,
    );
  }

  const cc = getCategoryColor(currentGuest.category, categoryColors);

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-[var(--bg-primary)] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between">
        <button onClick={onClose} className="text-sm text-[var(--text-secondary)] bg-transparent border-none cursor-pointer font-[family-name:var(--font-ui)]">
          ✕ 結束
        </button>
        <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-data)] tabular-nums">
          {assigned + skipped.size + 1} / {totalUnassigned}
        </span>
        <button onClick={handleFinish} className="text-sm text-[var(--accent)] bg-transparent border-none cursor-pointer font-[family-name:var(--font-ui)] font-medium">
          完成
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 mx-4 rounded-full bg-[var(--border)] overflow-hidden shrink-0">
        <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Guest card */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-center mb-6">
          <div className="text-2xl font-[family-name:var(--font-display)] font-bold text-[var(--text-primary)] mb-1">
            {currentGuest.aliases.length > 0 ? currentGuest.aliases[0] : currentGuest.name}
          </div>
          {currentGuest.aliases.length > 0 && (
            <div className="text-sm text-[var(--text-muted)]">{currentGuest.name}</div>
          )}
          <div className="flex items-center justify-center gap-2 mt-2">
            {currentGuest.category && (
              <span className="px-2 py-0.5 rounded-[var(--radius-sm,4px)] text-xs font-[family-name:var(--font-ui)] font-medium" style={{ background: cc.background, border: `1px solid ${cc.border}`, color: cc.color }}>
                {currentGuest.category}
              </span>
            )}
            {currentGuest.subcategory?.name && (
              <span className="text-xs text-[var(--text-muted)]">{currentGuest.subcategory.name}</span>
            )}
            {currentGuest.companionCount > 0 && (
              <span className="text-xs text-[var(--text-muted)]">+{currentGuest.companionCount}</span>
            )}
          </div>
          {currentGuest.seatPreferences.length > 0 && (
            <div className="text-xs text-[var(--text-muted)] mt-1">
              想同桌：{currentGuest.seatPreferences.map((p) => {
                const g = guests.find((gg) => gg.id === p.preferredGuestId);
                return g ? (g.aliases[0] || g.name) : '';
              }).filter(Boolean).join('、')}
            </div>
          )}
        </div>

        {/* Recommended tables */}
        <div className="w-full space-y-2">
          {recs.length > 0 ? recs.map((rec, i) => (
            <button
              key={rec.tableId}
              onClick={() => handleAssign(rec.tableId)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-[var(--radius-md,8px)] border cursor-pointer active:scale-[0.98] transition-transform"
              style={{
                background: i === 0 ? 'var(--accent-light)' : 'var(--bg-surface)',
                borderColor: i === 0 ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <div className="text-left">
                <div className="text-sm font-[family-name:var(--font-display)] font-semibold text-[var(--text-primary)]">{rec.tableName}</div>
                <div className="text-xs text-[var(--text-muted)]">{rec.reason}</div>
              </div>
              <span className="font-[family-name:var(--font-data)] font-bold tabular-nums" style={{ color: getSatisfactionColor(rec.predictedScore) }}>
                {rec.predictedScore.toFixed(0)}
              </span>
            </button>
          )) : (
            <div className="text-center py-4 text-sm text-[var(--text-muted)]">沒有合適的桌次</div>
          )}
        </div>
      </div>

      {/* Skip button */}
      <div className="shrink-0 px-4 py-3">
        <button
          onClick={handleSkip}
          className="w-full py-3 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--bg-surface)] text-sm font-[family-name:var(--font-ui)] text-[var(--text-secondary)] cursor-pointer"
        >
          跳過
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ─── Main MobileWorkspace ──────────────────────────

export function MobileWorkspace() {
  const tables = useSeatingStore((s) => s.tables);
  const guests = useSeatingStore((s) => s.guests);
  const saveAll = useSeatingStore((s) => s.saveAll);
  const isDirty = useSeatingStore((s) => s.isDirty);
  const isSavingAll = useSeatingStore((s) => s.isSaving);
  const autoAssignGuests = useSeatingStore((s) => s.autoAssignGuests);
  const autoAssignProgress = useSeatingStore((s) => s.autoAssignProgress);
  const undo = useSeatingStore((s) => s.undo);
  const undoStack = useSeatingStore((s) => s.undoStack);
  const snapshots = useSeatingStore((s) => s.snapshots);
  const restoreSnapshot = useSeatingStore((s) => s.restoreSnapshot);
  const addTable = useSeatingStore((s) => s.addTable);
  const resetAllSeats = useSeatingStore((s) => s.resetAllSeats);
  const isBatchSaving = useSeatingStore((s) => s.isBatchSaving);
  const autoArrangeTables = useSeatingStore((s) => s.autoArrangeTables);
  const editingGuestId = useSeatingStore((s) => s.editingGuestId);
  const setEditingGuest = useSeatingStore((s) => s.setEditingGuest);
  const updateGuest = useSeatingStore((s) => s.updateGuest);
  const moveGuest = useSeatingStore((s) => s.moveGuest);
  const deleteGuest = useSeatingStore((s) => s.deleteGuest);
  const updateGuestPreferences = useSeatingStore((s) => s.updateGuestPreferences);
  const addAvoidPair = useSeatingStore((s) => s.addAvoidPair);
  const removeAvoidPair = useSeatingStore((s) => s.removeAvoidPair);
  const setGuestSubcategory = useSeatingStore((s) => s.setGuestSubcategory);
  const subcategories = useSeatingStore((s) => s.subcategories);
  const eventId = useSeatingStore((s) => s.eventId);
  const eventCategories = useSeatingStore((s) => s.eventCategories);
  const [adding, setAdding] = useState(false);
  const [arranging, setArranging] = useState(false);
  const isDev = import.meta.env.DEV;

  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const categories = eventCategories.length > 0 ? eventCategories : ['男方', '女方', '共同'];
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);
  const editGuest = editingGuestId ? guests.find((g) => g.id === editingGuestId) : null;

  // 推薦計算（useMemo 懶計算，只在賓客/桌次變化時重算）
  const recommendations = useMemo(
    () => getTableRecommendations(tables, guests, avoidPairs),
    [tables, guests, avoidPairs],
  );
  const recMap = useMemo(() => {
    const m = new Map<string, TableRecommendation>();
    for (const r of recommendations) m.set(r.tableId, r);
    return m;
  }, [recommendations]);

  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [addingToTable, setAddingToTable] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ guest: Guest; tableId: string } | null>(null);
  const [showAutoMenu, setShowAutoMenu] = useState(false);
  const [guidedAssign, setGuidedAssign] = useState(false);
  const floorPlanRef = useRef<FloorPlanHandle>(null);

  const unassigned = guests.filter((g) => !g.assignedTableId && g.rsvpStatus === 'confirmed');

  // 切到地圖模式時 fitAll（polling 等 FloorPlan mount 完成）
  useEffect(() => {
    if (mode !== 'map') return;
    let cancelled = false;
    let attempts = 0;
    const tryFit = () => {
      if (cancelled) return;
      if (floorPlanRef.current) {
        floorPlanRef.current.fitAll(false);
      } else if (attempts < 20) {
        attempts++;
        setTimeout(tryFit, 50);
      }
    };
    setTimeout(tryFit, 50);
    return () => { cancelled = true; };
  }, [mode]);

  const handleSave = useCallback(async () => {
    await saveAll();
  }, [saveAll]);

  const handleAutoAssign = useCallback(async () => {
    await autoAssignGuests('balanced');
  }, [autoAssignGuests]);

  const handleAutoArrange = useCallback(async () => {
    setArranging(true);
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
    } finally {
      setArranging(false);
    }
  }, [tables, autoArrangeTables]);

  const handleRandomAssign = useCallback(() => {
    useSeatingStore.getState().randomAssignGuests();
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <MobileDashboard />

      {mode === 'list' ? (
        <>
          {/* Table cards */}
          <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
            {tables.map((t) => (
              <MobileTableCard
                key={t.id}
                tableId={t.id}
                onAddGuest={(id) => setAddingToTable(id)}
                onGuestLongPress={(guest, tableId) => setContextMenu({ guest, tableId })}
                recommendCount={recMap.get(t.id)?.guests.length ?? 0}
              />
            ))}

            {/* Unassigned section */}
            {unassigned.length > 0 && (
              <div className="border border-[var(--warning)] rounded-[var(--radius-lg,12px)] bg-[var(--bg-surface)] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
                  <span className="font-[family-name:var(--font-display)] font-semibold text-[var(--warning)]">待排區</span>
                  <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-data)] tabular-nums">{unassigned.length} 人</span>
                </div>
                <div className="px-3 py-2 flex flex-wrap gap-1.5">
                  {unassigned.map((g) => (
                    <span key={g.id} className="px-2 py-0.5 rounded-[var(--radius-sm,4px)] text-xs font-[family-name:var(--font-ui)] bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)]">
                      {g.aliases.length > 0 ? g.aliases[0] : g.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {tables.length === 0 && (
              <div className="text-center py-16">
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-primary)] mb-2">尚無桌次</p>
                <p className="font-[family-name:var(--font-body)] text-sm text-[var(--text-secondary)]">請先匯入賓客名單</p>
              </div>
            )}
          </div>

          {/* Bottom action bar */}
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-surface)]">
            {/* Auto-assign menu */}
            {showAutoMenu && (
              <div className="flex gap-2 px-3 pt-2 animate-[slideUp_200ms_ease-out]">
                <button
                  onClick={() => { setShowAutoMenu(false); handleAutoAssign(); }}
                  disabled={!!autoAssignProgress || unassigned.length === 0}
                  className="flex-1 py-2.5 rounded-[var(--radius-sm,4px)] text-xs font-[family-name:var(--font-ui)] font-medium cursor-pointer disabled:opacity-40 border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                >
                  完整自動排位
                </button>
                <button
                  onClick={() => { setShowAutoMenu(false); setGuidedAssign(true); }}
                  disabled={unassigned.length === 0}
                  className="flex-1 py-2.5 rounded-[var(--radius-sm,4px)] text-xs font-[family-name:var(--font-ui)] font-medium cursor-pointer disabled:opacity-40 border border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]"
                >
                  逐一確認模式
                </button>
              </div>
            )}
            {/* Toolbar — same style as map mode */}
            <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
              {/* 自動排位 */}
              <button
                onClick={() => setShowAutoMenu(!showAutoMenu)}
                disabled={!!autoAssignProgress || unassigned.length === 0}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] border border-[var(--border)] cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap"
              >
                <Zap size={13} /> {autoAssignProgress ? '排位中...' : '自動排位'}
              </button>
              {/* 儲存/讀取 */}
              <div className="flex shrink-0 rounded-[var(--radius-sm,4px)] border border-[var(--border)] overflow-hidden">
                <button onClick={handleSave} disabled={isSavingAll || !isDirty} className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-50 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] border-r border-[var(--border)] text-xs whitespace-nowrap">
                  <Save size={13} /> {isSavingAll ? '儲存中...' : isDirty ? '儲存' : '已存'}
                </button>
                <button onClick={() => { if (snapshots.length > 0) restoreSnapshot(snapshots[0].id); }} disabled={snapshots.length === 0} className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap">
                  <History size={13} /> 讀取
                </button>
              </div>
              {/* 還原/重做 */}
              <div className="flex shrink-0 rounded-[var(--radius-sm,4px)] border border-[var(--border)] overflow-hidden">
                <button onClick={() => undo()} disabled={undoStack.length === 0} className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] border-r border-[var(--border)] text-xs whitespace-nowrap">
                  <Undo2 size={13} /> 還原
                </button>
                <button disabled className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap">
                  <Redo2 size={13} /> 重做
                </button>
              </div>
              {/* 新桌/清桌 */}
              <div className="flex shrink-0 rounded-[var(--radius-sm,4px)] border border-[var(--border)] overflow-hidden">
                <button
                  onClick={async () => {
                    setAdding(true);
                    const pos = findFreePosition(tables);
                    addTable(`第${tables.length + 1}桌`, pos.x, pos.y);
                    setAdding(false);
                  }}
                  disabled={adding}
                  className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-50 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] border-r border-[var(--border)] text-xs whitespace-nowrap"
                >
                  <Plus size={13} /> 新桌
                </button>
                <button
                  onClick={async () => {
                    const eid = useSeatingStore.getState().eventId;
                    if (!eid) return;
                    try {
                      await api.delete(`/events/${eid}/tables/empty`);
                      await useSeatingStore.getState().reloadEvent();
                    } catch { /* ignore */ }
                  }}
                  disabled={!tables.some((t) => !guests.some((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed'))}
                  className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap"
                >
                  <Trash2 size={13} /> 清桌
                </button>
              </div>
              {/* 重排 */}
              <button
                onClick={() => resetAllSeats()}
                disabled={!guests.some((g) => g.assignedTableId)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] border border-[var(--border)] cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap"
              >
                <Shuffle size={13} /> 重排
              </button>
              {/* DEV 工具 */}
              {isDev && (
                <>
                  <button
                    onClick={handleRandomAssign}
                    disabled={tables.length === 0}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] border border-[#C4B5FD] cursor-pointer disabled:opacity-50 text-[#7C3AED] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap"
                  >
                    <Dices size={12} /> 隨機
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Map mode */
        <>
          <div className="flex-1 min-w-0">
            <FloorPlan ref={floorPlanRef} />
          </div>
          {/* Map mode toolbar — single row, horizontal scroll */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
            {/* 儲存/讀取 */}
            <div className="flex shrink-0 rounded-[var(--radius-sm,4px)] border border-[var(--border)] overflow-hidden">
              <button onClick={handleSave} disabled={isSavingAll || !isDirty} className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-50 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] border-r border-[var(--border)] text-xs whitespace-nowrap">
                <Save size={13} /> {isSavingAll ? '儲存中...' : isDirty ? '儲存' : '已存'}
              </button>
              <button onClick={() => { if (snapshots.length > 0) restoreSnapshot(snapshots[0].id); }} disabled={snapshots.length === 0} className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap">
                <History size={13} /> 讀取
              </button>
            </div>
            {/* 還原/重做 */}
            <div className="flex shrink-0 rounded-[var(--radius-sm,4px)] border border-[var(--border)] overflow-hidden">
              <button onClick={() => undo()} disabled={undoStack.length === 0} className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] border-r border-[var(--border)] text-xs whitespace-nowrap">
                <Undo2 size={13} /> 還原
              </button>
              <button disabled className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap">
                <Redo2 size={13} /> 重做
              </button>
            </div>
            {/* 新桌/清桌 */}
            <div className="flex shrink-0 rounded-[var(--radius-sm,4px)] border border-[var(--border)] overflow-hidden">
              <button
                onClick={async () => {
                  setAdding(true);
                  const pos = findFreePosition(tables);
                  addTable(`第${tables.length + 1}桌`, pos.x, pos.y);
                  floorPlanRef.current?.panToPoint(pos.x, pos.y);
                  setAdding(false);
                }}
                disabled={adding}
                className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-50 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] border-r border-[var(--border)] text-xs whitespace-nowrap"
              >
                <Plus size={13} /> 新桌
              </button>
              <button
                onClick={async () => {
                  const eid = useSeatingStore.getState().eventId;
                  if (!eid) return;
                  try {
                    await api.delete(`/events/${eid}/tables/empty`);
                    await useSeatingStore.getState().reloadEvent();
                  } catch { /* ignore */ }
                }}
                disabled={!tables.some((t) => !guests.some((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed'))}
                className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap"
              >
                <Trash2 size={13} /> 清桌
              </button>
            </div>
            {/* 重排 */}
            <button
              onClick={() => resetAllSeats()}
              disabled={!guests.some((g) => g.assignedTableId)}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] border border-[var(--border)] cursor-pointer disabled:opacity-30 text-[var(--text-secondary)] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap"
            >
              <Shuffle size={13} /> 重排
            </button>
            {/* DEV 工具 */}
            {isDev && (
              <>
                <button
                  onClick={handleAutoArrange}
                  disabled={tables.length === 0 || arranging}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] border border-[#C4B5FD] cursor-pointer disabled:opacity-50 text-[#7C3AED] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap"
                >
                  <LayoutGrid size={12} /> {arranging ? '排列中...' : '排列'}
                </button>
                {tables.length > 0 && (
                  <button
                    onClick={handleRandomAssign}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] border border-[#C4B5FD] cursor-pointer text-[#7C3AED] font-[family-name:var(--font-ui)] text-xs whitespace-nowrap"
                  >
                    <Dices size={12} /> 隨機
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Mode toggle FAB */}
      <button
        onClick={() => setMode(mode === 'list' ? 'map' : 'list')}
        className="fixed right-4 z-40 w-11 h-11 flex items-center justify-center rounded-full bg-[var(--bg-surface)] border border-[var(--border)] shadow-[0_2px_8px_rgba(0,0,0,0.12)] cursor-pointer"
        style={{ bottom: mode === 'list' ? 130 : 110 }}
      >
        {mode === 'list' ? <MapIcon size={18} className="text-[var(--text-secondary)]" /> : <List size={18} className="text-[var(--text-secondary)]" />}
      </button>

      {/* Bottom sheet: add guest */}
      {addingToTable && (
        <AddGuestSheet
          tableId={addingToTable}
          onClose={() => setAddingToTable(null)}
          recommendedGuestIds={new Set(recMap.get(addingToTable)?.guests.map((g) => g.guestId) ?? [])}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <GuestContextMenu
          guest={contextMenu.guest}
          tableId={contextMenu.tableId}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Guided assign (無腦排位) */}
      {guidedAssign && (
        <GuidedAssign onClose={() => setGuidedAssign(false)} />
      )}

      {/* 批次座位寫入中的半透明遮罩 */}
      {isBatchSaving && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-[var(--bg-surface)] px-4 py-2 rounded-lg shadow-md border border-[var(--border)]">
            <p className="text-sm text-[var(--text-secondary)] font-[family-name:var(--font-ui)]">儲存中...</p>
          </div>
        </div>
      )}

      {/* 賓客編輯 modal */}
      {editGuest && (
        <GuestFormModal
          mode="edit"
          guest={editGuest}
          tables={tables}
          guests={guests}
          avoidPairs={avoidPairs}
          categories={categories}
          subcategories={subcategories}
          categoryColors={categoryColors}
          onSubmit={async (data) => {
            updateGuest(editGuest.id, {
              name: data.name,
              aliases: data.aliases,
              category: data.category,
              rsvpStatus: data.rsvpStatus,
              companionCount: data.companionCount,
              dietaryNote: data.dietaryNote,
              specialNote: data.specialNote,
            });
            if (data.assignedTableId !== (editGuest.assignedTableId || null)) {
              moveGuest(editGuest.id, data.assignedTableId);
            }
            const prefs = data.preferredGuestIds.map((gid, i) => ({ preferredGuestId: gid, rank: i + 1 }));
            updateGuestPreferences(editGuest.id, prefs);

            const oldAvoidIds = avoidPairs
              .filter((ap) => ap.guestAId === editGuest.id || ap.guestBId === editGuest.id)
              .map((ap) => ({ pairId: ap.id, otherId: ap.guestAId === editGuest.id ? ap.guestBId : ap.guestAId }));
            for (const old of oldAvoidIds) {
              if (!data.avoidGuestIds.includes(old.otherId)) removeAvoidPair(old.pairId);
            }
            for (const gid of data.avoidGuestIds) {
              if (!oldAvoidIds.some((o) => o.otherId === gid)) addAvoidPair(editGuest.id, gid);
            }

            if (data.subcategoryName) {
              const { subcategories } = useSeatingStore.getState();
              const existing = subcategories.find(
                (sc) => sc.name === data.subcategoryName && sc.category === data.category,
              );
              if (existing) {
                const { guests } = useSeatingStore.getState();
                const gIdx = guests.findIndex((g) => g.id === editGuest.id);
                if (gIdx >= 0) {
                  const next = [...guests];
                  next[gIdx] = { ...next[gIdx], subcategory: existing };
                  useSeatingStore.setState({ guests: next });
                }
              }
              api.post(`/events/${eventId}/subcategories/batch`, {
                assignments: [{ guestId: editGuest.id, subcategoryName: data.subcategoryName, category: data.category }],
              }).catch(() => {});
            } else if (editGuest.subcategory) {
              setGuestSubcategory(editGuest.id, null);
            }

            setEditingGuest(null);
          }}
          onDelete={(gid) => { setEditingGuest(null); deleteGuest(gid); }}
          onClose={() => setEditingGuest(null)}
        />
      )}
    </div>
  );
}
