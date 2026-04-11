import { Link } from 'react-router-dom';
import { MiniTableVisual } from '@/components/landing/MiniTable';
import { demoFixtures } from '@/components/landing/demoFixtures';
import { demoScorer, moveGuest } from '@/components/landing/demoScorer';

// ─── Static demo data for the "圓桌排位" feature section ────
// 預先算好「拖完志明」的完美狀態（t1=87、t2=99），給 feature illustration 用
const demoAfter = moveGuest(demoFixtures, 'g3', 't2');
const demoScores = demoScorer(demoAfter);
const demoT2 = demoAfter.tables.t2;
const demoT2Guests = demoT2.guestIds
  .map((id) => demoAfter.guests[id])
  .filter((g): g is NonNullable<typeof g> => !!g);

// ─── Feature illustrations (inline SVG) ──────────────

function IllustrationImport() {
  return (
    <svg width={240} height={200} viewBox="0 0 240 200" aria-hidden>
      {/* Spreadsheet */}
      <rect x={20} y={30} width={90} height={140} rx={8} fill="#FFFFFF" stroke="#D6D3D1" strokeWidth={2} />
      <line x1={20} y1={55} x2={110} y2={55} stroke="#D6D3D1" strokeWidth={1.5} />
      <line x1={20} y1={80} x2={110} y2={80} stroke="#E7E5E4" />
      <line x1={20} y1={105} x2={110} y2={105} stroke="#E7E5E4" />
      <line x1={20} y1={130} x2={110} y2={130} stroke="#E7E5E4" />
      <line x1={20} y1={155} x2={110} y2={155} stroke="#E7E5E4" />
      <line x1={65} y1={30} x2={65} y2={170} stroke="#E7E5E4" />
      {[62, 90, 115, 140, 162].map((y, i) => (
        <circle key={i} cx={35} cy={y} r={3} fill="#B08D57" opacity={0.7} />
      ))}
      <text x={65} y={48} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>
        賓客名單.xlsx
      </text>
      {/* Arrow */}
      <path d="M120 100 L150 100" stroke="#B08D57" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M145 94 L153 100 L145 106" stroke="#B08D57" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Guest chips */}
      <g transform="translate(180, 60)">
        <rect x={-28} y={0} width={56} height={22} rx={11} fill="#DBEAFE" stroke="#BFDBFE" strokeWidth={1.5} />
        <text y={15} textAnchor="middle" fontSize={11} fill="#1E40AF" fontFamily='"Noto Sans TC"'>小明</text>
      </g>
      <g transform="translate(180, 92)">
        <rect x={-28} y={0} width={56} height={22} rx={11} fill="#FEE2E2" stroke="#FECACA" strokeWidth={1.5} />
        <text y={15} textAnchor="middle" fontSize={11} fill="#991B1B" fontFamily='"Noto Sans TC"'>美玲</text>
      </g>
      <g transform="translate(180, 124)">
        <rect x={-28} y={0} width={56} height={22} rx={11} fill="#DBEAFE" stroke="#BFDBFE" strokeWidth={1.5} />
        <text y={15} textAnchor="middle" fontSize={11} fill="#1E40AF" fontFamily='"Noto Sans TC"'>阿華</text>
      </g>
      <g transform="translate(180, 156)">
        <rect x={-28} y={0} width={56} height={22} rx={11} fill="#F3F4F6" stroke="#D1D5DB" strokeWidth={1.5} />
        <text y={15} textAnchor="middle" fontSize={11} fill="#374151" fontFamily='"Noto Sans TC"'>...</text>
      </g>
    </svg>
  );
}

