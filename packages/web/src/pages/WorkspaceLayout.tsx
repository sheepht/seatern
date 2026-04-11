import { useEffect, useRef } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { useSeatingStore } from '@/stores/seating';
import { useAuthStore } from '@/stores/auth';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Toolbar } from '@/components/workspace/Toolbar';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import TableLimitModal from '@/components/workspace/TableLimitModal';
import { LoadingTable } from '@/components/workspace/LoadingTable';
import { loadDemoData, hasDemoLoaded } from '@/lib/load-demo';

export default function WorkspaceLayout() {
  const location = useLocation();
  const bootEvent = useSeatingStore((s) => s.bootEvent);
  const loading = useSeatingStore((s) => s.loading);
  const eventId = useSeatingStore((s) => s.eventId);
  const guests = useSeatingStore((s) => s.guests);
  const demoLoading = useSeatingStore((s) => s.demoLoading);
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const demoLoaded = useRef(false);

  const page = location.pathname.endsWith('/import') ? 'import' as const
    : location.pathname.endsWith('/guests') ? 'guests' as const
    : location.pathname.endsWith('/settings') ? 'settings' as const
    : 'workspace' as const;

  useEffect(() => {
    if (!eventId) bootEvent();
  }, [eventId, bootEvent]);

  // 未登入 + 無賓客 → 自動載入範例資料
  useEffect(() => {
    if (!eventId || loading || demoLoaded.current) return;
    if (user) return;
    if (guests.length > 0) return;
    if (hasDemoLoaded()) return;
    demoLoaded.current = true;
    loadDemoData(eventId);
  }, [eventId, loading, user, guests.length]);

  const showLoading = loading || demoLoading;

  if (showLoading) {
    return (
      <div className="h-dvh flex flex-col bg-[var(--bg-primary)]">
        {!isMobile && <Toolbar page={page} />}
        <div className="flex-1 flex items-center justify-center">
          <LoadingTable label={demoLoading ? '載入展示用賓客...' : '載入中...'} />
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
