import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import type { DemoGuest, DemoTable } from './demoScorer';

export type MiniTableState = 'idle' | 'drag-over' | 'reject-shake' | 'full';

interface MiniTableProps {
  table: DemoTable;
  guests: DemoGuest[];
  score: number;
  state: MiniTableState;
  pulseGuestId?: string | null;
  pulseAll?: boolean;
}

// 圓桌幾何：和 workspace TableNode 共用 seatPosition 公式但尺寸 mini 化
const TABLE_RADIUS = 72;
const SEAT_RADIUS = 50;       // = TABLE_RADIUS - 22
const CHIP_SIZE = 52;         // DOM chip 直徑（a11y 44+ 符合 iOS HIG）
const CONTAINER = 200;        // SVG + 絕對定位容器邊長

function seatPosition(index: number, total: number) {
  const angle = ((2 * Math.PI) / total) * index - Math.PI / 2;
  return {
    x: Math.cos(angle) * SEAT_RADIUS,
    y: Math.sin(angle) * SEAT_RADIUS,
  };
}

const GROUP_STYLES: Record<DemoGuest['group'], { bg: string; border: string; color: string }> = {
  groom: { bg: '#DBEAFE', border: '#BFDBFE', color: '#1E40AF' },
  bride: { bg: '#FEE2E2', border: '#FECACA', color: '#991B1B' },
  shared: { bg: '#F3F4F6', border: '#D1D5DB', color: '#374151' },
};

/**
 * 座位 chip（可拖曳）。視覺是圓形頭像 + 姓名文字。
 * 絕對定位在圓桌周圍，跟 workspace GuestSeatOverlay 的座位感一致。
 */
function SeatedGuestChip({
  guest,
  style,
  pulse,
  bounce,
}: {
  guest: DemoGuest;
  style: CSSProperties;
  pulse: boolean;
  bounce: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: guest.id,
    data: { guestId: guest.id },
  });
  const gs = GROUP_STYLES[guest.group];
  const animClass = bounce
    ? 'animate-landing-bounce'
    : pulse
      ? 'animate-landing-pulse'
      : '';
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`absolute flex flex-col items-center justify-center rounded-full border-2 font-medium select-none cursor-grab active:cursor-grabbing shadow-sm ${
        isDragging ? 'opacity-0' : ''
      } ${animClass}`}
      style={{
        ...style,
        width: CHIP_SIZE,
        height: CHIP_SIZE,
        backgroundColor: gs.bg,
        borderColor: gs.border,
        color: gs.color,
        touchAction: 'none',
        fontSize: 12,
        lineHeight: 1,
      }}
      aria-label={`賓客 ${guest.name}，可拖曳到其他桌`}
      data-testid={`landing-chip-${guest.id}`}
    >
      <span>{guest.name}</span>
    </div>
  );
}

/**
 * DragOverlay 用的浮動 chip — 跟隨游標，視覺和 seated chip 一致
 */
export function FloatingGuestChip({ guest }: { guest: DemoGuest }) {
  const gs = GROUP_STYLES[guest.group];
  return (
    <div
      className="flex flex-col items-center justify-center rounded-full border-2 font-medium shadow-lg cursor-grabbing"
      style={{
        width: CHIP_SIZE,
        height: CHIP_SIZE,
        backgroundColor: gs.bg,
        borderColor: gs.border,
        color: gs.color,
        fontSize: 12,
        lineHeight: 1,
        transform: 'scale(1.08)',
      }}
    >
      <span>{guest.name}</span>
    </div>
  );
}

/**
 * 空座位視覺 — 淡色虛線圓，顯示該位置可被拖入
 */
function EmptySeat({ style }: { style: CSSProperties }) {
  return (
    <div
      className="absolute rounded-full border-2 border-dashed border-[#D6D3D1]"
      style={{
        ...style,
        width: CHIP_SIZE,
        height: CHIP_SIZE,
        opacity: 0.5,
      }}
      aria-hidden
    />
  );
}

export function MiniTable({
  table,
  guests,
  score,
  state,
  pulseGuestId,
  pulseAll,
}: MiniTableProps) {
  const { isOver, setNodeRef } = useDroppable({ id: table.id });
  const effectiveState: MiniTableState = isOver ? 'drag-over' : state;

  const tableStroke = effectiveState === 'drag-over' ? '#B08D57' : '#D6D3D1';
  const tableFill = effectiveState === 'drag-over' ? '#F5F0E6' : '#FFFFFF';
  const tableStrokeWidth = effectiveState === 'drag-over' ? 3 : 2;

  // 產生 capacity 個座位槽，前 N 個放 guests，其餘空槽
  const seats = Array.from({ length: table.capacity }, (_, i) => {
    const pos = seatPosition(i, table.capacity);
    const guest = guests[i] ?? null;
    const style: CSSProperties = {
      left: `calc(50% + ${pos.x}px)`,
      top: `calc(50% + ${pos.y}px)`,
      transform: 'translate(-50%, -50%)',
    };
    return { index: i, guest, style };
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative ${
        effectiveState === 'reject-shake' ? 'animate-landing-shake' : ''
      }`}
      style={{ width: CONTAINER, height: CONTAINER }}
      data-testid={`mini-table-${table.id}`}
    >
      {/* SVG 圓桌背景：桌面圓 + 中央分數 + 桌名 */}
      <svg
        width={CONTAINER}
        height={CONTAINER}
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
        aria-hidden
      >
        <circle
          cx={CONTAINER / 2}
          cy={CONTAINER / 2}
          r={TABLE_RADIUS}
          fill={tableFill}
          stroke={tableStroke}
          strokeWidth={tableStrokeWidth}
          style={{ transition: 'all 150ms ease-out' }}
        />
        <text
          x={CONTAINER / 2}
          y={CONTAINER / 2 + 4}
          textAnchor="middle"
          fontSize={34}
          fontWeight={800}
          fill="#1C1917"
          style={{
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontVariantNumeric: 'tabular-nums',
          }}
          data-testid={`mini-table-score-${table.id}`}
        >
          {score}
        </text>
        <text
          x={CONTAINER / 2}
          y={CONTAINER / 2 + 22}
          textAnchor="middle"
          fontSize={11}
          fill="#78716C"
          style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
        >
          {table.name}
        </text>
      </svg>

      {/* 座位圈：空座位用虛線圓，有人的用 draggable chip */}
      {seats.map((seat) =>
        seat.guest ? (
          <SeatedGuestChip
            key={seat.guest.id}
            guest={seat.guest}
            style={seat.style}
            pulse={!!pulseAll}
            bounce={pulseGuestId === seat.guest.id}
          />
        ) : (
          <EmptySeat key={`empty-${seat.index}`} style={seat.style} />
        ),
      )}

      <span className="sr-only">
        {table.name} 滿意度 {score} 分，共 {guests.length} 位賓客
      </span>
    </div>
  );
}
