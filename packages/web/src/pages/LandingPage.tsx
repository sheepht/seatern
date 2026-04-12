import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MiniTableVisual } from '@/components/landing/MiniTable';
import type { DemoGuest, DemoTable } from '@/components/landing/demoScorer';

// ─── Feature 2 showcase data: 2 tables × 10 seats × 分數分布 ─

const showcaseGuestsT1: DemoGuest[] = [
  { id: 's1', name: '志明', group: 'groom', mutualPrefs: [] },
  { id: 's2', name: '小美', group: 'groom', mutualPrefs: [] },
  { id: 's3', name: '建國', group: 'groom', mutualPrefs: [] },
  { id: 's4', name: '淑芬', group: 'groom', mutualPrefs: [] },
  { id: 's5', name: '國強', group: 'groom', mutualPrefs: [] },
  { id: 's6', name: '美玲', group: 'shared', mutualPrefs: [] },
  { id: 's7', name: '大雄', group: 'groom', mutualPrefs: [] },
  { id: 's8', name: '雅婷', group: 'bride', mutualPrefs: [] },
  { id: 's9', name: '文華', group: 'groom', mutualPrefs: [] },
  { id: 's10', name: '家豪', group: 'groom', mutualPrefs: [] },
];

const showcaseGuestsT2: DemoGuest[] = [
  { id: 's11', name: '淑惠', group: 'bride', mutualPrefs: [] },
  { id: 's12', name: '佳玲', group: 'bride', mutualPrefs: [] },
  { id: 's13', name: '怡君', group: 'bride', mutualPrefs: [] },
  { id: 's14', name: '志豪', group: 'groom', mutualPrefs: [] },
  { id: 's15', name: '婉婷', group: 'bride', mutualPrefs: [] },
  { id: 's16', name: '宗翰', group: 'groom', mutualPrefs: [] },
  { id: 's17', name: '雅文', group: 'bride', mutualPrefs: [] },
  { id: 's18', name: '曉琪', group: 'bride', mutualPrefs: [] },
  { id: 's19', name: '志強', group: 'shared', mutualPrefs: [] },
  { id: 's20', name: '惠君', group: 'bride', mutualPrefs: [] },
];

const showcaseT1: DemoTable = {
  id: 'ft1',
  name: '第 1 桌',
  capacity: 10,
  guestIds: showcaseGuestsT1.map((g) => g.id),
};
const showcaseT2: DemoTable = {
  id: 'ft2',
  name: '第 2 桌',
  capacity: 10,
  guestIds: showcaseGuestsT2.map((g) => g.id),
};

// 硬編分數創造滿意度視覺多樣性（綠/黃/橘/紅）
const showcaseScores: Record<string, number> = {
  s1: 94, s2: 88, s3: 82, s4: 78, s5: 72,
  s6: 58, s7: 90, s8: 32, s9: 68, s10: 85,
  s11: 80, s12: 92, s13: 68, s14: 45, s15: 88,
  s16: 76, s17: 82, s18: 90, s19: 22, s20: 70,
};
const showcaseT1Avg = Math.round(
  showcaseGuestsT1.reduce((sum, g) => sum + (showcaseScores[g.id] ?? 50), 0) /
    showcaseGuestsT1.length,
);
const showcaseT2Avg = Math.round(
  showcaseGuestsT2.reduce((sum, g) => sum + (showcaseScores[g.id] ?? 50), 0) /
    showcaseGuestsT2.length,
);

// ─── Feature illustrations ───────────────────────────

