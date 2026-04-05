import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeatingStore } from '@/stores/seating';
import { useAuthStore } from '@/stores/auth';

export default function TableLimitBanner() {
  const tables = useSeatingStore((s) => s.tables);
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  // Only show for anonymous users with 8+ tables
  if (user || dismissed || tables.length < 8) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 mx-2 mb-2 rounded-lg text-xs bg-[#F5F0E6] text-[#8C6D3F]">
      <span className="flex-1">登入即可排到 20 桌</span>
      <button
        onClick={() => navigate('/login')}
        className="font-medium hover:underline whitespace-nowrap text-[#B08D57]"
      >
        登入
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-stone-400 hover:text-stone-600 ml-1"
        aria-label="關閉"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3l8 8M11 3l-8 8" />
        </svg>
      </button>
    </div>
  );
}
