import { useEffect, useRef, useState } from 'react';
import { getSatisfactionColor } from '@/lib/satisfaction';
import type { DemoGuest, DemoTable } from './demoScorer';

/** 數字漸變動畫（對齊 workspace TableNode:13 的 useAnimatedNumber）*/
function useAnimatedNumber(target: number, duration = 500): number {
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
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return current;
}

// ─── Dynamic geometry — 對齊 workspace TableNode 公式 ─
interface Geometry {
  CONTAINER: number;
  CENTER: number;
  TABLE_RADIUS: number;
  SEAT_RADIUS: number;
  GUEST_R: number;
  RING_R: number;
}

function computeGeometry(capacity: number): Geometry {
  // workspace 公式變形: radius 隨 capacity 線性增長
  const TABLE_RADIUS = Math.max(82, 54 + capacity * 6);
  const SEAT_RADIUS = TABLE_RADIUS - 30;
  // chip 隨 capacity 縮小，文字字級另外控制（和 GUEST_R 解耦）
  const GUEST_R = capacity <= 6 ? 20 : capacity <= 8 ? 18 : capacity <= 10 ? 16 : 14;
  const RING_R = GUEST_R + 3;
  const CONTAINER = (TABLE_RADIUS + 40) * 2;
  return {
    CONTAINER,
    CENTER: CONTAINER / 2,
    TABLE_RADIUS,
    SEAT_RADIUS,
    GUEST_R,
    RING_R,
  };
}

function seatPosition(index: number, total: number, seatRadius: number) {
  const angle = ((2 * Math.PI) / total) * index - Math.PI / 2;
  return {
    x: Math.cos(angle) * seatRadius,
    y: Math.sin(angle) * seatRadius,
  };
}

const GROUP_COLORS: Record<DemoGuest['group'], { fill: string; stroke: string; text: string }> = {
  groom: { fill: '#DBEAFE', stroke: '#BFDBFE', text: '#1E40AF' },
  bride: { fill: '#FEE2E2', stroke: '#FECACA', text: '#991B1B' },
  shared: { fill: '#F3F4F6', stroke: '#D1D5DB', text: '#374151' },
};

// ─── SVG seat (filled) ───────────────────────────────
function FilledSeat({
  guest,
  score,
  x,
  y,
  guestR,
  ringR,
  nameSize,
  badge,
}: {
  guest: DemoGuest;
  score: number;
  x: number;
  y: number;
  guestR: number;
  ringR: number;
  nameSize: number;
  badge?: string;
}) {
  const gc = GROUP_COLORS[guest.group];
  const satColor = getSatisfactionColor(score);
  const animated = useAnimatedNumber(score, 500);
  const progress = Math.max(0, Math.min(animated / 100, 1));
  const circum = 2 * Math.PI * ringR;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={ringR} fill="none" stroke="#E7E5E4" strokeWidth={2} />
      <circle
        r={ringR}
        fill="none"
        stroke={satColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDashoffset={circum * 0.25}
        transform="rotate(-90)"
        style={{
          strokeDasharray: `${circum * progress} ${circum * (1 - progress)}`,
          transition: 'stroke-dasharray 500ms ease-out, stroke 500ms ease-out',
        }}
      />
      <circle r={guestR} fill={gc.fill} stroke="white" strokeWidth={1.5} />
      <text
        y={nameSize / 2.8}
        textAnchor="middle"
        fontSize={nameSize}
        fontWeight={600}
        fill={gc.text}
        style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
      >
        {guest.name}
      </text>
      {badge && (
        <g transform={`translate(${ringR + 2}, ${-ringR - 2})`}>
          <circle r={11} fill="#FEE2E2" stroke="#DC2626" strokeWidth={1.5} />
          <text
            y={4}
            textAnchor="middle"
            fontSize={13}
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            {badge}
          </text>
        </g>
      )}
    </g>
  );
}

function EmptySeat({
  x,
  y,
  guestR,
  ringR,
  isPreview,
}: {
  x: number;
  y: number;
  guestR: number;
  ringR: number;
  isPreview: boolean;
}) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle
        r={ringR}
        fill="none"
        stroke={isPreview ? '#B08D57' : '#D6D3D1'}
        strokeWidth={isPreview ? 2.5 : 1.5}
        strokeDasharray="4 4"
        opacity={isPreview ? 0.9 : 0.55}
      />
      <circle
        r={guestR * 0.85}
        fill={isPreview ? '#F5F0E6' : '#FAFAF9'}
        stroke={isPreview ? '#B08D57' : 'none'}
        strokeWidth={isPreview ? 1.5 : 0}
        strokeDasharray={isPreview ? '3 2' : undefined}
        opacity={isPreview ? 0.85 : 0.6}
      />
    </g>
  );
}

// ─── MiniTableVisual — pure SVG ─────────────────────
interface MiniTableVisualProps {
  table: DemoTable;
  guests: DemoGuest[];
  guestScores: Record<string, number>;
  tableScore: number;
  highlighted?: boolean;
  previewSlotIndex?: number;
  /** { guestId: emoji } — 渲染在賓客右上的徽章（青筋 💢 等） */
  seatBadges?: Record<string, string>;
  /** 桌中央下方的分數變化徽章，格式 "+5" / "-3"；正值綠、負值紅 */
  deltaBadge?: string | null;
}

