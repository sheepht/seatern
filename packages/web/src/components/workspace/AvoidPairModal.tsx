import { useState, useMemo, useRef, useEffect } from 'react'
import { useSeatingStore, type Guest } from '@/stores/seating'
import { getCategoryColor, loadCategoryColors, type CategoryColor } from '@/lib/category-colors'

interface Props {
  onClose: () => void
}

const CATEGORY_ORDER = ['男方', '女方', '共同']

// --- Inline guest search picker ---

function GuestPicker({ guests, excludeIds, value, onChange, categoryColors, placeholder }: {
  guests: Guest[]; excludeIds: Set<string>; value: string | null
  onChange: (guestId: string | null) => void; categoryColors: Record<string, CategoryColor>
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const confirmed = useMemo(() =>
    guests.filter((g) => g.rsvpStatus === 'confirmed' && !excludeIds.has(g.id)),
    [guests, excludeIds],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return confirmed
    return confirmed.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      g.aliases.some((a) => a.toLowerCase().includes(q)),
    )
  }, [confirmed, search])

  const grouped = useMemo(() => {
    const allCats = Array.from(new Set(filtered.map((g) => g.category ?? '其他')))
    const sorted = [...CATEGORY_ORDER.filter((c) => allCats.includes(c)), ...allCats.filter((c) => !CATEGORY_ORDER.includes(c))]
    return sorted.map((cat) => {
      const catGuests = filtered.filter((g) => (g.category ?? '其他') === cat)
      const subcatNames = Array.from(new Set(catGuests.map((g) => g.subcategory?.name).filter(Boolean))) as string[]
      const subGroups = [
        ...subcatNames.map((sn) => ({ tagName: sn, guests: catGuests.filter((g) => g.subcategory?.name === sn) })),
        { tagName: null as string | null, guests: catGuests.filter((g) => !g.subcategory) },
      ].filter((sg) => sg.guests.length > 0)
      return { category: cat, subGroups }
    }).filter((g) => g.subGroups.some((sg) => sg.guests.length > 0))
  }, [filtered])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedGuest = value ? guests.find((g) => g.id === value) : null

  if (selectedGuest) {
    const cc = getCategoryColor(selectedGuest.category, categoryColors)
    const display = selectedGuest.aliases.length > 0 ? selectedGuest.aliases[0] : selectedGuest.name
    return (
      <span
        onClick={() => onChange(null)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 'var(--radius-sm, 4px)',
          background: cc.background, border: `1px solid ${cc.border}`,
          fontSize: 13, fontFamily: 'var(--font-ui)', color: cc.color,
          cursor: 'pointer', fontWeight: 500,
        }}
      >
        {display}
        <span style={{ fontSize: 10, opacity: 0.6 }}>✕</span>
      </span>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        value={search}
        onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '5px 10px', fontSize: 13, fontFamily: 'var(--font-ui)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm, 4px)',
          outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; setOpen(true) }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
      />
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute', left: 0, top: '100%', marginTop: 4,
            width: '100%', maxHeight: 200, overflowY: 'auto', zIndex: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm, 4px)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: 4,
          }}
        >
          {grouped.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 6 }}>
              {search.trim() ? `找不到「${search}」` : '沒有可選的賓客'}
            </div>
          ) : (
            grouped.map(({ category, subGroups }) => {
              const cc = getCategoryColor(category, categoryColors)
              return (
                <div key={category} style={{ marginBottom: 6 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 6px', marginBottom: 2,
                    color: cc.color, opacity: 0.7,
                  }}>{category}</div>
                  <div style={{ paddingLeft: 6, borderLeft: `2px solid ${cc.border}` }}>
                    {subGroups.map(({ tagName, guests: sgGuests }) => (
                      <div key={tagName ?? '__no_subcat__'} style={{ marginBottom: 4 }}>
                        {tagName && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{tagName}</div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {sgGuests.map((g) => (
                            <button
                              key={g.id}
                              onMouseDown={(e) => { e.preventDefault(); onChange(g.id); setOpen(false); setSearch('') }}
                              style={{
                                padding: '2px 8px', fontSize: 12, fontFamily: 'var(--font-body)',
                                borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                                border: `1px solid ${cc.border}`, background: cc.background,
                                color: cc.color, whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = cc.background; e.currentTarget.style.borderColor = cc.border }}
                            >
                              {g.aliases.length > 0 ? g.aliases[0] : g.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
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

  const [selectedA, setSelectedA] = useState<string | null>(null)
  const [selectedB, setSelectedB] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const getGuest = (id: string) => guests.find((g) => g.id === id)

  // Duplicate check
  const existingPairSet = useMemo(() => {
    const s = new Set<string>()
    for (const ap of avoidPairs) {
      s.add(`${ap.guestAId}-${ap.guestBId}`)
      s.add(`${ap.guestBId}-${ap.guestAId}`)
    }
    return s
  }, [avoidPairs])
  const isDuplicate = selectedA && selectedB && existingPairSet.has(`${selectedA}-${selectedB}`)

  // Exclude already-selected from the other picker
  const excludeA = useMemo(() => {
    const s = new Set<string>()
    if (selectedB) s.add(selectedB)
    return s
  }, [selectedB])
  const excludeB = useMemo(() => {
    const s = new Set<string>()
    if (selectedA) s.add(selectedA)
    return s
  }, [selectedA])

  // Check same-table violations
  const getSameTableName = (aId: string, bId: string): string | null => {
    const a = getGuest(aId)
    const b = getGuest(bId)
    if (!a?.assignedTableId || !b?.assignedTableId) return null
    if (a.assignedTableId !== b.assignedTableId) return null
    return tables.find((t) => t.id === a.assignedTableId)?.name || null
  }

  const violationCount = avoidPairs.filter((ap) => getSameTableName(ap.guestAId, ap.guestBId) !== null).length

  const handleAdd = async () => {
    if (!selectedA || !selectedB || selectedA === selectedB || isDuplicate) return
    setAdding(true)
    await addAvoidPair(selectedA, selectedB)
    setSelectedA(null)
    setSelectedB(null)
    setAdding(false)
  }

  const canAdd = selectedA && selectedB && selectedA !== selectedB && !isDuplicate && !adding

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full p-5"
        style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
          maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>避免同桌管理</h2>
            {avoidPairs.length > 0 && (
              <span className="text-xs font-data" style={{ color: 'var(--text-muted)' }}>{avoidPairs.length} 組</span>
            )}
          </div>
          <button onClick={onClose} className="hover:opacity-70" style={{ color: 'var(--text-muted)', fontSize: 18 }}>✕</button>
        </div>

        {/* Add new pair */}
        <div className="mb-3 p-3" style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GuestPicker
              guests={guests} excludeIds={excludeA} value={selectedA}
              onChange={setSelectedA} categoryColors={categoryColors} placeholder="賓客 A..."
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>vs</span>
            <GuestPicker
              guests={guests} excludeIds={excludeB} value={selectedB}
              onChange={setSelectedB} categoryColors={categoryColors} placeholder="賓客 B..."
            />
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              style={{
                padding: '5px 16px', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500,
                border: 'none', borderRadius: 'var(--radius-sm, 4px)', flexShrink: 0,
                background: canAdd ? 'var(--error)' : 'var(--border)',
                color: canAdd ? '#fff' : 'var(--text-muted)', cursor: canAdd ? 'pointer' : 'default',
              }}
            >
              新增
            </button>
          </div>
          {isDuplicate && (
            <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>此配對已存在</div>
          )}
        </div>

        {/* Violation warning */}
        {violationCount > 0 && (
          <div className="mb-3 px-3 py-2 text-xs" style={{
            borderRadius: 'var(--radius-sm)', background: '#FEF2F2', color: '#DC2626', fontWeight: 500,
          }}>
            ⚠ {violationCount} 組避桌關係的賓客目前被排在同一桌
          </div>
        )}

        {/* Inline pair chips */}
        <div className="flex-1 overflow-y-auto">
          {avoidPairs.length === 0 ? (
            <div className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>
              尚未設定避桌關係
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {avoidPairs.map((ap) => {
                const a = getGuest(ap.guestAId)
                const b = getGuest(ap.guestBId)
                if (!a || !b) return null
                const nameA = a.aliases.length > 0 ? a.aliases[0] : a.name
                const nameB = b.aliases.length > 0 ? b.aliases[0] : b.name
                const ccA = getCategoryColor(a.category, categoryColors)
                const ccB = getCategoryColor(b.category, categoryColors)
                const tagA = a.subcategory?.name ?? (a.category ?? '共同')
                const tagB = b.subcategory?.name ?? (b.category ?? '共同')
                const sameTable = getSameTableName(ap.guestAId, ap.guestBId)
                return (
                  <span
                    key={ap.id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 'var(--radius-sm, 4px)',
                      background: sameTable ? '#FEF2F2' : 'var(--bg-primary)',
                      border: `1px solid ${sameTable ? '#FECACA' : 'var(--border)'}`,
                      fontSize: 15, fontFamily: 'var(--font-ui)',
                    }}
                    title={sameTable ? `⚠ 同在${sameTable}` : undefined}
                  >
                    {/* [tag]名字 */}
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                      background: ccA.background, color: ccA.color, border: `1px solid ${ccA.border}`,
                    }}>{tagA}</span>
                    <span style={{ fontWeight: 500, color: sameTable ? '#DC2626' : 'var(--text-primary)' }}>{nameA}</span>

                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>vs</span>

                    {/* 名字[tag] */}
                    <span style={{ fontWeight: 500, color: sameTable ? '#DC2626' : 'var(--text-primary)' }}>{nameB}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                      background: ccB.background, color: ccB.color, border: `1px solid ${ccB.border}`,
                    }}>{tagB}</span>

                    {sameTable && <span style={{ fontSize: 12, color: '#DC2626' }}>⚠</span>}
                    <button
                      onClick={() => removeAvoidPair(ap.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        color: sameTable ? '#DC2626' : 'var(--text-muted)', fontSize: 10, lineHeight: 1, opacity: 0.6,
                        marginLeft: 1,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
                    >
                      ✕
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
