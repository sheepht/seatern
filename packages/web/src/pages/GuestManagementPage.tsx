import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Search, X } from 'lucide-react'
import { useSeatingStore } from '@/stores/seating'
import { getSatisfactionColor } from '@/lib/satisfaction'
import type { Guest, Table } from '@/lib/types'

// ─── Types ──────────────────────────────────────────

type SortField = 'name' | 'category' | 'rsvpStatus' | 'satisfactionScore' | 'assignedTableId'
type SortDir = 'asc' | 'desc'
type CategoryFilter = '全部' | string

// ─── Helpers ────────────────────────────────────────

const RSVP_LABELS: Record<string, string> = {
  confirmed: '確認',
  declined: '婉拒',
}

const RSVP_CYCLE: string[] = ['confirmed', 'declined']

function rsvpIcon(status: string) {
  return status === 'confirmed' ? '✓' : '✗'
}

function rsvpColor(status: string) {
  return status === 'confirmed' ? 'var(--success)' : 'var(--error)'
}

// ─── Category Color Presets ──────────────────────────

interface CategoryColor { background: string; border: string; color: string }

// 8 hues × 5 saturations + 5 grays = 45 presets (≈ square grid 8×6)
const PALETTE_HUES = [0, 30, 55, 140, 195, 220, 275, 330] // red, orange, yellow, green, cyan, blue, purple, pink
const PALETTE_SATS = [90, 72, 55, 40, 25] // vivid → muted

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const a = s / 100 * Math.min(l / 100, 1 - l / 100)
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * v).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function makeColor(h: number, s: number): CategoryColor {
  return {
    background: hslToHex(h, s, 88),
    border: hslToHex(h, s, 75),
    color: hslToHex(h, s, 28),
  }
}

const COLOR_PRESETS: CategoryColor[][] = [
  ...PALETTE_HUES.map((h) => PALETTE_SATS.map((s) => makeColor(h, s))),
  // grays (same count as PALETTE_SATS)
  PALETTE_SATS.map((_, i) => {
    const lights = [92, 86, 78, 70, 60]
    const l = lights[i]
    return { background: hslToHex(220, 8, l), border: hslToHex(220, 8, l - 10), color: hslToHex(220, 10, 22) }
  }),
]

const DEFAULT_CATEGORY_COLORS: Record<string, CategoryColor> = {
  '男方': COLOR_PRESETS[5][0],  // 藍 (hue 220)
  '女方': COLOR_PRESETS[0][0],  // 紅 (hue 0)
  '共同': COLOR_PRESETS[8][0],  // 灰
}

function loadCategoryColors(eventId: string): Record<string, CategoryColor> {
  try {
    const raw = localStorage.getItem(`seatern:categoryColors:${eventId}`)
    return raw ? { ...DEFAULT_CATEGORY_COLORS, ...JSON.parse(raw) } : { ...DEFAULT_CATEGORY_COLORS }
  } catch { return { ...DEFAULT_CATEGORY_COLORS } }
}

function saveCategoryColors(eventId: string, colors: Record<string, CategoryColor>) {
  localStorage.setItem(`seatern:categoryColors:${eventId}`, JSON.stringify(colors))
}

const FALLBACK_COLOR: CategoryColor = { background: '#E5E7EB', border: '#D1D5DB', color: '#374151' }

function getCategoryBadgeStyle(category: string | undefined, colors: Record<string, CategoryColor>): CategoryColor {
  if (!category) return FALLBACK_COLOR
  return colors[category] || FALLBACK_COLOR
}

// ─── Category Color Picker ──────────────────────────

function CategoryColorPicker({ current, onPick, onPreview, rect, onEnter, onClose }: {
  current: CategoryColor; onPick: (c: CategoryColor) => void; onPreview: (c: CategoryColor | null) => void
  rect: { left: number; bottom: number }; onEnter: () => void; onClose: () => void
}) {
  const cols = PALETTE_HUES.length + 1 // hues + gray column
  const rows = PALETTE_SATS.length

  return createPortal(
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onClose}
      style={{
        position: 'fixed', left: rect.left, top: rect.bottom + 4,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 8px)', padding: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 9999,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 20px)`, gap: 3 }}>
        {Array.from({ length: rows }, (_, si) =>
          COLOR_PRESETS.map((hueRow, hi) => (
            <div
              key={`${hi}-${si}`}
              onClick={() => onPick(hueRow[si])}
              onMouseEnter={() => onPreview(hueRow[si])}
              onMouseLeave={() => onPreview(null)}
              style={{
                width: 20, height: 20, borderRadius: 3, cursor: 'pointer',
                background: hueRow[si].background,
                outline: hueRow[si].color === current.color ? `2px solid ${hueRow[si].color}` : 'none',
                outlineOffset: -1,
              }}
            />
          ))
        )}
      </div>
    </div>,
    document.body,
  )
}

