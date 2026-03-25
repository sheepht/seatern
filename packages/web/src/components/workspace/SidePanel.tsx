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
      className="text-[10px] text-red-400 hover:text-red-600"
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
      <div className="p-3 bg-white rounded-lg border border-gray-200">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">全場統計</h3>
        <div className="text-2xl font-bold text-gray-900">
          {confirmed.length > 0
            ? Math.round((confirmed.reduce((s, g) => s + g.satisfactionScore, 0) / confirmed.length) * 10) / 10
            : '—'
          }
          <span className="text-sm text-gray-400 font-normal ml-1">/ 100</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
          <div>已安排 <span className="font-medium text-gray-700">{assigned}</span> 席</div>
          <div>未安排 <span className="font-medium text-orange-600">{unassigned}</span> 席</div>
          <div>賓客 <span className="font-medium text-gray-700">{confirmed.length}</span> 人</div>
          <div>桌次 <span className="font-medium text-gray-700">{tables.length}</span> 桌</div>
        </div>
      </div>

      {/* 選中桌詳情 */}
      {selectedTable && (
        <div className="p-3 bg-white rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                {selectedTable.name}
              </h3>
              <div className="text-sm text-gray-600">
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
                  <span className={`text-xs font-medium ${getSatisfactionClass(g.satisfactionScore)}`}>
                    {g.satisfactionScore || '—'}
                  </span>
                  <button
                    onClick={() => moveGuest(g.id, null)}
                    className="w-4 h-4 flex items-center justify-center text-gray-300 hover:text-red-500 rounded hover:bg-red-50"
                    title="移除此人"
                  >
                    ×
                  </button>
                </div>
              </div>
              )
            })}
            {selectedGuests.length === 0 && (
              <p className="text-xs text-gray-400">尚未安排賓客</p>
            )}
          </div>
        </div>
      )}

      {/* 警示區 */}
      <div className="p-3 bg-white rounded-lg border border-gray-200">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">警示</h3>
        <div className="space-y-1.5 text-sm">
          {violations.length > 0 && violations.map((v) => {
            const a = guests.find((g) => g.id === v.guestAId)
            const b = guests.find((g) => g.id === v.guestBId)
            return (
              <div key={v.id} className="flex items-start gap-1.5 text-red-600">
                <span className="shrink-0">⚠</span>
                <span>{a?.name} 與 {b?.name} 避免同桌{v.reason ? `（${v.reason}）` : ''}</span>
              </div>
            )
          })}
          {unassigned > 0 && (
            <div className="flex items-start gap-1.5 text-orange-600">
              <span className="shrink-0">⚠</span>
              <span>尚有 {unassigned} 席未安排</span>
            </div>
          )}
          {violations.length === 0 && unassigned === 0 && (
            <p className="text-xs text-gray-400">目前無警示</p>
          )}
        </div>
      </div>
    </div>
  )
}

function getSatisfactionClass(score: number): string {
  if (score >= 85) return 'text-green-600'
  if (score >= 70) return 'text-yellow-600'
  if (score >= 55) return 'text-orange-600'
  return 'text-red-600'
}
