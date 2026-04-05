import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

import { authFetch } from '@/lib/api';

async function ensureEventExists() {
  const res = await authFetch('/api/events/mine');
  if (res.status === 404) {
    await authFetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '我的婚禮', type: 'wedding' }),
    });
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { signInWithEmail, signInWithGoogle, signInWithLINE, claimEvent } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urlError = searchParams.get('error');
    if (urlError) {
      setError(urlError);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      await claimEvent();
      await ensureEventExists();
      navigate('/');
    } catch (err: any) {
      setError(err.message || '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google 登入失敗');
    }
  };

  const handleLINE = async () => {
    try {
      await signInWithLINE();
    } catch (err: any) {
      setError(err.message || 'LINE 登入失敗');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-full max-w-sm p-6 bg-[var(--bg-surface)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)]">
        <h1 className="text-2xl font-bold text-center mb-6 font-[family-name:var(--font-display)] text-[var(--text-primary)]">登入排位鷗鷗</h1>

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
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-[var(--accent)] text-white rounded-[var(--radius-sm)] hover:bg-[var(--accent-dark)] disabled:opacity-50 font-[family-name:var(--font-ui)] font-medium"
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <div className="flex-1 border-t border-[var(--border)]" />
          <span className="text-sm text-[var(--text-muted)]">或</span>
          <div className="flex-1 border-t border-[var(--border)]" />
        </div>

        <div className="space-y-2">
          <button
            onClick={handleGoogle}
            className="w-full py-2 border border-[var(--border)] rounded-[var(--radius-sm)] hover:bg-[var(--accent-light)] text-sm text-[var(--text-secondary)] font-[family-name:var(--font-ui)] flex items-center justify-center gap-2"
          >
            <GoogleIcon /> 使用 Google 登入
          </button>
          <button
            onClick={handleLINE}
            className="w-full py-2 border border-green-200 rounded-[var(--radius-sm)] hover:bg-green-100 text-sm bg-green-50 text-green-800 font-[family-name:var(--font-ui)] flex items-center justify-center gap-2"
          >
            <LineIcon /> 使用 LINE 登入
          </button>
        </div>

        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          還沒有帳號？{' '}
          <a href="/register" className="text-[var(--accent)] hover:text-[var(--accent-dark)] hover:underline">
            註冊
          </a>
        </p>
      </div>
    </div>
  );
}

const GoogleIcon = () => <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>;
const LineIcon = () => <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#06C755" d="M24 10.304c0-5.369-5.383-9.738-12-9.738S0 4.935 0 10.304c0 4.814 4.27 8.846 10.035 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.309 14.253 24 12.38 24 10.304"/></svg>;
