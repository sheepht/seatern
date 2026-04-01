import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown } from 'lucide-react'
import type { Guest, Table, AvoidPair } from '@/lib/types'
import type { CategoryColor } from '@/lib/category-colors'
import { getCategoryColor } from '@/lib/category-colors'

// ─── Props ─────────────────────────────────────────

interface GuestEditModalProps {
  guest: Guest
  tables: Table[]
  guests: Guest[]
  avoidPairs: AvoidPair[]
  categories: string[]
  subcategories: Array<{ id: string; name: string; category: string }>
  categoryColors: Record<string, CategoryColor>
  onSave: (guestId: string, patch: Partial<Guest>) => Promise<boolean | void>
  onMoveToTable: (guestId: string, tableId: string | null) => void
  onUpdatePreferences: (guestId: string, prefs: Array<{ preferredGuestId: string; rank: number }>) => Promise<boolean>
  onSetSubcategory: (guestId: string, subcategoryId: string | null) => Promise<boolean>
  onAddAvoidPair: (guestAId: string, guestBId: string) => Promise<void>
  onRemoveAvoidPair: (pairId: string) => Promise<void>
  onRsvpToggle: (guestId: string) => void
  onDelete: (guestId: string) => void
  onClose: () => void
}

// ─── Helpers ───────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--text-secondary)',
  width: 80, flexShrink: 0, paddingTop: 6,
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '5px 0',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 600,
  color: 'var(--text-muted)', textTransform: 'uppercase' as const,
  letterSpacing: 0.5, padding: '0 0 6px', marginBottom: 4,
  borderBottom: '1px solid var(--border)',
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 2,
  padding: '3px 10px', borderRadius: 'var(--radius-sm, 4px)',
  border: '1px solid var(--border)', fontSize: 14,
  fontFamily: 'var(--font-ui)',
}

const inputStyle: React.CSSProperties = {
  border: 'none', borderBottom: '1px dashed var(--border)',
  background: 'rgba(0,0,0,0.02)', fontSize: 15, fontFamily: 'var(--font-body)',
  color: 'var(--text-primary)', outline: 'none', padding: '4px 6px',
  width: '100%', borderRadius: 2,
}

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  borderBottom: '2px solid var(--accent)',
  background: 'var(--accent-light)',
}

// ─── Small Editable Input ──────────────────────────

function FieldInput({ value, onSave, placeholder, maxLength = 100 }: {
  value: string; onSave: (v: string) => void; placeholder?: string; maxLength?: number
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    setFocused(false)
    const trimmed = draft.trim()
    if (trimmed !== value) onSave(trimmed)
    else setDraft(value)
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setFocused(false); inputRef.current?.blur() } }}
      placeholder={placeholder}
      style={focused ? inputFocusStyle : inputStyle}
    />
  )
}

// ─── Guest Search Dropdown ─────────────────────────

const CATEGORY_ORDER = ['男方', '女方', '共同']


// ─── Add Picker Button (+新增 → floating chip picker) ──

