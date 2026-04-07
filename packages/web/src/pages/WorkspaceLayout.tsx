import { useEffect, useRef } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { useSeatingStore } from '@/stores/seating';
import { useAuthStore } from '@/stores/auth';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Toolbar } from '@/components/workspace/Toolbar';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import TableLimitModal from '@/components/workspace/TableLimitModal';
import { loadDemoData, hasDemoLoaded } from '@/lib/load-demo';

export default function WorkspaceLayout() {
  const location = useLocation();
  const loadEvent = useSeatingStore((s) => s.loadEvent);
  const loading = useSeatingStore((s) => s.loading);
  const eventId = useSeatingStore((s) => s.eventId);
  const guests = useSeatingStore((s) => s.guests);
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const demoLoaded = useRef(false);

  const page = location.pathname.endsWith('/import') ? 'import' as const
    : location.pathname.endsWith('/guests') ? 'guests' as const
    : location.pathname.endsWith('/settings') ? 'settings' as const
    : 'workspace' as const;

  useEffect(() => {
    if (!eventId) loadEvent();
  }, [eventId, loadEvent]);

  // 未登入 + 無賓客 → 自動載入範例資料
  useEffect(() => {
    if (!eventId || loading || demoLoaded.current) return;
    if (user) return; // 已登入用戶不載入範例
    if (guests.length > 0) return; // 已有資料
    if (hasDemoLoaded()) return; // 已載入過，不重複灌入
    demoLoaded.current = true;
    loadDemoData(eventId);
  }, [eventId, loading, user, guests.length]);

  if (loading) {
    return (
      <div className="h-dvh flex flex-col bg-[var(--bg-primary)]">
        {!isMobile && <Toolbar page={page} />}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--text-muted)] font-[family-name:var(--font-body)]">載入中...</p>
        </div>
        {isMobile && <MobileBottomNav />}
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-[var(--bg-primary)]">
      {!isMobile && <Toolbar page={page} />}
      <div className={isMobile ? 'flex-1 flex flex-col overflow-hidden pb-14' : 'flex-1 flex flex-col overflow-hidden'}>
        <Outlet />
      </div>
      {isMobile && <MobileBottomNav />}
      <TableLimitModal />
    </div>
  );
}
