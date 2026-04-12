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

const TIPS = [
  '拖曳賓客到桌子上即可安排座位，系統會即時計算滿意度',
  '雙向都選「想同桌」的配對會形成強連結，優先安排在一起',
  '滿意度分數越高代表賓客對座位越滿意，綠色 75+ 表示很好',
  '可以用「自動排位」一鍵產生初始方案，再手動微調',
  '標記「避免同桌」可以確保特定賓客不會被排在一起',
  '每位賓客最多可以選 3 位想同桌的人，並排優先順序',
  '拖曳賓客時會即時顯示對其他人滿意度的影響',
  '儲存排位後可以建立快照，方便比較不同方案',
  '橘色或紅色的賓客需要特別關注，可能沒有配到想同桌的人',
  '系統會自動偵測孤立賓客，提醒你特別照顧他們',
  '同群組的賓客坐在一起會提高群組分，建議優先安排',
  '可以直接在畫布上拖曳桌子來調整實體位置',
];

function useRotatingTip() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % TIPS.length);
        setVisible(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return { tip: TIPS[index], visible };
}

export function LoadingTable({ label, showTips = false }: { label: string; showTips?: boolean }) {
  const [filled, setFilled] = useState(0);
  const { tip, visible } = useRotatingTip();

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
      {showTips && (
        <div className="mt-3 max-w-md text-center min-h-[3.5rem] flex items-center justify-center">
          <p
            className="text-lg text-[var(--text-secondary)] font-[family-name:var(--font-body)] leading-relaxed"
            style={{
              opacity: visible ? 1 : 0,
              transition: 'opacity 400ms ease-in-out',
            }}
          >
            💡 {tip}
          </p>
        </div>
      )}
    </div>
  );
}
