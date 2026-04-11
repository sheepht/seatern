import { useDroppable } from '@dnd-kit/core';
import { useSeatingStore } from '@/stores/seating';
import { GuestChip } from './GuestChip';

export function UnassignedBar() {
  const getUnassignedGuests = useSeatingStore((s) => s.getUnassignedGuests);
  const unassigned = getUnassignedGuests();

  const { isOver, setNodeRef } = useDroppable({
    id: 'unassigned',
    data: { type: 'unassigned' },
  });

  const totalSeats = unassigned.reduce((s, g) => s + g.seatCount, 0);

  return (
    <div
      ref={setNodeRef}
      className="px-4 py-3 transition-colors border-t border-[var(--border)]"
      style={{
        background: isOver ? 'var(--accent-light)' : 'var(--bg-surface)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="relative group">
          <span className="text-xs font-medium text-[var(--text-secondary)] cursor-default">
            未安排（<span className="font-data">{unassigned.length}</span> 人 / <span className="font-data">{totalSeats}</span> 席）
          </span>
          <span className="pointer-events-none absolute left-0 bottom-full mb-2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--bg-elevated,#1f2937)] text-white text-xs px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-50 text-left leading-relaxed font-normal">
            「人」＝賓客數（不含眷屬）<br />
            「席」＝賓客本人 + 眷屬（含嬰兒）的總座位數<br />
            <span className="opacity-80">例：王小明帶 1 位伴侶 + 1 位嬰兒 → 算 1 人、3 席</span>
          </span>
        </span>
        {isOver && <span className="text-xs text-[var(--accent-dark)]">放開以取消安排</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto min-h-[28px]">
        {unassigned.map((g) => (
          <GuestChip key={g.id} guest={g} />
        ))}
        {unassigned.length === 0 && (
          <span className="text-xs text-[var(--text-muted)]">所有賓客都已安排</span>
        )}
      </div>
    </div>
  );
}