function IllustrationImport() {
  return (
    <svg width={260} height={200} viewBox="0 0 260 200" aria-hidden>
      <rect x={20} y={30} width={100} height={140} rx={8} fill="#FFFFFF" stroke="#D6D3D1" strokeWidth={2} />
      <line x1={20} y1={55} x2={120} y2={55} stroke="#D6D3D1" strokeWidth={1.5} />
      {[80, 105, 130, 155].map((y) => (
        <line key={y} x1={20} y1={y} x2={120} y2={y} stroke="#E7E5E4" />
      ))}
      <line x1={68} y1={30} x2={68} y2={170} stroke="#E7E5E4" />
      {[68, 93, 118, 143, 165].map((y, i) => (
        <circle key={i} cx={40} cy={y} r={3} fill="#B08D57" opacity={0.7} />
      ))}
      <text x={70} y={48} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>
        賓客名單.xlsx
      </text>
      <path d="M130 100 L160 100" stroke="#B08D57" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M155 94 L163 100 L155 106" stroke="#B08D57" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {[
        { y: 55, color: '#DBEAFE', border: '#BFDBFE', text: '#1E40AF', name: '小明' },
        { y: 85, color: '#FEE2E2', border: '#FECACA', text: '#991B1B', name: '美玲' },
        { y: 115, color: '#DBEAFE', border: '#BFDBFE', text: '#1E40AF', name: '阿華' },
        { y: 145, color: '#F3F4F6', border: '#D1D5DB', text: '#374151', name: '志明' },
      ].map((c, i) => (
        <g key={i} transform={`translate(200, ${c.y})`}>
          <rect x={-32} y={0} width={64} height={24} rx={12} fill={c.color} stroke={c.border} strokeWidth={1.5} />
          <text y={16} textAnchor="middle" fontSize={12} fill={c.text} fontFamily='"Noto Sans TC"' fontWeight={600}>
            {c.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

// Feature 3 target table: capacity 10, 9 高分賓客 + 1 空位被推薦
const recommendationTable: DemoTable = {
  id: 'rec-t3',
  name: '第 3 桌',
  capacity: 10,
  guestIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'],
};
const recommendationGuests: DemoGuest[] = [
  { id: 'r1', name: '大雄', group: 'groom', mutualPrefs: [] },
  { id: 'r2', name: '家豪', group: 'groom', mutualPrefs: [] },
  { id: 'r3', name: '文華', group: 'groom', mutualPrefs: [] },
  { id: 'r4', name: '建國', group: 'groom', mutualPrefs: [] },
  { id: 'r5', name: '國強', group: 'groom', mutualPrefs: [] },
  { id: 'r6', name: '明華', group: 'groom', mutualPrefs: [] },
  { id: 'r7', name: '志豪', group: 'groom', mutualPrefs: [] },
  { id: 'r8', name: '宗翰', group: 'groom', mutualPrefs: [] },
  { id: 'r9', name: '小明', group: 'groom', mutualPrefs: [] },
];
const recommendationScores: Record<string, number> = {
  r1: 88, r2: 92, r3: 84, r4: 90, r5: 86, r6: 91, r7: 85, r8: 89, r9: 87,
};

// Feature 4 avoid pair: 10 人桌 + Harry Potter vs 佛地魔 同桌 + 💢 標記
const avoidTable: DemoTable = {
  id: 'avoid-t',
  name: '大家都不開心',
  capacity: 10,
  guestIds: ['harry', 'a2', 'a3', 'a4', 'a5', 'voldemort', 'a7', 'a8', 'a9', 'a10'],
};
const avoidGuests: DemoGuest[] = [
  { id: 'harry', name: '波特', group: 'bride', mutualPrefs: [] },
  { id: 'a2', name: '榮恩', group: 'groom', mutualPrefs: [] },
  { id: 'a3', name: '妙麗', group: 'bride', mutualPrefs: [] },
  { id: 'a4', name: '石內卜', group: 'groom', mutualPrefs: [] },
  { id: 'a5', name: '貝拉', group: 'bride', mutualPrefs: [] },
  { id: 'voldemort', name: '佛地魔', group: 'shared', mutualPrefs: [] },
  { id: 'a7', name: '路平', group: 'groom', mutualPrefs: [] },
  { id: 'a8', name: '唐克斯', group: 'bride', mutualPrefs: [] },
  { id: 'a9', name: '穆敵', group: 'groom', mutualPrefs: [] },
  { id: 'a10', name: '鄧不利多', group: 'shared', mutualPrefs: [] },
];
const avoidScores: Record<string, number> = {
  harry: 18, a2: 52, a3: 48, a4: 45, a5: 50, voldemort: 18, a7: 58, a8: 55, a9: 52, a10: 62,
};
const avoidTableAvg = 46;

function IllustrationRecommendation() {
  // 志偉的滿意度 cycle animation: 45 → 78 → 45 (every 2.2s)
  const [isAfter, setIsAfter] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setIsAfter((v) => !v), 2200);
    return () => clearInterval(id);
  }, []);

  const r = 28;
  const circum = 2 * Math.PI * r;
  const score = isAfter ? 78 : 45;
  const color = isAfter ? '#16A34A' : '#EA580C';
  const progress = score / 100;

  return (
    <div className="flex items-center justify-center gap-0 sm:gap-1">
      {/* Combined SVG: 志偉 chip + 曲線箭頭（箭頭從 chip 右緣直接伸出）*/}
      <svg width={230} height={160} style={{ overflow: 'visible' }} aria-hidden>
        <defs>
          <marker
            id="rec-arrow-head"
            viewBox="0 0 10 10"
            refX={8}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#B08D57" />
          </marker>
        </defs>

        {/* 志偉 chip at (50, 85) */}
        <g transform="translate(50, 85)">
          <circle r={r} fill="none" stroke="#E7E5E4" strokeWidth={2.5} />
          <circle
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${circum * progress} ${circum * (1 - progress)}`}
            strokeDashoffset={circum * 0.25}
            transform="rotate(-90)"
            style={{
              transition: 'stroke-dasharray 900ms ease-out, stroke 900ms ease-out',
            }}
          />
          <circle r={23} fill="#DBEAFE" stroke="white" strokeWidth={1.5} />
          <text
            y={5}
            textAnchor="middle"
            fontSize={14}
            fontWeight={700}
            fill="#1E40AF"
            fontFamily='"Noto Sans TC"'
          >
            志偉
          </text>
        </g>
        <text
          x={50}
          y={140}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill={color}
          fontFamily='"Noto Sans TC"'
          style={{ transition: 'fill 900ms ease-out' }}
        >
          {score} 分
        </text>

        {/* 曲線箭頭：從志偉右緣 (80, 80) 曲線到右上 (218, 40)，視覺上指向目標桌 */}
        <path
          d="M 80 78 Q 150 5 218 38"
          fill="none"
          stroke="#B08D57"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="7 5"
          markerEnd="url(#rec-arrow-head)"
        />
        <text
          x={145}
          y={155}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#8C6D3F"
          fontFamily='"Noto Sans TC"'
        >
          智慧推薦
        </text>
      </svg>

      {/* 目標桌 — MiniTableVisual 大圓桌 cap 10, deltaBadge +33 */}
      <div className="-ml-6 scale-[0.72] sm:-ml-4 sm:scale-[0.8]">
        <MiniTableVisual
          table={recommendationTable}
          guests={recommendationGuests}
          guestScores={recommendationScores}
          tableScore={88}
          previewSlotIndex={9}
          deltaBadge="+33"
        />
      </div>
    </div>
  );
}

function IllustrationAvoidPair() {
  // 10 人桌放 Harry + 佛地魔 + 8 個 HP 角色，2 人帶青筋 💢 標記
  return (
    <div className="scale-[0.82] sm:scale-90">
      <MiniTableVisual
        table={avoidTable}
        guests={avoidGuests}
        guestScores={avoidScores}
        tableScore={avoidTableAvg}
        seatBadges={{ harry: '💢', voldemort: '💢' }}
      />
    </div>
  );
}

function IllustrationGuestList() {
  // 賓客清單 / 低分賓客視圖（字體放大版）
  return (
    <svg width={320} height={260} viewBox="0 0 320 260" aria-hidden>
      <rect x={10} y={10} width={300} height={240} rx={12} fill="#FFFFFF" stroke="#D6D3D1" strokeWidth={2} />
      <text x={26} y={38} fontSize={15} fontWeight={700} fill="#1C1917" fontFamily='"Noto Sans TC"'>
        需要關注的賓客 (3)
      </text>
      <line x1={26} y1={48} x2={294} y2={48} stroke="#E7E5E4" />

      {[
        { name: '林志偉', meta: '第 5 桌 · 素食需求', score: 45, color: '#EA580C' },
        { name: '黃大明', meta: '第 5 桌 · 無群組', score: 42, color: '#EA580C' },
        { name: '陳美芳', meta: '第 7 桌 · 輪椅', score: 38, color: '#DC2626' },
        { name: '王小華', meta: '第 2 桌', score: 72, color: '#CA8A04' },
        { name: '張雅婷', meta: '第 4 桌', score: 68, color: '#CA8A04' },
      ].map((row, i) => {
        const y = 66 + i * 36;
        const cy = y + 12;
        const rRing = 16;
        const circumRow = 2 * Math.PI * rRing;
        return (
          <g key={i}>
            {/* Avatar ring */}
            <circle cx={40} cy={cy} r={rRing} fill="none" stroke="#E7E5E4" strokeWidth={2.5} />
            <circle cx={40} cy={cy} r={rRing} fill="none" stroke={row.color} strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={`${circumRow * (row.score / 100)} ${circumRow * (1 - row.score / 100)}`}
              strokeDashoffset={circumRow * 0.25}
              transform={`rotate(-90 40 ${cy})`}
            />
            <circle cx={40} cy={cy} r={12} fill="#F3F4F6" stroke="white" strokeWidth={1.5} />
            {/* Name + meta */}
            <text x={68} y={cy - 2} fontSize={14} fontWeight={700} fill="#1C1917" fontFamily='"Noto Sans TC"'>
              {row.name}
            </text>
            <text x={68} y={cy + 14} fontSize={11} fill="#78716C" fontFamily='"Noto Sans TC"'>
              {row.meta}
            </text>
            {/* Score badge */}
            <g transform={`translate(274, ${cy})`}>
              <rect x={-22} y={-13} width={44} height={26} rx={13} fill={row.color} />
              <text y={5} textAnchor="middle" fontSize={14} fontWeight={800} fill="white" fontFamily='"Plus Jakarta Sans"'>
                {row.score}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function IllustrationAutoAssign() {
  // 自動排桌：散亂賓客 → 整齊桌子
  return (
    <svg width={280} height={200} viewBox="0 0 280 200" aria-hidden>
      {/* Left: scattered chips */}
      {[
        { x: 25, y: 40, color: '#DBEAFE', stroke: '#BFDBFE' },
        { x: 60, y: 30, color: '#FEE2E2', stroke: '#FECACA' },
        { x: 45, y: 75, color: '#DBEAFE', stroke: '#BFDBFE' },
        { x: 80, y: 95, color: '#F3F4F6', stroke: '#D1D5DB' },
        { x: 20, y: 115, color: '#FEE2E2', stroke: '#FECACA' },
        { x: 65, y: 135, color: '#DBEAFE', stroke: '#BFDBFE' },
        { x: 30, y: 160, color: '#FEE2E2', stroke: '#FECACA' },
        { x: 85, y: 160, color: '#F3F4F6', stroke: '#D1D5DB' },
      ].map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={11} fill={c.color} stroke={c.stroke} strokeWidth={1.5} />
      ))}
      <text x={55} y={190} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>
        未分配賓客
      </text>

      {/* Arrow with sparkle */}
      <g transform="translate(130, 100)">
        <path d="M -12 0 L 12 0" stroke="#B08D57" strokeWidth={3} strokeLinecap="round" />
        <path d="M 6 -7 L 14 0 L 6 7" stroke="#B08D57" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* Sparkle */}
        <g transform="translate(0, -22)">
          <path d="M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z" fill="#B08D57" />
        </g>
        <text y={32} textAnchor="middle" fontSize={9} fill="#8C6D3F" fontWeight={600} fontFamily='"Noto Sans TC"'>
          一鍵排桌
        </text>
      </g>

      {/* Right: 2 organized tables — 賓客全綠表示全部滿意 */}
      {[
        { cx: 205, cy: 60 },
        { cx: 205, cy: 140 },
      ].map((t, ti) => (
        <g key={ti}>
          <circle cx={t.cx} cy={t.cy} r={34} fill="#FFFFFF" stroke="#B08D57" strokeWidth={2} />
          <text x={t.cx} y={t.cy + 3} textAnchor="middle" fontSize={14} fontWeight={800} fill="#16A34A" fontFamily='"Plus Jakarta Sans"'>
            {ti === 0 ? 92 : 88}
          </text>
          {Array.from({ length: 6 }, (_, i) => {
            const angle = ((2 * Math.PI) / 6) * i - Math.PI / 2;
            const cx = t.cx + Math.cos(angle) * 26;
            const cy = t.cy + Math.sin(angle) * 26;
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={8} fill="none" stroke="#16A34A" strokeWidth={2} />
                <circle cx={cx} cy={cy} r={6} fill="#BBF7D0" stroke="white" strokeWidth={1} />
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

function IllustrationOverflow() {
  // 鄰桌加成：主桌 10 大學同學 + 鄰桌 8 公司同事 + 2 位溢出大學同學
  // 重點：溢出的 2 位雖然不是和子分類同桌，但因為鄰桌，仍有 +5 加成
  return (
    <svg width={340} height={240} viewBox="0 0 340 240" aria-hidden>
      {/* Main table: 大學同學 10 人 */}
      <g transform="translate(90, 120)">
        <circle r={68} fill="#FFFFFF" stroke="#16A34A" strokeWidth={2.5} />
        <text y={-4} textAnchor="middle" fontSize={22} fontWeight={800} fill="#16A34A" fontFamily='"Plus Jakarta Sans"'>
          85
        </text>
        <text y={14} textAnchor="middle" fontSize={11} fill="#78716C" fontFamily='"Noto Sans TC"'>
          第 1 桌
        </text>
        <text y={28} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>
          大學同學
        </text>
        {Array.from({ length: 10 }, (_, i) => {
          const angle = ((2 * Math.PI) / 10) * i - Math.PI / 2;
          const cx = Math.cos(angle) * 52;
          const cy = Math.sin(angle) * 52;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={11} fill="none" stroke="#16A34A" strokeWidth={2} />
              <circle cx={cx} cy={cy} r={9} fill="#DBEAFE" stroke="white" strokeWidth={1} />
            </g>
          );
        })}
      </g>

      {/* Neighbor table: 公司同事 8 + 大學同學溢出 2 */}
      <g transform="translate(240, 120)">
        <circle r={68} fill="#FFFFFF" stroke="#D6D3D1" strokeWidth={2} />
        <text y={-4} textAnchor="middle" fontSize={22} fontWeight={800} fill="#1C1917" fontFamily='"Plus Jakarta Sans"'>
          78
        </text>
        <text y={14} textAnchor="middle" fontSize={11} fill="#78716C" fontFamily='"Noto Sans TC"'>
          第 2 桌
        </text>
        <text y={28} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>
          公司同事
        </text>
        {Array.from({ length: 10 }, (_, i) => {
          const angle = ((2 * Math.PI) / 10) * i - Math.PI / 2;
          const cx = Math.cos(angle) * 52;
          const cy = Math.sin(angle) * 52;
          // 第 0 和 1 是溢出的大學同學（藍色，和第 1 桌同色）
          const isOverflow = i === 0 || i === 1;
          return (
            <g key={i}>
              {/* 溢出者特別圈起來 — 外層暖金粗虛線環 */}
              {isOverflow && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={17}
                  fill="none"
                  stroke="#B08D57"
                  strokeWidth={2.5}
                  strokeDasharray="3 2"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(176,141,87,0.4))' }}
                />
              )}
              <circle cx={cx} cy={cy} r={11} fill="none" stroke={isOverflow ? '#16A34A' : '#CA8A04'} strokeWidth={2} />
              <circle
                cx={cx}
                cy={cy}
                r={9}
                fill={isOverflow ? '#DBEAFE' : '#FEE2E2'}
                stroke="white"
                strokeWidth={1}
              />
            </g>
          );
        })}
      </g>

      {/* 兩桌之間的連結弧線（顯示同群組仍有連結）*/}
      <path
        d="M 138 115 Q 170 85 205 95"
        fill="none"
        stroke="#B08D57"
        strokeWidth={2}
        strokeDasharray="4 3"
        opacity={0.7}
      />

      {/* +5 鄰桌加成 badge 放在連結弧線上方 */}
      <g transform="translate(170, 55)" style={{ filter: 'drop-shadow(0 2px 6px rgba(22,163,74,0.25))' }}>
        <rect x={-42} y={-14} width={84} height={28} rx={14} fill="#DCFCE7" stroke="#16A34A" strokeWidth={2} />
        <text y={5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#15803D" fontFamily='"Plus Jakarta Sans"'>
          +5 鄰桌加成
        </text>
      </g>

      <text x={170} y={220} textAnchor="middle" fontSize={11} fill="#78716C" fontFamily='"Noto Sans TC"'>
        12 人大學群組 · 溢出 2 位到鄰桌仍保留群組分
      </text>
    </svg>
  );
}

function IllustrationCompanion() {
  // 眷屬跟隨：模擬工作區拖曳 — 一張桌子 + 被拖曳的主人+眷屬 ghost 浮動 + +N 徽章
  return (
    <svg width={320} height={240} viewBox="0 0 320 240" aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <filter id="drag-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx={0} dy={6} stdDeviation={5} floodColor="#B08D57" floodOpacity={0.35} />
        </filter>
      </defs>

      {/* Source table (cap 10, 主人離開的原位 dashed) */}
      <g transform="translate(100, 130)">
        <circle r={68} fill="#FFFFFF" stroke="#D6D3D1" strokeWidth={2} />
        <text y={-4} textAnchor="middle" fontSize={22} fontWeight={800} fill="#1C1917" fontFamily='"Plus Jakarta Sans"'>
          82
        </text>
        <text y={14} textAnchor="middle" fontSize={11} fill="#78716C" fontFamily='"Noto Sans TC"'>
          第 4 桌
        </text>
        {Array.from({ length: 10 }, (_, i) => {
          const angle = ((2 * Math.PI) / 10) * i - Math.PI / 2;
          const cx = Math.cos(angle) * 52;
          const cy = Math.sin(angle) * 52;
          // 第 0 是主人原位（dashed empty），第 1 是眷屬原位（dashed empty）
          const isEmpty = i === 0 || i === 1;
          if (isEmpty) {
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={11}
                fill="#F5F0E6"
                stroke="#B08D57"
                strokeWidth={2}
                strokeDasharray="3 2"
                opacity={0.7}
              />
            );
          }
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={11} fill="none" stroke="#16A34A" strokeWidth={2} />
              <circle cx={cx} cy={cy} r={9} fill="#FEE2E2" stroke="white" strokeWidth={1} />
            </g>
          );
        })}
      </g>

      {/* Dragged ghost: 主人 + 嬰兒一起飄在上方右側 */}
      <g transform="translate(235, 80)" filter="url(#drag-shadow)">
        {/* 主人 */}
        <g>
          <circle r={24} fill="none" stroke="#16A34A" strokeWidth={2.5} />
          <circle r={20} fill="#FEE2E2" stroke="white" strokeWidth={2} />
          <text y={5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#991B1B" fontFamily='"Noto Sans TC"'>
            媽媽
          </text>
        </g>
        {/* 眷屬 (小圈 + 連結) */}
        <g transform="translate(28, 24)">
          <line x1={-14} y1={-12} x2={-4} y2={-4} stroke="#8C6D3F" strokeWidth={2} strokeDasharray="2 2" />
          <circle r={14} fill="none" stroke="#16A34A" strokeWidth={2} />
          <circle r={11} fill="#FEE2E2" stroke="white" strokeWidth={1.5} />
          <text y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#991B1B" fontFamily='"Noto Sans TC"'>
            嬰兒
          </text>
        </g>
      </g>

      {/* +N 眷屬 badge (貼在 ghost 右上，像工作區拖曳時的分數 delta badge) */}
      <g transform="translate(288, 56)" style={{ filter: 'drop-shadow(0 2px 6px rgba(176,141,87,0.35))' }}>
        <rect x={-28} y={-13} width={56} height={26} rx={13} fill="#F5F0E6" stroke="#B08D57" strokeWidth={2} />
        <text y={5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#8C6D3F" fontFamily='"Plus Jakarta Sans"'>
          +1 位
        </text>
      </g>

      {/* 拖曳虛線軌跡：從原位到 ghost */}
      <path
        d="M 100 80 Q 170 40 225 70"
        fill="none"
        stroke="#B08D57"
        strokeWidth={2}
        strokeDasharray="5 4"
        opacity={0.6}
      />

      <text x={160} y={222} textAnchor="middle" fontSize={11} fill="#78716C" fontFamily='"Noto Sans TC"'>
        拖主人，眷屬自動跟著走
      </text>
    </svg>
  );
}

// ─── Feature section component ──────────────────────

interface FeatureProps {
  index: number;
  headline: string;
  description: string;
  illustration: React.ReactNode;
  side: 'left' | 'right';
  background: 'primary' | 'alt';
}

function FeatureSection({ index, headline, description, illustration, side, background }: FeatureProps) {
  const bg = background === 'alt' ? '#F5F0E6' : '#FAFAF9';
  return (
    <section
      className="w-full px-6 py-16 sm:py-20"
      style={{ backgroundColor: bg }}
      aria-labelledby={`feature-${index}-title`}
    >
      <div
        className={`mx-auto flex max-w-5xl flex-col items-center gap-10 md:gap-16 ${
          side === 'right' ? 'md:flex-row-reverse' : 'md:flex-row'
        }`}
      >
        <div className="flex w-full shrink-0 items-center justify-center md:w-[45%]">
          {illustration}
        </div>
        <div className="w-full md:w-[55%]">
          <div className="mb-3 flex items-center gap-3">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#B08D57] text-sm font-bold text-white"
              style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              {index}
            </span>
            <h2
              id={`feature-${index}-title`}
              className="text-2xl font-bold text-[#1C1917] sm:text-3xl"
              style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
            >
              {headline}
            </h2>
          </div>
          <p className="text-base leading-relaxed text-[#57534E] sm:text-lg">{description}</p>
        </div>
      </div>
    </section>
  );
}

// ─── Landing page ────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#FAFAF9] text-[#1C1917]">
      {/* Hero */}
      <section
        aria-labelledby="landing-hero-title"
        className="relative flex min-h-[60vh] flex-col items-center justify-center px-6 py-20 sm:py-28"
        style={{
          background:
            'radial-gradient(ellipse at top right, rgba(245, 240, 230, 0.6) 0%, rgba(250, 250, 249, 0) 50%)',
        }}
      >
        <h1
          id="landing-hero-title"
          className="text-center font-[800] tracking-tight text-[40px] leading-[1.1] sm:text-[52px] lg:text-[64px]"
          style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
        >
          用心排好座位
        </h1>
        <p className="mt-6 max-w-2xl text-center text-lg text-[#78716C] sm:text-xl">
          婚禮、尾牙、活動的一站式座位安排工具。
          <br className="hidden sm:inline" />
          從匯入名單到智慧推薦，每個環節都替你想好了。
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link
            to="/register"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-[#B08D57] px-8 text-base font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#8C6D3F] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#B08D57] focus:ring-offset-2"
          >
            免費試用
          </Link>
          <a
            href="#features"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-[#D6D3D1] bg-white px-8 text-base font-medium text-[#1C1917] transition-colors hover:bg-[#F5F0E6]"
          >
            看看功能 ↓
          </a>
        </div>
      </section>

      <div id="features" />

      {/* 1. 匯入賓客名單 */}
      <FeatureSection
        index={1}
        side="left"
        background="alt"
        headline="從你已有的名單開始"
        description="直接匯入 Google Sheet 或 Excel 檔案。系統自動辨識姓名、別名、分類、關係分數，不用一筆一筆重新輸入。支援繁中欄位和彈性格式，手上已經做好的 Excel 就是起點。"
        illustration={<IllustrationImport />}
      />

      {/* 2. 拖曳排位 + 每人滿意度 — 2 桌 × 10 人 */}
      <section className="w-full px-6 py-16 sm:py-20" style={{ backgroundColor: '#FAFAF9' }}>
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-3 flex items-center justify-center gap-3">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#B08D57] text-sm font-bold text-white"
                style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
              >
                2
              </span>
              <h2
                className="text-2xl font-bold text-[#1C1917] sm:text-3xl"
                style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
              >
                拖曳排位，每個人都有滿意度分數
              </h2>
            </div>
            <p className="text-base leading-relaxed text-[#57534E] sm:text-lg">
              畫面上的每張桌子都是圓桌，座位圍繞桌緣排列。每位賓客有自己的滿意度進度環，綠色代表被照顧得很好，紅色代表需要關注。拖一下就即時重算，不用等也不用存檔。
            </p>
          </div>
          <div className="mt-10 flex flex-wrap items-start justify-center gap-6 md:gap-10">
            <MiniTableVisual
              table={showcaseT1}
              guests={showcaseGuestsT1}
              guestScores={showcaseScores}
              tableScore={showcaseT1Avg}
            />
            <MiniTableVisual
              table={showcaseT2}
              guests={showcaseGuestsT2}
              guestScores={showcaseScores}
              tableScore={showcaseT2Avg}
            />
          </div>
        </div>
      </section>

      {/* 3. 推薦最好的座位 */}
      <FeatureSection
        index={3}
        side="left"
        background="alt"
        headline="推薦最好的座位給您"
        description="系統根據賓客的社交關係、群組歸屬、個人偏好，自動算出「這個人放哪桌最開心」。滑鼠停在任何賓客身上，就會看到一條智慧推薦虛線指向最適合的空位，附上預估分數變化。"
        illustration={<IllustrationRecommendation />}
      />

      {/* 4. 避免同桌（名人仇人梗） */}
      <FeatureSection
        index={4}
        side="right"
        background="primary"
        headline="死對頭，悄悄擋住"
        description="標記「這兩人絕對不能同桌」，只有你看得到，賓客不知道。系統排位時會自動避開，就算手動拖錯也會即時警告。前任、家族糾紛、公司恩怨，都可以安心放進來。"
        illustration={<IllustrationAvoidPair />}
      />

      {/* 5. 全場滿意度一次看 — 用賓客清單 */}
      <FeatureSection
        index={5}
        side="left"
        background="alt"
        headline="誰不開心，一眼就知道"
        description="儀表板把全場依滿意度排序，分數低的賓客自動浮上來。誰的座位需要重新想、有沒有特殊需求被漏掉、哪些人想同桌還沒配對成功,全部一張表看完。點一下就能直接跳到那個人去調整。"
        illustration={<IllustrationGuestList />}
      />

      {/* 6. 自動排桌 */}
      <FeatureSection
        index={6}
        side="right"
        background="primary"
        headline="一鍵自動排桌"
        description="完全不知道從哪開始?按一下「自動排桌」,系統用社群偵測演算法把賓客分成幾組,每組塞進一桌,群組內的人盡量放在一起、跨群組的橋接角色放在邊界。你只要在結果上微調就好。"
        illustration={<IllustrationAutoAssign />}
      />

      {/* 7. 群組溢出處理 */}
      <FeatureSection
        index={7}
        side="left"
        background="alt"
        headline="人太多塞不下?自動溢出到鄰桌"
        description="大學同學 12 個人但桌子只有 10 位?系統自動把多出來的 2 位安排到鄰桌,優先挑和其他圈子也有連結的人,讓他們在新桌依然有認識的人。而且實體桌位會建議相鄰,連走動都不費力。"
        illustration={<IllustrationOverflow />}
      />

      {/* 8. 眷屬跟隨 */}
      <FeatureSection
        index={8}
        side="right"
        background="primary"
        headline="帶小孩、帶另一半?一起移動"
        description="一位賓客帶幾個眷屬來,系統會把他們綁在一起。你拖主人,眷屬自動跟著走,不會分開。嬰兒椅、兒童椅、不吃牛的另一半,所有特殊需求都跟著主人一起被記下來。"
        illustration={<IllustrationCompanion />}
      />

      {/* Final CTA */}
      <section
        className="w-full px-6 py-20 text-center"
        style={{
          background:
            'linear-gradient(180deg, #F5F0E6 0%, #FAFAF9 100%)',
        }}
      >
        <h2
          className="mx-auto max-w-2xl text-3xl font-bold text-[#1C1917] sm:text-4xl"
          style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
        >
          準備好開始排座位了嗎?
        </h2>
        <p className="mt-4 text-base text-[#78716C] sm:text-lg">
          免費試用,不用信用卡。匯入你的名單,立刻體驗。
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            to="/register"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-[#B08D57] px-10 text-base font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#8C6D3F] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#B08D57] focus:ring-offset-2"
          >
            免費試用
          </Link>
        </div>
      </section>

      <footer className="w-full bg-[#1C1917] px-6 py-10 text-center text-sm text-[#A8A29E]">
        <p>排位鷗鷗 Seatern · 用心排好座位</p>
      </footer>
    </main>
  );
}
