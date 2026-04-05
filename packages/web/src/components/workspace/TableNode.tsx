import { useRef, useLayoutEffect, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSeatingStore, type Table, type Guest } from '@/stores/seating';
import { getSatisfactionColor, formatScoreDelta } from '@/lib/satisfaction';
import { dampedCounterScale, labelOpacity, satisfactionBlend, blendColors } from '@/lib/viewport';
import { getCategoryColor, loadCategoryColors } from '@/lib/category-colors';
import type { Slot } from '@/lib/seat-shift';

/**
 * 數字漸變動畫 hook — 值改變時平滑過渡
 */
function useAnimatedNumber(target: number, duration = 400): number {
  const [current, setCurrent] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    if (from === target) return;
    prevRef.current = target;

    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setCurrent(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return current;
}


// zoom level 目前只有 normal（overview 模式已停用）

interface Props {
  table: Table
  isSelected: boolean
  isDragging: boolean
  isOverlapping?: boolean
  isDimmed?: boolean
  zoom: number
  onMouseDown: (e: React.MouseEvent) => void
  onEmptySeatClick?: (tableId: string, seatIndex: number, e: React.MouseEvent) => void
}

/**
 * 取得姓名的後 2 個字
 */
function getDisplayName(name: string, aliases?: string[]): string {
  // 優先用暱稱（第一個），沒有再用名字後兩字
  if (aliases && aliases.length > 0) {
    const nick = aliases[0];
    if (nick.length <= 3) return nick;
    return nick.slice(0, 3);
  }
  if (name.length <= 2) return name;
  return name.slice(-2);
}

/** 桌次中央滿意度圓環（數字 + 進度弧線帶動畫） */
function TableScoreRing({ score, originalScore, hasGuests, hideDelta }: { score: number; originalScore: number; hasGuests: boolean; hideDelta?: boolean }) {
  const ringRadius = 28;
  const strokeW = 5;
  const circumference = 2 * Math.PI * ringRadius;

  const roundedScore = Math.round(score);
  const animatedScore = useAnimatedNumber(roundedScore);
  const progress = Math.min(animatedScore / 100, 1);
  const color = getSatisfactionColor(animatedScore);

  const rawDelta = score - originalScore;
  const delta = formatScoreDelta(rawDelta);
  const scale = rawDelta > 0.1 ? 1.25 : rawDelta < -0.1 ? 0.8 : 1;

  return (
    <g>
      {/* 圓環 + 數字（帶縮放） */}
      <g style={{ transform: `scale(${scale})`, transition: 'transform 200ms ease-out', transformOrigin: '0 0' }}>
        <circle r={ringRadius} fill="none" stroke="#E7E5E4" strokeWidth={strokeW} />
        {hasGuests && (
          <circle
            r={ringRadius}
            fill="none"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDashoffset={circumference * 0.25}
            transform="rotate(-90)"
            style={{
              stroke: color,
              strokeDasharray: `${circumference * progress} ${circumference * (1 - progress)}`,
              transition: 'stroke 400ms ease-out',
            }}
          />
        )}
        <text
          y={hasGuests ? 8 : 6}
          textAnchor="middle"
          fontSize={hasGuests ? '26' : '14'}
          fontWeight="800"
          fontFamily="'Plus Jakarta Sans', sans-serif"
          style={{ fill: hasGuests ? color : '#A8A29E', transition: 'fill 400ms ease-out' }}
        >
          {hasGuests ? animatedScore : '空桌'}
        </text>
      </g>
      {/* ±N badge（在縮放 group 外面，不受影響） */}
      {delta !== 0 && !hideDelta && (
        <g transform={`translate(0, ${ringRadius + 16})`}>
          <rect
            x={-22}
            y={-13}
            width={44}
            height={26}
            rx={13}
            fill={delta > 0 ? '#16A34A' : '#DC2626'}
          />
          <text
            y={5}
            textAnchor="middle"
            fill="white"
            fontSize="14"
            fontWeight="700"
            fontFamily="'Plus Jakarta Sans', sans-serif"
          >
            {delta > 0 ? '+' : ''}{delta}
          </text>
        </g>
      )}
    </g>
  );
}

export function TableNode({ table, isSelected, isDragging, isOverlapping, isDimmed, zoom, onMouseDown, onEmptySeatClick }: Props) {
  const counterScale = 1 / zoom; // 桌名等維持固定螢幕大小
  const rawGuestScale = dampedCounterScale(zoom); // 賓客元素：阻尼縮小
  const nameAlpha = labelOpacity(zoom);         // 名字漸進淡出
  const satBlend = satisfactionBlend(zoom);     // 填色從分類色→滿意度色
  const eventId = useSeatingStore((s) => s.eventId);
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);
  const getTableGuests = useSeatingStore((s) => s.getTableGuests);
  const getTableSeatCount = useSeatingStore((s) => s.getTableSeatCount);
  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const dragPreview = useSeatingStore((s) => s.dragPreview);
  const activeDragGuestId = useSeatingStore((s) => s.activeDragGuestId);
  const dragRejectTableId = useSeatingStore((s) => s.dragRejectTableId);
  const recommendationTableScores = useSeatingStore((s) => s.recommendationTableScores);
  const hoveredGuestId = useSeatingStore((s) => s.hoveredGuestId);
  const recommendationGuestScore = useSeatingStore((s) => s.recommendationGuestScore);
  const guestsWithRecommendations = useSeatingStore((s) => s.guestsWithRecommendations);
  const seatPreviewGuest = useSeatingStore((s) => s.seatPreviewGuest);
  const allGuests = useSeatingStore((s) => s.guests);
  const isResetting = useSeatingStore((s) => s.isResetting);
  const flyingGuestIds = useSeatingStore((s) => s.flyingGuestIds);
  const clearTable = useSeatingStore((s) => s.clearTable);
  const setSelectedTable = useSeatingStore((s) => s.setSelectedTable);
  const removeTable = useSeatingStore((s) => s.removeTable);
  const updateTableName = useSeatingStore((s) => s.updateTableName);
  const updateTableCapacity = useSeatingStore((s) => s.updateTableCapacity);

  const [_isHovered, setIsHovered] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showActionConfirm, setShowActionConfirm] = useState(false);
  const [renameValue, setRenameValue] = useState(table.name);
  const [capacityValue, setCapacityValue] = useState(table.capacity);
  // 量測桌名文字長度，用來精確定位圖示
  const namePathRef = useRef<SVGTextPathElement>(null);
  const [nameTextLength, setNameTextLength] = useState(table.name.length * 20);

  const guests = getTableGuests(table.id);
  const seatCount = getTableSeatCount(table.id);
  const isOverCapacity = seatCount > table.capacity;

  // 檢查此桌是否有避免同桌違規，並記錄哪些賓客涉及
  const guestIds = guests.map((g) => g.id);
  const violatingGuestIds = new Set<string>();
  for (const ap of avoidPairs) {
    if (guestIds.includes(ap.guestAId) && guestIds.includes(ap.guestBId)) {
      violatingGuestIds.add(ap.guestAId);
      violatingGuestIds.add(ap.guestBId);
    }
  }
  // 拖曳預覽時：檢查被拖的賓客是否跟此桌的人有衝突
  const previewDragId = dragPreview?.tableId === table.id ? dragPreview.draggedGuestId : null;
  if (previewDragId) {
    for (const ap of avoidPairs) {
      const isConflict =
        (ap.guestAId === previewDragId && guestIds.includes(ap.guestBId)) ||
        (ap.guestBId === previewDragId && guestIds.includes(ap.guestAId));
      if (isConflict) {
        violatingGuestIds.add(ap.guestAId);
        violatingGuestIds.add(ap.guestBId);
      }
    }
  }

  // 桌次大小依容量固定（要放得下所有座位圈圈）
  const baseRadius = 58 + Math.min(table.capacity, 12) * 7;
  const radius = Math.max(baseRadius, 88);

  // 賓客圈圈大小上限：不超出桌子、不互相擠壓
  const seatRadius = radius - 34;
  const maxByTable = 34 - 2; // 不超出桌緣（34 = radius - seatRadius，留 2px padding）
  const maxBySeat = seatRadius * Math.sin(Math.PI / table.capacity) - 2; // 相鄰不重疊
  const maxGuestR = Math.min(maxByTable, maxBySeat);
  const guestScale = Math.min(rawGuestScale, maxGuestR / 20); // cap: 20 * guestScale <= maxGuestR

  // 拖曳 hover 但無法放置（滿桌）
  const isRejectTable = dragRejectTableId === table.id;

  // 是否有此桌的拖曳預覽
  const isPreviewTable = dragPreview?.tableId === table.id;
  const previewSlots = isPreviewTable ? dragPreview.previewSlots : null;
  // 預覽滿意度分數（拖曳中即時計算 — 適用於所有桌，不只目標桌）
  const previewScores = dragPreview ? dragPreview.previewScores : null;
  const previewTableScore = dragPreview?.previewTableScores?.get(table.id);

  // 拖曳中的賓客一律不顯示在任何桌上（他跟著游標走）
  const filteredGuests = activeDragGuestId
    ? guests.filter((g) => g.id !== activeDragGuestId)
    : guests;

  // 預覽時需要所有賓客資料（被位移的人可能需要查找）
  const guestPool = isPreviewTable ? allGuests.filter((g) => g.rsvpStatus === 'confirmed') : filteredGuests;

  // 飛行動畫中的賓客視為尚未入座（空位+弧線不提前更新）
  const layoutGuests = flyingGuestIds.size > 0
    ? guestPool.filter((g) => !flyingGuestIds.has(g.id))
    : guestPool;

  // 所有座位（含空位），依 capacity 固定數量
  const allSeats = buildSeatLayout(layoutGuests, table.capacity, radius, previewSlots);

  // FLIP 動畫：追蹤座位元素的前一次位置
  const seatRefsMap = useRef<Map<string, SVGGElement>>(new Map());
  const prevPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  // 在 DOM 更新前捕捉當前位置（FLIP: First）
  // 因為 React 在 render 後才更新 DOM，我們在這裡先記錄 "即將被替換" 的位置
  const currentPositions = new Map<string, { x: number; y: number }>();
  for (const seat of allSeats) {
    if (seat.guest) {
      const key = seat.type === 'companion' ? `guest-${seat.guest.id}-c${seat.companionIndex}` : `guest-${seat.guest.id}-main`;
      currentPositions.set(key, { x: seat.x, y: seat.y });
    }
  }

  useLayoutEffect(() => {
    // FLIP: Last → Invert → Play
    const prev = prevPositions.current;
    for (const [key, newPos] of currentPositions) {
      const oldPos = prev.get(key);
      if (!oldPos) continue;

      const dx = oldPos.x - newPos.x;
      const dy = oldPos.y - newPos.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

      // 跳過正在飛行動畫中的賓客（undo 動畫已處理過渡）
      const guestId = key.replace(/^guest-/, '').replace(/-(main|c\d+)$/, '');
      if (flyingGuestIds.has(guestId) || isResetting) continue;

      const el = seatRefsMap.current.get(key);
      if (!el) continue;

      // Invert + Play：從舊位置動畫到新位置
      el.animate(
        [
          { transform: `translate(${newPos.x + dx}px, ${newPos.y + dy}px)` },
          { transform: `translate(${newPos.x}px, ${newPos.y}px)` },
        ],
        { duration: 200, easing: 'ease-out' },
      );
    }

    // 更新記錄
    prevPositions.current = currentPositions;
  });

  // 量測桌名文字長度（用於圖示定位）
  useLayoutEffect(() => {
    if (namePathRef.current) {
      const len = namePathRef.current.getComputedTextLength();
      if (len > 0) setNameTextLength(len);
    }
  }, [table.name, radius]);

  // 眷屬群組弧線
  const groupArcs = buildGroupArcsFromSeats(allSeats, table.capacity, radius);

  const handleRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== table.name) updateTableName(table.id, trimmed);
    if (capacityValue !== table.capacity) updateTableCapacity(table.id, capacityValue);
    setShowRenameModal(false);
  };

  const handleActionConfirm = () => {
    if (guests.length > 0) {
      clearTable(table.id);
      setSelectedTable(null);
    } else {
      removeTable(table.id);
    }
    setShowActionConfirm(false);
  };

  const showIcons = isSelected && !isDragging;
  const iconR = 14;
  // 弧線參數化：t ∈ [0,1]，x(t) = -R·cos(t·π)，y(t) = -R·sin(t·π)
  // textArcR = 文字 baseline 所在弧線（與 textPath 一致）
  // iconArcR = 圖示中心所在弧線，需往外偏移約半個字高，使圖示視覺中心對齊文字中心
  const textArcR = radius + 12;
  const fontSize = 20;
  const iconArcR = textArcR + fontSize * 0.55;  // baseline → 文字視覺中心
  const arcLength = Math.PI * textArcR;
  const iconPad = 20 * counterScale;  // 文字邊緣到圖示中心的間距（螢幕 px），隨 zoom 反向縮放
  const tEdit = Math.max(0.04, 0.5 - (nameTextLength / 2 + iconPad) / arcLength);
  const tDelete = Math.min(0.96, 0.5 + (nameTextLength / 2 + iconPad) / arcLength);
  const editX = -iconArcR * Math.cos(tEdit * Math.PI);
  const editY = -iconArcR * Math.sin(tEdit * Math.PI);
  const deleteX = -iconArcR * Math.cos(tDelete * Math.PI);
  const deleteY = -iconArcR * Math.sin(tDelete * Math.PI);
  // 動畫起點：桌子中心（從外層 <g> 反推 = 負的終點座標）
  // 圖示畫在桌子圓形之前，所以在桌面內的路程被桌子蓋住，穿越邊緣後彈出
  const editFromX = -editX;
  const editFromY = -editY;
  const deleteFromX = -deleteX;
  const deleteFromY = -deleteY;

  return (
    <>
    <g
      data-table-id={table.id}
      transform={`translate(${table.positionX}, ${table.positionY})`}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`${isDragging ? 'cursor-grabbing' : 'cursor-grab'} transition-opacity duration-200 ease-out`}
      opacity={isDimmed ? 0.2 : isOverlapping ? 0.4 : 1}
    >
      {/* 操作圖示 — 畫在桌子圓形之前，讓桌面蓋住圖示（從背後彈出效果） */}
      {showIcons && (
        <>
          <g
            className="table-btn-edit cursor-pointer"
            transform={`translate(${editX}, ${editY}) scale(${counterScale})`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setRenameValue(table.name); setCapacityValue(table.capacity); setShowRenameModal(true); }}
          >
            <g className="table-icon-pop" style={{ '--icon-from-x': `${editFromX * zoom}px`, '--icon-from-y': `${editFromY * zoom}px` } as React.CSSProperties}>
              <circle r={iconR} fill="white" stroke="#D6D3D1" strokeWidth="1.5" />
              {/* Pencil icon (lucide) */}
              <g fill="none" stroke="#78716C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(-6,-6) scale(0.5)">
                <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                <path d="m15 5 4 4" />
              </g>
            </g>
          </g>
          <g
            className="table-btn-delete cursor-pointer"
            transform={`translate(${deleteX}, ${deleteY}) scale(${counterScale})`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowActionConfirm(true); }}
          >
            <g className="table-icon-pop" style={{ '--icon-from-x': `${deleteFromX * zoom}px`, '--icon-from-y': `${deleteFromY * zoom}px` } as React.CSSProperties}>
              <circle r={iconR} fill="white" stroke="#FECACA" strokeWidth="1.5" />
              {/* X icon (lucide) */}
              <g fill="none" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(-6,-6) scale(0.5)">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </g>
            </g>
          </g>
        </>
      )}

      {/* 對話框 badge — counter-scale 維持固定螢幕大小 */}
      {isOverCapacity && (
        <g transform={`translate(${radius * 0.8}, ${-radius - 8 * counterScale}) scale(${counterScale})`}>
          <rect x={0} y={0} width={88} height={32} rx={6} fill="#EA580C" />
          <polygon points="10,32 0,46 20,32" fill="#EA580C" />
          <text x={44} y={22} textAnchor="middle" fill="white" fontSize="16" fontWeight="600" fontFamily="'Noto Sans TC', sans-serif">
            超過容量{seatCount - table.capacity}
          </text>
        </g>
      )}
      {isRejectTable && (
        <g transform={`translate(${radius * 0.8}, ${-radius - (8 + (isOverCapacity ? 36 : 0)) * counterScale}) scale(${counterScale})`}>
          <rect x={0} y={0} width={64} height={32} rx={6} fill="#991B1B" />
          <polygon points="10,32 0,46 20,32" fill="#991B1B" />
          <text x={32} y={22} textAnchor="middle" fill="white" fontSize="16" fontWeight="600" fontFamily="'Noto Sans TC', sans-serif">
            滿桌
          </text>
        </g>
      )}

      {/* 桌次圓形 — 畫在 badge 之後，蓋住尖角底部 */}
      <circle
        r={radius}
        fill={isRejectTable ? '#FEF2F2' : 'white'}
        stroke={isRejectTable ? '#DC2626' : '#D6D3D1'}
        strokeWidth={isRejectTable ? 2 : 1.5}
      />

      {/* 選中時外圈虛線 */}
      {isSelected && (
        <circle
          r={radius + 6}
          fill="none"
          stroke="#B08D57"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
      )}

      {/* 桌名（沿桌子上方弧形彎曲）— fontSize 補償 zoom 維持固定螢幕大小 */}
      <defs>
        <path
          id={`table-name-path-${table.id}`}
          d={`M ${-(radius + 12)},0 A ${radius + 12},${radius + 12} 0 0,1 ${radius + 12},0`}
          fill="none"
        />
      </defs>
      <text
        fill="#1C1917"
        fontSize={20 * counterScale}
        fontWeight="bold"
        fontFamily="'Noto Sans TC', 'Plus Jakarta Sans', sans-serif"
      >
        <textPath
          ref={namePathRef}
          href={`#table-name-path-${table.id}`}
          startOffset="50%"
          textAnchor="middle"
        >
          {table.name}
        </textPath>
      </text>

      {/* 滿意度圓環進度條 + 中央數字 — 比賓客更強的阻尼，縮小時相對變大 */}
      <g transform={`scale(${Math.pow(zoom, -0.45)})`} style={{ opacity: isResetting ? 0 : 1 }}>
        <TableScoreRing
          hideDelta
          score={(() => {
            if (previewTableScore != null) return previewTableScore;
            const recScore = recommendationTableScores.get(table.id);
            if (recScore != null) {
              // 已入座賓客的推薦受 zoom 限制，待排賓客的推薦不受限
              const hoveredGuest = hoveredGuestId ? allGuests.find((g) => g.id === hoveredGuestId) : null;
              if (zoom >= 0.7 || (hoveredGuest && !hoveredGuest.assignedTableId)) return recScore;
            }
            return guests.length > 0 ? table.averageSatisfaction : 0;
          })()}
          originalScore={guests.length > 0 ? table.averageSatisfaction : 0}
          hasGuests={(() => {
            if (guests.length > 0) return true;
            if (!recommendationTableScores.has(table.id)) return false;
            const hoveredGuest = hoveredGuestId ? allGuests.find((g) => g.id === hoveredGuestId) : null;
            return zoom >= 0.7 || (hoveredGuest != null && !hoveredGuest.assignedTableId);
          })()}
        />
      </g>

      {/* 眷屬群組：圓頭筆刷弧線 — isResetting 時隱藏 */}
      {!isResetting && groupArcs.map((arc, i) => (
        <path
          key={`arc-${i}`}
          d={arc.path}
          fill="none"
          stroke={getCategoryColor(arc.category, categoryColors).background}
          strokeWidth={40 * guestScale}
          strokeLinecap="round"
          opacity={0.5}
        />
      ))}

      {/* 空位（靜態）— isResetting 時隱藏，含 "+" 可點擊 */}
      {!isResetting && allSeats.filter((s) => s.type === 'empty').map((seat) => {
        const isPreview = seatPreviewGuest?.tableId === table.id && seatPreviewGuest?.seatIndex === seat.seatIndex;
        const previewScore = isPreview ? seatPreviewGuest.predictedScore : 0;
        const previewCategory = isPreview ? seatPreviewGuest.category : undefined;
        const previewBgColor = isPreview ? getCategoryColor(previewCategory, categoryColors).background : undefined;
        const previewSatColor = isPreview ? getSatisfactionColor(previewScore) : undefined;
        const guestR = 20 * guestScale;
        const guestRingR = guestR + 3 * guestScale;
        const guestCircum = 2 * Math.PI * guestRingR;
        const guestProgress = previewScore / 100;

        return (
          <g
            key={`empty-${seat.seatIndex}`}
            style={{ cursor: nameAlpha > 0 ? 'pointer' : 'default' }}
            onClick={(e) => {
              if (nameAlpha <= 0) return;
              e.stopPropagation();
              onEmptySeatClick?.(table.id, seat.seatIndex, e);
            }}
          >
            {isPreview ? (
              /* 預覽賓客：帶滿意度進度圈的賓客圓形 */
              <g style={{ transform: `translate(${seat.x}px, ${seat.y}px)`, opacity: 0.75 }}>
                {nameAlpha > 0 && (
                  <>
                    <circle r={guestRingR} fill="none" stroke="#E7E5E4" strokeWidth={2 * guestScale} opacity={nameAlpha} />
                    {previewScore > 0 && (
                      <circle
                        r={guestRingR}
                        fill="none"
                        strokeWidth={2 * guestScale}
                        strokeLinecap="round"
                        strokeDashoffset={guestCircum * 0.25}
                        transform="rotate(-90)"
                        opacity={nameAlpha}
                        style={{
                          stroke: previewSatColor,
                          strokeDasharray: `${guestCircum * guestProgress} ${guestCircum * (1 - guestProgress)}`,
                        }}
                      />
                    )}
                  </>
                )}
                <circle r={guestR} fill={blendColors(previewBgColor!, previewSatColor!, satBlend)} stroke="white" strokeWidth={1.5 * guestScale} />
                {nameAlpha > 0 && (
                  <text
                    y={6 * guestScale}
                    textAnchor="middle"
                    fill={getCategoryColor(previewCategory, categoryColors).color}
                    fontSize={16 * guestScale}
                    fontWeight="500"
                    fontFamily="'Noto Sans TC', sans-serif"
                    opacity={nameAlpha}
                  >
                    {getDisplayName(seatPreviewGuest.name, seatPreviewGuest.aliases)}
                  </text>
                )}
              </g>
            ) : (
              /* 普通空位：虛線圈圈 + "+" */
              <>
                <circle
                  cx={seat.x}
                  cy={seat.y}
                  r={guestR}
                  fill="none"
                  stroke="#D6D3D1"
                  strokeWidth={1.5 * guestScale}
                  strokeDasharray={`${4 * guestScale} ${3 * guestScale}`}
                />
                {nameAlpha > 0 && (
                  <text
                    x={seat.x}
                    y={seat.y + 6 * guestScale}
                    textAnchor="middle"
                    fontSize={18 * guestScale}
                    fontWeight="300"
                    fontFamily="'Plus Jakarta Sans', sans-serif"
                    style={{ fill: `rgba(168,162,158,${nameAlpha})`, pointerEvents: 'none' }}
                  >
                    +
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}

      {/* 賓客圖層 — 重排時立刻隱藏（浮動圓圈取代） */}
      <g style={{
        opacity: isResetting ? 0 : 1,
      }}>

      {/* 有人的座位（賓客 + 眷屬），用 guest ID 作為穩定 key + FLIP 動畫 */}
      {allSeats.filter((s) => s.type !== 'empty').map((seat) => {
        const key = `guest-${seat.guest!.id}-${seat.type === 'companion' ? `c${seat.companionIndex}` : 'main'}`;
        const setRef = (el: SVGGElement | null) => {
          if (el) seatRefsMap.current.set(key, el);
          else seatRefsMap.current.delete(key);
        };

        const isFlying = flyingGuestIds.has(seat.guest!.id);

        if (seat.type === 'companion' || seat.type === 'overflow-companion') {
          const companionCatColor = getCategoryColor(seat.guest!.category, categoryColors);
          const bgColor = companionCatColor.background;
          const textColor = companionCatColor.color;
          const totalCompanions = seat.guest!.companionCount;
          const isLast = seat.companionIndex === totalCompanions;
          return (
            <g key={key} ref={setRef} style={{ transform: `translate(${seat.x}px, ${seat.y}px)`, opacity: isFlying ? 0 : undefined }}>
              <circle
                r={20 * guestScale}
                fill={bgColor}
                stroke="white"
                strokeWidth={1.5 * guestScale}
                opacity={0.6}
              />
              {isLast && nameAlpha > 0 && (
                <text
                  y={6 * guestScale}
                  textAnchor="middle"
                  fill={textColor}
                  fontSize={14 * guestScale}
                  fontWeight="600"
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  opacity={0.7 * nameAlpha}
                >
                  +{totalCompanions}
                </text>
              )}
            </g>
          );
        }

        // 賓客本人
        const guestCatColor = getCategoryColor(seat.guest!.category, categoryColors);
        const bgColor = guestCatColor.background;
        const textColor = guestCatColor.color;
        const displayName = getDisplayName(seat.guest!.name, seat.guest!.aliases);
        const recGuestScore = recommendationGuestScore?.guestId === seat.guest!.id ? recommendationGuestScore.score : undefined;
        const guestScore = previewScores?.get(seat.guest!.id) ?? recGuestScore ?? seat.guest!.satisfactionScore;
        const guestSatColor = getSatisfactionColor(guestScore);
        const guestR = 20 * guestScale;
        const guestRingR = guestR + 3 * guestScale;
        const guestCircum = 2 * Math.PI * guestRingR;
        const guestProgress = Math.min(guestScore / 100, 1);
        // 縮小時填色從分類色漸變到滿意度色
        const fillColor = blendColors(bgColor, guestSatColor, satBlend);

        return (
          <g key={key} ref={setRef} style={{ transform: `translate(${seat.x}px, ${seat.y}px)`, opacity: isFlying ? 0 : undefined }}>
            {/* 滿意度進度圈 — 縮小時漸進淡出 */}
            {nameAlpha > 0 && (
              <>
                <circle
                  r={guestRingR}
                  fill="none"
                  stroke="#E7E5E4"
                  strokeWidth={2 * guestScale}
                  opacity={nameAlpha}
                />
                {guestScore > 0 && (
                  <circle
                    r={guestRingR}
                    fill="none"
                    strokeWidth={2 * guestScale}
                    strokeLinecap="round"
                    strokeDashoffset={guestCircum * 0.25}
                    transform="rotate(-90)"
                    opacity={nameAlpha}
                    style={{
                      stroke: guestSatColor,
                      strokeDasharray: `${guestCircum * guestProgress} ${guestCircum * (1 - guestProgress)}`,
                      transition: 'stroke-dasharray 400ms ease-out, stroke 400ms ease-out',
                    }}
                  />
                )}
              </>
            )}
            {/* 賓客圓形 */}
            <circle
              r={guestR}
              fill={fillColor}
              stroke="white"
              strokeWidth={1.5 * guestScale}
            />
            {nameAlpha > 0 && (
              <text
                y={6 * guestScale}
                textAnchor="middle"
                fill={textColor}
                fontSize={16 * guestScale}
                fontWeight="500"
                fontFamily="'Noto Sans TC', sans-serif"
                opacity={nameAlpha}
              >
                {displayName}
              </text>
            )}
          </g>
        );
      })}

      {/* 圖示層：怒氣 + 推薦（在所有賓客之上）— 縮小時跟名字一起淡出 */}
      {nameAlpha > 0 && allSeats.filter((s) => s.type === 'guest' && s.guest).map((seat) => {
        const guestR = 20 * guestScale;
        const hasViolation = violatingGuestIds.has(seat.guest!.id);
        const hasRecommendation = zoom >= 0.7 && guestsWithRecommendations.has(seat.guest!.id);

        if (!hasViolation && !hasRecommendation) return null;

        return (
          <g key={`icon-${seat.guest!.id}`} style={{ transform: `translate(${seat.x}px, ${seat.y}px)` }}>
            {hasViolation && (
              <g transform={`translate(${guestR + 4}, ${-guestR - 4})`}>
                <path
                  d="M-9,7 A12,12 0 1,1 -5,10 L-14,16 Z"
                  fill="white"
                  stroke="#DC2626"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <g transform="translate(0,-1)">
                  <path
                    d="M-1.5,-6 Q-1.5,-1.5 -6,-1.5 M1.5,-6 Q1.5,-1.5 6,-1.5 M-1.5,6 Q-1.5,1.5 -6,1.5 M1.5,6 Q1.5,1.5 6,1.5"
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </g>
              </g>
            )}
            {hasRecommendation && (
              <g transform={`translate(${-guestR - 4}, ${-guestR - 4})`}>
                <path
                  d="M9,7 A12,12 0 1,0 5,10 L14,16 Z"
                  fill="white"
                  stroke="#B08D57"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                {/* ArrowLeftRight icon (lucide) */}
                <g fill="none" stroke="#B08D57" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="translate(-7,-7.5) scale(0.58)">
                  <path d="M8 3 4 7l4 4" />
                  <path d="M4 7h16" />
                  <path d="m16 21 4-4-4-4" />
                  <path d="M20 17H4" />
                </g>
              </g>
            )}
          </g>
        );
      })}

      </g>{/* 結束賓客圖層 */}

      {/* ±N badge — 渲染在所有賓客之上 */}
      {(() => {
        const ringScore = (() => {
          if (previewTableScore != null) return previewTableScore;
          const recScore = recommendationTableScores.get(table.id);
          if (recScore != null) {
            const hg = hoveredGuestId ? allGuests.find((g) => g.id === hoveredGuestId) : null;
            if (zoom >= 0.7 || (hg && !hg.assignedTableId)) return recScore;
          }
          return guests.length > 0 ? table.averageSatisfaction : 0;
        })();
        const origScore = guests.length > 0 ? table.averageSatisfaction : 0;
        const d = formatScoreDelta(ringScore - origScore);
        if (d === 0) return null;
        const badgeScale = 1 / zoom; // badge 維持固定螢幕大小
        // 中央分數圈用 zoom^(-0.45) 縮放，半徑 28，換算成 badge 座標系的偏移
        const ringScreenR = 28 * Math.pow(zoom, -0.45);
        const offsetInBadgeSpace = ringScreenR * zoom + 16; // 轉到 badgeScale 座標系
        return (
          <g transform={`scale(${badgeScale})`}>
            <g transform={`translate(0, ${offsetInBadgeSpace})`}>
              <rect x={-22} y={-13} width={44} height={26} rx={13} fill={d > 0 ? '#16A34A' : '#DC2626'} />
              <text y={5} textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="'Plus Jakarta Sans', sans-serif">
                {d > 0 ? '+' : ''}{d}
              </text>
            </g>
          </g>
        );
      })()}

    </g>

    {/* 改名 modal */}
    {showRenameModal && createPortal(
      <div className="fixed inset-0 z-[999] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/25" onClick={() => setShowRenameModal(false)} />
        <div className="relative bg-[var(--bg-surface)] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[300px] border border-[var(--border)]">
          <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">編輯桌次</p>
          <label className="block text-[12px] text-[var(--text-muted)] mb-1">桌名</label>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setShowRenameModal(false); }}
            className="w-full px-2.5 py-2 border border-[var(--accent)] rounded-md text-[13px] outline-none bg-[var(--bg-surface)] text-[var(--text-primary)] box-border font-inherit"
          />
          <label className="block text-[12px] text-[var(--text-muted)] mt-3 mb-1">座位數</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCapacityValue((v) => Math.max(Math.max(8, seatCount), v - 1))}
              disabled={capacityValue <= Math.max(8, seatCount)}
              className="w-8 h-8 rounded-md border border-[var(--border)] flex items-center justify-center text-base bg-[var(--bg-surface)] cursor-pointer disabled:opacity-40 disabled:cursor-default text-[var(--text-secondary)]"
            >−</button>
            <span className="text-[15px] font-semibold text-[var(--text-primary)] min-w-[32px] text-center tabular-nums">{capacityValue}</span>
            <button
              onClick={() => setCapacityValue((v) => Math.min(12, v + 1))}
              disabled={capacityValue >= 12}
              className="w-8 h-8 rounded-md border border-[var(--border)] flex items-center justify-center text-base bg-[var(--bg-surface)] cursor-pointer disabled:opacity-40 disabled:cursor-default text-[var(--text-secondary)]"
            >+</button>
            <span className="text-[12px] text-[var(--text-muted)] ml-1">位</span>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setShowRenameModal(false)} className="px-3.5 py-1.5 rounded-md text-xs border border-[var(--border)] bg-transparent text-[var(--text-secondary)] cursor-pointer">取消</button>
            <button onClick={handleRename} className="px-3.5 py-1.5 rounded-md text-xs border-none bg-[var(--accent)] text-white cursor-pointer font-semibold">確認</button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* 清空/刪除 modal */}
    {showActionConfirm && createPortal(
      <div className="fixed inset-0 z-[999] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/25" onClick={() => setShowActionConfirm(false)} />
        <div className="relative bg-[var(--bg-surface)] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[300px] border border-[var(--border)]">
          <p className="text-base font-semibold text-[var(--text-primary)] mb-1.5">
            {guests.length > 0 ? `清空「${table.name}」？` : `刪除「${table.name}」？`}
          </p>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            {guests.length > 0
              ? `此桌的 ${guests.length} 位賓客將移回未安排。`
              : '此桌為空桌，將直接刪除。'}
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowActionConfirm(false)} className="px-4 py-2 rounded-md text-sm border border-[var(--border)] bg-transparent text-[var(--text-secondary)] cursor-pointer">取消</button>
            <button onClick={handleActionConfirm} className="px-4 py-2 rounded-md text-sm border-none bg-[#DC2626] text-white cursor-pointer font-semibold">
              {guests.length > 0 ? '清空' : '刪除'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}

interface Seat {
  type: 'guest' | 'companion' | 'empty' | 'overflow' | 'overflow-companion'
  guest: Guest | null
  companionIndex?: number // 第幾個眷屬（從 1 開始）
  seatIndex: number // 圓桌上的座位索引
  x: number
  y: number
}

/**
 * 計算座位角度位置
 */
function seatPosition(seatIndex: number, totalSlots: number, seatRadius: number) {
  const angle = ((2 * Math.PI) / totalSlots) * seatIndex - Math.PI / 2;
  return {
    x: Math.cos(angle) * seatRadius,
    y: Math.sin(angle) * seatRadius,
  };
}

/**
 * 建立座位佈局（使用 seatIndex）：
 * - 統一走 Slot[] → Seat[] 的 code path（不管有沒有 preview）
 * - 確保 React 元素結構穩定，CSS transition 能正常運作
 */
function buildSeatLayout(
  guests: Guest[],
  capacity: number,
  tableRadius: number,
  previewSlots?: Slot[] | null,
): Seat[] {
  const totalSlots = capacity;
  const seatRadius = tableRadius - 34;

  // Step 1: 建立 Slot[] — preview 時直接用，正常時從 guests 建立
  let slots: Slot[];
  if (previewSlots) {
    slots = previewSlots;
  } else {
    slots = new Array(totalSlots).fill(null);
    for (const guest of guests) {
      const startIdx = guest.seatIndex ?? 0;
      const immovable = guest.seatCount > 1;
      if (startIdx < totalSlots) {
        slots[startIdx] = { guestId: guest.id, isCompanion: false, immovable };
      }
      for (let c = 1; c < guest.seatCount; c++) {
        const idx = (startIdx + c) % totalSlots;
        slots[idx] = { guestId: guest.id, isCompanion: true, immovable };
      }
    }
  }

  // Step 2: 統一 code path — 從 Slot[] 轉成 Seat[]
  const guestMap = new Map<string, Guest>();
  for (const g of guests) guestMap.set(g.id, g);

  const seats: Seat[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const slot = slots[i];
    const pos = seatPosition(i, totalSlots, seatRadius);

    if (!slot) {
      seats.push({ type: 'empty', guest: null, seatIndex: i, ...pos });
    } else if (slot.isCompanion) {
      const guest = guestMap.get(slot.guestId) || null;
      // 計算 companionIndex（用 circular offset，支援 wrap-around）
      const mainSeatIdx = guest?.seatIndex ?? 0;
      const companionIdx = (i - mainSeatIdx + totalSlots) % totalSlots;
      seats.push({ type: 'companion', guest, companionIndex: companionIdx, seatIndex: i, ...pos });
    } else {
      const guest = guestMap.get(slot.guestId) || null;
      seats.push({ type: 'guest', guest, seatIndex: i, ...pos });
    }
  }

  return seats;
}

interface GroupArc {
  path: string
  category: string
}

/**
 * 從 allSeats 建立眷屬群組弧線
 */
function buildGroupArcsFromSeats(
  allSeats: Seat[],
  capacity: number,
  tableRadius: number,
): GroupArc[] {
  const seatRadius = tableRadius - 34;
  const totalSlots = capacity;
  const arcs: GroupArc[] = [];

  // 找出帶眷屬的賓客，取得他們的起始 seatIndex 和佔位數
  const processed = new Set<string>();

  for (const seat of allSeats) {
    if (!seat.guest || seat.type !== 'guest') continue;
    if (processed.has(seat.guest.id)) continue;
    processed.add(seat.guest.id);

    if (seat.guest.seatCount < 2) continue;

    const startIndex = seat.seatIndex;
    const seatCount = seat.guest.seatCount;

    const angleStep = (2 * Math.PI) / totalSlots;
    const startAngle = angleStep * startIndex - Math.PI / 2;
    const endAngle = angleStep * ((startIndex + seatCount - 1) % totalSlots) - Math.PI / 2;

    // 處理環形情況
    let sweepAngle = endAngle - startAngle;
    if (sweepAngle < 0) sweepAngle += 2 * Math.PI;
    const largeArc = sweepAngle > Math.PI ? 1 : 0;

    const x1 = Math.cos(startAngle) * seatRadius;
    const y1 = Math.sin(startAngle) * seatRadius;
    const x2 = Math.cos(endAngle) * seatRadius;
    const y2 = Math.sin(endAngle) * seatRadius;

    arcs.push({
      path: `M ${x1} ${y1} A ${seatRadius} ${seatRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
      category: seat.guest.category,
    });
  }

  return arcs;
}