function IllustrationRelationshipGraph() {
  // Community Detection 社交關係圖 — 三個小社群用虛線圈起來
  return (
    <svg width={260} height={200} viewBox="0 0 260 200" aria-hidden>
      {/* Community A 圈 */}
      <ellipse cx={70} cy={70} rx={55} ry={45} fill="none" stroke="#B08D57" strokeDasharray="5 4" opacity={0.5} />
      {/* Community B 圈 */}
      <ellipse cx={190} cy={70} rx={50} ry={40} fill="none" stroke="#B08D57" strokeDasharray="5 4" opacity={0.5} />
      {/* Community C 圈 */}
      <ellipse cx={130} cy={150} rx={60} ry={35} fill="none" stroke="#B08D57" strokeDasharray="5 4" opacity={0.5} />
      {/* Edges 內部強連結 */}
      <line x1={50} y1={60} x2={85} y2={55} stroke="#78716C" strokeWidth={2.5} />
      <line x1={50} y1={60} x2={70} y2={90} stroke="#78716C" strokeWidth={2.5} />
      <line x1={85} y1={55} x2={70} y2={90} stroke="#78716C" strokeWidth={2.5} />
      <line x1={175} y1={55} x2={205} y2={60} stroke="#78716C" strokeWidth={2.5} />
      <line x1={175} y1={55} x2={200} y2={90} stroke="#78716C" strokeWidth={2.5} />
      <line x1={205} y1={60} x2={200} y2={90} stroke="#78716C" strokeWidth={2.5} />
      <line x1={100} y1={145} x2={130} y2={135} stroke="#78716C" strokeWidth={2.5} />
      <line x1={100} y1={145} x2={160} y2={155} stroke="#78716C" strokeWidth={2.5} />
      <line x1={130} y1={135} x2={160} y2={155} stroke="#78716C" strokeWidth={2.5} />
      {/* 橋接邊 弱連結 */}
      <line x1={70} y1={90} x2={130} y2={135} stroke="#A8A29E" strokeWidth={1.5} strokeDasharray="3 3" />
      <line x1={200} y1={90} x2={160} y2={155} stroke="#A8A29E" strokeWidth={1.5} strokeDasharray="3 3" />
      {/* Nodes — 大小代表關係分 */}
      {[
        { cx: 50, cy: 60, r: 9, color: '#DBEAFE', stroke: '#1E40AF' },
        { cx: 85, cy: 55, r: 11, color: '#DBEAFE', stroke: '#1E40AF' },
        { cx: 70, cy: 90, r: 9, color: '#DBEAFE', stroke: '#1E40AF' },
        { cx: 175, cy: 55, r: 9, color: '#FEE2E2', stroke: '#991B1B' },
        { cx: 205, cy: 60, r: 11, color: '#FEE2E2', stroke: '#991B1B' },
        { cx: 200, cy: 90, r: 9, color: '#FEE2E2', stroke: '#991B1B' },
        { cx: 100, cy: 145, r: 9, color: '#F3F4F6', stroke: '#374151' },
        { cx: 130, cy: 135, r: 11, color: '#F3F4F6', stroke: '#374151' },
        { cx: 160, cy: 155, r: 9, color: '#F3F4F6', stroke: '#374151' },
      ].map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill={n.color} stroke={n.stroke} strokeWidth={2} />
      ))}
      {/* Labels */}
      <text x={70} y={25} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>大學同學</text>
      <text x={190} y={25} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>公司同事</text>
      <text x={130} y={196} textAnchor="middle" fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>家人親戚</text>
    </svg>
  );
}

