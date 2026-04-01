import { useState, useMemo } from 'react'
import { useSeatingStore, type Guest } from '@/stores/seating'
import { getCategoryColor, loadCategoryColors, type CategoryColor } from '@/lib/category-colors'

interface Props {
  onClose: () => void
}

const REASONS = ['前任關係', '家庭糾紛', '工作嫌隙', '其他']

const CATEGORY_ORDER = ['男方', '女方', '共同']

// --- Guest tag label: [大學同學] with category color ---

function TagLabel({ guest, categoryColors }: { guest: Guest; categoryColors: Record<string, CategoryColor> }) {
  const catColor = getCategoryColor(guest.category, categoryColors)
  const tagName = guest.subcategory?.name ?? (guest.category ?? '共同')
  return (
    <span className="whitespace-nowrap shrink-0" style={{
      fontSize: 12, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
      background: catColor.background, color: catColor.color, border: `1px solid ${catColor.border}`,
    }}>
      {tagName}
    </span>
  )
}

// --- Selectable chip (left panel) ---

function SelectableChip({ guest, selected, onClick, categoryColors }: { guest: Guest; selected: boolean; onClick: () => void; categoryColors: Record<string, CategoryColor> }) {
  const catColor = getCategoryColor(guest.category, categoryColors)
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 text-sm cursor-pointer select-none whitespace-nowrap transition-all"
      style={{
        fontFamily: 'var(--font-body)',
        borderRadius: 'var(--radius-sm)',
        border: selected ? '2px solid var(--error)' : `1px solid ${catColor.border}`,
        backgroundColor: selected ? '#FEF2F2' : catColor.background,
        color: selected ? '#DC2626' : catColor.color,
        fontWeight: selected ? 600 : 400,
      }}
    >
      {guest.aliases.length > 0 ? guest.aliases[0] : guest.name}
    </button>
  )
}

// --- Avoid pair row (right panel): [tag]名字 vs [tag]名字 ---

function PairRow({ guestA, guestB, reason, onRemove, categoryColors }: {
  guestA: Guest; guestB: Guest; reason: string | null; onRemove: () => void; categoryColors: Record<string, CategoryColor>
}) {
  const nameA = guestA.aliases.length > 0 ? guestA.aliases[0] : guestA.name
  const nameB = guestB.aliases.length > 0 ? guestB.aliases[0] : guestB.name
  return (
    <div
      className="flex items-center gap-1.5 py-2 px-2.5"
      style={{ background: '#FEF2F2', borderRadius: 'var(--radius-sm)', border: '1px solid #FECACA', fontSize: 13 }}
    >
      <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-nowrap">
        <TagLabel guest={guestA} categoryColors={categoryColors} />
        <span className="whitespace-nowrap" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{nameA}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>vs</span>
        <span className="whitespace-nowrap" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{nameB}</span>
        <TagLabel guest={guestB} categoryColors={categoryColors} />
        {reason && <span className="whitespace-nowrap" style={{ color: 'var(--text-muted)', fontSize: 11 }}>({reason})</span>}
      </div>
      <button
        onClick={onRemove}
        className="hover:opacity-70 shrink-0"
        style={{ color: '#DC2626', fontSize: 14, lineHeight: 1, padding: 2 }}
      >
        ✕
      </button>
    </div>
  )
}

// --- Main Modal ---

