import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-5xl font-bold text-gray-900 mb-4">Seatern</h1>
      <p className="text-lg text-gray-600 mb-8 text-center max-w-md">
        智慧座位安排系統 — 從賓客管理到滿意度最佳化，一站完成。
      </p>
      <Link
        to="/login"
        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        登入
      </Link>
    </div>
  )
}
