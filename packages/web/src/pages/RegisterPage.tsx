import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { signUpWithEmail } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('密碼不一致')
      return
    }
    if (password.length < 6) {
      setError('密碼至少 6 個字元')
      return
    }

    setLoading(true)
    try {
      await signUpWithEmail(email, password)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || '註冊失敗')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-full max-w-sm p-6 bg-[var(--bg-surface)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] text-center">
          <h1 className="text-2xl font-bold mb-4 font-[family-name:var(--font-display)] text-[var(--text-primary)]">註冊成功</h1>
          <p className="text-[var(--text-secondary)] mb-4">請查看信箱確認您的帳號。</p>
          <a href="/login" className="text-[var(--accent)] hover:text-[var(--accent-dark)] hover:underline">
            前往登入
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-full max-w-sm p-6 bg-[var(--bg-surface)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)]">
        <h1 className="text-2xl font-bold text-center mb-6 font-[family-name:var(--font-display)] text-[var(--text-primary)]">註冊排位鷗鷗</h1>

        {error && (
          <div className="mb-4 p-2 text-sm text-[#991B1B] bg-red-50 rounded-[var(--radius-sm)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-[var(--text-primary)]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-[var(--text-primary)]">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-[var(--text-primary)]">確認密碼</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-[var(--accent)] text-white rounded-[var(--radius-sm)] hover:bg-[var(--accent-dark)] disabled:opacity-50 font-[family-name:var(--font-ui)] font-medium"
          >
            {loading ? '註冊中...' : '註冊'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          已有帳號？{' '}
          <a href="/login" className="text-[var(--accent)] hover:text-[var(--accent-dark)] hover:underline">
            登入
          </a>
        </p>
      </div>
    </div>
  )
}