export function AvoidPairModal({ onClose }: Props) {
  const guests = useSeatingStore((s) => s.guests)
  const tables = useSeatingStore((s) => s.tables)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const addAvoidPair = useSeatingStore((s) => s.addAvoidPair)
  const removeAvoidPair = useSeatingStore((s) => s.removeAvoidPair)
  const eventId = useSeatingStore((s) => s.eventId)
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId])

  const confirmed = useMemo(() => guests.filter((g) => g.rsvpStatus === 'confirmed'), [guests])

  const [selectedA, setSelectedA] = useState<string | null>(null)
  const [selectedB, setSelectedB] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  const guestA = selectedA ? confirmed.find((g) => g.id === selectedA) ?? null : null
  const guestB = selectedB ? confirmed.find((g) => g.id === selectedB) ?? null : null

  // Check duplicate
  const disabledPairIds = useMemo(() => {
    const pairs = new Set<string>()
    for (const ap of avoidPairs) {
      pairs.add(`${ap.guestAId}-${ap.guestBId}`)
      pairs.add(`${ap.guestBId}-${ap.guestAId}`)
    }
    return pairs
  }, [avoidPairs])
  const isDuplicate = guestA && guestB && disabledPairIds.has(`${guestA.id}-${guestB.id}`)

  // Same-table status
  const sameTableInfo = useMemo(() => {
    if (!guestA || !guestB) return null
    if (!guestA.assignedTableId || !guestB.assignedTableId) return null
    const tableA = tables.find((t) => t.id === guestA.assignedTableId)
    const tableB = tables.find((t) => t.id === guestB.assignedTableId)
    if (!tableA || !tableB) return null
    if (tableA.id === tableB.id) return { same: true as const, tableName: tableA.name }
    return { same: false as const, tableAName: tableA.name, tableBName: tableB.name }
  }, [guestA, guestB, tables])

  // Group confirmed guests by category → tag
  const grouped = useMemo(() => {
    const allCategories = Array.from(new Set(confirmed.map((g) => g.category ?? '其他')))
    const sorted = [
      ...CATEGORY_ORDER.filter((c) => allCategories.includes(c)),
      ...allCategories.filter((c) => !CATEGORY_ORDER.includes(c)),
    ]
    const q = search.trim().toLowerCase()
    return sorted.map((cat) => {
      let catGuests = confirmed.filter((g) => (g.category ?? '其他') === cat)
      if (q) {
        catGuests = catGuests.filter((g) =>
          g.name.toLowerCase().includes(q) ||
          g.aliases.some((a) => a.toLowerCase().includes(q))
        )
      }
      const subcatNames = Array.from(new Set(catGuests.map((g) => g.subcategory?.name).filter(Boolean))) as string[]
      const subGroups = [
        ...subcatNames.map((tagName) => ({
          tagName,
          guests: catGuests.filter((g) => g.subcategory?.name === tagName),
        })),
        { tagName: null as string | null, guests: catGuests.filter((g) => !g.subcategory) },
      ].filter((sg) => sg.guests.length > 0)
      return { category: cat, subGroups }
    }).filter((g) => g.subGroups.some((sg) => sg.guests.length > 0))
  }, [confirmed, search])

  const handleChipClick = (guestId: string) => {
    if (!selectedA) {
      setSelectedA(guestId)
    } else if (selectedA === guestId) {
      setSelectedA(selectedB)
      setSelectedB(null)
    } else if (!selectedB) {
      if (guestId === selectedA) return
      setSelectedB(guestId)
    } else if (selectedB === guestId) {
      setSelectedB(null)
    } else {
      setSelectedB(guestId)
    }
  }

  const handleAdd = async () => {
    if (!guestA || !guestB || guestA.id === guestB.id || isDuplicate) return
    setAdding(true)
    await addAvoidPair(guestA.id, guestB.id, reason || undefined)
    setSelectedA(null)
    setSelectedB(null)
    setReason('')
    setAdding(false)
  }

  const getGuest = (id: string) => guests.find((g) => g.id === id)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full p-5"
        style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
          maxWidth: 800, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>避免同桌管理</h2>
          <button onClick={onClose} className="hover:opacity-70" style={{ color: 'var(--text-muted)', fontSize: 18 }}>✕</button>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-4 flex-1 min-h-0">

          {/* LEFT: Guest selection */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>選擇兩位賓客</h3>
              {(guestA || guestB) && (
                <div className="flex items-center gap-1 text-xs">
                  {guestA && (
                    <span
                      className="px-1.5 py-0.5 font-medium cursor-pointer"
                      style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-sm)', border: '1px solid #FECACA' }}
                      onClick={() => { setSelectedA(selectedB); setSelectedB(null) }}
                    >
                      {guestA.aliases.length > 0 ? guestA.aliases[0] : guestA.name} ✕
                    </span>
                  )}
                  {guestA && guestB && <span style={{ color: 'var(--text-muted)' }}>vs</span>}
                  {guestB && (
                    <span
                      className="px-1.5 py-0.5 font-medium cursor-pointer"
                      style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-sm)', border: '1px solid #FECACA' }}
                      onClick={() => setSelectedB(null)}
                    >
                      {guestB.aliases.length > 0 ? guestB.aliases[0] : guestB.name} ✕
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="搜尋姓名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={20}
              className="w-full text-sm px-2.5 py-1.5 mb-2"
              style={{
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                outline: 'none', background: '#FAFAF9', fontFamily: 'var(--font-body)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#B08D57' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />

            {/* Grouped guest list */}
            <div className="flex-1 overflow-y-auto pr-1">
              {grouped.length === 0 ? (
                <p className="text-sm py-2" style={{ color: 'var(--text-muted)' }}>
                  {search.trim() ? `找不到「${search}」` : '沒有已確認的賓客'}
                </p>
              ) : (
                <div className="space-y-3">
                  {grouped.map(({ category, subGroups }) => {
                    const catColor = getCategoryColor(category, categoryColors)
                    return (
                      <div key={category}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded"
                            style={{ background: catColor.background, color: catColor.color, border: `1px solid ${catColor.border}` }}
                          >
                            {category}
                          </span>
                        </div>
                        <div className="space-y-1.5 pl-2" style={{ borderLeft: `2px solid ${catColor.border}` }}>
                          {subGroups.map(({ tagName, guests: sgGuests }) => (
                            <div key={tagName ?? '__no_tag__'}>
                              {tagName && (
                                <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>{tagName}</div>
                              )}
                              <div className="flex flex-wrap gap-1">
                                {sgGuests.map((g) => (
                                  <SelectableChip
                                    key={g.id}
                                    guest={g}
                                    selected={g.id === selectedA || g.id === selectedB}
                                    onClick={() => handleChipClick(g.id)}
                                    categoryColors={categoryColors}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Status + action bar */}
            <div className="pt-2 mt-2 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
              {sameTableInfo && (
                <div className="text-xs px-2 py-1" style={{
                  borderRadius: 'var(--radius-sm)',
                  background: sameTableInfo.same ? '#FEF2F2' : '#F5F0E6',
                  color: sameTableInfo.same ? '#DC2626' : 'var(--text-secondary)',
                }}>
                  {sameTableInfo.same
                    ? `⚠ ${guestA!.name} 和 ${guestB!.name} 目前都在${sameTableInfo.tableName}！`
                    : `${guestA!.name} 在${sameTableInfo.tableAName}，${guestB!.name} 在${sameTableInfo.tableBName}`
                  }
                </div>
              )}
              {isDuplicate && (
                <div className="text-xs px-2 py-1" style={{
                  borderRadius: 'var(--radius-sm)', background: '#FEF2F2', color: '#DC2626',
                }}>
                  此配對已存在
                </div>
              )}
              <div className="flex items-center gap-2">
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="text-sm px-2 py-1.5 flex-1"
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                >
                  <option value="">原因（選填）</option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  onClick={handleAdd}
                  disabled={!guestA || !guestB || guestA.id === guestB.id || !!isDuplicate || adding}
                  className="px-4 py-1.5 text-white text-sm disabled:opacity-50 hover:opacity-90 shrink-0"
                  style={{ background: 'var(--error)', borderRadius: 'var(--radius-sm)' }}
                >
                  新增
                </button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />

          {/* RIGHT: Existing avoid pairs */}
          <div className="flex flex-col min-h-0" style={{ width: 300, flexShrink: 0 }}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>已設定</h3>
              {avoidPairs.length > 0 && (
                <span className="text-xs font-data" style={{ color: 'var(--text-muted)' }}>{avoidPairs.length} 組</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {avoidPairs.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                  從左側選擇兩位賓客<br />設為避免同桌
                </p>
              ) : (
                avoidPairs.map((ap) => {
                  const a = getGuest(ap.guestAId)
                  const b = getGuest(ap.guestBId)
                  if (!a || !b) return null
                  return (
                    <PairRow
                      key={ap.id}
                      guestA={a}
                      guestB={b}
                      reason={ap.reason}
                      onRemove={() => removeAvoidPair(ap.id)}
                      categoryColors={categoryColors}
                    />
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
