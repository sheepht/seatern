import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useSeatingStore } from '@/stores/seating';
import { useNotifyPayment } from '@/hooks/usePricingApi';

const PLANS = [
  { type: '30', tables: 30, price: 199, days: 30, label: '小型婚禮', hasGroupPref: false },
  { type: '50', tables: 50, price: 499, days: 30, label: '大型婚禮 / 小型企業活動', recommended: true, hasGroupPref: true },
  { type: '80', tables: 80, price: 799, days: 60, label: '中型企業活動', hasGroupPref: true },
  { type: '200', tables: 200, price: 1499, days: 90, label: '大型活動 / 品牌晚宴', hasGroupPref: true },
] as const;

export default function PricingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const eventId = useSeatingStore((s) => s.eventId);
  const planStatus = useSeatingStore((s) => s.planStatus);
  const planExpiresAt = useSeatingStore((s) => s.planExpiresAt);
  const tableLimit = useSeatingStore((s) => s.tableLimit);
  // 反推目前方案的 planType（從 tableLimit 對應）
  const currentPlanType = PLANS.find((p) => p.tables === tableLimit)?.type ?? null;
  const isActive = planStatus === 'active' && currentPlanType;
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const notifyMut = useNotifyPayment();
  const submitted = notifyMut.isSuccess;
  const submitting = notifyMut.isPending;

  const handleNotify = () => {
    if (!selectedPlan || !eventId) return;
    if (!user) { navigate('/login'); return; }
    notifyMut.mutate({ eventId, planType: selectedPlan });
  };

  // 已經通知過
  if (submitted || planStatus === 'pending') {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CA8A04" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-stone-900 font-[family-name:var(--font-display)] mb-2">
          匯款確認中
        </h1>
        <p className="text-sm text-stone-500 leading-relaxed mb-6">
          我們已收到你的通知，通常 2 小時內確認完成。<br />
          確認後你會在下次登入時看到通知。
        </p>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ← 回到排位頁
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* 標題 */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-stone-900 font-[family-name:var(--font-display)] mb-3">
          升級你的排位體驗
        </h1>
        <p className="text-base text-stone-500">
          一次付費，用到活動結束
        </p>
      </div>

      {/* 到期進度條 */}
      {isActive && planExpiresAt && (() => {
        const currentPlan = PLANS.find((p) => p.type === currentPlanType);
        const totalDays = currentPlan?.days ?? 30;
        const expiresDate = new Date(planExpiresAt);
        const now = new Date();
        const remainDays = Math.max(0, Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const usedPct = Math.min(100, ((totalDays - remainDays) / totalDays) * 100);
        return (
          <div className="rounded-xl border border-stone-200 p-4 mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-stone-500">方案有效期</span>
              <span className="text-sm font-medium text-stone-700 font-[family-name:var(--font-data)]">
                剩餘 {remainDays} 天 / {totalDays} 天
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-stone-100">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${usedPct}%`,
                  background: remainDays <= 3 ? '#DC2626' : remainDays <= 7 ? '#CA8A04' : '#16A34A',
                }}
              />
            </div>
            <p className="text-xs text-stone-400 mt-2">
              到期日：{expiresDate.toLocaleDateString('zh-TW')}
            </p>
          </div>
        );
      })()}

      {/* 方案卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        {PLANS.map((plan) => {
          const isCurrent = isActive && plan.type === currentPlanType;
          const isComingSoon = plan.tables >= 50;
          const isSelected = selectedPlan === plan.type;
          return (
            <button
              key={plan.type}
              onClick={() => !isCurrent && !isComingSoon && setSelectedPlan(plan.type)}
              disabled={!!isCurrent || isComingSoon}
              className={`relative rounded-xl border-2 p-5 text-left transition-all ${
                isComingSoon
                  ? 'border-stone-200 bg-stone-50 opacity-60 cursor-not-allowed'
                  : isCurrent
                    ? 'border-green-300 bg-green-50'
                    : isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                      : 'border-stone-200 hover:border-stone-300'
              }`}
            >
              {isComingSoon ? (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-stone-400 text-white whitespace-nowrap">
                  敬請期待
                </span>
              ) : isCurrent ? (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-600 text-white whitespace-nowrap">
                  目前方案
                </span>
              ) : 'recommended' in plan && plan.recommended && !isActive ? (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[var(--accent)] text-white whitespace-nowrap">
                  推薦
                </span>
              ) : null}
              <div className="text-3xl font-bold text-stone-900 font-[family-name:var(--font-data)] mb-1">
                {plan.tables}
              </div>
              <div className="text-sm text-stone-500 mb-3">桌上限</div>
              <div className="text-xl font-bold text-stone-900 font-[family-name:var(--font-data)]">
                NT${plan.price}
              </div>
              <div className="text-sm text-stone-400">{plan.days} 天有效</div>
              <div className="text-sm text-stone-500 mt-2 leading-tight">
                {plan.label}
              </div>
              {plan.hasGroupPref && (
                <div className="text-xs text-[var(--accent)] font-medium mt-2">
                  含群組同桌/避桌
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 匯款資訊 — 選擇方案後才顯示 */}
      {selectedPlan && (
        <div className="rounded-xl border border-stone-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-stone-900 font-[family-name:var(--font-display)] mb-5">
            匯款資訊
          </h2>

          <div className="text-base space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-stone-500">應付金額</span>
              <span className="font-bold text-stone-900 font-[family-name:var(--font-data)]">
                NT${PLANS.find((p) => p.type === selectedPlan)?.price}
              </span>
            </div>

            <div className="border-t border-stone-100" />

            <div className="flex items-center justify-between">
              <span className="text-stone-500">銀行</span>
              <span className="text-stone-900">國泰世華 (013)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-500">帳號</span>
              <div className="flex items-center gap-2">
                <span className="text-stone-900 font-[family-name:var(--font-data)]">0000-0000-0000-0000</span>
                <button
                  onClick={() => navigator.clipboard.writeText('0000000000000000')}
                  className="text-[11px] text-[var(--accent)] hover:underline"
                >
                  複製
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-500">戶名</span>
              <span className="text-stone-900">排位鷗鷗</span>
            </div>
          </div>

          <p className="text-sm text-stone-400 leading-relaxed mb-6">
            匯款完成後按下方按鈕通知我們。我們確認入帳後會立即為你開通方案。
          </p>

          {!user ? (
            <button
              onClick={() => navigate('/login')}
              className="w-full h-11 rounded-lg text-sm font-medium text-white flex items-center justify-center bg-[var(--accent)]"
            >
              請先登入再購買
            </button>
          ) : (
            <button
              onClick={handleNotify}
              disabled={submitting}
              className="w-full h-11 rounded-lg text-sm font-medium text-white flex items-center justify-center bg-[var(--accent)] disabled:opacity-50"
            >
              {submitting ? '通知中...' : '我已匯款，通知確認'}
            </button>
          )}
        </div>
      )}

      {/* 免費版說明 */}
      <div className="text-center">
        <p className="text-sm text-stone-400">
          免費版最多 {user ? 20 : 10} 桌，無需付費
        </p>
        <button
          onClick={() => navigate('/')}
          className="text-base text-[var(--accent)] hover:underline mt-2"
        >
          ← 回到排位頁
        </button>
      </div>

      {/* 超過 200 桌 */}
      <div className="text-center mt-8 pt-6 border-t border-stone-100">
        <p className="text-sm text-stone-400">
          超過 200 桌？請聯繫 <a href="mailto:hi@seatern.app" className="text-[var(--accent)] hover:underline">hi@seatern.app</a>
        </p>
      </div>
    </div>
    </div>
  );
}
