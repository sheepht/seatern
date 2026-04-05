import { useEffect } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { useSeatingStore } from '@/stores/seating';
import { Toolbar } from '@/components/workspace/Toolbar';
import TableLimitModal from '@/components/workspace/TableLimitModal';

export default function WorkspaceLayout() {
  const location = useLocation();
  const loadEvent = useSeatingStore((s) => s.loadEvent);
  const loading = useSeatingStore((s) => s.loading);
  const eventId = useSeatingStore((s) => s.eventId);

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
        <Toolbar page={page} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--text-muted)] font-[family-name:var(--font-body)]">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
      <Toolbar page={page} />
      <Outlet />
      <TableLimitModal />
    </div>
  );
}
