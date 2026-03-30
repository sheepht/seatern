import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSeatingStore } from '@/stores/seating'
import { recalculateAll, getSatisfactionColor, formatScoreDelta } from '@/lib/satisfaction'

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  '男方': { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
  '女方': { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  '共同': { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' },
}

interface Props {
  tableId: string
  seatIndex: number
  seatX: number
  seatY: number
  tableCenterX: number
  tableCenterY: number
  onClose: () => void
}

interface Prediction {
  guest: ReturnType<typeof useSeatingStore.getState>['guests'][0]
  predictedScore: number
  tableDelta: number
  newTableAvg: number
}

export function SeatPopover({ tableId, seatIndex, seatX, seatY, tableCenterX, tableCenterY, onClose }: Props) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)

  const guests = useSeatingStore((s) => s.guests)
  const tables = useSeatingStore((s) => s.tables)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const moveGuestToSeat = useSeatingStore((s) => s.moveGuestToSeat)

  // 自動 focus 搜尋框
  useEffect(() => { inputRef.current?.focus() }, [])

  // 點擊外部關閉（capture phase，延遲啟用避免觸發自身的 click 事件）
  useEffect(() => {
    const raf = requestAnimationFrame(() => { mountedRef.current = true })
    const handler = (e: PointerEvent) => {
      if (!mountedRef.current) return
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handler, true)
    return () => { cancelAnimationFrame(raf); mountedRef.current = false; document.removeEventListener('pointerdown', handler, true) }
  }, [onClose])

  // ESC 關閉
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const unassigned = useMemo(
    () => guests.filter((g) => !g.assignedTableId && g.rsvpStatus === 'confirmed'),
    [guests],
  )

  // 預測每位待排賓客在此桌的滿意度 + 桌均 delta
  const predictions = useMemo(() => {
    const table = tables.find((t) => t.id === tableId)
    if (!table) return []

    const tableGuests = guests.filter((g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed')
    const seatCount = tableGuests.reduce((s, g) => s + g.attendeeCount, 0)
    const currentTableAvg = table.averageSatisfaction

    const results: Prediction[] = []
    for (const g of unassigned) {
      if (seatCount + g.attendeeCount > table.capacity) continue
      const simGuests = guests.map((og) => og.id === g.id ? { ...og, assignedTableId: tableId } : og)
      const simResult = recalculateAll(simGuests, tables, avoidPairs)
      const newScore = simResult.guests.find((gs) => gs.id === g.id)?.satisfactionScore ?? 55
      const newTableAvg = simResult.tables.find((ts) => ts.id === tableId)?.averageSatisfaction ?? 0
      const tableDelta = formatScoreDelta(newTableAvg - currentTableAvg)
      results.push({
        guest: g,
        predictedScore: Math.round(newScore),
        tableDelta,
        newTableAvg,
      })
    }
    results.sort((a, b) => b.predictedScore - a.predictedScore)
    return results
  }, [unassigned, guests, tables, avoidPairs, tableId])

  // 搜尋：姓名、暱稱、分類、標籤
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return predictions
    return predictions.filter(({ guest: g }) =>
      g.name.toLowerCase().includes(q) ||
      g.aliases.some((a) => a.toLowerCase().includes(q)) ||
      (g.category ?? '').toLowerCase().includes(q) ||
      g.guestTags.some((gt) => gt.tag.name.toLowerCase().includes(q))
    )
  }, [predictions, search])

  const top3 = predictions.slice(0, 3)

  const handleSelect = (guestId: string) => {
    useSeatingStore.setState({ recommendationTableScores: new Map(), seatPreviewGuest: null })
    moveGuestToSeat(guestId, tableId, seatIndex)
    onClose()
  }

  // popover 關閉時清除預覽
  useEffect(() => {
    return () => { useSeatingStore.setState({ recommendationTableScores: new Map(), seatPreviewGuest: null }) }
  }, [])

  // Popover 位置：固定在桌子正右方，不蓋桌子
  const popW = 280
  const popH = 360

  // 桌子最右側座位 x + 間距 → popover 左邊緣
  const tableRadius = Math.sqrt((seatX - tableCenterX) ** 2 + (seatY - tableCenterY) ** 2) || 40
  const left = Math.max(8, Math.min(tableCenterX + tableRadius + 32, window.innerWidth - popW - 8))
  const top = Math.max(8, Math.min(tableCenterY - popH / 2, window.innerHeight - popH - 8))

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: Math.max(8, left),
        top: Math.max(8, top),
        width: popW,
        maxHeight: popH,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 8px 30px rgba(28,25,23,0.12)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-body)',
        overflow: 'hidden',
      }}
    >
      {/* 搜尋框 */}
      <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid var(--border)' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="搜尋姓名、分類、群組..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontFamily: 'var(--font-body)',
            outline: 'none',
            background: '#FAFAF9',
          }}
          onFocus={(e) => { e.target.style.borderColor = '#B08D57' }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
        />
      </div>

      {/* 推薦區（僅在無搜尋時顯示） */}
      {!search.trim() && top3.length > 0 && (
        <div style={{ padding: '8px 12px 4px' }}>
          <div style={{ fontSize: '11px', color: '#A8A29E', fontWeight: 600, marginBottom: 4 }}>
            推薦入座
          </div>
          {top3.map((p) => (
            <GuestRow key={p.guest.id} prediction={p} onClick={() => handleSelect(p.guest.id)} highlight tableId={tableId} seatIndex={seatIndex} />
          ))}
        </div>
      )}

      {/* 分隔線 */}
      {!search.trim() && top3.length > 0 && filtered.length > top3.length && (
        <div style={{ height: 1, background: 'var(--border)', margin: '0 12px' }} />
      )}

      {/* 全部列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 8px' }}>
        {!search.trim() && top3.length > 0 && (
          <div style={{ fontSize: '11px', color: '#A8A29E', fontWeight: 600, marginBottom: 4, marginTop: 4 }}>
            所有待排
          </div>
        )}
        {(search.trim() ? filtered : filtered.slice(top3.length)).map((p) => (
          <GuestRow key={p.guest.id} prediction={p} onClick={() => handleSelect(p.guest.id)} tableId={tableId} seatIndex={seatIndex} />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '16px 0', textAlign: 'center', color: '#A8A29E', fontSize: '13px' }}>
            {search.trim() ? '找不到符合的賓客' : '沒有待排賓客'}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function GuestRow({ prediction, onClick, highlight, tableId, seatIndex }: {
  prediction: Prediction
  onClick: () => void
  highlight?: boolean
  tableId: string
  seatIndex: number
}) {
  const { guest, predictedScore, tableDelta, newTableAvg } = prediction
  // 用分類決定顏色（男方藍、女方紅），badge 文字顯示標籤名
  const catStyle = CATEGORY_STYLES[guest.category ?? ''] || { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' }
  const tagLabel = guest.guestTags.length > 0 ? guest.guestTags[0].tag.name : (guest.category ?? '其他')
  const scoreColor = getSatisfactionColor(predictedScore)
  const deltaColor = tableDelta > 0 ? '#16A34A' : tableDelta < 0 ? '#DC2626' : '#A8A29E'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 6px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: highlight ? '#FFFBEB' : 'transparent',
        transition: 'background 100ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = highlight ? '#FEF3C7' : '#F5F5F4'
        useSeatingStore.setState({
          recommendationTableScores: new Map([[tableId, newTableAvg]]),
          seatPreviewGuest: { tableId, seatIndex, guestId: guest.id, predictedScore, category: guest.category, name: guest.name, aliases: guest.aliases },
        })
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = highlight ? '#FFFBEB' : 'transparent'
        useSeatingStore.setState({ recommendationTableScores: new Map(), seatPreviewGuest: null })
      }}
    >
      {/* 標籤 badge（顏色跟分類走） */}
      <span style={{
        fontSize: '10px',
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: '3px',
        background: catStyle.bg,
        color: catStyle.text,
        border: `1px solid ${catStyle.border}`,
        flexShrink: 0,
        maxWidth: 72,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {tagLabel}
      </span>

      {/* 姓名 */}
      <span style={{ fontSize: '13px', fontWeight: 500, color: '#1C1917', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {guest.name}
      </span>

      {/* 預測分數 + 桌均 delta */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: scoreColor }}>
          {predictedScore}
        </span>
        <span style={{ fontSize: '10px', fontWeight: 600, color: deltaColor }}>
          {tableDelta > 0 ? `+${tableDelta}` : tableDelta === 0 ? '±0' : `${tableDelta}`}
        </span>
      </span>
    </div>
  )
}
