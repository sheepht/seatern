import { Link } from 'react-router-dom'

export default function DemoPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-4">Demo 體驗</h1>
      <p className="text-gray-600 mb-8">排位工作區 Demo（Phase 6 實作）</p>
      <Link to="/" className="text-blue-600 hover:underline">
        返回首頁
      </Link>
    </div>
  )
}
