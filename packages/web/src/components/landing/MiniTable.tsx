import { useEffect, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { getSatisfactionColor } from '@/lib/satisfaction';
import type { DemoGuest, DemoTable } from './demoScorer';

export type MiniTableState = 'idle' | 'drag-over' | 'reject-shake' | 'full';

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

// ─── Geometry ────────────────────────────────────────
const CONTAINER = 240;
const CENTER = CONTAINER / 2;
const TABLE_RADIUS = 80;
const SEAT_RADIUS = 56;
const GUEST_R = 20;
const RING_R = 23;

function seatPosition(index: number, total: number) {
  const angle = ((2 * Math.PI) / total) * index - Math.PI / 2;
  return {
    x: Math.cos(angle) * SEAT_RADIUS,
    y: Math.sin(angle) * SEAT_RADIUS,
  };
}

const GROUP_COLORS: Record<DemoGuest['group'], { fill: string; stroke: string; text: string }> = {
  groom: { fill: '#DBEAFE', stroke: '#BFDBFE', text: '#1E40AF' },
  bride: { fill: '#FEE2E2', stroke: '#FECACA', text: '#991B1B' },
  shared: { fill: '#F3F4F6', stroke: '#D1D5DB', text: '#374151' },
};

// ─── SVG seat (filled) ───────────────────────────────
interface FilledSeatProps {
  guest: DemoGuest;
  score: number;
  x: number;
  y: number;
}

function FilledSeat({ guest, score, x, y }: FilledSeatProps) {
  const gc = GROUP_COLORS[guest.group];
  const satColor = getSatisfactionColor(score);
  const animated = useAnimatedNumber(score, 500);
  const progress = Math.max(0, Math.min(animated / 100, 1));
  const circum = 2 * Math.PI * RING_R;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={RING_R} fill="none" stroke="#E7E5E4" strokeWidth={2.5} />
      <circle
        r={RING_R}
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
      <circle r={GUEST_R} fill={gc.fill} stroke="white" strokeWidth={2} />
      <text
        y={4}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill={gc.text}
        style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
      >
        {guest.name}
      </text>
    </g>
  );
}

// ─── SVG empty seat ──────────────────────────────────
function EmptySeat({ x, y, isPreview }: { x: number; y: number; isPreview: boolean }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle
        r={RING_R}
        fill="none"
        stroke={isPreview ? '#B08D57' : '#D6D3D1'}
        strokeWidth={isPreview ? 2.5 : 1.8}
        strokeDasharray="4 4"
        opacity={isPreview ? 0.9 : 0.55}
      />
      {isPreview && (
        <circle
          r={GUEST_R}
          fill="#F5F0E6"
          stroke="#B08D57"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={0.7}
        />
      )}
    </g>
  );
}

// ─── MiniTableVisual — pure SVG（不用 DndContext）───
interface MiniTableVisualProps {
  table: DemoTable;
  guests: DemoGuest[];
  guestScores: Record<string, number>;
  tableScore: number;
  highlighted?: boolean;
  previewSlotIndex?: number;
  shake?: boolean;
}

export function MiniTableVisual({
  table,
  guests,
  guestScores,
  tableScore,
  highlighted = false,
  previewSlotIndex = -1,
  shake = false,
}: MiniTableVisualProps) {
  const animatedTableScore = useAnimatedNumber(tableScore, 500);

  const tableStroke = highlighted ? '#B08D57' : '#D6D3D1';
  const tableFill = highlighted ? '#F5F0E6' : '#FFFFFF';
  const tableStrokeWidth = highlighted ? 3 : 2;

  return (
    <div
      className={`relative ${shake ? 'animate-landing-shake' : ''}`}
      style={{ width: CONTAINER, height: CONTAINER }}
      data-testid={`mini-table-${table.id}`}
    >
      <svg
        width={CONTAINER}
        height={CONTAINER}
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={TABLE_RADIUS}
          fill={tableFill}
          stroke={tableStroke}
          strokeWidth={tableStrokeWidth}
          style={{ transition: 'all 150ms ease-out' }}
        />
        <text
          x={CENTER}
          y={CENTER + 4}
          textAnchor="middle"
          fontSize={36}
          fontWeight={800}
          fill="#1C1917"
          style={{
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontVariantNumeric: 'tabular-nums',
          }}
          data-testid={`mini-table-score-${table.id}`}
        >
          {animatedTableScore}
        </text>
        <text
          x={CENTER}
          y={CENTER + 24}
          textAnchor="middle"
          fontSize={11}
          fill="#78716C"
          style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
        >
          {table.name}
        </text>

        <g transform={`translate(${CENTER}, ${CENTER})`}>
          {Array.from({ length: table.capacity }, (_, i) => {
            const { x, y } = seatPosition(i, table.capacity);
            const guest = guests[i] ?? null;
            if (guest) {
              return (
                <FilledSeat
                  key={guest.id}
                  guest={guest}
                  score={guestScores[guest.id] ?? 50}
                  x={x}
                  y={y}
                />
              );
            }
            return (
              <EmptySeat
                key={`empty-${i}`}
                x={x}
                y={y}
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

// ─── SeatDragHandle — HTML overlay for dnd-kit ───────
function SeatDragHandle({
  guestId,
  x,
  y,
  guestName,
}: {
  guestId: string;
  x: number;
  y: number;
  guestName: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: guestId,
    data: { guestId },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute cursor-grab active:cursor-grabbing select-none focus:outline-none focus:ring-2 focus:ring-[#B08D57] focus:ring-offset-2 rounded-full"
      style={{
        left: `calc(50% + ${x}px - ${RING_R + 2}px)`,
        top: `calc(50% + ${y}px - ${RING_R + 2}px)`,
        width: (RING_R + 2) * 2,
        height: (RING_R + 2) * 2,
        touchAction: 'none',
        opacity: isDragging ? 0 : 1,
      }}
      aria-label={`賓客 ${guestName}，可拖曳到其他桌`}
      data-testid={`landing-chip-${guestId}`}
    />
  );
}

// ─── MiniTable — interactive wrapper（droppable + drag handles）
// 目前 landing page 不用這個（feature section 走 MiniTableVisual），
// 保留給未來可能的互動場景。
interface MiniTableProps {
  table: DemoTable;
  guests: DemoGuest[];
  guestScores: Record<string, number>;
  tableScore: number;
  state: MiniTableState;
  activeGuestId?: string | null;
}

export function MiniTable({
  table,
  guests,
  guestScores,
  tableScore,
  state,
  activeGuestId,
}: MiniTableProps) {
  const { isOver, setNodeRef } = useDroppable({ id: table.id });
  const effectiveState: MiniTableState = isOver ? 'drag-over' : state;

  const draggedFromThisTable = activeGuestId
    ? table.guestIds.includes(activeGuestId)
    : false;
  const hasRoom = guests.length < table.capacity;
  const showPreview = Boolean(activeGuestId && !draggedFromThisTable && hasRoom);
  const previewSlotIndex = showPreview ? guests.length : -1;

  return (
    <div ref={setNodeRef}>
      <MiniTableVisual
        table={table}
        guests={guests}
        guestScores={guestScores}
        tableScore={tableScore}
        highlighted={effectiveState === 'drag-over'}
        previewSlotIndex={previewSlotIndex}
        shake={effectiveState === 'reject-shake'}
      />
      {guests.map((guest, i) => {
        const { x, y } = seatPosition(i, table.capacity);
        return (
          <SeatDragHandle
            key={guest.id}
            guestId={guest.id}
            guestName={guest.name}
            x={x}
            y={y}
          />
        );
      })}
    </div>
  );
}
