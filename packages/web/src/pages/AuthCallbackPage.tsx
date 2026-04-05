import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { authFetch } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const claimEvent = useAuthStore((s) => s.claimEvent);
  const [error, setError] = useState('');
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');

    if (!tokenHash || type !== 'magiclink') {
      queueMicrotask(() => setError('無效的登入連結'));
      return;
    }

    ;(async () => {

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      });

      if (verifyError) {
        setError(verifyError.message || '登入失敗');
        return;
      }

      await claimEvent();

      // Ensure an event exists before navigating to workspace
      const checkRes = await authFetch('/api/events/mine');
      if (checkRes.status === 404) {
        await authFetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '我的婚禮', type: 'wedding' }),
        });
      }

      navigate('/', { replace: true });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a href="/login" className="text-blue-600 hover:underline">回到登入頁</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-stone-500">登入中...</p>
    </div>
  );
}