// ─── Toast ──────────────────────────────────────────

function Toast({ message, onUndo, onClose }: { message: string; onUndo?: () => void; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--text-primary)', color: 'var(--bg-surface)', padding: '10px 20px',
        borderRadius: 'var(--radius-md, 8px)', fontSize: 14, fontFamily: 'var(--font-body)',
        display: 'flex', alignItems: 'center', gap: 12, zIndex: 9999,
        boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
      }}
    >
      <span>{message}</span>
      {onUndo && (
        <button onClick={onUndo} style={{ color: 'var(--accent-light)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', fontSize: 14 }}>
          復原
        </button>
      )}
    </div>
  )
}

// ─── Inline Editable Cell ───────────────────────────

function EditableText({
  value, onSave, maxLength = 50, placeholder,
}: { value: string; onSave: (v: string) => void; maxLength?: number; placeholder?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    else setDraft(value)
    setEditing(false)
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className="cursor-pointer hover:bg-[var(--accent-light)] px-1 -mx-1 rounded"
        style={{ minHeight: 20, display: 'inline-block' }}
      >
        {value || <span style={{ color: 'var(--text-muted)' }}>{placeholder || '—'}</span>}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
      className="outline-none w-full"
      style={{
        background: 'var(--accent-light)', border: 'none', borderBottom: '2px solid var(--accent)',
        padding: '1px 4px', fontSize: 'inherit', fontFamily: 'inherit', color: 'inherit',
        borderRadius: 2,
      }}
    />
  )
}

function NumberStepper({ value, min, max, onSave, maxTooltip }: { value: number; min: number; max: number; onSave: (v: number) => void; maxTooltip?: string }) {
  const atMax = value >= max
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null)
  const popoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const btnRef = useRef<HTMLSpanElement>(null)

  const handleMaxHover = () => {
    if (!atMax || !maxTooltip) return
    popoverTimer.current = setTimeout(() => {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect()
        setPopoverPos({ x: r.right, y: r.top - 6 })
      }
    }, 300)
  }
  const handleMaxLeave = () => {
    if (popoverTimer.current) clearTimeout(popoverTimer.current)
    setPopoverPos(null)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={() => value > min && onSave(value - 1)}
        disabled={value <= min}
        style={{
          width: 24, height: 24, borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
          background: value <= min ? 'transparent' : 'var(--bg-surface)', cursor: value <= min ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          color: value <= min ? 'var(--text-muted)' : 'var(--text-secondary)',
        }}
      >−</button>
      <span style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', minWidth: 18, textAlign: 'center' }}>{value}</span>
      <span ref={btnRef} onMouseEnter={handleMaxHover} onMouseLeave={handleMaxLeave} style={{ display: 'inline-flex' }}>
        <button
          onClick={() => !atMax && onSave(value + 1)}
          disabled={atMax}
          style={{
            width: 24, height: 24, borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
            background: atMax ? 'transparent' : 'var(--bg-surface)', cursor: atMax ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            color: atMax ? 'var(--text-muted)' : 'var(--text-secondary)',
          }}
        >+</button>
      </span>
      {popoverPos && maxTooltip && createPortal(
        <div style={{
          position: 'fixed', left: popoverPos.x, top: popoverPos.y,
          transform: 'translate(-100%, -100%)',
          background: 'var(--text-primary)', color: 'var(--bg-surface)',
          padding: '4px 10px', borderRadius: 'var(--radius-sm, 4px)',
          fontSize: 12, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', pointerEvents: 'none',
          zIndex: 9999,
        }}>
          {maxTooltip}
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Delete Confirm Modal ───────────────────────────

function DeleteConfirmModal({ guestName, tableName, onConfirm, onCancel }: {
  guestName: string; tableName: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 12px)', padding: 24, maxWidth: 400, width: '90%', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>確定要刪除？</h3>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
          {guestName} 目前在{tableName}，刪除後該座位會空出。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}
          >取消</button>
          <button
            onClick={onConfirm}
            style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm, 4px)', border: 'none', background: 'var(--error)', color: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-ui)', fontWeight: 500 }}
          >刪除</button>
        </div>
      </div>
    </div>
  )
}

