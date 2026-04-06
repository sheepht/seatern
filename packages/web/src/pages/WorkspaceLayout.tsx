import { useEffect } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { useSeatingStore } from '@/stores/seating';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Toolbar } from '@/components/workspace/Toolbar';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import TableLimitModal from '@/components/workspace/TableLimitModal';

export default function WorkspaceLayout() {
  const location = useLocation();
  const loadEvent = useSeatingStore((s) => s.loadEvent);
  const loading = useSeatingStore((s) => s.loading);
  const eventId = useSeatingStore((s) => s.eventId);
  const isMobile = useIsMobile();

  const page = location.pathname.endsWith('/import') ? 'import' as const
    : location.pathname.endsWith('/guests') ? 'guests' as const
    : location.pathname.endsWith('/settings') ? 'settings' as const
    : 'workspace' as const;

  useEffect(() => {
    if (!eventId) loadEvent();
  }, [eventId, loadEvent]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
        {!isMobile && <Toolbar page={page} />}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--text-muted)] font-[family-name:var(--font-body)]">載入中...</p>
        </div>
        {isMobile && <MobileBottomNav />}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
      {!isMobile && <Toolbar page={page} />}
      <div className={isMobile ? 'flex-1 overflow-auto pb-14' : 'flex-1 flex flex-col overflow-hidden'}>
        <Outlet />
      </div>
      {isMobile && <MobileBottomNav />}
      <TableLimitModal />
    </div>
  );
}
