import { useEffect } from 'react'
import { useParams, useLocation, Outlet } from 'react-router-dom'
import { useSeatingStore } from '@/stores/seating'
import { Toolbar } from '@/components/workspace/Toolbar'

export default function WorkspaceLayout() {
  const { eventId } = useParams<{ eventId: string }>()
  const location = useLocation()
  const loadEvent = useSeatingStore((s) => s.loadEvent)
  const loading = useSeatingStore((s) => s.loading)

  const page = location.pathname.endsWith('/import') ? 'import' as const
    : location.pathname.endsWith('/guests') ? 'guests' as const
    : 'workspace' as const

  useEffect(() => {
    if (eventId) loadEvent(eventId)
  }, [eventId, loadEvent])

  if (loading) {
    return (
      <div className="h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
        <Toolbar page={page} />
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>載入中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      <Toolbar page={page} />
      <Outlet />
    </div>
  )
}