// ─── Stats Bar ──────────────────────────────────────

function StatsBar({
  guests, onFilterClick,
}: { guests: Guest[]; onFilterClick: (status: string) => void }) {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed').length
  const declined = guests.filter((g) => g.rsvpStatus === 'declined').length
  const totalSeats = guests.filter((g) => g.rsvpStatus === 'confirmed').reduce((s, g) => s + g.attendeeCount, 0)
  const assigned = guests.filter((g) => g.assignedTableId && g.rsvpStatus === 'confirmed')
  const avgSat = assigned.length > 0 ? assigned.reduce((s, g) => s + g.satisfactionScore, 0) / assigned.length : 0

  const statStyle = () => ({
    display: 'flex' as const, alignItems: 'baseline' as const, gap: 4, cursor: 'pointer',
    padding: '4px 8px', borderRadius: 'var(--radius-sm, 4px)',
  })

  return (
    <>
      <div style={statStyle()} onClick={() => onFilterClick('confirmed')}>
        <span style={{ fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 20, color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{confirmed}</span>
        <span>確認</span>
      </div>
      <div style={statStyle()} onClick={() => onFilterClick('declined')}>
        <span style={{ fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 20, color: 'var(--error)', fontVariantNumeric: 'tabular-nums' }}>{declined}</span>
        <span>婉拒</span>
      </div>
      <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{totalSeats}</span>
        <span>席位</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 20, color: avgSat > 0 ? getSatisfactionColor(avgSat) : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {avgSat > 0 ? avgSat.toFixed(1) : '—'}
        </span>
        <span>平均滿意度</span>
      </div>
    </>
  )
}

// ─── Main Page ──────────────────────────────────────

export default function GuestManagementPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const guests = useSeatingStore((s) => s.guests)
  const tables = useSeatingStore((s) => s.tables)
  const eventName = useSeatingStore((s) => s.eventName)
  const avoidPairs = useSeatingStore((s) => s.avoidPairs)
  const updateGuest = useSeatingStore((s) => s.updateGuest)
  const deleteGuest = useSeatingStore((s) => s.deleteGuest)
  const addGuest = useSeatingStore((s) => s.addGuest)

  // Category colors (localStorage-backed)
  const [categoryColors, setCategoryColors] = useState<Record<string, CategoryColor>>(() => loadCategoryColors(eventId || ''))
  const handleColorChange = useCallback((cat: string, c: CategoryColor) => {
    setCategoryColors((prev) => {
      const next = { ...prev, [cat]: c }
      saveCategoryColors(eventId || '', next)
      return next
    })
  }, [eventId])

  // Color picker state
  const [pickerCat, setPickerCat] = useState<{ cat: string; rect: { left: number; bottom: number } } | null>(null)
  const [previewColor, setPreviewColor] = useState<{ cat: string; color: CategoryColor } | null>(null)
  const pickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelPickerClose = useCallback(() => {
    if (pickerCloseTimer.current) { clearTimeout(pickerCloseTimer.current); pickerCloseTimer.current = null }
  }, [])
  const schedulePickerClose = useCallback(() => {
    cancelPickerClose()
    pickerCloseTimer.current = setTimeout(() => setPickerCat(null), 150)
  }, [cancelPickerClose])

  // UI state
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('全部')
  const [rsvpFilter, setRsvpFilter] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ guestId: string; guestName: string; tableName: string } | null>(null)
  const [addingGuest, setAddingGuest] = useState(false)
  const [newGuestName, setNewGuestName] = useState('')
  const newGuestRef = useRef<HTMLInputElement>(null)
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup delete timers on unmount / navigate away
  useEffect(() => {
    return () => {
      deleteTimers.current.forEach((timer, guestId) => {
        clearTimeout(timer)
        // Fire pending deletes immediately
        const { eventId } = useSeatingStore.getState()
        if (eventId) {
          fetch(`/api/events/${eventId}/guests/${guestId}`, { method: 'DELETE', credentials: 'include' })
        }
      })
      deleteTimers.current.clear()
    }
  }, [])

  // Focus new guest input
  useEffect(() => {
    if (addingGuest) newGuestRef.current?.focus()
  }, [addingGuest])

  // Get unique categories from event
  const categories = Array.from(new Set(guests.map((g) => g.category).filter(Boolean))) as string[]

  // Merge preview color into effective colors
  const effectiveColors = previewColor
    ? { ...categoryColors, [previewColor.cat]: previewColor.color }
    : categoryColors

  // Lookup maps
  const tableNameMap = new Map(tables.map((t) => [t.id, t.name]))
  const guestNameMap = new Map(guests.map((g) => [g.id, g.name]))

  // Filter + sort
  const filtered = guests.filter((g) => {
    if (categoryFilter !== '全部' && g.category !== categoryFilter) return false
    if (rsvpFilter && g.rsvpStatus !== rsvpFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const nameMatch = g.name.toLowerCase().includes(q)
      const aliasMatch = g.aliases.some((a) => a.toLowerCase().includes(q))
      if (!nameMatch && !aliasMatch) return false
    }
    return true
  }).sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'name': cmp = a.name.localeCompare(b.name, 'zh-Hant'); break
      case 'category': cmp = (a.category || '').localeCompare(b.category || '', 'zh-Hant'); break
      case 'rsvpStatus': cmp = a.rsvpStatus.localeCompare(b.rsvpStatus); break
      case 'satisfactionScore': cmp = a.satisfactionScore - b.satisfactionScore; break
      case 'assignedTableId': cmp = (a.assignedTableId || '').localeCompare(b.assignedTableId || ''); break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  // Handlers
  const handleSave = useCallback(async (guestId: string, patch: Partial<Guest>) => {
    const ok = await updateGuest(guestId, patch)
    if (!ok) setToast({ message: '儲存失敗，已還原' })
  }, [updateGuest])

  const handleDelete = useCallback((guest: Guest) => {
    if (guest.assignedTableId) {
      const tableName = tableNameMap.get(guest.assignedTableId) || '未知桌'
      setDeleteConfirm({ guestId: guest.id, guestName: guest.name, tableName })
    } else {
      // Soft delete with undo timer
      const prevGuests = useSeatingStore.getState().guests
      deleteGuest(guest.id)

      const timer = setTimeout(() => {
        deleteTimers.current.delete(guest.id)
        setToast(null)
      }, 5000)
      deleteTimers.current.set(guest.id, timer)

      setToast({
        message: `已刪除 ${guest.name}`,
        onUndo: () => {
          clearTimeout(timer)
          deleteTimers.current.delete(guest.id)
          // Restore by re-loading event data
          const { loadEvent: reload } = useSeatingStore.getState()
          if (eventId) reload(eventId)
          setToast(null)
        },
      })
    }
  }, [deleteGuest, eventId, tableNameMap])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return
    await deleteGuest(deleteConfirm.guestId)
    setDeleteConfirm(null)
    setToast({ message: `已刪除 ${deleteConfirm.guestName}` })
  }, [deleteConfirm, deleteGuest])

  const handleAddGuest = useCallback(async () => {
    const name = newGuestName.trim()
    if (!name) return
    const guest = await addGuest({ name })
    if (guest) {
      setNewGuestName('')
      setAddingGuest(false)
      setToast({ message: `已新增 ${name}` })
    } else {
      setToast({ message: '新增失敗' })
    }
  }, [newGuestName, addGuest])

  const handleRsvpToggle = useCallback((guest: Guest) => {
    const idx = RSVP_CYCLE.indexOf(guest.rsvpStatus)
    const next = RSVP_CYCLE[(idx + 1) % RSVP_CYCLE.length]
    handleSave(guest.id, { rsvpStatus: next as any })
  }, [handleSave])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const sortArrow = (field: SortField) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const handleRsvpFilterClick = (status: string) => {
    setRsvpFilter((prev) => prev === status ? null : status)
  }

  // ─── Empty state ────────────────────────────────────
  if (guests.length === 0 && !addingGuest) {
    return (
      <div style={{ flex: 1, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 24px', width: '100%' }}>
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>尚無賓客</h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>點擊下方新增或返回匯入名單</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setAddingGuest(true)} style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm, 4px)', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-ui)', fontWeight: 500 }}>
                <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> 新增賓客
              </button>
              <button onClick={() => navigate('/import')} style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}>
                匯入名單
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Main table view ────────────────────────────────
  return (
    <div style={{ flex: 1, background: 'var(--bg-primary)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 24px', width: '100%' }}>

        {/* Toolbar: Search + Filter (left) | Stats (right) */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 0',
          fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Left: Search + Category + RSVP badge */}
          <div style={{ position: 'relative', flex: '0 1 240px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋姓名/暱稱..."
              style={{
                width: '100%', padding: '6px 10px 6px 30px', borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 14,
                fontFamily: 'var(--font-body)', color: 'var(--text-primary)', outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm, 4px)', overflow: 'hidden' }}>
            {['全部', ...categories].map((cat) => {
              const count = cat === '全部' ? guests.length : guests.filter((g) => g.category === cat).length
              return (
                <button
                  key={cat}
                  onClick={() => { setCategoryFilter(cat as CategoryFilter); setRsvpFilter(null) }}
                  onMouseEnter={(e) => {
                    if (cat === '全部') return
                    if (pickerTimer.current) clearTimeout(pickerTimer.current)
                    const r = e.currentTarget.getBoundingClientRect()
                    pickerTimer.current = setTimeout(() => setPickerCat({ cat, rect: { left: r.left, bottom: r.bottom } }), 400)
                  }}
                  onMouseLeave={() => {
                    if (pickerTimer.current) clearTimeout(pickerTimer.current)
                    schedulePickerClose()
                  }}
                  style={{
                    padding: '5px 12px', border: 'none', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500,
                    cursor: 'pointer',
                    ...(() => {
                      if (cat === '全部') {
                        return categoryFilter === cat
                          ? { background: 'var(--accent)', color: '#fff' }
                          : { background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                      }
                      const badge = getCategoryBadgeStyle(cat, effectiveColors)
                      return categoryFilter === cat
                        ? { background: badge.color, color: '#fff' }
                        : { background: badge.background, color: badge.color }
                    })(),
                  }}
                >{cat} {count}</button>
              )
            })}
          </div>

          {/* Category color picker */}
          {pickerCat && (
            <CategoryColorPicker
              current={getCategoryBadgeStyle(pickerCat.cat, effectiveColors)}
              onPick={(c) => { setPreviewColor(null); handleColorChange(pickerCat.cat, c); setPickerCat(null) }}
              onPreview={(c) => setPreviewColor(c ? { cat: pickerCat.cat, color: c } : null)}
              rect={pickerCat.rect}
              onEnter={cancelPickerClose}
              onClose={() => { setPreviewColor(null); schedulePickerClose() }}
            />
          )}

          {rsvpFilter && (
            <button
              onClick={() => setRsvpFilter(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
                background: 'var(--accent-light)', fontSize: 13, fontFamily: 'var(--font-ui)',
                cursor: 'pointer', color: 'var(--text-primary)',
              }}
            >
              {RSVP_LABELS[rsvpFilter] || rsvpFilter} <X size={12} />
            </button>
          )}

          {/* Right: Stats */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatsBar guests={guests} onFilterClick={handleRsvpFilterClick} />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th onClick={() => handleSort('name')} style={thStyle}>姓名{sortArrow('name')}</th>
                <th onClick={() => handleSort('category')} style={thStyle}>分類{sortArrow('category')}</th>
                <th style={thStyle}>標籤</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>關係</th>
                <th onClick={() => handleSort('assignedTableId')} style={thStyle}>桌次{sortArrow('assignedTableId')}</th>
                <th onClick={() => handleSort('satisfactionScore')} style={{ ...thStyle, textAlign: 'right' }}>滿意度{sortArrow('satisfactionScore')}</th>
                <th onClick={() => handleSort('rsvpStatus')} style={{ ...thStyle, textAlign: 'center' }}>出席{sortArrow('rsvpStatus')}</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>人數</th>
                <th style={thStyle}>想同桌</th>
                <th style={thStyle}>要避桌</th>
                <th style={thStyle}>飲食</th>
                <th style={thStyle}>特殊需求</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest) => {
                const tableName = guest.assignedTableId ? tableNameMap.get(guest.assignedTableId) || '—' : '未排座'
                const satColor = guest.assignedTableId ? getSatisfactionColor(guest.satisfactionScore) : 'var(--text-muted)'
                const tags = guest.guestTags.map((gt) => gt.tag.name)

                // Compute dynamic max attendeeCount based on table capacity
                let maxAttendee = 10
                let maxAttendeeTooltip: string | undefined
                if (guest.assignedTableId) {
                  const table = tables.find((t) => t.id === guest.assignedTableId)
                  if (table) {
                    const othersSeats = guests
                      .filter((g) => g.assignedTableId === table.id && g.id !== guest.id && g.rsvpStatus === 'confirmed')
                      .reduce((sum, g) => sum + g.attendeeCount, 0)
                    maxAttendee = Math.min(10, table.capacity - othersSeats)
                    if (maxAttendee <= guest.attendeeCount) {
                      const used = othersSeats + guest.attendeeCount
                      maxAttendeeTooltip = `${table.name}已滿 (${used}/${table.capacity})`
                    }
                  }
                }

                // Seat preference names (sorted by rank)
                const prefNames = guest.seatPreferences
                  .slice().sort((a, b) => a.rank - b.rank)
                  .map((p) => guestNameMap.get(p.preferredGuestId))
                  .filter(Boolean) as string[]

                // Avoid pair names for this guest
                const avoidNames = avoidPairs
                  .filter((ap) => ap.guestAId === guest.id || ap.guestBId === guest.id)
                  .map((ap) => guestNameMap.get(ap.guestAId === guest.id ? ap.guestBId : ap.guestAId))
                  .filter(Boolean) as string[]

                return (
                  <GuestRow
                    key={guest.id}
                    guest={guest}
                    tableName={tableName}
                    satColor={satColor}
                    tags={tags}
                    maxAttendee={maxAttendee}
                    maxAttendeeTooltip={maxAttendeeTooltip}
                    prefNames={prefNames}
                    avoidNames={avoidNames}
                    catColor={getCategoryBadgeStyle(guest.category, effectiveColors)}
                    onSave={(patch) => handleSave(guest.id, patch)}
                    onRsvpToggle={() => handleRsvpToggle(guest)}
                    onDelete={() => handleDelete(guest)}
                  />
                )
              })}

              {/* Empty search result */}
              {filtered.length === 0 && guests.length > 0 && (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                  沒有符合的賓客
                </td></tr>
              )}

              {/* Add guest row */}
              {addingGuest && (
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td colSpan={12} style={{ padding: '8px 12px' }}>
                    <input
                      ref={newGuestRef}
                      value={newGuestName}
                      onChange={(e) => setNewGuestName(e.target.value.slice(0, 50))}
                      onBlur={() => { if (newGuestName.trim()) handleAddGuest(); else setAddingGuest(false) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddGuest(); if (e.key === 'Escape') { setNewGuestName(''); setAddingGuest(false) } }}
                      placeholder="輸入賓客姓名..."
                      style={{
                        width: '100%', padding: '4px 8px', border: 'none',
                        borderBottom: '2px solid var(--accent)', background: 'var(--accent-light)',
                        fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
                        borderRadius: 2, color: 'var(--text-primary)',
                      }}
                    />
                  </td>
                  <td style={{ width: 36 }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add button */}
        {!addingGuest && (
          <button
            onClick={() => setAddingGuest(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, padding: '8px 16px',
              background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-ui)', fontWeight: 500, color: 'var(--accent)',
            }}
          >
            <Plus size={14} /> 新增賓客
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} onUndo={toast.onUndo} onClose={() => setToast(null)} />}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <DeleteConfirmModal
          guestName={deleteConfirm.guestName}
          tableName={deleteConfirm.tableName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

// ─── Guest Row (memo for perf) ──────────────────────

const GuestRow = ({ guest, tableName, satColor, tags, maxAttendee, maxAttendeeTooltip, prefNames, avoidNames, catColor, onSave, onRsvpToggle, onDelete }: {
  guest: Guest; tableName: string; satColor: string; tags: string[]
  maxAttendee: number; maxAttendeeTooltip?: string
  prefNames: string[]; avoidNames: string[]
  catColor: CategoryColor
  onSave: (patch: Partial<Guest>) => void; onRsvpToggle: () => void; onDelete: () => void
}) => {
  const [hovered, setHovered] = useState(false)
  const aliasText = guest.aliases.length > 0 ? `（${guest.aliases.join('、')}）` : ''

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: '1px solid var(--border)', background: hovered ? 'var(--accent-light)' : 'transparent', transition: 'background 50ms' }}
    >
      {/* Name + aliases */}
      <td style={tdStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <EditableText value={guest.name} onSave={(v) => onSave({ name: v })} />
          {aliasText && <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{aliasText}</span>}
        </div>
      </td>

      {/* Category */}
      <td style={tdStyle}>
        {guest.category && (
          <span style={{ background: catColor.background, border: `1px solid ${catColor.border}`, color: catColor.color, padding: '1px 8px', borderRadius: 'var(--radius-sm, 4px)', fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 500 }}>
            {guest.category}
          </span>
        )}
      </td>

      {/* Tags */}
      <td style={tdStyle}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tags.slice(0, 2).map((t) => (
            <span key={t} style={{ padding: '1px 6px', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>{t}</span>
          ))}
          {tags.length > 2 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{tags.length - 2}</span>}
        </div>
      </td>

      {/* Relation score (stars) */}
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', gap: 1 }}>
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              onClick={() => onSave({ relationScore: s })}
              style={{ cursor: 'pointer', fontSize: 14, color: s <= guest.relationScore ? 'var(--accent)' : 'var(--border)' }}
            >★</span>
          ))}
        </div>
      </td>

      {/* Table */}
      <td style={tdStyle}>
        <span style={{ color: guest.assignedTableId ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13 }}>{tableName}</span>
      </td>

      {/* Satisfaction */}
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {guest.assignedTableId ? (
          <span style={{ color: satColor, fontFamily: 'var(--font-data)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {guest.satisfactionScore.toFixed(0)}
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>

      {/* RSVP toggle */}
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <button
          onClick={onRsvpToggle}
          title={RSVP_LABELS[guest.rsvpStatus]}
          style={{
            width: 28, height: 28, borderRadius: 'var(--radius-sm, 4px)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
            color: rsvpColor(guest.rsvpStatus), display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >{rsvpIcon(guest.rsvpStatus)}</button>
      </td>

      {/* Attendee count stepper */}
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <NumberStepper value={guest.attendeeCount} min={1} max={maxAttendee} onSave={(v) => onSave({ attendeeCount: v })} maxTooltip={maxAttendeeTooltip} />
      </td>

      {/* Seat preferences */}
      <td style={tdStyle}>
        {prefNames.length > 0 ? (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{prefNames.join('、')}</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>

      {/* Avoid pairs */}
      <td style={tdStyle}>
        {avoidNames.length > 0 ? (
          <span style={{ fontSize: 13, color: 'var(--error)' }}>{avoidNames.join('、')}</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>

      {/* Dietary note */}
      <td style={tdStyle}>
        <EditableText value={guest.dietaryNote || ''} onSave={(v) => onSave({ dietaryNote: v })} placeholder="—" maxLength={100} />
      </td>

      {/* Special note */}
      <td style={tdStyle}>
        <EditableText value={guest.specialNote || ''} onSave={(v) => onSave({ specialNote: v })} placeholder="—" maxLength={100} />
      </td>

      {/* Delete */}
      <td style={{ width: 36, padding: '0 8px' }}>
        <button
          onClick={onDelete}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: hovered ? 'var(--error)' : 'transparent', padding: 4, borderRadius: 'var(--radius-sm, 4px)', transition: 'color 100ms' }}
          title="刪除"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}

// ─── Styles ─────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--font-ui)',
  fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase' as const, cursor: 'pointer', userSelect: 'none',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px', verticalAlign: 'middle',
}
