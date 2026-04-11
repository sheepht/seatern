import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

// Phase 2：Hero 有真的可拖曳 demo。Phase 3-5 補 sections。
// 完整規格見 ~/.gstack/projects/seatern/ceo-plans/2026-04-11-landing-page.md
//
// LandingDemo 走 React.lazy 讓 @dnd-kit/core 不進首屏 bundle。
// 首屏只載：React + Link + hero 骨架。
const LandingDemo = lazy(() => import('@/components/landing/LandingDemo'));

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#FAFAF9] text-[#1C1917]">
      <section
        aria-labelledby="landing-hero-title"
        className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-20"
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

        <p className="mt-6 max-w-xl text-center text-lg text-[#78716C] sm:text-xl">
          拖一下賓客，立刻看到滿意度變化
        </p>

        <div className="mt-10 w-full max-w-3xl">
          <Suspense
            fallback={
              <div
                className="flex h-[240px] items-center justify-center rounded-2xl border border-dashed border-[#D6D3D1] bg-white/60 text-sm text-[#A8A29E]"
                aria-label="載入互動式座位安排示範"
              >
                載入中…
              </div>
            }
          >
            <LandingDemo />
          </Suspense>
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link
            to="/register"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-[#B08D57] px-8 text-base font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#8C6D3F] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#B08D57] focus:ring-offset-2"
          >
            免費試用
          </Link>
          <Link
            to="/"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-[#D6D3D1] bg-white px-8 text-base font-medium text-[#1C1917] transition-colors hover:bg-[#F5F0E6]"
          >
            看看運作
          </Link>
        </div>

        <p className="mt-8 text-xs text-[#A8A29E]">
          Phase 2 — 後續會補痛點、流程、公式、FAQ sections
        </p>
      </section>
    </main>
  );
}
