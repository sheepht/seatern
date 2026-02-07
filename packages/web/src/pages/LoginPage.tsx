import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { signInWithEmail, signInWithGoogle, signInWithLINE } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 讀取 URL 上的 error 參數（LINE 登入失敗時會帶上）
  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError) {
      setError(urlError)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithEmail(email, password)
      navigate('/events')
    } catch (err: any) {
      setError(err.message || '登入失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    try {
      await signInWithGoogle()
    } catch (err: any) {
      setError(err.message || 'Google 登入失敗')
    }
  }

  const handleLINE = async () => {
    try {
      await signInWithLINE()
    } catch (err: any) {
      setError(err.message || 'LINE 登入失敗')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-6 bg-white rounded shadow">
        <h1 className="text-2xl font-bold text-center mb-6">登入 Seatern</h1>

        {error && (
          <div className="mb-4 p-2 text-sm text-red-700 bg-red-50 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <div className="flex-1 border-t" />
          <span className="text-sm text-gray-500">或</span>
          <div className="flex-1 border-t" />
        </div>

        <div className="space-y-2">
          <button
            onClick={handleGoogle}
            className="w-full py-2 border rounded hover:bg-gray-50 text-sm"
          >
            使用 Google 登入
          </button>
          <button
            onClick={handleLINE}
            className="w-full py-2 border rounded hover:bg-gray-50 text-sm bg-green-50 text-green-800"
          >
            使用 LINE 登入
          </button>
        </div>

        <p className="mt-4 text-center text-sm text-gray-600">
          還沒有帳號？{' '}
          <a href="/register" className="text-blue-600 hover:underline">
            註冊
          </a>
        </p>
      </div>
    </div>
  )
}
