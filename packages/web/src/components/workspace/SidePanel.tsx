import { useSeatingStore } from '@/stores/seating'
import { GuestChip } from './GuestChip'

function ClearTableButton({ tableId, guestCount }: { tableId: string; guestCount: number }) {
  const moveGuest = useSeatingStore((s) => s.moveGuest)
  const getTableGuests = useSeatingStore((s) => s.getTableGuests)

  if (guestCount === 0) return null

  const handleClear = () => {
    const guests = getTableGuests(tableId)
    for (const g of guests) {
      moveGuest(g.id, null)
    }
  }

  return (
    <button
      onClick={handleClear}
      className="text-[10px] hover:opacity-80"
      style={{ color: 'var(--error)' }}
    >
      清空此桌
    </button>
  )
}

export function SidePanel() {
  const guests = useSeatingStore((s) => s.guests)
  const tables = useSeatingStore((s) => s.tables)
  const moveGuest = useSeatingStore((s) => s.moveGuest)
  const selectedTableId = useSeatingStore((s) => s.selectedTableId)
  const getTableGuests = useSeatingStore((s) => s.getTableGuests)
  const getTableSeatCount = useSeatingStore((s) => s.getTableSeatCount)
  const getTotalAssignedSeats = useSeatingStore((s) => s.getTotalAssignedSeats)
  const getTotalConfirmedSeats = useSeatingStore((s) => s.getTotalConfirmedSeats)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const dragPreview = useSeatingStore((s) => s.dragPreview)
  const recommendationOverallScore = useSeatingStore((s) => s.recommendationOverallScore)

  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')
  const assigned = getTotalAssignedSeats()
  const total = getTotalConfirmedSeats()
  const unassigned = total - assigned

  // 避免同桌違規檢查
  const violations = avoidPairs.filter((ap) => {
    const a = guests.find((g) => g.id === ap.guestAId)
    const b = guests.find((g) => g.id === ap.guestBId)
    return a?.assignedTableId && a.assignedTableId === b?.assignedTableId
  })

  // 選中桌的詳情
  const selectedTable = tables.find((t) => t.id === selectedTableId)
  const selectedGuests = selectedTableId ? getTableGuests(selectedTableId) : []
  const selectedSeatCount = selectedTableId ? getTableSeatCount(selectedTableId) : 0

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* 全場滿意度 */}
      <div className="p-3" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h3 className="text-xs font-medium uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>全場統計</h3>
        {(() => {
          const currentAvg = confirmed.length > 0
            ? Math.round((confirmed.reduce((s, g) => s + g.satisfactionScore, 0) / confirmed.length) * 10) / 10
            : 0
          // 拖曳預覽或推薦的全場平均
          const previewOverall = dragPreview?.previewTableScores
            ? (() => {
                // 拖曳時用 previewScores 計算全場平均
                const scores = confirmed.map((g) => dragPreview.previewScores.get(g.id) ?? g.satisfactionScore)
                return scores.length > 0 ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : 0
              })()
            : recommendationOverallScore !== null
              ? Math.round(recommendationOverallScore * 10) / 10
              : null
          const displayScore = previewOverall ?? currentAvg
          const rawDelta = previewOverall !== null ? previewOverall - currentAvg : 0
          const delta = rawDelta > 0.05 ? Math.max(1, Math.round(rawDelta * 10) / 10) : rawDelta < -0.05 ? Math.min(-1, Math.round(rawDelta * 10) / 10) : 0

          return (
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold" style={{
                color: 'var(--text-primary)',
                transform: rawDelta > 0.05 ? 'scale(1.08)' : rawDelta < -0.05 ? 'scale(0.95)' : 'scale(1)',
                transition: 'transform 200ms ease-out',
                transformOrigin: 'left center',
              }}>
                <span className="font-data">
                  {confirmed.length > 0 ? displayScore : '—'}
                </span>
                <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-muted)' }}>/ 100</span>
              </div>
              {delta !== 0 && (
                <span
                  className="text-xs font-bold font-data px-1.5 py-0.5 rounded-full"
                  style={{
                    background: delta > 0 ? '#16A34A' : '#DC2626',
                    color: 'white',
                    fontSize: '11px',
                  }}
                >
                  {delta > 0 ? '+' : ''}{delta}
                </span>
              )}
            </div>
          )
        })()}
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <div>已安排 <span className="font-medium font-data" style={{ color: 'var(--text-primary)' }}>{assigned}</span> 席</div>
          <div>未安排 <span className="font-medium font-data" style={{ color: '#EA580C' }}>{unassigned}</span> 席</div>
          <div>賓客 <span className="font-medium font-data" style={{ color: 'var(--text-primary)' }}>{confirmed.length}</span> 人</div>
          <div>桌次 <span className="font-medium font-data" style={{ color: 'var(--text-primary)' }}>{tables.length}</span> 桌</div>
        </div>
      </div>

      {/* 選中桌詳情 */}
      {selectedTable && (
        <div className="p-3" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '2px solid var(--accent)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
                {selectedTable.name}
              </h3>
              <div className="text-sm font-data" style={{ color: 'var(--text-secondary)' }}>
                {selectedSeatCount}/{selectedTable.capacity} 席
              </div>
            </div>
            <ClearTableButton tableId={selectedTable.id} guestCount={selectedGuests.length} />
          </div>
          <div className="space-y-1.5">
            {selectedGuests.map((g) => {
              // 檢查此賓客是否跟同桌的人有避免同桌衝突
              const violatedPair = avoidPairs.find((ap) => {
                const otherId = ap.guestAId === g.id ? ap.guestBId : ap.guestBId === g.id ? ap.guestAId : null
                return otherId && selectedGuests.some((sg) => sg.id === otherId)
              })

              return (
              <div
                key={g.id}
                className={`flex items-center justify-between rounded px-1 -mx-1 ${
                  violatedPair ? 'bg-red-50 ring-1 ring-red-300' : ''
                }`}
                title={violatedPair ? `避免同桌${violatedPair.reason ? `（${violatedPair.reason}）` : ''}` : undefined}
              >
                <div className="flex items-center gap-1">
                  {violatedPair && <span className="text-red-500 text-xs">⚠</span>}
                  <GuestChip guest={g} />
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <span className="text-xs font-medium font-data" style={{ color: getSatisfactionHex(g.satisfactionScore) }}>
                    {g.satisfactionScore || '—'}
                  </span>
                  <button
                    onClick={() => moveGuest(g.id, null)}
                    className="w-4 h-4 flex items-center justify-center rounded"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.backgroundColor = '#FEF2F2' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = '' }}
                    title="移除此人"
                  >
                    ×
                  </button>
                </div>
              </div>
              )
            })}
            {selectedGuests.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>尚未安排賓客</p>
            )}
          </div>
        </div>
      )}

      {/* 警示區 */}
      <div className="p-3" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h3 className="text-xs font-medium uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>警示</h3>
        <div className="space-y-1.5 text-sm">
          {violations.length > 0 && violations.map((v) => {
            const a = guests.find((g) => g.id === v.guestAId)
            const b = guests.find((g) => g.id === v.guestBId)
            return (
              <div key={v.id} className="flex items-start gap-1.5" style={{ color: 'var(--error)' }}>
                <span className="shrink-0">⚠</span>
                <span>{a?.name} 與 {b?.name} 避免同桌{v.reason ? `（${v.reason}）` : ''}</span>
              </div>
            )
          })}
          {unassigned > 0 && (
            <div className="flex items-start gap-1.5" style={{ color: '#EA580C' }}>
              <span className="shrink-0">⚠</span>
              <span>尚有 {unassigned} 席未安排</span>
            </div>
          )}
          {violations.length === 0 && unassigned === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>目前無警示</p>
          )}
        </div>
      </div>
    </div>
  )
}

function getSatisfactionHex(score: number): string {
  if (score >= 85) return '#16A34A'
  if (score >= 70) return '#CA8A04'
  if (score >= 55) return '#EA580C'
  return '#DC2626'
}
