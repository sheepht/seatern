import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Search, X } from 'lucide-react'
import { useSeatingStore } from '@/stores/seating'
import { getSatisfactionColor } from '@/lib/satisfaction'
import { loadCategoryColors, saveCategoryColors, getCategoryColor, COLOR_PRESETS, PALETTE_HUES, PALETTE_SATS, FALLBACK_COLOR, type CategoryColor } from '@/lib/category-colors'
import GuestFormModal, { type GuestFormData } from '@/components/GuestFormModal'
import { AvoidPairModal } from '@/components/workspace/AvoidPairModal'
import type { Guest } from '@/lib/types'

// ─── Types ──────────────────────────────────────────

type SortField = 'name' | 'category' | 'rsvpStatus' | 'satisfactionScore' | 'assignedTableId' | 'companionCount' | 'prefCount' | 'avoidCount' | 'dietaryNote' | 'specialNote'
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
  const totalSeats = guests.filter((g) => g.rsvpStatus === 'confirmed').reduce((s, g) => s + g.seatCount, 0)
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
  const moveGuest = useSeatingStore((s) => s.moveGuest)
  const updateGuestPreferences = useSeatingStore((s) => s.updateGuestPreferences)
  const setGuestSubcategory = useSeatingStore((s) => s.setGuestSubcategory)
  const subcategories = useSeatingStore((s) => s.subcategories)
  const addAvoidPair = useSeatingStore((s) => s.addAvoidPair)
  const removeAvoidPair = useSeatingStore((s) => s.removeAvoidPair)

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
  const [holdingCat, setHoldingCat] = useState<string | null>(null) // which button shows progress bar
  const pickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const PICKER_DELAY = 800
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
  const [showDeclined, setShowDeclined] = useState(false)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ guestId: string; guestName: string; tableName: string } | null>(null)
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null)
  const [showAvoidModal, setShowAvoidModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

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

  // Get unique categories from event
  const eventCategories = useSeatingStore((s) => s.eventCategories)
  const categories = eventCategories.length > 0 ? eventCategories : ['男方', '女方', '共同']

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
    if (!showDeclined && !search && g.rsvpStatus === 'declined') return false
    if (search) {
      const q = search.toLowerCase()
      const nameMatch = g.name.toLowerCase().includes(q)
      const aliasMatch = g.aliases.some((a) => a.toLowerCase().includes(q))
      if (!nameMatch && !aliasMatch) return false
    }
    return true
  }).sort((a, b) => {
    let cmp = 0
    const avoidCount = (g: Guest) => avoidPairs.filter((ap) => ap.guestAId === g.id || ap.guestBId === g.id).length
    switch (sortField) {
      case 'name': cmp = a.name.localeCompare(b.name, 'zh-Hant'); break
      case 'category': cmp = (a.category || '').localeCompare(b.category || '', 'zh-Hant'); break
      case 'rsvpStatus': cmp = a.rsvpStatus.localeCompare(b.rsvpStatus); break
      case 'satisfactionScore': cmp = a.satisfactionScore - b.satisfactionScore; break
      case 'assignedTableId': cmp = (a.assignedTableId || '').localeCompare(b.assignedTableId || ''); break
      case 'companionCount': cmp = a.companionCount - b.companionCount; break
      case 'prefCount': cmp = a.seatPreferences.length - b.seatPreferences.length; break
      case 'avoidCount': cmp = avoidCount(a) - avoidCount(b); break
      case 'dietaryNote': cmp = (a.dietaryNote || '').localeCompare(b.dietaryNote || '', 'zh-Hant'); break
      case 'specialNote': cmp = (a.specialNote || '').localeCompare(b.specialNote || '', 'zh-Hant'); break
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
      // Soft delete: 先從 local state 移除，延遲刪 DB。Undo 時恢復 state 並取消 API call。
      const state = useSeatingStore.getState()
      const prevGuests = state.guests
      const prevAvoidPairs = state.avoidPairs

      // 從 local state 移除（不呼叫 deleteGuest，避免立即刪 DB）
      const nextGuests = prevGuests.filter((g) => g.id !== guest.id)
      const nextAvoidPairs = prevAvoidPairs.filter(
        (ap) => ap.guestAId !== guest.id && ap.guestBId !== guest.id,
      )
      useSeatingStore.setState({ guests: nextGuests, avoidPairs: nextAvoidPairs })

      const timer = setTimeout(async () => {
        deleteTimers.current.delete(guest.id)
        setToast(null)
        // Timer 到了才真正刪 DB
        try {
          await fetch(`/api/events/${eventId}/guests/${guest.id}`, {
            method: 'DELETE',
            credentials: 'include',
          })
        } catch { /* ignore */ }
      }, 5000)
      deleteTimers.current.set(guest.id, timer)

      setToast({
        message: `已刪除 ${guest.name}`,
        onUndo: () => {
          clearTimeout(timer)
          deleteTimers.current.delete(guest.id)
          // 恢復 local state（DB 還沒刪，不需要重建）
          useSeatingStore.setState({ guests: prevGuests, avoidPairs: prevAvoidPairs })
          setToast(null)
        },
      })
    }
  }, [eventId, tableNameMap])

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return
    const { guestId, guestName } = deleteConfirm
    setDeleteConfirm(null)

    // Soft delete：同未入座邏輯，先移 local state，延遲刪 DB
    const state = useSeatingStore.getState()
    const prevGuests = state.guests
    const prevAvoidPairs = state.avoidPairs

    const nextGuests = prevGuests.filter((g) => g.id !== guestId)
    const nextAvoidPairs = prevAvoidPairs.filter(
      (ap) => ap.guestAId !== guestId && ap.guestBId !== guestId,
    )
    useSeatingStore.setState({ guests: nextGuests, avoidPairs: nextAvoidPairs })

    const timer = setTimeout(async () => {
      deleteTimers.current.delete(guestId)
      setToast(null)
      try {
        await fetch(`/api/events/${eventId}/guests/${guestId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
      } catch { /* ignore */ }
    }, 5000)
    deleteTimers.current.set(guestId, timer)

    setToast({
      message: `已刪除 ${guestName}`,
      onUndo: () => {
        clearTimeout(timer)
        deleteTimers.current.delete(guestId)
        useSeatingStore.setState({ guests: prevGuests, avoidPairs: prevAvoidPairs })
        setToast(null)
      },
    })
  }, [deleteConfirm, eventId])

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
    if (status === 'declined') setShowDeclined(true)
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
            {(() => {
              const visible = !showDeclined ? guests.filter((g) => g.rsvpStatus !== 'declined') : guests
              return ['全部', ...categories].map((cat) => {
              const count = cat === '全部' ? visible.length : visible.filter((g) => g.category === cat).length
              return (
                <button
                  key={cat}
                  onClick={() => { setCategoryFilter(cat as CategoryFilter); setRsvpFilter(null) }}
                  onMouseEnter={(e) => {
                    if (cat === '全部') return
                    if (pickerTimer.current) clearTimeout(pickerTimer.current)
                    setHoldingCat(cat)
                    const r = e.currentTarget.getBoundingClientRect()
                    pickerTimer.current = setTimeout(() => { setHoldingCat(null); setPickerCat({ cat, rect: { left: r.left, bottom: r.bottom } }) }, PICKER_DELAY)
                  }}
                  onMouseLeave={() => {
                    if (pickerTimer.current) clearTimeout(pickerTimer.current)
                    setHoldingCat(null)
                    schedulePickerClose()
                  }}
                  style={{
                    position: 'relative', overflow: 'hidden',
                    padding: '5px 12px', border: 'none', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500,
                    cursor: 'pointer',
                    ...(() => {
                      if (cat === '全部') {
                        return categoryFilter === cat
                          ? { background: 'var(--accent)', color: '#fff' }
                          : { background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                      }
                      const badge = getCategoryColor(cat, effectiveColors)
                      return categoryFilter === cat
                        ? { background: badge.color, color: '#fff' }
                        : { background: badge.background, color: badge.color }
                    })(),
                  }}
                >
                  {cat} {count}
                  {holdingCat === cat && (
                    <div style={{
                      position: 'absolute', left: 0, bottom: 0, height: 2, width: '100%',
                      background: getCategoryColor(cat, effectiveColors).color,
                      animation: `pickerProgress ${PICKER_DELAY}ms linear forwards`,
                      opacity: 0.6,
                    }} />
                  )}
                </button>
              )
            })
            })()}
          </div>

          {/* Category color picker */}
          {pickerCat && (
            <CategoryColorPicker
              current={getCategoryColor(pickerCat.cat, effectiveColors)}
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

          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <div
              onClick={() => setShowDeclined((v) => !v)}
              style={{
                width: 32, height: 18, borderRadius: 9, position: 'relative',
                background: showDeclined ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.2s',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2,
                left: showDeclined ? 16 : 2,
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
            顯示婉拒
          </label>

          {/* Avoid pairs overview */}
          <button
            onClick={() => setShowAvoidModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px',
              borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
              background: avoidPairs.length > 0 ? '#FEF2F2' : 'var(--bg-surface)',
              fontSize: 13, fontFamily: 'var(--font-ui)', cursor: 'pointer',
              color: avoidPairs.length > 0 ? '#DC2626' : 'var(--text-secondary)',
            }}
          >
            避桌 {avoidPairs.length > 0 && <span style={{ fontWeight: 600 }}>{avoidPairs.length}</span>}
          </button>

          {/* 追加匯入 */}
          <button
            onClick={() => navigate(`/workspace/${eventId}/import`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px',
              borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
              background: 'var(--bg-surface)', fontSize: 13, fontFamily: 'var(--font-ui)',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
          >
            追加匯入
          </button>

          {/* Right: Stats */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatsBar guests={guests} onFilterClick={handleRsvpFilterClick} />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: 15 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th onClick={() => handleSort('name')} style={thStyle}>姓名{sortArrow('name')}</th>
                <th onClick={() => handleSort('category')} style={thStyle}>分類{sortArrow('category')}</th>
                <th style={thStyle}>子分類</th>
                <th onClick={() => handleSort('assignedTableId')} style={thStyle}>桌次{sortArrow('assignedTableId')}</th>
                <th onClick={() => handleSort('satisfactionScore')} style={{ ...thStyle, textAlign: 'right' }}>滿意度{sortArrow('satisfactionScore')}</th>
                <th onClick={() => handleSort('rsvpStatus')} style={{ ...thStyle, textAlign: 'center' }}>出席{sortArrow('rsvpStatus')}</th>
                <th onClick={() => handleSort('companionCount')} style={{ ...thStyle, textAlign: 'center' }}>攜眷{sortArrow('companionCount')}</th>
                <th onClick={() => handleSort('prefCount')} style={thStyle}>想同桌{sortArrow('prefCount')}</th>
                <th onClick={() => handleSort('avoidCount')} style={thStyle}>要避桌{sortArrow('avoidCount')}</th>
                <th onClick={() => handleSort('dietaryNote')} style={thStyle}>飲食{sortArrow('dietaryNote')}</th>
                <th onClick={() => handleSort('specialNote')} style={thStyle}>特殊需求{sortArrow('specialNote')}</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest) => {
                const tableName = guest.assignedTableId ? tableNameMap.get(guest.assignedTableId) || '—' : '未排座'
                const satColor = guest.assignedTableId ? getSatisfactionColor(guest.satisfactionScore) : 'var(--text-muted)'
                const subcatName = guest.subcategory?.name ?? ''

                // Compute dynamic max companionCount based on table capacity
                let maxCompanion = 9
                let maxCompanionTooltip: string | undefined
                if (guest.assignedTableId) {
                  const table = tables.find((t) => t.id === guest.assignedTableId)
                  if (table) {
                    const othersSeats = guests
                      .filter((g) => g.assignedTableId === table.id && g.id !== guest.id && g.rsvpStatus === 'confirmed')
                      .reduce((sum, g) => sum + g.seatCount, 0)
                    maxCompanion = Math.min(9, table.capacity - othersSeats - 1)
                    if (maxCompanion <= guest.companionCount) {
                      const used = othersSeats + guest.seatCount
                      maxCompanionTooltip = `${table.name}已滿 (${used}/${table.capacity})`
                    }
                  }
                }

                // Seat preference guests (sorted by rank)
                const prefGuests = guest.seatPreferences
                  .slice().sort((a, b) => a.rank - b.rank)
                  .map((p) => guests.find((g) => g.id === p.preferredGuestId))
                  .filter(Boolean) as Guest[]

                // Avoid pair guests for this guest
                const avoidGuests = avoidPairs
                  .filter((ap) => ap.guestAId === guest.id || ap.guestBId === guest.id)
                  .map((ap) => {
                    const otherId = ap.guestAId === guest.id ? ap.guestBId : ap.guestAId
                    return guests.find((g) => g.id === otherId)
                  })
                  .filter(Boolean) as Guest[]

                return (
                  <GuestRow
                    key={guest.id}
                    guest={guest}
                    tableName={tableName}
                    satColor={satColor}
                    subcatName={subcatName}
                    maxCompanion={maxCompanion}
                    maxCompanionTooltip={maxCompanionTooltip}
                    prefGuests={prefGuests}
                    avoidGuests={avoidGuests}
                    categoryColors={effectiveColors}
                    catColor={getCategoryColor(guest.category, effectiveColors)}
                    onSave={(patch) => handleSave(guest.id, patch)}
                    onRsvpToggle={() => handleRsvpToggle(guest)}
                    onDelete={() => handleDelete(guest)}
                    onEdit={() => setEditingGuestId(guest.id)}
                  />
                )
              })}

              {/* Empty search result */}
              {filtered.length === 0 && guests.length > 0 && (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                  沒有符合的賓客
                </td></tr>
              )}

              {/* No guests at all */}
              {guests.length === 0 && (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '60px 24px' }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>尚無賓客</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>點擊下方新增或匯入名單</p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                    <button
                      onClick={() => setShowAddModal(true)}
                      style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm, 4px)', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-ui)', fontWeight: 500 }}
                    >
                      <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> 新增賓客
                    </button>
                    <button onClick={() => navigate(`/workspace/${eventId}/import`)} style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}>
                      匯入名單
                    </button>
                  </div>
                </td></tr>
              )}

            </tbody>
          </table>
        </div>

        {/* Floating add button */}
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            position: 'fixed', right: 32, bottom: 32, zIndex: 50,
            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 20px',
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-md, 8px)', cursor: 'pointer',
            fontSize: 14, fontFamily: 'var(--font-ui)', fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          <Plus size={16} /> 新增賓客
        </button>
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

      {/* Guest edit modal */}
      {editingGuestId && (() => {
        const editGuest = guests.find((g) => g.id === editingGuestId)
        if (!editGuest) return null
        return (
          <GuestFormModal
            mode="edit"
            guest={editGuest}
            categories={categories}
            subcategories={subcategories}
            tables={tables}
            guests={guests}
            avoidPairs={avoidPairs}
            categoryColors={effectiveColors}
            onSubmit={async (data) => {
              // Update basic fields
              await updateGuest(editGuest.id, {
                name: data.name,
                aliases: data.aliases,
                category: data.category,
                rsvpStatus: data.rsvpStatus,
                companionCount: data.companionCount,
                dietaryNote: data.dietaryNote,
                specialNote: data.specialNote,
              })
              // Move table if changed
              if (data.assignedTableId !== (editGuest.assignedTableId || null)) {
                moveGuest(editGuest.id, data.assignedTableId)
              }
              // Update preferences
              const prefs = data.preferredGuestIds.map((gid, i) => ({ preferredGuestId: gid, rank: i + 1 }))
              await updateGuestPreferences(editGuest.id, prefs)
              // Handle avoid pairs: remove old ones not in new list, add new ones not in old list
              const oldAvoidIds = avoidPairs
                .filter((ap) => ap.guestAId === editGuest.id || ap.guestBId === editGuest.id)
                .map((ap) => ({ pairId: ap.id, otherId: ap.guestAId === editGuest.id ? ap.guestBId : ap.guestAId }))
              for (const old of oldAvoidIds) {
                if (!data.avoidGuestIds.includes(old.otherId)) {
                  await removeAvoidPair(old.pairId)
                }
              }
              for (const gid of data.avoidGuestIds) {
                if (!oldAvoidIds.some((o) => o.otherId === gid)) {
                  await addAvoidPair(editGuest.id, gid)
                }
              }
              // Handle subcategory
              if (data.subcategoryName) {
                try {
                  await fetch(`/api/events/${eventId}/subcategories/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ assignments: [{ guestId: editGuest.id, subcategoryName: data.subcategoryName, category: data.category }] }),
                  })
                } catch {}
              } else if (editGuest.subcategory) {
                await setGuestSubcategory(editGuest.id, null)
              }
              // Reload to get fresh data
              const { loadEvent } = useSeatingStore.getState()
              if (eventId) await loadEvent(eventId)
              setEditingGuestId(null)
            }}
            onDelete={(gid) => { setEditingGuestId(null); handleDelete(guests.find((g) => g.id === gid)!) }}
            onClose={() => setEditingGuestId(null)}
          />
        )
      })()}
      {showAvoidModal && <AvoidPairModal onClose={() => setShowAvoidModal(false)} />}

      {/* Add guest modal */}
      {showAddModal && (
        <GuestFormModal
          mode="add"
          categories={categories}
          subcategories={subcategories}
          tables={tables}
          guests={guests}
          avoidPairs={avoidPairs}
          categoryColors={effectiveColors}
          onSubmit={async (data) => {
            const { subcategoryName, assignedTableId, preferredGuestIds, avoidGuestIds, ...guestData } = data
            const guest = await addGuest(guestData)
            if (guest) {
              if (assignedTableId) moveGuest(guest.id, assignedTableId)
              if (preferredGuestIds.length > 0) {
                const prefs = preferredGuestIds.map((gid, i) => ({ preferredGuestId: gid, rank: i + 1 }))
                await updateGuestPreferences(guest.id, prefs)
              }
              for (const gid of avoidGuestIds) {
                await addAvoidPair(guest.id, gid)
              }
              if (subcategoryName && data.category) {
                try {
                  await fetch(`/api/events/${eventId}/subcategories/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ assignments: [{ guestId: guest.id, subcategoryName, category: data.category }] }),
                  })
                } catch {}
              }
              const { loadEvent } = useSeatingStore.getState()
              if (eventId) await loadEvent(eventId)
              setShowAddModal(false)
              setToast({ message: `已新增 ${data.name}` })
            }
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}

// ─── Guest Row (read-only display + quick edits) ───

const GuestRow = ({ guest, tableName, satColor, subcatName, maxCompanion, maxCompanionTooltip, prefGuests, avoidGuests, catColor, categoryColors, onSave, onRsvpToggle, onDelete, onEdit }: {
  guest: Guest; tableName: string; satColor: string; subcatName: string
  maxCompanion: number; maxCompanionTooltip?: string
  prefGuests: Guest[]; avoidGuests: Guest[]
  catColor: CategoryColor; categoryColors: Record<string, CategoryColor>
  onSave: (patch: Partial<Guest>) => void; onRsvpToggle: () => void; onDelete: () => void
  onEdit: () => void
}) => {
  const [hovered, setHovered] = useState(false)

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onEdit}
      style={{ borderBottom: '1px solid var(--border)', background: hovered ? 'var(--accent-light)' : 'transparent', transition: 'background 50ms', cursor: 'pointer' }}
    >
      {/* Name + aliases */}
      <td style={tdStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 15, fontFamily: 'var(--font-body)', color: 'var(--text-primary)' }}>{guest.name}</span>
          {guest.aliases.length > 0 && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              ({guest.aliases.join('、')})
            </span>
          )}
        </div>
      </td>

      {/* Category (read-only badge) */}
      <td style={tdStyle}>
        {guest.category && (
          <span style={{ background: catColor.background, border: `1px solid ${catColor.border}`, color: catColor.color, padding: '1px 8px', borderRadius: 'var(--radius-sm, 4px)', fontSize: 14, fontFamily: 'var(--font-ui)', fontWeight: 500 }}>
            {guest.category}
          </span>
        )}
      </td>

      {/* Subcategory (read-only) */}
      <td style={tdStyle}>
        {subcatName ? (
          <span style={{
            padding: '1px 6px', borderRadius: 'var(--radius-sm, 4px)',
            border: '1px solid var(--border)', fontSize: 14, color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)',
          }}>{subcatName}</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>

      {/* Table (read-only) */}
      <td style={tdStyle}>
        <span style={{ color: guest.assignedTableId ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 15 }}>
          {tableName}
        </span>
      </td>

      {/* Satisfaction */}
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {guest.assignedTableId ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: 36, height: 36 }}>
            <svg width={36} height={36} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
              <circle cx={18} cy={18} r={15} fill="none" stroke="#E7E5E4" strokeWidth={2.5} />
              <circle cx={18} cy={18} r={15} fill="none" stroke={satColor} strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 15 * Math.min(guest.satisfactionScore / 100, 1)} ${2 * Math.PI * 15}`}
                style={{ transition: 'stroke-dasharray 400ms ease-out, stroke 400ms ease-out' }}
              />
            </svg>
            <span style={{ position: 'relative', color: satColor, fontFamily: 'var(--font-data)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
              {guest.satisfactionScore.toFixed(0)}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>

      {/* RSVP toggle (quick edit) */}
      <td style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
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

      {/* Attendee count stepper (quick edit) */}
      <td style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <NumberStepper value={guest.companionCount} min={0} max={maxCompanion} onSave={(v) => onSave({ companionCount: v })} maxTooltip={maxCompanionTooltip} />
      </td>

      {/* Seat preferences (read-only) */}
      <td style={tdStyle}>
        {prefGuests.length > 0 ? (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {prefGuests.map((g) => {
              const cc = getCategoryColor(g.category, categoryColors)
              return (
                <span key={g.id} style={{
                  padding: '1px 6px', borderRadius: 'var(--radius-sm, 4px)',
                  background: cc.background, border: `1px solid ${cc.border}`,
                  fontSize: 14, color: cc.color, fontFamily: 'var(--font-ui)',
                }}>{g.aliases.length > 0 ? g.aliases[0] : g.name}</span>
              )
            })}
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>

      {/* Avoid pairs (read-only) */}
      <td style={tdStyle}>
        {avoidGuests.length > 0 ? (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {avoidGuests.map((g) => {
              const cc = getCategoryColor(g.category, categoryColors)
              return (
                <span key={g.id} style={{
                  padding: '1px 6px', borderRadius: 'var(--radius-sm, 4px)',
                  background: cc.background, border: `1px solid ${cc.border}`,
                  fontSize: 14, color: cc.color, fontFamily: 'var(--font-ui)',
                }}>{g.aliases.length > 0 ? g.aliases[0] : g.name}</span>
              )
            })}
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>

      {/* Dietary note (read-only) */}
      <td style={tdStyle}>
        <span style={{ fontSize: 15, color: guest.dietaryNote ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
          {guest.dietaryNote || '—'}
        </span>
      </td>

      {/* Special note (read-only) */}
      <td style={tdStyle}>
        <span style={{ fontSize: 15, color: guest.specialNote ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
          {guest.specialNote || '—'}
        </span>
      </td>

      {/* Delete button */}
      <td style={{ width: 36, padding: '0 4px' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
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
  fontSize: 14, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase' as const, cursor: 'pointer', userSelect: 'none',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px', verticalAlign: 'middle',
}
