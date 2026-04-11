import { useDraggable, useDroppable } from '@dnd-kit/core';
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

const GROUP_STYLES: Record<DemoGuest['group'], { bg: string; border: string; color: string }> = {
  groom: { bg: '#DBEAFE', border: '#BFDBFE', color: '#1E40AF' },
  bride: { bg: '#FEE2E2', border: '#FECACA', color: '#991B1B' },
  shared: { bg: '#F3F4F6', border: '#D1D5DB', color: '#374151' },
};

function LandingGuestChip({
  guest,
  pulse,
  bounce,
}: {
  guest: DemoGuest;
  pulse: boolean;
  bounce: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: guest.id,
    data: { guestId: guest.id },
  });
  const style = GROUP_STYLES[guest.group];
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
      className={`inline-flex h-11 min-w-[44px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium select-none cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      } ${animClass}`}
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        color: style.color,
        touchAction: 'none',
      }}
      aria-label={`賓客 ${guest.name}，可拖曳到其他桌`}
      data-testid={`landing-chip-${guest.id}`}
    >
      <span aria-hidden>●</span>
      <span>{guest.name}</span>
    </div>
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

  const borderColor = effectiveState === 'drag-over' ? '#B08D57' : '#E7E5E4';
  const bgColor = effectiveState === 'drag-over' ? '#F5F0E6' : '#FFFFFF';

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[260px] flex-col rounded-2xl border-2 p-4 shadow-sm transition-colors duration-150 ${
        effectiveState === 'reject-shake' ? 'animate-landing-shake' : ''
      }`}
      style={{ borderColor, backgroundColor: bgColor, minHeight: 200 }}
      data-testid={`mini-table-${table.id}`}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wide text-[#78716C]">{table.name}</span>
        <span
          className="tabular-nums text-[32px] font-[800] leading-none text-[#1C1917]"
          style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
          aria-label={`${table.name} 滿意度 ${score} 分`}
          data-testid={`mini-table-score-${table.id}`}
        >
          {score}
        </span>
      </div>
      <div className="flex flex-wrap gap-2" role="list" aria-label={`${table.name} 賓客名單`}>
        {guests.map((g) => (
          <div role="listitem" key={g.id}>
            <LandingGuestChip
              guest={g}
              pulse={!!pulseAll}
              bounce={pulseGuestId === g.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
