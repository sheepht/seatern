import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown } from 'lucide-react'
import type { Guest, Table, AvoidPair } from '@/lib/types'
import type { CategoryColor } from '@/lib/category-colors'
import { getCategoryColor } from '@/lib/category-colors'

// ─── Types ────────────────────────────────────────

export interface GuestFormData {
  name: string
  aliases: string[]
  category: string
  subcategoryName?: string
  rsvpStatus: 'confirmed' | 'declined'
  companionCount: number
  assignedTableId: string | null
  dietaryNote: string
  specialNote: string
  preferredGuestIds: string[]
  avoidGuestIds: string[]
}

interface GuestFormModalProps {
  mode: 'add' | 'edit'
  guest?: Guest
  categories: string[]
  subcategories: Array<{ id: string; name: string; category: string }>
  tables: Table[]
  guests: Guest[]
  avoidPairs: AvoidPair[]
  categoryColors: Record<string, CategoryColor>
  onSubmit: (data: GuestFormData) => Promise<void>
  onDelete?: (guestId: string) => void
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

function FieldInput({ value, onChange, placeholder, maxLength = 100 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    setFocused(false)
    onChange(draft.trim())
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

export const CATEGORY_ORDER = ['男方', '女方', '共同']

// ─── Add Picker Button (+新增 → floating chip picker) ──

export function AddPickerButton({ guests, excludeIds, onSelect, categoryColors, placeholder }: {
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

// ─── Fixed Dropdown (portal) ───────────────────────

export function FixedDropdown({ anchorRef, children, onClose, style: extraStyle }: {
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

// ─── Main Modal ────────────────────────────────────

export default function GuestFormModal({
  mode, guest, categories, subcategories, tables, guests, avoidPairs, categoryColors,
  onSubmit, onDelete, onClose,
}: GuestFormModalProps) {

  // ─── Internal draft state ──────────────────────────
  const [name, setName] = useState(mode === 'edit' && guest ? guest.name : '')
  const [alias, setAlias] = useState(mode === 'edit' && guest ? (guest.aliases[0] || '') : '')
  const [category, setCategory] = useState(mode === 'edit' && guest ? (guest.category || categories[0] || '男方') : (categories[0] || '男方'))
  const [subcatName, setSubcatName] = useState(mode === 'edit' && guest ? (guest.subcategory?.name || '') : '')
  const [newSubcat, setNewSubcat] = useState('')
  const [rsvp, setRsvp] = useState<'confirmed' | 'declined'>(mode === 'edit' && guest ? guest.rsvpStatus : 'confirmed')
  const [companion, setCompanion] = useState(mode === 'edit' && guest ? guest.companionCount : 0)
  const [tableId, setTableId] = useState<string | null>(mode === 'edit' && guest ? (guest.assignedTableId || null) : null)
  const [prefIds, setPrefIds] = useState<string[]>(
    mode === 'edit' && guest
      ? guest.seatPreferences.slice().sort((a, b) => a.rank - b.rank).map((p) => p.preferredGuestId)
      : []
  )
  const [avoidIds, setAvoidIds] = useState<string[]>(
    mode === 'edit' && guest
      ? avoidPairs
          .filter((ap) => ap.guestAId === guest.id || ap.guestBId === guest.id)
          .map((ap) => ap.guestAId === guest.id ? ap.guestBId : ap.guestAId)
      : []
  )
  const [dietary, setDietary] = useState(mode === 'edit' && guest ? (guest.dietaryNote || '') : '')
  const [special, setSpecial] = useState(mode === 'edit' && guest ? (guest.specialNote || '') : '')
  const [tableOpen, setTableOpen] = useState(false)
  const [subcatOpen, setSubcatOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const tableAnchorRef = useRef<HTMLSpanElement>(null)
  const subcatAnchorRef = useRef<HTMLSpanElement>(null)
  const newSubcatInputRef = useRef<HTMLInputElement>(null)

  // Reset subcatName when category changes
  const prevCatRef = useRef(category)
  useEffect(() => {
    if (prevCatRef.current !== category) {
      setSubcatName('')
      setNewSubcat('')
      prevCatRef.current = category
    }
  }, [category])

  // Focus new subcat input when entering new-subcat mode
  useEffect(() => {
    if (subcatName === '__new__') {
      setTimeout(() => newSubcatInputRef.current?.focus(), 50)
    }
  }, [subcatName])

  // ─── Table info ─────────────────────────────────────
  const seatCount = companion + 1
  const tableInfo = tables.map((t) => {
    const used = guests.filter((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed').reduce((s, g) => s + g.seatCount, 0)
    return { ...t, used, remaining: t.capacity - used }
  })
  const currentTable = tableId ? tables.find((t) => t.id === tableId) : null

  // ─── Exclude sets ───────────────────────────────────
  const selfId = mode === 'edit' && guest ? guest.id : undefined
  const prefExcludeIds = useMemo(() => {
    const ids = new Set(prefIds)
    if (selfId) ids.add(selfId)
    return ids
  }, [prefIds, selfId])
  const avoidExcludeIds = useMemo(() => {
    const ids = new Set(avoidIds)
    if (selfId) ids.add(selfId)
    return ids
  }, [avoidIds, selfId])

  // ─── Filtered subcategories ─────────────────────────
  const filteredSubcats = subcategories.filter((sc) => sc.category === category)

  // ─── Submit handler ─────────────────────────────────
  const handleSubmit = async () => {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        aliases: alias.trim() ? [alias.trim()] : [],
        category,
        subcategoryName: (newSubcat.trim() || (subcatName && subcatName !== '__new__' ? subcatName : undefined)) || undefined,
        rsvpStatus: rsvp,
        companionCount: companion,
        assignedTableId: tableId,
        dietaryNote: dietary.trim(),
        specialNote: special.trim(),
        preferredGuestIds: prefIds,
        avoidGuestIds: avoidIds,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render ─────────────────────────────────────────
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
            {mode === 'add' ? '新增賓客' : `${guest!.name}的詳細資訊`}
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
              <span style={labelStyle}>
                姓名{mode === 'add' && <span style={{ color: 'var(--error)' }}> *</span>}
              </span>
              <div style={{ flex: 1 }}>
                <FieldInput value={name} onChange={setName} maxLength={50} />
              </div>
              <span style={{ ...labelStyle, width: 'auto', paddingLeft: 8 }}>暱稱</span>
              <div style={{ flex: 1 }}>
                <FieldInput
                  value={alias}
                  onChange={setAlias}
                  placeholder="暱稱..."
                  maxLength={20}
                />
              </div>
            </div>

            {/* 2. 分類 */}
            <div style={rowStyle}>
              <span style={labelStyle}>分類</span>
              <div style={{ flex: 1, display: 'flex', gap: 6, paddingTop: 2 }}>
                {categories.map((cat) => {
                  const cc = getCategoryColor(cat, categoryColors)
                  const selected = category === cat
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      style={{
                        padding: '3px 12px', borderRadius: 'var(--radius-sm, 4px)', fontSize: 14,
                        fontFamily: 'var(--font-ui)', fontWeight: 500, cursor: 'pointer',
                        border: selected ? `2px solid ${cc.color}` : `1px solid ${cc.border}`,
                        background: selected ? cc.background : 'var(--bg-surface)',
                        color: selected ? cc.color : 'var(--text-secondary)',
                      }}
                    >{cat}</button>
                  )
                })}
              </div>
            </div>

            {/* 3. 子分類 */}
            <div style={rowStyle}>
              <span style={labelStyle}>子分類</span>
              <div style={{ flex: 1, paddingTop: 4, position: 'relative' }}>
                <span
                  ref={subcatAnchorRef}
                  onClick={() => setSubcatOpen(!subcatOpen)}
                  style={{
                    color: subcatName && subcatName !== '__new__' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2,
                  }}
                >
                  {subcatName && subcatName !== '__new__' ? subcatName : '未指定'}
                  <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />
                </span>
                {subcatOpen && (
                  <FixedDropdown anchorRef={subcatAnchorRef} onClose={() => setSubcatOpen(false)} style={{ minWidth: 180, maxHeight: 240, overflow: 'auto' }}>
                    <div
                      onClick={() => { setSubcatName(''); setNewSubcat(''); setSubcatOpen(false) }}
                      style={{
                        padding: '4px 8px', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                        fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)',
                        background: !subcatName ? 'var(--accent-light)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = !subcatName ? 'var(--accent-light)' : 'transparent' }}
                    >
                      （未指定）
                    </div>
                    {filteredSubcats.map((sc) => (
                      <div
                        key={sc.id}
                        onClick={() => { setSubcatName(sc.name); setNewSubcat(''); setSubcatOpen(false) }}
                        style={{
                          padding: '4px 8px', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                          fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-primary)',
                          background: subcatName === sc.name ? 'var(--accent-light)' : 'transparent',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = subcatName === sc.name ? 'var(--accent-light)' : 'transparent' }}
                      >
                        {sc.name}
                      </div>
                    ))}
                    <div
                      onClick={() => { setSubcatName('__new__'); setSubcatOpen(false) }}
                      style={{
                        padding: '4px 8px', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                        fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--accent)',
                        borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      ＋ 新增子分類
                    </div>
                  </FixedDropdown>
                )}
                {subcatName === '__new__' && (
                  <div style={{ marginTop: 6 }}>
                    <input
                      ref={newSubcatInputRef}
                      value={newSubcat}
                      onChange={(e) => setNewSubcat(e.target.value.slice(0, 50))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newSubcat.trim()) {
                          setSubcatName(newSubcat.trim())
                        }
                        if (e.key === 'Escape') {
                          setSubcatName('')
                          setNewSubcat('')
                        }
                      }}
                      onBlur={() => {
                        if (newSubcat.trim()) {
                          setSubcatName(newSubcat.trim())
                        } else {
                          setSubcatName('')
                          setNewSubcat('')
                        }
                      }}
                      placeholder="輸入子分類名稱..."
                      style={{
                        ...inputStyle,
                        width: 180,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...sectionTitleStyle, marginTop: 12 }}>出席狀態</div>

            {/* 4. 出席 */}
            <div style={rowStyle}>
              <span style={labelStyle}>出席</span>
              <div style={{ flex: 1, display: 'flex', gap: 8, paddingTop: 4 }}>
                <button
                  onClick={() => setRsvp('confirmed')}
                  style={{
                    padding: '4px 14px', borderRadius: 'var(--radius-sm, 4px)',
                    border: rsvp === 'confirmed' ? '2px solid var(--success)' : '1px solid var(--border)',
                    background: rsvp === 'confirmed' ? 'rgba(34,197,94,0.08)' : 'var(--bg-surface)',
                    color: rsvp === 'confirmed' ? 'var(--success)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 15, fontFamily: 'var(--font-ui)', fontWeight: 600,
                  }}
                >
                  ✓ 確認
                </button>
                <button
                  onClick={() => setRsvp('declined')}
                  style={{
                    padding: '4px 14px', borderRadius: 'var(--radius-sm, 4px)',
                    border: rsvp === 'declined' ? '2px solid var(--error)' : '1px solid var(--border)',
                    background: rsvp === 'declined' ? 'rgba(239,68,68,0.08)' : 'var(--bg-surface)',
                    color: rsvp === 'declined' ? 'var(--error)' : 'var(--text-muted)',
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

            {/* 1. 桌次 + 攜眷 */}
            <div style={rowStyle}>
              <span style={labelStyle}>桌次</span>
              <div style={{ flex: 1, paddingTop: 4, position: 'relative' }}>
                <span
                  ref={tableAnchorRef}
                  onClick={() => setTableOpen(!tableOpen)}
                  style={{
                    color: tableId ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2,
                  }}
                >
                  {currentTable ? currentTable.name : '未排座'}
                  <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />
                </span>
                {tableOpen && (
                  <FixedDropdown anchorRef={tableAnchorRef} onClose={() => setTableOpen(false)} style={{ minWidth: 180, maxHeight: 240, overflow: 'auto' }}>
                    <div
                      onClick={() => { setTableId(null); setTableOpen(false) }}
                      style={{
                        padding: '4px 8px', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                        fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)',
                        background: !tableId ? 'var(--accent-light)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = !tableId ? 'var(--accent-light)' : 'transparent' }}
                    >
                      未排座
                    </div>
                    {tableInfo.map((t) => {
                      const isCurrent = t.id === tableId
                      const full = isCurrent ? false : t.remaining < seatCount
                      return (
                        <div
                          key={t.id}
                          onClick={() => { if (!full || isCurrent) { setTableId(t.id); setTableOpen(false) } }}
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
                  </FixedDropdown>
                )}
              </div>
              <span style={{ ...labelStyle, width: 'auto', paddingLeft: 8 }}>攜眷</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 4 }}>
                <button
                  onClick={() => companion > 0 && setCompanion(companion - 1)}
                  disabled={companion <= 0}
                  style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
                    background: companion <= 0 ? 'transparent' : 'var(--bg-surface)', cursor: companion <= 0 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    color: companion <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  }}
                >−</button>
                <span style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'center', fontSize: 15 }}>{companion}</span>
                <button
                  onClick={() => companion < 4 && setCompanion(companion + 1)}
                  disabled={companion >= 4}
                  style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
                    background: companion >= 4 ? 'transparent' : 'var(--bg-surface)', cursor: companion >= 4 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    color: companion >= 4 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  }}
                >+</button>
              </div>
            </div>

            {/* 2. 想同桌 */}
            <div style={rowStyle}>
              <span style={labelStyle}>想同桌</span>
              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {prefIds.map((pid) => {
                    const g = guests.find((x) => x.id === pid)
                    const display = g ? (g.aliases.length > 0 ? g.aliases[0] : g.name) : '?'
                    const cc = g ? getCategoryColor(g.category, categoryColors) : null
                    return (
                      <span key={pid} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        padding: '2px 8px', borderRadius: 'var(--radius-sm, 4px)',
                        background: cc?.background || 'var(--accent-light)',
                        border: `1px solid ${cc?.border || 'var(--border)'}`,
                        fontSize: 14, fontFamily: 'var(--font-ui)', color: cc?.color || 'var(--text-primary)',
                      }}>
                        {display}
                        <button
                          onClick={() => setPrefIds(prefIds.filter((id) => id !== pid))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: cc?.color || 'var(--text-muted)', fontSize: 10, lineHeight: 1, opacity: 0.6 }}
                        >
                          <X size={14} />
                        </button>
                      </span>
                    )
                  })}
                  {prefIds.length < 3 && (
                    <AddPickerButton
                      guests={guests}
                      excludeIds={prefExcludeIds}
                      onSelect={(gid) => setPrefIds([...prefIds, gid])}
                      categoryColors={categoryColors}
                      placeholder="搜尋賓客（最多 3 位）..."
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 3. 要避桌 */}
            <div style={rowStyle}>
              <span style={labelStyle}>要避桌</span>
              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {avoidIds.map((aid) => {
                    const g = guests.find((x) => x.id === aid)
                    const display = g ? (g.aliases.length > 0 ? g.aliases[0] : g.name) : '?'
                    const cc = g ? getCategoryColor(g.category, categoryColors) : null
                    return (
                      <span key={aid} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        padding: '2px 8px', borderRadius: 'var(--radius-sm, 4px)',
                        background: cc?.background || 'rgba(239,68,68,0.08)',
                        border: `1px solid ${cc?.border || 'var(--error)'}`,
                        fontSize: 14, fontFamily: 'var(--font-ui)', color: cc?.color || 'var(--error)',
                      }}>
                        {display}
                        <button
                          onClick={() => setAvoidIds(avoidIds.filter((id) => id !== aid))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: cc?.color || 'var(--error)', fontSize: 10, lineHeight: 1, opacity: 0.6 }}
                        >
                          <X size={14} />
                        </button>
                      </span>
                    )
                  })}
                  <AddPickerButton
                    guests={guests}
                    excludeIds={avoidExcludeIds}
                    onSelect={(gid) => setAvoidIds([...avoidIds, gid])}
                    categoryColors={categoryColors}
                    placeholder="搜尋要避桌的賓客..."
                  />
                </div>
              </div>
            </div>

            <div style={{ ...sectionTitleStyle, marginTop: 12 }}>備註</div>

            {/* 4. 飲食 */}
            <div style={rowStyle}>
              <span style={labelStyle}>飲食</span>
              <div style={{ flex: 1 }}>
                <FieldInput value={dietary} onChange={setDietary} placeholder="素食、過敏等..." />
              </div>
            </div>

            {/* 5. 特殊需求 */}
            <div style={rowStyle}>
              <span style={labelStyle}>特殊需求</span>
              <div style={{ flex: 1 }}>
                <FieldInput value={special} onChange={setSpecial} placeholder="輪椅、兒童椅等..." />
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div>
            {mode === 'edit' && onDelete && guest && (
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
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 20px', borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--border)', background: 'var(--bg-surface)',
                color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 15,
                fontFamily: 'var(--font-ui)', fontWeight: 500,
              }}
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || submitting}
              style={{
                padding: '6px 20px', borderRadius: 'var(--radius-sm, 4px)',
                border: 'none', background: !name.trim() || submitting ? 'var(--text-muted)' : 'var(--accent)',
                color: '#fff', cursor: !name.trim() || submitting ? 'default' : 'pointer', fontSize: 15,
                fontFamily: 'var(--font-ui)', fontWeight: 500,
                opacity: !name.trim() || submitting ? 0.5 : 1,
              }}
            >
              {mode === 'add' ? '新增賓客' : '儲存變更'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