function IllustrationAvoidPair() {
  return (
    <svg width={240} height={180} viewBox="0 0 240 180" aria-hidden>
      {/* Guest A */}
      <g transform="translate(60, 90)">
        <circle r={32} fill="#DBEAFE" stroke="#1E40AF" strokeWidth={2.5} />
        <text y={5} textAnchor="middle" fontSize={14} fontWeight={600} fill="#1E40AF" fontFamily='"Noto Sans TC"'>
          陳志偉
        </text>
      </g>
      {/* Guest B */}
      <g transform="translate(180, 90)">
        <circle r={32} fill="#FEE2E2" stroke="#991B1B" strokeWidth={2.5} />
        <text y={5} textAnchor="middle" fontSize={14} fontWeight={600} fill="#991B1B" fontFamily='"Noto Sans TC"'>
          林大華
        </text>
      </g>
      {/* Red X in middle */}
      <g transform="translate(120, 90)">
        <circle r={18} fill="#FEE2E2" stroke="#DC2626" strokeWidth={2.5} />
        <line x1={-8} y1={-8} x2={8} y2={8} stroke="#DC2626" strokeWidth={3} strokeLinecap="round" />
        <line x1={-8} y1={8} x2={8} y2={-8} stroke="#DC2626" strokeWidth={3} strokeLinecap="round" />
      </g>
      <text x={120} y={160} textAnchor="middle" fontSize={11} fill="#78716C" fontFamily='"Noto Sans TC"'>
        標記為「避免同桌」
      </text>
    </svg>
  );
}

function IllustrationDashboard() {
  return (
    <svg width={260} height={200} viewBox="0 0 260 200" aria-hidden>
      {/* Frame */}
      <rect x={10} y={10} width={240} height={180} rx={10} fill="#FFFFFF" stroke="#D6D3D1" strokeWidth={2} />
      <text x={25} y={35} fontSize={12} fontWeight={600} fill="#1C1917" fontFamily='"Noto Sans TC"'>
        全場平均：82 分
      </text>
      {/* Overall bar */}
      <rect x={25} y={44} width={210} height={10} rx={5} fill="#E7E5E4" />
      <rect x={25} y={44} width={172} height={10} rx={5} fill="#16A34A" />
      {/* Per-table rows */}
      {[
        { label: '桌 1 家人', pct: 0.92, color: '#16A34A', y: 75 },
        { label: '桌 2 公司', pct: 0.85, color: '#16A34A', y: 100 },
        { label: '桌 3 大學', pct: 0.76, color: '#CA8A04', y: 125 },
        { label: '桌 4 混合', pct: 0.58, color: '#EA580C', y: 150 },
      ].map((row, i) => (
        <g key={i}>
          <text x={25} y={row.y + 4} fontSize={10} fill="#78716C" fontFamily='"Noto Sans TC"'>{row.label}</text>
          <rect x={85} y={row.y - 4} width={140} height={8} rx={4} fill="#E7E5E4" />
          <rect x={85} y={row.y - 4} width={140 * row.pct} height={8} rx={4} fill={row.color} />
          <text x={235} y={row.y + 4} fontSize={10} fill="#1C1917" textAnchor="end" fontFamily='"Plus Jakarta Sans"' fontWeight={600}>
            {Math.round(row.pct * 100)}
          </text>
        </g>
      ))}
      {/* Warning badge */}
      <g transform="translate(195, 175)">
        <rect x={-30} y={-8} width={60} height={16} rx={8} fill="#FEE2E2" stroke="#DC2626" strokeWidth={1} />
        <text y={4} textAnchor="middle" fontSize={9} fill="#DC2626" fontFamily='"Noto Sans TC"' fontWeight={600}>
          2 位需關注
        </text>
      </g>
    </svg>
  );
}

