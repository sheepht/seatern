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
  // workspace 公式: radius = max(88, 58 + capacity * 7)
  const TABLE_RADIUS = Math.max(82, 54 + capacity * 6);
  const SEAT_RADIUS = TABLE_RADIUS - 28;
  // 高容量桌 chip 要縮小避免相鄰重疊
  const GUEST_R = capacity <= 6 ? 20 : capacity <= 8 ? 18 : 15;
  const RING_R = GUEST_R + 3;
  const CONTAINER = (TABLE_RADIUS + 36) * 2;
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
}: {
  guest: DemoGuest;
  score: number;
  x: number;
  y: number;
  guestR: number;
  ringR: number;
  nameSize: number;
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
}

export function MiniTableVisual({
  table,
  guests,
  guestScores,
  tableScore,
  highlighted = false,
  previewSlotIndex = -1,
}: MiniTableVisualProps) {
  const geo = computeGeometry(table.capacity);
  const animatedTableScore = useAnimatedNumber(tableScore, 500);

  const tableStroke = highlighted ? '#B08D57' : '#D6D3D1';
  const tableFill = highlighted ? '#F5F0E6' : '#FFFFFF';
  const tableStrokeWidth = highlighted ? 3 : 2;

  const nameSize = geo.GUEST_R >= 18 ? 12 : geo.GUEST_R >= 15 ? 11 : 9;
  const scoreSize = geo.TABLE_RADIUS >= 100 ? 40 : 34;
  const labelSize = geo.TABLE_RADIUS >= 100 ? 12 : 11;

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
        <text
          x={geo.CENTER}
          y={geo.CENTER + 4}
          textAnchor="middle"
          fontSize={scoreSize}
          fontWeight={800}
          fill="#1C1917"
          style={{
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {animatedTableScore}
        </text>
        <text
          x={geo.CENTER}
          y={geo.CENTER + 4 + scoreSize * 0.7}
          textAnchor="middle"
          fontSize={labelSize}
          fill="#78716C"
          style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
        >
          {table.name}
        </text>

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
