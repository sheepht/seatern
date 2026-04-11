import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Pencil, Menu, LogIn, Settings, LogOut } from 'lucide-react';
import { SeaternLogo } from '@/components/SeaternLogo';
import { useSeatingStore } from '@/stores/seating';
import { useAuthStore } from '@/stores/auth';
import { getSatisfactionColor } from '@/lib/satisfaction';
import { AvoidPairModal } from './AvoidPairModal';
import { computeSnapshotStats, computeCurrentStats } from '@/lib/snapshot-stats';
import { getCategoryColor, loadCategoryColors } from '@/lib/category-colors';

interface ToolbarProps {
  onFitAll?: () => void
  onPanToTable?: (x: number, y: number) => void
  page?: 'workspace' | 'guests' | 'import' | 'settings'
}

export function Toolbar({ onFitAll, page = 'workspace' }: ToolbarProps = {}) {
  const eid = useSeatingStore((s) => s.eventId);
  const categoryColors = useMemo(() => loadCategoryColors(eid || ''), [eid]);
  const eventName = useSeatingStore((s) => s.eventName);
  const tables = useSeatingStore((s) => s.tables);
  const undo = useSeatingStore((s) => s.undo);
  const undoStack = useSeatingStore((s) => s.undoStack);
  const snapshots = useSeatingStore((s) => s.snapshots);
  const restoreSnapshot = useSeatingStore((s) => s.restoreSnapshot);
  const guests = useSeatingStore((s) => s.guests);
  const getTotalAssignedSeats = useSeatingStore((s) => s.getTotalAssignedSeats);
  const getTotalConfirmedSeats = useSeatingStore((s) => s.getTotalConfirmedSeats);
  const dragPreview = useSeatingStore((s) => s.dragPreview);
  const recommendationPreviewScores = useSeatingStore((s) => s.recommendationPreviewScores);
  const navigate = useNavigate();

  const updateEventName = useSeatingStore((s) => s.updateEventName);

  const resetAllSeats = useSeatingStore((s) => s.resetAllSeats);

  const [showAvoidModal, setShowAvoidModal] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showRenameEvent, setShowRenameEvent] = useState(false);
  const [renameEventValue, setRenameEventValue] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const handleRenameEvent = () => {
    const trimmed = renameEventValue.trim();
    if (trimmed) updateEventName(trimmed);
    setShowRenameEvent(false);
  };


  const confirmRestore = () => {
    restoreSnapshot(snapshots[0].id);
    setShowRestoreConfirm(false);
    // 還原後顯示全部桌子
    setTimeout(() => onFitAll?.(), 50);
  };


  // 計算賓客在桌上的螢幕位置
  const getSeatScreenPos = (
    svgEl: SVGSVGElement,
    ctm: DOMMatrix,
    table: { positionX: number; positionY: number; capacity: number },
    seatIndex: number,
  ) => {
    const radius = Math.max(58 + Math.min(table.capacity, 12) * 7, 88);
    const seatRadius = radius - 34;
    const angle = ((2 * Math.PI) / table.capacity) * seatIndex - Math.PI / 2;
    const seatSvgX = table.positionX + Math.cos(angle) * seatRadius;
    const seatSvgY = table.positionY + Math.sin(angle) * seatRadius;
    const pt = svgEl.createSVGPoint();
    pt.x = seatSvgX;
    pt.y = seatSvgY;
    return pt.matrixTransform(ctm);
  };

  // 建立浮動圓圈元素
  const createChip = (
    guest: typeof guests[0],
    screenX: number,
    screenY: number,
    circleSize: number,
    fontSize: number,
  ) => {
    const displayName = guest.name.length <= 2 ? guest.name : guest.name.slice(-2);
    const chip = document.createElement('div');
    chip.textContent = displayName;
    chip.style.cssText = `
      position:fixed;
      left:${screenX}px;
      top:${screenY}px;
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
    return chip;
  };

  const animateUndo = () => {
    if (undoStack.length === 0) return;

    // 非賓客移動（新增桌、移動桌）直接 undo，不需飛行動畫
    const last = undoStack[undoStack.length - 1];
    if (last.type === 'add-table' || last.type === 'rename-table' || last.type === 'auto-arrange' || last.type === 'auto-assign') { undo(); return; }

    // 移動桌子：用 SVG 動畫滑回原位
    if (last.type === 'move-table') {
      const tableEl = document.querySelector(`[data-table-id="${last.tableId}"]`) as SVGGElement | null;
      if (!tableEl) { undo(); return; }
      const { fromX, fromY, toX, toY } = last;
      tableEl.animate(
        [
          { transform: `translate(${toX}px, ${toY}px)` },
          { transform: `translate(${fromX}px, ${fromY}px)` },
        ],
        { duration: 400, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      ).onfinish = () => undo();
      return;
    }

    const svgEl = document.getElementById('floorplan-svg') as SVGSVGElement | null;
    if (!svgEl) { undo(); return; }
    const ctm = svgEl.getScreenCTM();
    if (!ctm) { undo(); return; }

    const vb = svgEl.viewBox.baseVal;
    const svgRect = svgEl.getBoundingClientRect();
    const svgScale = svgRect.width / vb.width;
    const circleSize = 40 * svgScale;
    const fontSize = Math.max(10, Math.round(16 * svgScale));

    // 找出即將被 undo 的 entries（last 已在上方宣告，且非 move-guest 已 early return）
    type MoveGuestEntry = Extract<typeof undoStack[number], { guestId: string }>
    const isMoveGuest = (e: typeof undoStack[number]): e is MoveGuestEntry =>
      !e.type || e.type === 'move-guest';
    if (!isMoveGuest(last)) { undo(); return; }
    const entriesToUndo: MoveGuestEntry[] = last.batchId
      ? undoStack.filter(isMoveGuest).filter((e) => e.batchId === last.batchId)
      : [last];

    // sidebar 位置（用於 unassigned 賓客）
    const sidebarEl = document.querySelector('[data-droppable-id="unassigned"]') || document.querySelector('.overflow-y-auto');
    const sidebarRect = sidebarEl?.getBoundingClientRect();
    const sidebarX = 144;
    const sidebarTop = sidebarRect ? sidebarRect.top + 20 : 100;
    const sidebarHeight = sidebarRect ? sidebarRect.height - 40 : 400;

    // 收集每個受影響賓客的 起點 & 終點
    type AnimItem = { guest: typeof guests[0]; fromX: number; fromY: number; toX: number; toY: number }
    const animItems: AnimItem[] = [];

    for (const entry of entriesToUndo) {
      const guest = guests.find((g) => g.id === entry.guestId);
      if (!guest) continue;

      // 起點：賓客目前的位置
      let fromX: number, fromY: number;
      const currentTable = guest.assignedTableId ? tables.find((t) => t.id === guest.assignedTableId) : null;
      if (currentTable && guest.seatIndex !== null) {
        const pos = getSeatScreenPos(svgEl, ctm, currentTable, guest.seatIndex);
        fromX = pos.x;
        fromY = pos.y;
      } else {
        // 在 sidebar 中 — 嘗試找到 DOM 元素位置
        const chipEl = document.querySelector(`[data-guest-id="${guest.id}"]`);
        if (chipEl) {
          const r = chipEl.getBoundingClientRect();
          fromX = r.left + r.width / 2;
          fromY = r.top + r.height / 2;
        } else {
          fromX = sidebarX;
          fromY = sidebarTop + Math.random() * sidebarHeight;
        }
      }

      // 終點：undo 後賓客回到的位置
      let toX: number, toY: number;
      const targetTable = entry.fromTableId ? tables.find((t) => t.id === entry.fromTableId) : null;
      const targetSeatIndex = entry.prevSeatIndices.get(guest.id) ?? 0;
      if (targetTable && entry.fromTableId) {
        const pos = getSeatScreenPos(svgEl, ctm, targetTable, targetSeatIndex);
        toX = pos.x;
        toY = pos.y;
      } else {
        // 回到 sidebar
        toX = sidebarX;
        toY = sidebarTop + Math.random() * sidebarHeight;
      }

      animItems.push({ guest, fromX, fromY, toX, toY });
    }

    if (animItems.length === 0) { undo(); return; }

    // 隱藏受影響的賓客（批量用 isResetting，單個用 flyingGuestIds）
    const isBatch = animItems.length > 3;
    const flyingIds = new Set(animItems.map((item) => item.guest.id));
    if (isBatch) {
      useSeatingStore.setState({ isResetting: true });
    } else {
      useSeatingStore.setState({ flyingGuestIds: flyingIds });
    }

    // 建立 overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
    document.body.appendChild(overlay);

    const chips: HTMLDivElement[] = [];
    for (const item of animItems) {
      const chip = createChip(item.guest, item.fromX, item.fromY, circleSize, fontSize);
      overlay.appendChild(chip);
      chips.push(chip);
    }

    // 觸發飛行動畫
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chips.forEach((chip, i) => {
          const item = animItems[i];
          chip.style.left = `${item.toX}px`;
          chip.style.top = `${item.toY}px`;
          chip.style.transitionDelay = `${i * 20}ms`;
        });
      });
    });

    // 動畫快結束時執行真正的 undo
    setTimeout(() => {
      undo();
      // 延遲清除 flyingGuestIds，等 React render + useLayoutEffect (FLIP) 跑完再清
      requestAnimationFrame(() => {
        if (isBatch) {
          useSeatingStore.setState({ isResetting: false });
        } else {
          useSeatingStore.setState({ flyingGuestIds: new Set() });
        }
      });
      setTimeout(() => overlay.remove(), 200);
    }, 450);
  };

  // Ctrl+Z 鍵盤快捷鍵
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        animateUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const animateResetToSidebar = () => {
    const svgEl = document.getElementById('floorplan-svg') as SVGSVGElement | null;
    if (!svgEl) { resetAllSeats(); return; }

    const ctm = svgEl.getScreenCTM();
    if (!ctm) { resetAllSeats(); return; }

    const assignedGuests = guests.filter((g) => g.assignedTableId && g.rsvpStatus === 'confirmed');
    if (assignedGuests.length === 0) { resetAllSeats(); return; }

    // 計算 SVG 單位到螢幕 px 的縮放比（用於圓圈大小）
    const vb = svgEl.viewBox.baseVal;
    const svgRect = svgEl.getBoundingClientRect();
    const svgScale = svgRect.width / vb.width;
    const circleSize = 40 * svgScale;  // r=20 → 直徑 40 SVG 單位

    // 立刻隱藏桌上的 SVG 賓客，讓浮動圓圈「取代」它們
    useSeatingStore.setState({ isResetting: true });

    // sidebar 目標位置（左側面板中央偏上）
    const sidebarEl = document.querySelector('[data-droppable-id="unassigned"]') || document.querySelector('.overflow-y-auto');
    const targetX = 144;  // w-72 / 2

    // 建立浮動 overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
    document.body.appendChild(overlay);

    const chips: HTMLDivElement[] = [];
    assignedGuests.forEach((guest) => {
      const table = tables.find((t) => t.id === guest.assignedTableId);
      if (!table) return;

      // 計算座位在 SVG 中的位置
      const radius = Math.max(58 + Math.min(table.capacity, 12) * 7, 88);
      const seatRadius = radius - 34;
      const seatIndex = guest.seatIndex ?? 0;
      const angle = ((2 * Math.PI) / table.capacity) * seatIndex - Math.PI / 2;
      const seatSvgX = table.positionX + Math.cos(angle) * seatRadius;
      const seatSvgY = table.positionY + Math.sin(angle) * seatRadius;

      // SVG 座標 → 螢幕座標（用 CTM 正確處理 viewBox + preserveAspectRatio）
      const pt = svgEl.createSVGPoint();
      pt.x = seatSvgX;
      pt.y = seatSvgY;
      const screenPt = pt.matrixTransform(ctm);
      const screenX = screenPt.x;
      const screenY = screenPt.y;

      const displayName = guest.name.length <= 2 ? guest.name : guest.name.slice(-2);
      const fontSize = Math.max(10, Math.round(16 * svgScale));
      const chip = document.createElement('div');
      chip.textContent = displayName;
      chip.style.cssText = `
        position:fixed;
        left:${screenX}px;
        top:${screenY}px;
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
    });

    // sidebar 的可見範圍高度
    const sidebarRect = sidebarEl?.getBoundingClientRect();
    const sidebarTop = sidebarRect ? sidebarRect.top + 20 : 100;
    const sidebarHeight = sidebarRect ? sidebarRect.height - 40 : 400;

    // 下一幀觸發飛行動畫
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chips.forEach((chip, i) => {
          const randomY = sidebarTop + Math.random() * sidebarHeight;
          chip.style.left = `${targetX}px`;
          chip.style.top = `${randomY}px`;
          chip.style.opacity = '0';
          chip.style.transform = 'translate(-50%,-50%)';
          chip.style.transitionDelay = `${i * 20}ms`;
        });
      });
    });

    // 動畫快結束時執行真正的 reset
    setTimeout(() => {
      resetAllSeats();
      setTimeout(() => overlay.remove(), 200);
    }, 450);
  };

  const isResetting = useSeatingStore((s) => s.isResetting);

  const authUser = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const tableLimit = useSeatingStore((s) => s.tableLimit);
  const tableCountPct = tables.length / tableLimit;

  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed');
  const liveAssigned = getTotalAssignedSeats();
  const liveTotal = getTotalConfirmedSeats();
  const seated = confirmed.filter((g) => g.assignedTableId);
  const previewScores = dragPreview?.previewScores ?? (recommendationPreviewScores.size > 0 ? recommendationPreviewScores : null);
  const getScore = (g: typeof confirmed[0]) => previewScores?.get(g.id) ?? g.satisfactionScore;
  const liveT = seated.length;
  const liveGreen = seated.filter((g) => getScore(g) >= 75).length;
  const liveYellow = seated.filter((g) => getScore(g) >= 50 && getScore(g) < 75).length;
  const liveOrange = seated.filter((g) => getScore(g) >= 25 && getScore(g) < 50).length;
  const liveRed = seated.filter((g) => getScore(g) < 25).length;

  // 飛行動畫期���（isResetting）凍結數值，等動畫結束才更新
  const liveStats = useMemo(() => (
    { assigned: liveAssigned, total: liveTotal, t: liveT, green: liveGreen, yellow: liveYellow, orange: liveOrange, red: liveRed }
  ), [liveAssigned, liveTotal, liveT, liveGreen, liveYellow, liveOrange, liveRed]);
  const [frozenStats, setFrozenStats] = useState(liveStats);
  if (!isResetting && frozenStats !== liveStats) {
    setFrozenStats(liveStats);
  }
  const { assigned, total, t, green, yellow, orange, red } = isResetting ? frozenStats : liveStats;

  return (
    <>
      <div
        className="h-14 border-b border-[var(--border)] bg-white px-5 flex items-stretch justify-between"
      >
        {/* Left: Brand + Event name + stats */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight font-[family-name:var(--font-display)] text-[var(--accent)] cursor-pointer hover:opacity-80 transition-opacity"
            title="回到排位頁"
          >
            <SeaternLogo className="w-7 h-7" />
            排位鷗鷗
          </button>
          <span className="text-[var(--border-strong)]">|</span>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {eventName || '未命名活動'}
          </span>
          <button
            onClick={() => { setRenameEventValue(eventName); setShowRenameEvent(true); }}
            className="flex items-center justify-center w-5 h-5 rounded cursor-pointer hover:bg-[var(--accent-light)] text-[var(--text-muted)] shrink-0"
            title="修改活動名稱"
          >
            <Pencil size={12} />
          </button>
          <span className="text-[var(--border-strong)]">|</span>
          {/* 安排進度 */}
          <div className="flex items-center gap-2">
            <div className="w-32 h-1.5 rounded-full overflow-hidden bg-[rgba(128,128,128,0.15)]">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: total > 0 ? `${Math.round((assigned / total) * 100)}%` : '0%',
                  background: getSatisfactionColor(total > 0 ? (assigned / total) * 100 : 0),
                }}
              />
            </div>
            <span className="relative group">
              <span className="text-sm font-data font-semibold text-[var(--text-secondary)] cursor-default">{assigned}/{total} 席</span>
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--bg-elevated,#1f2937)] text-white text-xs px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-50 text-left leading-relaxed">
                已安排 {assigned} 席 / 共 {total} 席<br />
                「席」＝賓客本人 + 眷屬（含嬰兒）的總座位數<br />
                <span className="opacity-80">例：王小明 1 大 1 嬰 → 算 2 席，但只是 1 人</span>
              </span>
            </span>
            <span className="relative group">
              <span className="text-sm font-data font-semibold cursor-default" style={{
                color: tableCountPct >= 0.8 ? '#DC2626' : tableCountPct >= 0.6 ? '#CA8A04' : '#16A34A',
              }}>{tables.length}/{tableLimit} 桌</span>
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--bg-elevated,#1f2937)] text-white text-xs px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-50">
                {tableLimit > 20 ? `已升級 ${tableLimit} 桌方案` : authUser ? '到定價頁升級更多桌數' : '登入後可使用最多 20 桌'}
              </span>
            </span>
          </div>
          {t > 0 && <>
            <span className="text-[var(--border-strong)]">|</span>
            {/* 滿意度分佈 */}
            <div className="flex items-center gap-2">
              <div className="w-32 h-1.5 rounded-full overflow-hidden flex bg-[rgba(128,128,128,0.15)] gap-px">
                {green > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(green / t) * 100}%`, background: '#16A34A' }} />}
                {yellow > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(yellow / t) * 100}%`, background: '#CA8A04' }} />}
                {orange > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(orange / t) * 100}%`, background: '#EA580C' }} />}
                {red > 0 && <div className="h-full transition-all duration-300" style={{ width: `${(red / t) * 100}%`, background: '#DC2626' }} />}
              </div>
              <div className="flex gap-2">
                {[
                  { color: '#16A34A', label: '滿意', count: green },
                  { color: '#CA8A04', label: '尚可', count: yellow },
                  { color: '#EA580C', label: '不滿', count: orange },
                  { color: '#DC2626', label: '糟糕', count: red },
                ].map(({ color, label, count }) => (
                  <span key={color} className="flex items-center gap-0.5">
                    <span className="inline-block w-[7px] h-[7px] rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-sm font-medium text-[var(--text-secondary)]">{label}</span>
                    <span className="text-sm font-data font-semibold text-[var(--text-secondary)]">{count}人</span>
                  </span>
                ))}
              </div>
            </div>
          </>}
        </div>

        {/* Right: Tab nav + ☰ */}
        <div className="flex items-stretch gap-2">
          {/* 頁面 Tab — 左上右有邊框，active tab 底部開口連接內容區 */}
          <div className="flex self-stretch items-end -mb-px">
            {([
              { key: 'workspace', label: '排位畫布', path: '/' },
              { key: 'guests', label: '賓客名單', path: '/guests' },
              { key: 'import', label: '匯入資料', path: '/import' },
            ] as const).map((tab) => {
              const active = page === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => { if (!active) navigate(tab.path); }}
                  className="px-4 py-2.5 text-sm font-[family-name:var(--font-ui)] font-medium rounded-t-md -mr-px transition-colors duration-150"
                  style={{
                    cursor: active ? 'default' : 'pointer',
                    background: active ? 'var(--bg-primary)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: active ? '1px solid var(--border)' : '1px solid transparent',
                    borderBottom: active ? '1px solid var(--bg-primary)' : '1px solid transparent',
                  }}
                >{tab.label}</button>
              );
            })}
          </div>

          {/* ☰ 選單按鈕 */}
          <div className="relative self-center">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--accent-light)] relative text-[var(--text-secondary)]"
              title="更多"
            >
              <Menu size={18} />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-1 z-50 py-1 min-w-[200px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-md,8px)] shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
                >
                  {/* 登入 / 用戶資訊 */}
                  {authUser ? (
                    <>
                      <div
                        className="px-3 py-2 text-sm truncate text-[var(--text-secondary)] font-[family-name:var(--font-body)]"
                      >
                        {authUser.user_metadata?.name || authUser.email}
                      </div>
                      <button
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--accent-light)] text-[var(--text-secondary)] font-[family-name:var(--font-body)]"
                        onClick={() => { setShowMenu(false); navigate('/settings'); }}
                      >
                        <Settings size={16} className="shrink-0" />
                        <span>設定</span>
                      </button>
                      <button
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--accent-light)] text-[var(--text-secondary)] font-[family-name:var(--font-body)]"
                        onClick={async () => { setShowMenu(false); await signOut(); navigate('/'); }}
                      >
                        <LogOut size={16} className="shrink-0" />
                        <span>登出</span>
                      </button>
                    </>
                  ) : (
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--accent-light)] text-[var(--accent)] font-[family-name:var(--font-body)]"
                      onClick={() => { setShowMenu(false); navigate('/login'); }}
                    >
                      <LogIn size={16} className="shrink-0" />
                      <span>登入</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showAvoidModal && <AvoidPairModal onClose={() => setShowAvoidModal(false)} />}

      {showResetConfirm && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/25" onClick={() => setShowResetConfirm(false)} />
          <div className="relative bg-[var(--bg-surface)] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-80 border border-[var(--border)]">
            <p className="text-base font-semibold text-[var(--text-primary)] mb-2">確定重排？</p>
            <p className="text-sm text-[var(--text-secondary)] mb-4">所有已安排的賓客將移回待排區。可按「還原」回復。</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 rounded-md text-sm border border-[var(--border)] bg-transparent text-[var(--text-secondary)] cursor-pointer">取消</button>
              <button onClick={() => {
                setShowResetConfirm(false);
                animateResetToSidebar();
              }} className="px-4 py-2 rounded-md text-sm border-none bg-[#DC2626] text-white cursor-pointer font-semibold">重排</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showRenameEvent && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/25" onClick={() => setShowRenameEvent(false)} />
          <div className="relative bg-[var(--bg-surface)] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-80 border border-[var(--border)]">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">修改活動名稱</p>
            <input
              autoFocus
              value={renameEventValue}
              onChange={(e) => setRenameEventValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameEvent(); if (e.key === 'Escape') setShowRenameEvent(false); }}
              className="w-full px-2.5 py-2 border border-[var(--accent)] rounded-md text-[13px] outline-none bg-[var(--bg-surface)] text-[var(--text-primary)] box-border font-[inherit]"
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowRenameEvent(false)} className="px-3.5 py-1.5 rounded-md text-xs border border-[var(--border)] bg-transparent text-[var(--text-secondary)] cursor-pointer">取消</button>
              <button onClick={handleRenameEvent} className="px-3.5 py-1.5 rounded-md text-xs border-none bg-[var(--accent)] text-white cursor-pointer font-semibold">確認</button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
          // 進度條顏色依安排百分比，用滿意度色彩邏輯
          const assignBarColor = getSatisfactionColor(assignPct);
          // 分佈條：只收集有值的 segment
          const segments = satItems.filter(({ key }) => stats[key] > 0);
          return (
            <div className="flex-1 min-w-0">
              <div className="mb-3 text-xs font-semibold text-[var(--text-muted)] tracking-wide font-[family-name:var(--font-display)]">
                {label}
              </div>
              {/* 已安排進度 */}
              <div className="flex items-center gap-2 mb-1">
                <span className="font-data font-semibold text-[13px] text-[var(--text-primary)]">
                  {stats.assigned}/{stats.total} 人
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">已安排</span>
              </div>
              <div className="flex mb-3 h-1.5 rounded-sm overflow-hidden bg-[var(--border)]">
                {assignPct > 0 && (
                  <div className="transition-[width] duration-300" style={{ width: `${assignPct}%`, background: assignBarColor }} />
                )}
              </div>
              {/* 滿意度分佈條（色塊之間 1px 間距） */}
              <div className="flex mb-2 h-1.5 rounded-sm overflow-hidden bg-[var(--border)]" style={{ gap: segments.length > 1 ? '1px' : 0 }}>
                {seatedTotal > 0 && segments.map(({ key, color }) => (
                  <div key={key} style={{ width: `${(stats[key] / seatedTotal) * 100}%`, background: color }} />
                ))}
              </div>
              {/* 分佈標籤 */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                {satItems.map(({ key, color, label: satLabel }) =>
                  stats[key] > 0 ? (
                    <span key={key} className="font-data" style={{ color }}>
                      {satLabel} {stats[key]}人
                    </span>
                  ) : null
                )}
              </div>
              {/* 桌數 + 溢出 */}
              <div className="flex gap-3 mt-2 text-xs text-[var(--text-muted)]">
                <span>{stats.tableCount} 桌</span>
                {stats.overflowCount > 0 && (
                  <span className="text-[var(--warning)]">溢出 {stats.overflowCount}人</span>
                )}
              </div>
            </div>
          );
        };

        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowRestoreConfirm(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="restore-modal-title"
              className="bg-white w-full max-w-md p-6 mx-4 rounded-[var(--radius-lg)] shadow-[var(--shadow-md)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="restore-modal-title" className="text-lg font-bold mb-1 font-[family-name:var(--font-display)] text-[var(--text-primary)]">
                讀取快照
              </h2>
              <p className="mb-4 text-[13px] text-[var(--text-secondary)]">
                還原到：<span className="font-medium text-[var(--text-primary)]">{snap.name}</span>
              </p>
              {/* 對比區域 */}
              <div className="flex gap-3 pb-4 mb-4 flex-col min-[480px]:flex-row min-[480px]:items-stretch border-b border-[var(--border)]">
                <StatColumn label="目前" stats={currStats} />
                {/* 箭頭分隔 */}
                <div className="hidden min-[480px]:flex items-center justify-center w-6 shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex min-[480px]:hidden items-center justify-center py-1">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M4 9l4 4 4-4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <StatColumn label="快照" stats={snapStats} />
              </div>
              <p className="text-sm mb-4 text-[var(--warning)]">
                目前的排位將被覆蓋，還原記錄會清空。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRestoreConfirm(false)}
                  className="flex-1 py-2 text-sm font-medium rounded-[var(--radius-sm)] border border-[var(--border-strong)] cursor-pointer hover:bg-[var(--bg-primary)] text-[var(--text-secondary)]"
                >
                  取消
                </button>
                <button
                  onClick={confirmRestore}
                  className="flex-1 py-2 text-sm font-semibold text-white rounded-[var(--radius-sm)] cursor-pointer hover:brightness-90 bg-[var(--accent)] font-[family-name:var(--font-display)]"
                >
                  還原
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
