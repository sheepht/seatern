import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authFetch } from '@/lib/api'

export default function LandingPage() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const handleStart = async () => {
    setCreating(true)
    try {
      // 先檢查是否已有活動
      const checkRes = await authFetch('/api/events/mine')
      if (checkRes.ok) {
        navigate('/workspace')
        return
      }

      // 沒有活動，建立新的
      const res = await authFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '我的婚禮', type: 'wedding' }),
      })
      if (!res.ok) throw new Error('建立活動失敗')
      navigate('/workspace/import')
    } catch {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-5xl font-bold text-gray-900 mb-4">Seatern</h1>
      <p className="text-lg text-gray-600 mb-8 text-center max-w-md">
        智慧座位安排系統 — 從賓客管理到滿意度最佳化，一站完成。
      </p>
      <div className="flex gap-4">
        <button
          onClick={handleStart}
          disabled={creating}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? '建立中...' : '開始排座位'}
        </button>
        <Link
          to="/login"
          className="px-6 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-100"
        >
          登入
        </Link>
      </div>
    </div>
  )
}
