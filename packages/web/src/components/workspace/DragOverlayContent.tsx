import { useMemo } from 'react';
import { useSeatingStore, type Guest } from '@/stores/seating';
import { getSatisfactionColor } from '@/lib/satisfaction';
import { getCategoryColor, loadCategoryColors } from '@/lib/category-colors';

function getDisplayName(name: string, aliases?: string[]): string {
  if (aliases && aliases.length > 0) {
    const nick = aliases[0];
    return nick.length <= 3 ? nick : nick.slice(0, 3);
  }
  if (name.length <= 2) return name;
  return name.slice(-2);
}


interface Props {
  guest: Guest
}

export function DragOverlayContent({ guest }: Props) {
  const dragPreview = useSeatingStore((s) => s.dragPreview);
  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const guests = useSeatingStore((s) => s.guests);
  const eventId = useSeatingStore((s) => s.eventId);
  const colors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);
  const catColor = getCategoryColor(guest.category, colors);
  const catStyle = { background: catColor.background, borderColor: catColor.border, color: catColor.color };
  const displayName = getDisplayName(guest.name, guest.aliases);

  // 預覽分數：hover 到座位時即時計算的分數
  const previewScore = dragPreview?.previewScores?.get(guest.id);

  // 檢查拖曳目標桌是否有避免同桌衝突
  const hasAvoidConflict = (() => {
    if (!dragPreview) return false;
    const tableGuestIds = guests
      .filter((g) => g.assignedTableId === dragPreview.tableId && g.rsvpStatus === 'confirmed' && g.id !== guest.id)
      .map((g) => g.id);
    return avoidPairs.some(
      (ap) =>
        (ap.guestAId === guest.id && tableGuestIds.includes(ap.guestBId)) ||
        (ap.guestBId === guest.id && tableGuestIds.includes(ap.guestAId)),
    );
  })();
  const score = previewScore ?? guest.satisfactionScore;
  const satColor = getSatisfactionColor(score);

  // 分數變化 → 微調大小
  const delta = previewScore !== undefined ? previewScore - guest.satisfactionScore : 0;
  const scale = delta > 0 ? 1.25 : delta < 0 ? 0.8 : 1;

  const size = 48;
  const ringR = size / 2 + 3;
  const circumference = 2 * Math.PI * ringR;
  const progress = Math.min(score / 100, 1);

  return (
    <div
      className="relative cursor-grabbing"
      style={{ transform: `scale(${scale})`, transition: 'transform 200ms ease-out' }}
    >
      {/* 滿意度進度圈 */}
      <svg
        width={size + 12}
        height={size + 12}
        className="absolute -left-1.5 -top-1.5 pointer-events-none"
      >
        <circle
          cx={size / 2 + 6}
          cy={size / 2 + 6}
          r={ringR}
          fill="none"
          stroke="#E7E5E4"
          strokeWidth="2.5"
        />
        {score > 0 && (
          <circle
            cx={size / 2 + 6}
            cy={size / 2 + 6}
            r={ringR}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDashoffset={circumference * 0.25}
            transform={`rotate(-90 ${size / 2 + 6} ${size / 2 + 6})`}
            style={{
              stroke: satColor,
              strokeDasharray: `${circumference * progress} ${circumference * (1 - progress)}`,
              transition: 'stroke-dasharray 200ms ease-out, stroke 200ms ease-out',
            }}
          />
        )}
      </svg>

      {/* 賓客圓形 */}
      <div
        className="flex items-center justify-center rounded-full font-[family-name:var(--font-body)] font-medium whitespace-nowrap overflow-hidden shadow-[0_4px_16px_rgba(28,25,23,0.2)]"
        style={{
          width: size,
          height: size,
          fontSize: displayName.length > 3 ? '13px' : '16px',
          border: `2px solid ${catStyle.borderColor}`,
          backgroundColor: catStyle.background,
          color: catStyle.color,
        }}
      >
        {displayName}
      </div>

      {/* 滿意度變化 badge（不受父層 scale 影響） */}
      {delta !== 0 && (
        <div
          className="absolute flex items-center justify-center -bottom-2 left-1/2 min-w-7 h-5 rounded-[10px] px-1.5 text-white text-[11px] font-bold font-[family-name:var(--font-data)] border-2 border-white whitespace-nowrap"
          style={{
            transform: `translateX(-50%) scale(${1 / scale})`,
            background: delta > 0 ? '#16A34A' : '#DC2626',
          }}
        >
          {delta > 0 ? '+' : ''}{Math.round(delta)}
        </div>
      )}

      {/* 避免同桌怒氣符號 */}
      {hasAvoidConflict && (
        <svg
          width={30}
          height={34}
          className="absolute -top-3.5 -right-3.5 pointer-events-none"
          style={{
            transform: `scale(${1 / scale})`,
          }}
        >
          <g transform="translate(12, 12)">
            <path
              d="M-9,7 A12,12 0 1,1 -5,10 L-14,16 Z"
              fill="white"
              stroke="#DC2626"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <g transform="translate(1,-1)">
              <path
                d="M-1.5,-6 Q-1.5,-1.5 -6,-1.5 M1.5,-6 Q1.5,-1.5 6,-1.5 M-1.5,6 Q-1.5,1.5 -6,1.5 M1.5,6 Q1.5,1.5 6,1.5"
                fill="none"
                stroke="#DC2626"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
          </g>
        </svg>
      )}

      {/* 眷屬 badge */}
      {guest.companionCount > 0 && (
        <div
          className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-[22px] h-[22px] rounded-full bg-[#B08D57] text-white text-[11px] font-bold font-[family-name:var(--font-data)] border-2 border-white"
        >
          +{guest.companionCount}
        </div>
      )}
    </div>
  );
}