function IllustrationExport() {
  return (
    <svg width={220} height={200} viewBox="0 0 220 200" aria-hidden>
      {/* Paper */}
      <rect x={30} y={20} width={160} height={160} rx={6} fill="#FFFFFF" stroke="#D6D3D1" strokeWidth={2} />
      <line x1={45} y1={45} x2={175} y2={45} stroke="#1C1917" strokeWidth={1.5} />
      <text x={50} y={40} fontSize={10} fontWeight={700} fill="#1C1917" fontFamily='"Noto Sans TC"'>
        婚宴座位表
      </text>
      {/* Mini tables */}
      {[
        { cx: 75, cy: 80 },
        { cx: 145, cy: 80 },
        { cx: 75, cy: 140 },
        { cx: 145, cy: 140 },
      ].map((t, i) => (
        <g key={i}>
          <circle cx={t.cx} cy={t.cy} r={22} fill="none" stroke="#B08D57" strokeWidth={1.5} />
          <text x={t.cx} y={t.cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1C1917" fontFamily='"Plus Jakarta Sans"'>
            {i + 1}
          </text>
          {[0, 1, 2, 3, 4, 5].map((s) => {
            const angle = (Math.PI * 2 * s) / 6 - Math.PI / 2;
            return (
              <circle
                key={s}
                cx={t.cx + Math.cos(angle) * 18}
                cy={t.cy + Math.sin(angle) * 18}
                r={3}
                fill="#78716C"
              />
            );
          })}
        </g>
      ))}
      {/* Download arrow */}
      <g transform="translate(180, 175)">
        <circle r={16} fill="#B08D57" />
        <path d="M0 -6 L0 4 M-4 0 L0 4 L4 0" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
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
          從匯入名單到列印座位表，每個環節都替你想好了。
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

      {/* Feature 1: 匯入賓客名單 */}
      <FeatureSection
        index={1}
        side="left"
        background="alt"
        headline="從你已有的名單開始"
        description="直接匯入 Google Sheet 或 Excel 檔案。系統自動辨識姓名、別名、分類、關係分數，不用一筆一筆重新輸入。支援繁中欄位和彈性格式，手上已經做好的 Excel 就是起點。"
        illustration={<IllustrationImport />}
      />

      {/* Feature 2: 圓桌排位 + 每人滿意度 */}
      <FeatureSection
        index={2}
        side="right"
        background="primary"
        headline="拖曳排位，每個人都有滿意度分數"
        description="畫面上的每張桌子都是一個圓桌，座位圍繞桌緣排列。每位賓客有自己的滿意度進度環，從綠（被照顧得很好）到紅（需要關注）。拖一下就即時重算，不用等也不用存檔。"
        illustration={
          <MiniTableVisual
            table={demoT2}
            guests={demoT2Guests}
            guestScores={demoScores.perGuest}
            tableScore={demoScores.tableAvg.t2}
          />
        }
      />

      {/* Feature 3: 社交關係圖 */}
      <FeatureSection
        index={3}
        side="left"
        background="alt"
        headline="社交關係一眼看穿"
        description="系統自動偵測賓客之間的連結（同群組、想同桌、常被點名），把他們畫成社群圖。緊密連結的人會聚成一個圈，橋接角色一看就懂。適合你在決定誰跟誰一桌之前先摸清楚整個場面。"
        illustration={<IllustrationRelationshipGraph />}
      />

      {/* Feature 4: 避免同桌 */}
      <FeatureSection
        index={4}
        side="right"
        background="primary"
        headline="前任、家庭糾紛，悄悄擋住"
        description="標記「這兩個人絕對不能同桌」，只有你看得到，賓客不知道。系統排位時會自動避開，就算你手動拖錯也會即時警告。家族歷史不用再告訴別人。"
        illustration={<IllustrationAvoidPair />}
      />

      {/* Feature 5: 儀表板 */}
      <FeatureSection
        index={5}
        side="left"
        background="alt"
        headline="全場滿意度一次看"
        description="儀表板顯示整場平均、每桌平均、誰是分數最低的人。一眼知道哪桌需要調整、誰可能會不開心。系統還會主動建議優化方案，一鍵套用。"
        illustration={<IllustrationDashboard />}
      />

      {/* Feature 6: 匯出 */}
      <FeatureSection
        index={6}
        side="right"
        background="primary"
        headline="一鍵匯出列印用座位表"
        description="確認完座位之後，直接匯出成可列印的座位表 PDF。婚宴現場貼在入口的那種版面，桌號、賓客名字、備註都在上面。也可以發送座位確認通知給每位賓客。"
        illustration={<IllustrationExport />}
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
          準備好開始排座位了嗎？
        </h2>
        <p className="mt-4 text-base text-[#78716C] sm:text-lg">
          免費試用，不用信用卡。匯入你的名單，立刻體驗。
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
