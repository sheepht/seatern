import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, Users, Upload, Settings, LogIn } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isLoggedIn = !!user && !user.is_anonymous;

  const currentPath = location.pathname;

  const navItems = [
    { path: '/', icon: LayoutGrid, label: '排位' },
    { path: '/guests', icon: Users, label: '賓客' },
    { path: '/import', icon: Upload, label: '匯入' },
    isLoggedIn
      ? { path: '/settings', icon: Settings, label: '設定' }
      : { path: '/login', icon: LogIn, label: '登入' },
  ];

  return (
    <nav
      role="navigation"
      aria-label="主導航"
      className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-surface)] border-t border-[var(--border)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = path === '/'
            ? currentPath === '/'
            : currentPath.startsWith(path);

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="flex flex-col items-center justify-center gap-0.5 min-w-[64px] h-full bg-transparent border-none cursor-pointer"
              style={{
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
              <span
                className="text-[11px] font-[family-name:var(--font-ui)]"
                style={{ fontWeight: isActive ? 600 : 400 }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
