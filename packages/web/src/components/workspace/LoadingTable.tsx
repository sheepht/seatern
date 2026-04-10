import { useEffect, useState } from 'react';

const CAPACITY = 10;
const SEAT_RING_RADIUS = 56;
const GUEST_R = 10;
const TABLE_R = SEAT_RING_RADIUS - GUEST_R - 8;

const seats = Array.from({ length: CAPACITY }, (_, i) => {
  const angle = ((2 * Math.PI) / CAPACITY) * i - Math.PI / 2;
  return {
    index: i,
    x: Math.cos(angle) * SEAT_RING_RADIUS,
    y: Math.sin(angle) * SEAT_RING_RADIUS,
  };
});

export function LoadingTable({ label }: { label: string }) {
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const cycle = async () => {
      while (!cancelled) {
        for (let i = 1; i <= CAPACITY; i++) {
          if (cancelled) return;
          setFilled(i);
          await sleep(180);
        }
        await sleep(600);
        if (cancelled) return;
        setFilled(0);
        await sleep(300);
      }
    };

    cycle();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col items-center gap-5">
      <svg
        width={150}
        height={150}
        viewBox="-80 -80 160 160"
        aria-hidden="true"
      >
        <circle
          r={TABLE_R}
          fill="var(--bg-surface)"
          stroke="var(--border-strong)"
          strokeWidth={2}
        />
        {seats.map((seat) => {
          const isFilled = seat.index < filled;
          return (
            <circle
              key={seat.index}
              cx={seat.x}
              cy={seat.y}
              r={GUEST_R}
              fill={isFilled ? 'var(--accent)' : 'none'}
              stroke={isFilled ? 'var(--accent)' : 'var(--border-strong)'}
              strokeWidth={isFilled ? 0 : 1.5}
              strokeDasharray={isFilled ? undefined : '4 3'}
              style={{
                transition: 'fill 350ms ease-out, stroke 350ms ease-out',
              }}
            />
          );
        })}
      </svg>
      <p className="text-[var(--text-muted)] font-[family-name:var(--font-body)]">
        {label}
      </p>
    </div>
  );
}
