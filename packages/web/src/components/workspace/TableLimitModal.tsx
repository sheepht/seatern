import { useSeatingStore } from '@/stores/seating';
import { useAuthStore } from '@/stores/auth';
import { useNavigate } from 'react-router-dom';

export default function TableLimitModal() {
  const tableLimitReached = useSeatingStore((s) => s.tableLimitReached);
  const tables = useSeatingStore((s) => s.tables);
  const limit = useSeatingStore((s) => s.tableLimit);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  if (!tableLimitReached) return null;

  const isLoggedIn = !!user;

  const dismiss = () => {
    useSeatingStore.setState({ tableLimitReached: false });
  };

  // Logged-in user hitting 20-table limit → paid tier prompt
  if (isLoggedIn) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center sm:items-center">
        <div className="absolute inset-0 bg-stone-900/40" onClick={dismiss} />
        <div className="relative w-full sm:max-w-[420px] bg-white sm:rounded-xl rounded-t-2xl sm:mx-4 p-8 shadow-[0_20px_60px_rgba(28,25,23,0.15)] max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-b-none max-sm:pb-10">
          <div className="sm:hidden flex justify-center mb-4">
            <div className="w-10 h-1 rounded-full bg-stone-300" />
          </div>

          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 rounded-full bg-[#F5F0E6] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B08D57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
          </div>

          <h2 className="text-center text-xl font-bold text-stone-900 font-[family-name:var(--font-display)]">
            已達到 {limit} 桌上限
          </h2>

          <p className="text-center text-sm text-stone-500 mt-2 leading-relaxed">
            你已經排了 {tables.length} 桌！<br />
            付費版可解鎖更多桌數和進階功能。
          </p>

          <div className="mt-5 space-y-2">
            {['無限桌數', '多活動管理', '優先客服支援'].map((benefit) => (
              <div key={benefit} className="flex items-center gap-2.5 text-sm text-stone-800">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 5" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {benefit}
              </div>
            ))}
          </div>

          <div className="mt-6">
            <button
              onClick={() => { dismiss(); navigate('/pricing'); }}
              className="w-full h-11 rounded-lg text-sm font-medium text-white flex items-center justify-center bg-[#B08D57]"
            >
              升級方案
            </button>
          </div>

          <button onClick={dismiss} className="w-full mt-4 text-center text-xs text-stone-400 hover:underline">
            稍後再說
          </button>
        </div>
      </div>
    );
  }

  // Anonymous user hitting 10-table limit → login prompt
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:items-center">
      <div className="absolute inset-0 bg-stone-900/40" onClick={dismiss} />
      <div className="relative w-full sm:max-w-[420px] bg-white sm:rounded-xl rounded-t-2xl sm:mx-4 p-8 shadow-[0_20px_60px_rgba(28,25,23,0.15)] max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-b-none max-sm:pb-10">
        <div className="sm:hidden flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-stone-300" />
        </div>

        <div className="flex justify-center mb-5">
          <div className="w-12 h-12 rounded-full bg-[#F5F0E6] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B08D57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>

        <h2 className="text-center text-xl font-bold text-stone-900 font-[family-name:var(--font-display)]">
          解鎖更多桌數
        </h2>

        <p className="text-center text-sm text-stone-500 mt-2 leading-relaxed">
          你已經排了 {tables.length} 桌！登入即可排到 20 桌，<br />而且資料永遠不會遺失。
        </p>

        <div className="mt-5 space-y-2">
          {['解鎖 20 桌', '資料雲端儲存', '跨裝置使用'].map((benefit) => (
            <div key={benefit} className="flex items-center gap-2.5 text-sm text-stone-800">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8l3.5 3.5L13 5" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {benefit}
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-2.5">
          <button
            onClick={() => navigate('/login')}
            className="w-full h-11 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 bg-[#06C755]"
          >
            LINE 登入
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full h-11 rounded-lg text-sm font-medium text-stone-800 border border-stone-200 flex items-center justify-center gap-2 hover:bg-stone-50"
          >
            Google 登入
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full h-11 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 bg-[#B08D57]"
          >
            Email 登入
          </button>
        </div>

        <button onClick={dismiss} className="w-full mt-4 text-center text-xs text-stone-400 hover:underline">
          稍後再說
        </button>
      </div>
    </div>
  );
}