function AddPickerButton({ guests, excludeIds, onSelect, categoryColors, placeholder }: {
  guests: Guest[]; excludeIds: Set<string>; onSelect: (guestId: string) => void
  categoryColors: Record<string, CategoryColor>; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  const confirmed = useMemo(() => guests.filter((g) => g.rsvpStatus === 'confirmed' && !excludeIds.has(g.id)), [guests, excludeIds])

  const grouped = useMemo(() => {
    const allCats = Array.from(new Set(confirmed.map((g) => g.category ?? '其他')))
    const sorted = [...CATEGORY_ORDER.filter((c) => allCats.includes(c)), ...allCats.filter((c) => !CATEGORY_ORDER.includes(c))]
    const q = search.trim().toLowerCase()
    return sorted.map((cat) => {
      let catGuests = confirmed.filter((g) => (g.category ?? '其他') === cat)
      if (q) catGuests = catGuests.filter((g) => g.name.toLowerCase().includes(q) || g.aliases.some((a) => a.toLowerCase().includes(q)))
      const subcatNames = Array.from(new Set(catGuests.map((g) => g.subcategory?.name).filter(Boolean))) as string[]
      const subGroups = [
        ...subcatNames.map((sn) => ({ tagName: sn, guests: catGuests.filter((g) => g.subcategory?.name === sn) })),
        { tagName: null as string | null, guests: catGuests.filter((g) => !g.subcategory) },
      ].filter((sg) => sg.guests.length > 0)
      return { category: cat, subGroups }
    }).filter((g) => g.subGroups.some((sg) => sg.guests.length > 0))
  }, [confirmed, search])

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 4 })
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: '2px 8px', borderRadius: 'var(--radius-sm, 4px)',
          border: '1px dashed var(--border)', background: 'none',
          fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--accent)',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        + 新增
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed', left: pos.left, top: pos.top, width: 320, zIndex: 10000,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-md, 8px)',
            padding: 8, background: 'var(--bg-surface)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
          }}
        >
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder || '搜尋賓客...'}
            style={{
              width: '100%', padding: '4px 8px', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm, 4px)', fontSize: 14, fontFamily: 'var(--font-ui)',
              outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)',
              boxSizing: 'border-box', marginBottom: 6,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {grouped.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 4 }}>
                {search.trim() ? `找不到「${search}」` : '沒有可選的賓客'}
              </div>
            ) : (
              grouped.map(({ category, subGroups }) => {
                const catColor = getCategoryColor(category, categoryColors)
                return (
                  <div key={category} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                        background: catColor.background, color: catColor.color, border: `1px solid ${catColor.border}`,
                      }}>{category}</span>
                    </div>
                    {subGroups.map(({ tagName, guests: sgGuests }) => (
                      <div key={tagName ?? '__no_tag__'} style={{ paddingLeft: 8, borderLeft: `2px solid ${catColor.border}`, marginBottom: 4 }}>
                        {tagName && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{tagName}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {sgGuests.map((g) => (
                            <button
                              key={g.id}
                              onClick={() => { onSelect(g.id) }}
                              style={{
                                padding: '2px 8px', fontSize: 13, fontFamily: 'var(--font-body)',
                                borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                                border: `1px solid ${catColor.border}`, background: catColor.background,
                                color: catColor.color, whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = catColor.background; e.currentTarget.style.borderColor = catColor.border }}
                            >
                              {g.aliases.length > 0 ? g.aliases[0] : g.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Main Modal ────────────────────────────────────

export default function GuestEditModal({
  guest, tables, guests, avoidPairs, categories, subcategories, categoryColors,
  onSave, onMoveToTable, onUpdatePreferences, onSetSubcategory,
  onAddAvoidPair, onRemoveAvoidPair, onRsvpToggle, onDelete, onClose,
}: GuestEditModalProps) {

  const guestNameMap = new Map(guests.map((g) => [g.id, g.name]))

  // Avoid pairs for this guest
  const guestAvoidPairs = avoidPairs
    .filter((ap) => ap.guestAId === guest.id || ap.guestBId === guest.id)
    .map((ap) => {
      const otherId = ap.guestAId === guest.id ? ap.guestBId : ap.guestAId
      return { pairId: ap.id, otherGuestId: otherId, otherName: guestNameMap.get(otherId) || '?' }
    })

  // Preference data sorted by rank
  const sortedPrefs = guest.seatPreferences.slice().sort((a, b) => a.rank - b.rank)

  // Table info
  const tableInfo = tables.map((t) => {
    const used = guests.filter((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed').reduce((s, g) => s + g.seatCount, 0)
    return { ...t, used, remaining: t.capacity - used }
  })

  const currentTable = guest.assignedTableId ? tables.find((t) => t.id === guest.assignedTableId) : null

  // Max companion count based on table capacity
  let maxCompanion = 9
  let maxCompanionHint = ''
  if (guest.assignedTableId) {
    const ti = tableInfo.find((t) => t.id === guest.assignedTableId)
    if (ti) {
      const othersSeats = ti.used - guest.seatCount
      maxCompanion = Math.min(9, ti.capacity - othersSeats - 1)
      if (maxCompanion <= guest.companionCount) {
        maxCompanionHint = `${ti.name}已滿 (${ti.used}/${ti.capacity})`
      }
    }
  }

  // Category color
  const catColor = getCategoryColor(guest.category, categoryColors)

  // Exclude sets
  const prefExcludeIds = new Set([guest.id, ...sortedPrefs.map((p) => p.preferredGuestId)])
  const avoidExcludeIds = new Set([guest.id, ...guestAvoidPairs.map((ap) => ap.otherGuestId)])



  // Preference handlers
  const handleAddPref = async (guestId: string) => {
    if (sortedPrefs.length >= 3) return
    const newPrefs = [...sortedPrefs, { preferredGuestId: guestId, rank: sortedPrefs.length + 1 }]
    await onUpdatePreferences(guest.id, newPrefs)
  }

  const handleRemovePref = async (guestId: string) => {
    const newPrefs = sortedPrefs
      .filter((p) => p.preferredGuestId !== guestId)
      .map((p, i) => ({ ...p, rank: i + 1 }))
    await onUpdatePreferences(guest.id, newPrefs)
  }

  // Table dropdown state
  const [tableOpen, setTableOpen] = useState(false)
  const tableAnchorRef = useRef<HTMLSpanElement>(null)

  // Category dropdown state
  const [catOpen, setCatOpen] = useState(false)
  const catAnchorRef = useRef<HTMLSpanElement>(null)

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 12px)',
          padding: 24, maxWidth: 820, width: '90%', maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {guest.name}的詳細資訊
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form — two columns */}
        <div style={{ display: 'flex', gap: 24 }}>

        {/* Left column: basic info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          <div style={sectionTitleStyle}>基本資料</div>

          {/* 1. 姓名 + 暱稱 */}
          <div style={rowStyle}>
            <span style={labelStyle}>姓名</span>
            <div style={{ flex: 1 }}>
              <FieldInput value={guest.name} onSave={(v) => { if (v) onSave(guest.id, { name: v }) }} maxLength={50} />
            </div>
            <span style={{ ...labelStyle, width: 'auto', paddingLeft: 8 }}>暱稱</span>
            <div style={{ flex: 1 }}>
              <FieldInput
                value={guest.aliases[0] || ''}
                onSave={(v) => onSave(guest.id, { aliases: v ? [v] : [] })}
                placeholder="暱稱..."
                maxLength={20}
              />
            </div>
          </div>

          {/* 3. 分類 */}
          <div style={rowStyle}>
            <span style={labelStyle}>分類</span>
            <div style={{ flex: 1, paddingTop: 4, position: 'relative' }}>
              {categories.length > 0 ? (
                <>
                  <span
                    ref={catAnchorRef}
                    onClick={() => setCatOpen(!catOpen)}
                    style={{
                      background: catColor.background, border: `1px solid ${catColor.border}`, color: catColor.color,
                      padding: '2px 10px', borderRadius: 'var(--radius-sm, 4px)', fontSize: 14,
                      fontFamily: 'var(--font-ui)', fontWeight: 500, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                    }}
                  >
                    {guest.category || '未分類'}
                    <ChevronDown size={10} />
                  </span>
                  {catOpen && <FixedDropdown anchorRef={catAnchorRef} onClose={() => setCatOpen(false)}>
                    {categories.map((cat) => (
                      <div
                        key={cat}
                        onClick={() => { onSave(guest.id, { category: cat }); setCatOpen(false) }}
                        style={{
                          padding: '4px 8px', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                          fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-primary)',
                          background: cat === guest.category ? 'var(--accent-light)' : 'transparent',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = cat === guest.category ? 'var(--accent-light)' : 'transparent' }}
                      >
                        {cat}
                      </div>
                    ))}
                  </FixedDropdown>}
                </>
              ) : (
                <span style={{ fontSize: 15, color: 'var(--text-muted)' }}>{guest.category || '—'}</span>
              )}
            </div>
          </div>

          {/* 4. 子分類 */}
          <div style={rowStyle}>
            <span style={labelStyle}>子分類</span>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <select
                value={guest.subcategory?.id ?? ''}
                onChange={(e) => onSetSubcategory(guest.id, e.target.value || null)}
                style={{
                  ...inputStyle,
                  width: 'auto', minWidth: 120,
                  cursor: 'pointer',
                }}
              >
                {subcategories
                  .filter((sc) => !guest.category || sc.category === guest.category)
                  .map((sc) => (
                    <option key={sc.id} value={sc.id}>{sc.name}</option>
                  ))}
              </select>
            </div>
          </div>

          <div style={{ ...sectionTitleStyle, marginTop: 12 }}>出席狀態</div>

          {/* 6. 出席 */}
          <div style={rowStyle}>
            <span style={labelStyle}>出席</span>
            <div style={{ flex: 1, display: 'flex', gap: 8, paddingTop: 4 }}>
              <button
                onClick={() => { if (guest.rsvpStatus !== 'confirmed') onRsvpToggle(guest.id) }}
                style={{
                  padding: '4px 14px', borderRadius: 'var(--radius-sm, 4px)',
                  border: guest.rsvpStatus === 'confirmed' ? '2px solid var(--success)' : '1px solid var(--border)',
                  background: guest.rsvpStatus === 'confirmed' ? 'rgba(34,197,94,0.08)' : 'var(--bg-surface)',
                  color: guest.rsvpStatus === 'confirmed' ? 'var(--success)' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 15, fontFamily: 'var(--font-ui)', fontWeight: 600,
                }}
              >
                ✓ 確認
              </button>
              <button
                onClick={() => { if (guest.rsvpStatus !== 'declined') onRsvpToggle(guest.id) }}
                style={{
                  padding: '4px 14px', borderRadius: 'var(--radius-sm, 4px)',
                  border: guest.rsvpStatus === 'declined' ? '2px solid var(--error)' : '1px solid var(--border)',
                  background: guest.rsvpStatus === 'declined' ? 'rgba(239,68,68,0.08)' : 'var(--bg-surface)',
                  color: guest.rsvpStatus === 'declined' ? 'var(--error)' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 15, fontFamily: 'var(--font-ui)', fontWeight: 600,
                }}
              >
                ✗ 婉拒
              </button>
            </div>
          </div>

        </div>

        {/* Right column: seating & notes */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          <div style={sectionTitleStyle}>排位</div>

          {/* 5. 桌次 + 7. 攜眷 */}
          <div style={rowStyle}>
            <span style={labelStyle}>桌次</span>
            <div style={{ flex: 1, paddingTop: 4, position: 'relative' }}>
              <span
                ref={tableAnchorRef}
                onClick={() => setTableOpen(!tableOpen)}
                style={{
                  color: guest.assignedTableId ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2,
                }}
              >
                {currentTable ? currentTable.name : '未排座'}
                <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />
              </span>
              {tableOpen && <FixedDropdown anchorRef={tableAnchorRef} onClose={() => setTableOpen(false)} style={{ minWidth: 180, maxHeight: 240, overflow: 'auto' }}>
                <div
                  onClick={() => { onMoveToTable(guest.id, null); setTableOpen(false) }}
                  style={{
                    padding: '4px 8px', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                    fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)',
                    background: !guest.assignedTableId ? 'var(--accent-light)' : 'transparent',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = !guest.assignedTableId ? 'var(--accent-light)' : 'transparent' }}
                >
                  未排座
                </div>
                {tableInfo.map((t) => {
                  const isCurrent = t.id === guest.assignedTableId
                  const full = isCurrent ? false : t.remaining < guest.seatCount
                  return (
                    <div
                      key={t.id}
                      onClick={() => { if (!full || isCurrent) { onMoveToTable(guest.id, t.id); setTableOpen(false) } }}
                      style={{
                        padding: '4px 8px', borderRadius: 'var(--radius-sm, 4px)',
                        cursor: full && !isCurrent ? 'default' : 'pointer',
                        fontSize: 14, fontFamily: 'var(--font-ui)',
                        color: full && !isCurrent ? 'var(--text-muted)' : 'var(--text-primary)',
                        opacity: full && !isCurrent ? 0.5 : 1,
                        background: isCurrent ? 'var(--accent-light)' : 'transparent',
                        display: 'flex', justifyContent: 'space-between', gap: 8,
                      }}
                      onMouseEnter={(e) => { if (!full || isCurrent) (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isCurrent ? 'var(--accent-light)' : 'transparent' }}
                    >
                      <span>{t.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>({t.used}/{t.capacity})</span>
                    </div>
                  )
                })}
              </FixedDropdown>}
            </div>
            <span style={{ ...labelStyle, width: 'auto', paddingLeft: 8 }}>攜眷</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 4 }}>
              <button
                onClick={() => guest.companionCount > 0 && onSave(guest.id, { companionCount: guest.companionCount - 1 })}
                disabled={guest.companionCount <= 0}
                style={{
                  width: 28, height: 28, borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
                  background: guest.companionCount <= 0 ? 'transparent' : 'var(--bg-surface)', cursor: guest.companionCount <= 0 ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  color: guest.companionCount <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                }}
              >−</button>
              <span style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'center', fontSize: 15 }}>{guest.companionCount}</span>
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <button
                  onClick={() => guest.companionCount < maxCompanion && onSave(guest.id, { companionCount: guest.companionCount + 1 })}
                  disabled={guest.companionCount >= maxCompanion}
                  style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
                    background: guest.companionCount >= maxCompanion ? 'transparent' : 'var(--bg-surface)', cursor: guest.companionCount >= maxCompanion ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    color: guest.companionCount >= maxCompanion ? 'var(--text-muted)' : 'var(--text-secondary)',
                  }}
                >+</button>
                {maxCompanionHint && (
                  <div style={{
                    position: 'absolute', bottom: '100%', right: 0,
                    marginBottom: 6, padding: '4px 10px', borderRadius: 'var(--radius-sm, 4px)',
                    background: 'var(--text-primary)', color: 'var(--bg-surface)',
                    fontSize: 12, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', pointerEvents: 'none',
                  }}>
                    {maxCompanionHint}
                  </div>
                )}
              </span>
            </div>
          </div>

          {/* 8. 想同桌 */}
          <div style={rowStyle}>
            <span style={labelStyle}>想同桌</span>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {sortedPrefs.map((p) => {
                  const g = guests.find((x) => x.id === p.preferredGuestId)
                  const display = g ? (g.aliases.length > 0 ? g.aliases[0] : g.name) : '?'
                  const cc = g ? getCategoryColor(g.category, categoryColors) : null
                  return (
                    <span key={p.preferredGuestId} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                      padding: '2px 8px', borderRadius: 'var(--radius-sm, 4px)',
                      background: cc?.background || 'var(--accent-light)',
                      border: `1px solid ${cc?.border || 'var(--border)'}`,
                      fontSize: 14, fontFamily: 'var(--font-ui)', color: cc?.color || 'var(--text-primary)',
                    }}>
                      {display}
                      <button onClick={() => handleRemovePref(p.preferredGuestId)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: cc?.color || 'var(--text-muted)', fontSize: 10, lineHeight: 1, opacity: 0.6 }}>
                        <X size={14} />
                      </button>
                    </span>
                  )
                })}
                {sortedPrefs.length < 3 && (
                  <AddPickerButton
                    guests={guests} excludeIds={prefExcludeIds} onSelect={handleAddPref}
                    categoryColors={categoryColors} placeholder="搜尋賓客（最多 3 位）..."
                  />
                )}
              </div>
            </div>
          </div>

          {/* 9. 要避桌 */}
          <div style={rowStyle}>
            <span style={labelStyle}>要避桌</span>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {guestAvoidPairs.map((ap) => {
                  const g = guests.find((x) => x.id === ap.otherGuestId)
                  const display = g ? (g.aliases.length > 0 ? g.aliases[0] : g.name) : ap.otherName
                  const cc = g ? getCategoryColor(g.category, categoryColors) : null
                  return (
                    <span key={ap.pairId} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                      padding: '2px 8px', borderRadius: 'var(--radius-sm, 4px)',
                      background: cc?.background || 'rgba(239,68,68,0.08)',
                      border: `1px solid ${cc?.border || 'var(--error)'}`,
                      fontSize: 14, fontFamily: 'var(--font-ui)', color: cc?.color || 'var(--error)',
                    }}>
                      {display}
                      <button onClick={() => onRemoveAvoidPair(ap.pairId)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: cc?.color || 'var(--error)', fontSize: 10, lineHeight: 1, opacity: 0.6 }}>
                        <X size={14} />
                      </button>
                    </span>
                  )
                })}
                <AddPickerButton
                  guests={guests} excludeIds={avoidExcludeIds} onSelect={(gid) => onAddAvoidPair(guest.id, gid)}
                  categoryColors={categoryColors} placeholder="搜尋要避桌的賓客..."
                />
              </div>
            </div>
          </div>

          <div style={{ ...sectionTitleStyle, marginTop: 12 }}>備註</div>

          {/* 10. 飲食 */}
          <div style={rowStyle}>
            <span style={labelStyle}>飲食</span>
            <div style={{ flex: 1 }}>
              <FieldInput value={guest.dietaryNote || ''} onSave={(v) => onSave(guest.id, { dietaryNote: v })} placeholder="素食、過敏等..." />
            </div>
          </div>

          {/* 11. 特殊需求 */}
          <div style={rowStyle}>
            <span style={labelStyle}>特殊需求</span>
            <div style={{ flex: 1 }}>
              <FieldInput value={guest.specialNote || ''} onSave={(v) => onSave(guest.id, { specialNote: v })} placeholder="輪椅、兒童椅等..." />
            </div>
          </div>
        </div>

        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => onDelete(guest.id)}
            style={{
              padding: '6px 16px', borderRadius: 'var(--radius-sm, 4px)',
              border: '1px solid var(--error)', background: 'none',
              color: 'var(--error)', cursor: 'pointer', fontSize: 15,
              fontFamily: 'var(--font-ui)', fontWeight: 500,
            }}
          >
            刪除賓客
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 20px', borderRadius: 'var(--radius-sm, 4px)',
              border: 'none', background: 'var(--accent)',
              color: '#fff', cursor: 'pointer', fontSize: 15,
              fontFamily: 'var(--font-ui)', fontWeight: 500,
            }}
          >
            關閉
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── Fixed Dropdown (portal) ───────────────────────

function FixedDropdown({ anchorRef, children, onClose, style: extraStyle }: {
  anchorRef: React.RefObject<HTMLElement | null>; children: React.ReactNode; onClose: () => void; style?: React.CSSProperties
}) {
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 4 })
    }
  }, [anchorRef])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  return createPortal(
    <div ref={popRef} style={{
      position: 'fixed', left: pos.left, top: pos.top, zIndex: 10000,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md, 8px)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      padding: 4, minWidth: 120, ...extraStyle,
    }}>
      {children}
    </div>,
    document.body,
  )
}