export function MiniTableVisual({
  table,
  guests,
  guestScores,
  tableScore,
  highlighted = false,
  previewSlotIndex = -1,
  seatBadges,
  deltaBadge,
}: MiniTableVisualProps) {
  const geo = computeGeometry(table.capacity);
  const animatedTableScore = useAnimatedNumber(tableScore, 500);

  const tableStroke = highlighted ? '#B08D57' : '#D6D3D1';
  const tableFill = highlighted ? '#F5F0E6' : '#FFFFFF';
  const tableStrokeWidth = highlighted ? 3 : 2;

  // 字級和 GUEST_R 解耦 — cap 10 的 chip 小但名字照樣大
  // 字級和 GUEST_R 解耦 — cap 10 的 chip 小但名字照樣大
  // 字級和 GUEST_R 解耦 — cap 10 的 chip 小但名字照樣大
  const nameSize = geo.GUEST_R >= 20 ? 14 : geo.GUEST_R >= 18 ? 13 : 13;
  const scoreSize = geo.TABLE_RADIUS >= 100 ? 36 : 28;
  const labelSize = geo.TABLE_RADIUS >= 100 ? 13 : 12;

  // 中心滿意度進度環 — 對齊 workspace TableNode.TableScoreRing
  const scoreRingR = geo.TABLE_RADIUS >= 100 ? 38 : 30;
  const scoreRingStrokeW = 5;
  const scoreRingCircum = 2 * Math.PI * scoreRingR;
  const scoreRingProgress = Math.max(0, Math.min(animatedTableScore / 100, 1));
  const scoreColor = getSatisfactionColor(animatedTableScore);

  const deltaIsPositive = deltaBadge?.startsWith('+');

  return (
    <div
      className="relative"
      style={{ width: geo.CONTAINER, height: geo.CONTAINER }}
      data-testid={`mini-table-${table.id}`}
    >
      <svg
        width={geo.CONTAINER}
        height={geo.CONTAINER}
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        <circle
          cx={geo.CENTER}
          cy={geo.CENTER}
          r={geo.TABLE_RADIUS}
          fill={tableFill}
          stroke={tableStroke}
          strokeWidth={tableStrokeWidth}
          style={{ transition: 'all 150ms ease-out' }}
        />

        {/* 中心滿意度進度環（workspace TableNode 樣式）*/}
        <g transform={`translate(${geo.CENTER}, ${geo.CENTER})`}>
          <circle
            r={scoreRingR}
            fill="none"
            stroke="#E7E5E4"
            strokeWidth={scoreRingStrokeW}
          />
          <circle
            r={scoreRingR}
            fill="none"
            stroke={scoreColor}
            strokeWidth={scoreRingStrokeW}
            strokeLinecap="round"
            strokeDasharray={`${scoreRingCircum * scoreRingProgress} ${scoreRingCircum * (1 - scoreRingProgress)}`}
            strokeDashoffset={scoreRingCircum * 0.25}
            transform="rotate(-90)"
            style={{
              transition: 'stroke-dasharray 500ms ease-out, stroke 500ms ease-out',
            }}
          />
        </g>

        <text
          x={geo.CENTER}
          y={geo.CENTER + scoreSize * 0.34}
          textAnchor="middle"
          fontSize={scoreSize}
          fontWeight={800}
          fill={scoreColor}
          style={{
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontVariantNumeric: 'tabular-nums',
            transition: 'fill 500ms ease-out',
          }}
        >
          {animatedTableScore}
        </text>

        {/* 桌名放在桌身上方、SVG 容器內（避開底部座位）*/}
        <text
          x={geo.CENTER}
          y={geo.CENTER - geo.TABLE_RADIUS - 12}
          textAnchor="middle"
          fontSize={labelSize}
          fontWeight={600}
          fill="#78716C"
          style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
        >
          {table.name}
        </text>

        {deltaBadge && (
          <g
            transform={`translate(${geo.CENTER}, ${geo.CENTER + geo.TABLE_RADIUS + 20})`}
            style={{ filter: 'drop-shadow(0 2px 6px rgba(176, 141, 87, 0.25))' }}
          >
            <rect
              x={-32}
              y={-14}
              width={64}
              height={28}
              rx={14}
              fill={deltaIsPositive ? '#DCFCE7' : '#FEE2E2'}
              stroke={deltaIsPositive ? '#16A34A' : '#DC2626'}
              strokeWidth={2}
            />
            <text
              y={5}
              textAnchor="middle"
              fontSize={15}
              fontWeight={800}
              fill={deltaIsPositive ? '#15803D' : '#991B1B'}
              style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              {deltaBadge}
            </text>
          </g>
        )}

        <g transform={`translate(${geo.CENTER}, ${geo.CENTER})`}>
          {Array.from({ length: table.capacity }, (_, i) => {
            const { x, y } = seatPosition(i, table.capacity, geo.SEAT_RADIUS);
            const guest = guests[i] ?? null;
            if (guest) {
              return (
                <FilledSeat
                  key={guest.id}
                  guest={guest}
                  score={guestScores[guest.id] ?? 50}
                  x={x}
                  y={y}
                  guestR={geo.GUEST_R}
                  ringR={geo.RING_R}
                  nameSize={nameSize}
                  badge={seatBadges?.[guest.id]}
                />
              );
            }
            return (
              <EmptySeat
                key={`empty-${i}`}
                x={x}
                y={y}
                guestR={geo.GUEST_R}
                ringR={geo.RING_R}
                isPreview={i === previewSlotIndex}
              />
            );
          })}
        </g>
      </svg>

      <span className="sr-only">
        {table.name} 滿意度 {tableScore} 分，共 {guests.length} 位賓客
      </span>
    </div>
  );
}
