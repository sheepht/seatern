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

// Feature 3 target table: capacity 5, 4 高分賓客 + 1 空位被推薦
const recommendationTable: DemoTable = {
  id: 'rec-t3',
  name: '第 3 桌',
  capacity: 5,
  guestIds: ['r1', 'r2', 'r3', 'r4'],
};
const recommendationGuests: DemoGuest[] = [
  { id: 'r1', name: '大雄', group: 'groom', mutualPrefs: [] },
  { id: 'r2', name: '家豪', group: 'groom', mutualPrefs: [] },
  { id: 'r3', name: '文華', group: 'groom', mutualPrefs: [] },
  { id: 'r4', name: '建國', group: 'groom', mutualPrefs: [] },
];
const recommendationScores: Record<string, number> = {
  r1: 88, r2: 92, r3: 84, r4: 90,
};

function SourceGuestChip() {
  const r = 26;
  const circum = 2 * Math.PI * r;
  // 志偉目前 45 分 → orange
  const progress = 0.45;
  return (
    <div className="flex flex-col items-center">
      <svg width={70} height={70} style={{ overflow: 'visible' }} aria-hidden>
        <g transform="translate(35, 35)">
          <circle r={r} fill="none" stroke="#E7E5E4" strokeWidth={2.5} />
          <circle
            r={r}
            fill="none"
            stroke="#EA580C"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${circum * progress} ${circum * (1 - progress)}`}
            strokeDashoffset={circum * 0.25}
            transform="rotate(-90)"
          />
          <circle r={22} fill="#DBEAFE" stroke="white" strokeWidth={1.5} />
          <text y={4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#1E40AF" fontFamily='"Noto Sans TC"'>
            志偉
          </text>
        </g>
      </svg>
      <p className="mt-1 text-xs text-[#78716C]" style={{ fontFamily: '"Noto Sans TC", sans-serif' }}>
        目前 45 分
      </p>
    </div>
  );
}

function RecommendationArrow() {
  return (
    <div className="flex flex-col items-center">
      <div
        className="mb-2 rounded-full border border-[#B08D57] bg-[#F5F0E6] px-3 py-1 text-xs font-bold text-[#8C6D3F] shadow-sm"
        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
      >
        +33 分
      </div>
      <svg width={90} height={24} aria-hidden>
        <line
          x1={6}
          y1={12}
          x2={70}
          y2={12}
          stroke="#B08D57"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="6 5"
        />
        <polygon points="68,4 84,12 68,20" fill="#B08D57" />
      </svg>
      <p
        className="mt-1 text-[10px] font-medium text-[#8C6D3F]"
        style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
      >
        推薦移動
      </p>
    </div>
  );
}

function IllustrationRecommendation() {
  // 智慧推薦線：左邊源頭賓客 (45 分) + 中間箭頭 +33 + 右邊 MiniTableVisual 目標桌
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4">
      <SourceGuestChip />
      <RecommendationArrow />
      <div className="scale-[0.85] sm:scale-90">
        <MiniTableVisual
          table={recommendationTable}
          guests={recommendationGuests}
          guestScores={recommendationScores}
          tableScore={88}
          previewSlotIndex={4}
        />
      </div>
    </div>
  );
}

function IllustrationAvoidPair() {
  return (
    <svg width={260} height={200} viewBox="0 0 260 200" aria-hidden>
      {/* Left: Harry Potter (gryffindor red/gold accent) */}
      <g transform="translate(65, 100)">
        <circle r={42} fill="#FEE2E2" stroke="#DC2626" strokeWidth={2.5} />
        <text y={-2} textAnchor="middle" fontSize={13} fontWeight={700} fill="#991B1B" fontFamily='"Noto Sans TC"'>
          哈利
        </text>
        <text y={14} textAnchor="middle" fontSize={12} fontWeight={600} fill="#991B1B" fontFamily='"Noto Sans TC"'>
          波特
        </text>
      </g>
      {/* Right: Voldemort (slytherin green) */}
      <g transform="translate(195, 100)">
        <circle r={42} fill="#DCFCE7" stroke="#16A34A" strokeWidth={2.5} />
        <text y={-2} textAnchor="middle" fontSize={13} fontWeight={700} fill="#166534" fontFamily='"Noto Sans TC"'>
          佛地魔
        </text>
      </g>
      {/* Red X warning in the middle */}
      <g transform="translate(130, 100)">
        <circle r={22} fill="#FFFFFF" stroke="#DC2626" strokeWidth={2.5} />
        <line x1={-10} y1={-10} x2={10} y2={10} stroke="#DC2626" strokeWidth={3.5} strokeLinecap="round" />
        <line x1={-10} y1={10} x2={10} y2={-10} stroke="#DC2626" strokeWidth={3.5} strokeLinecap="round" />
      </g>
      <text x={130} y={170} textAnchor="middle" fontSize={11} fill="#78716C" fontFamily='"Noto Sans TC"'>
        標記「避免同桌」
      </text>
    </svg>
  );
}

function IllustrationGuestList() {
  // 賓客清單 / 低分賓客視圖
  return (
    <svg width={280} height={220} viewBox="0 0 280 220" aria-hidden>
      <rect x={10} y={10} width={260} height={200} rx={10} fill="#FFFFFF" stroke="#D6D3D1" strokeWidth={2} />
      <text x={24} y={34} fontSize={12} fontWeight={700} fill="#1C1917" fontFamily='"Noto Sans TC"'>
        需要關注的賓客 (3)
      </text>
      <line x1={24} y1={42} x2={256} y2={42} stroke="#E7E5E4" />

      {[
        { name: '林志偉', meta: '第 5 桌 · 素食需求', score: 45, color: '#EA580C' },
        { name: '黃大明', meta: '第 5 桌 · 無群組', score: 42, color: '#EA580C' },
        { name: '陳美芳', meta: '第 7 桌 · 輪椅', score: 38, color: '#DC2626' },
        { name: '王小華', meta: '第 2 桌', score: 72, color: '#CA8A04' },
        { name: '張雅婷', meta: '第 4 桌', score: 68, color: '#CA8A04' },
      ].map((row, i) => {
        const y = 58 + i * 30;
        return (
          <g key={i}>
            {/* Avatar */}
            <circle cx={36} cy={y + 10} r={13} fill="none" stroke="#E7E5E4" strokeWidth={2} />
            <circle cx={36} cy={y + 10} r={13} fill="none" stroke={row.color} strokeWidth={2.5}
              strokeDasharray={`${2 * Math.PI * 13 * (row.score / 100)} ${2 * Math.PI * 13 * (1 - row.score / 100)}`}
              strokeDashoffset={2 * Math.PI * 13 * 0.25}
              transform={`rotate(-90 36 ${y + 10})`}
            />
            <circle cx={36} cy={y + 10} r={10} fill="#F3F4F6" stroke="white" strokeWidth={1} />
            {/* Name */}
            <text x={58} y={y + 7} fontSize={11} fontWeight={600} fill="#1C1917" fontFamily='"Noto Sans TC"'>
              {row.name}
            </text>
            <text x={58} y={y + 20} fontSize={9} fill="#78716C" fontFamily='"Noto Sans TC"'>
              {row.meta}
            </text>
            {/* Score badge */}
            <g transform={`translate(240, ${y + 10})`}>
              <rect x={-20} y={-11} width={40} height={22} rx={11} fill={row.color} />
              <text y={4} textAnchor="middle" fontSize={12} fontWeight={700} fill="white" fontFamily='"Plus Jakarta Sans"'>
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

      {/* Right: 2 organized tables */}
      {[
        { cx: 205, cy: 60 },
        { cx: 205, cy: 140 },
      ].map((t, ti) => (
        <g key={ti}>
          <circle cx={t.cx} cy={t.cy} r={34} fill="#FFFFFF" stroke="#B08D57" strokeWidth={2} />
          <text x={t.cx} y={t.cy + 3} textAnchor="middle" fontSize={14} fontWeight={800} fill="#1C1917" fontFamily='"Plus Jakarta Sans"'>
            {ti === 0 ? 92 : 88}
          </text>
          {Array.from({ length: 6 }, (_, i) => {
            const angle = ((2 * Math.PI) / 6) * i - Math.PI / 2;
            const cx = t.cx + Math.cos(angle) * 26;
            const cy = t.cy + Math.sin(angle) * 26;
            const color = i % 2 === 0 ? '#DBEAFE' : '#FEE2E2';
            return <circle key={i} cx={cx} cy={cy} r={6} fill={color} stroke="white" strokeWidth={1} />;
          })}
        </g>
      ))}
    </svg>
  );
}

function IllustrationOverflow() {
  // 群組溢出：12 人群組放不下 10 人桌，溢出 2 人到鄰桌
  return (
    <svg width={280} height={200} viewBox="0 0 280 200" aria-hidden>
      {/* Main table with 10 seats filled */}
      <g transform="translate(95, 100)">
        <circle r={58} fill="#FFFFFF" stroke="#B08D57" strokeWidth={2.5} />
        <text y={-2} textAnchor="middle" fontSize={16} fontWeight={800} fill="#1C1917" fontFamily='"Plus Jakarta Sans"'>
          10
        </text>
        <text y={14} textAnchor="middle" fontSize={9} fill="#78716C" fontFamily='"Noto Sans TC"'>
          大學同學
        </text>
        {Array.from({ length: 10 }, (_, i) => {
          const angle = ((2 * Math.PI) / 10) * i - Math.PI / 2;
          const cx = Math.cos(angle) * 44;
          const cy = Math.sin(angle) * 44;
          return (
            <circle key={i} cx={cx} cy={cy} r={8} fill="#DBEAFE" stroke="white" strokeWidth={1.5} />
          );
        })}
      </g>

      {/* Arrow */}
      <path d="M 162 90 L 182 90" stroke="#B08D57" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="4 3" />
      <path d="M 176 84 L 184 90 L 176 96" stroke="#B08D57" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Overflow neighbor table */}
      <g transform="translate(220, 80)">
        <circle r={34} fill="#FFFFFF" stroke="#D6D3D1" strokeWidth={1.8} />
        <text y={3} textAnchor="middle" fontSize={11} fontWeight={700} fill="#78716C" fontFamily='"Plus Jakarta Sans"'>
          鄰桌
        </text>
        {/* 2 overflow guests highlighted */}
        <g transform="translate(-18, -20)">
          <circle r={9} fill="#DBEAFE" stroke="#B08D57" strokeWidth={2} />
        </g>
        <g transform="translate(18, -20)">
          <circle r={9} fill="#DBEAFE" stroke="#B08D57" strokeWidth={2} />
        </g>
      </g>
      <text x={220} y={135} textAnchor="middle" fontSize={10} fill="#8C6D3F" fontWeight={600} fontFamily='"Noto Sans TC"'>
        溢出 2 位
      </text>

      <text x={140} y={188} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>
        12 人群組 · 單桌上限 10 人
      </text>
    </svg>
  );
}

function IllustrationCompanion() {
  // 眷屬跟隨：主人 + 嬰兒椅小圈一起移動
  return (
    <svg width={280} height={200} viewBox="0 0 280 200" aria-hidden>
      {/* Before: main + companion together */}
      <g transform="translate(60, 100)">
        <circle r={28} fill="#FEE2E2" stroke="#991B1B" strokeWidth={2} />
        <text y={4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#991B1B" fontFamily='"Noto Sans TC"'>
          媽媽
        </text>
        <g transform="translate(22, 22)">
          <circle r={12} fill="#FEE2E2" stroke="#991B1B" strokeWidth={1.5} />
          <text y={3} textAnchor="middle" fontSize={8} fontWeight={600} fill="#991B1B" fontFamily='"Noto Sans TC"'>
            嬰兒
          </text>
        </g>
        {/* Link between them */}
        <line x1={18} y1={18} x2={10} y2={10} stroke="#8C6D3F" strokeWidth={2} strokeDasharray="2 2" />
      </g>

      {/* Arrow */}
      <path d="M 115 100 L 155 100" stroke="#B08D57" strokeWidth={3} strokeLinecap="round" />
      <path d="M 149 94 L 157 100 L 149 106" stroke="#B08D57" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <text x={135} y={85} textAnchor="middle" fontSize={10} fill="#8C6D3F" fontWeight={600} fontFamily='"Noto Sans TC"'>
        拖曳
      </text>

      {/* After: moved together */}
      <g transform="translate(210, 100)">
        <circle r={28} fill="#FEE2E2" stroke="#991B1B" strokeWidth={2} />
        <text y={4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#991B1B" fontFamily='"Noto Sans TC"'>
          媽媽
        </text>
        <g transform="translate(22, 22)">
          <circle r={12} fill="#FEE2E2" stroke="#991B1B" strokeWidth={1.5} />
          <text y={3} textAnchor="middle" fontSize={8} fontWeight={600} fill="#991B1B" fontFamily='"Noto Sans TC"'>
            嬰兒
          </text>
        </g>
        <line x1={18} y1={18} x2={10} y2={10} stroke="#8C6D3F" strokeWidth={2} strokeDasharray="2 2" />
      </g>
      <text x={140} y={180} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>
        眷屬自動跟著主人移動
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
