import { useSeatingStore } from '@/stores/seating'
import { useNavigate } from 'react-router-dom'

export default function TableLimitModal() {
  const tableLimitReached = useSeatingStore((s) => s.tableLimitReached)
  const tableLimitDismissed = useSeatingStore((s) => s.tableLimitDismissed)
  const navigate = useNavigate()

  if (!tableLimitReached || tableLimitDismissed) return null

  const dismiss = () => {
    useSeatingStore.setState({ tableLimitReached: false, tableLimitDismissed: true })
  }

  const goLogin = () => {
    navigate('/login')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-stone-900/40" onClick={dismiss} />

      {/* Modal — bottom sheet on mobile, centered on desktop */}
      <div className="relative w-full sm:max-w-[420px] bg-white sm:rounded-xl rounded-t-2xl sm:mx-4 p-8 shadow-[0_20px_60px_rgba(28,25,23,0.15)] max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-b-none max-sm:pb-10">
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-stone-300" />
        </div>

        {/* Lock icon */}
        <div className="flex justify-center mb-5">
          <div className="w-12 h-12 rounded-full bg-[#F5F0E6] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B08D57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>

        {/* Header */}
        <h2 className="text-center text-xl font-bold text-stone-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          解鎖更多桌數
        </h2>

        {/* Subheader */}
        <p className="text-center text-sm text-stone-500 mt-2 leading-relaxed">
          你已經排了 10 桌！登入即可排到 20 桌，<br />而且資料永遠不會遺失。
        </p>

        {/* Benefits */}
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

        {/* Login buttons */}
        <div className="mt-6 space-y-2.5">
          <button
            onClick={goLogin}
            className="w-full h-11 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: '#06C755' }}
          >
            LINE 登入
          </button>
          <button
            onClick={goLogin}
            className="w-full h-11 rounded-lg text-sm font-medium text-stone-800 border border-stone-200 flex items-center justify-center gap-2 hover:bg-stone-50"
          >
            Google 登入
          </button>
          <button
            onClick={goLogin}
            className="w-full h-11 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: '#B08D57' }}
          >
            Email 登入
          </button>
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="w-full mt-4 text-center text-xs text-stone-400 hover:underline"
        >
          稍後再說
        </button>
      </div>
    </div>
  )
}
