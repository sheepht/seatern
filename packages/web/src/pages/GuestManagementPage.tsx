import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { useSeatingStore } from '@/stores/seating'
import { getSatisfactionColor } from '@/lib/satisfaction'
import { Toolbar } from '@/components/workspace/Toolbar'
import type { Guest } from '@/lib/types'

// ─── Types ──────────────────────────────────────────

type SortField = 'name' | 'category' | 'rsvpStatus' | 'satisfactionScore' | 'assignedTableId'
type SortDir = 'asc' | 'desc'
type CategoryFilter = '全部' | string

// ─── Helpers ────────────────────────────────────────

const RSVP_LABELS: Record<string, string> = {
  confirmed: '確認',
  pending: '未回覆',
  declined: '婉拒',
  modified: '已修改',
}

const RSVP_CYCLE: string[] = ['confirmed', 'pending', 'declined']

function rsvpIcon(status: string) {
  if (status === 'confirmed') return '✓'
  if (status === 'declined') return '✗'
  return '?'
}

function rsvpColor(status: string) {
  if (status === 'confirmed') return 'var(--success)'
  if (status === 'declined') return 'var(--error)'
  return 'var(--warning)'
}

function categoryBadgeStyle(category: string | undefined) {
  if (category === '男方') return { background: '#DBEAFE', border: '1px solid #BFDBFE', color: '#1E40AF' }
  if (category === '女方') return { background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B' }
  return { background: '#F3F4F6', border: '1px solid #D1D5DB', color: '#374151' }
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
        borderRadius: 'var(--radius-md, 8px)', fontSize: 13, fontFamily: 'var(--font-body)',
        display: 'flex', alignItems: 'center', gap: 12, zIndex: 9999,
        boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
      }}
    >
      <span>{message}</span>
      {onUndo && (
        <button onClick={onUndo} style={{ color: 'var(--accent-light)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', fontSize: 13 }}>
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

function NumberStepper({ value, min, max, onSave }: { value: number; min: number; max: number; onSave: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={() => value > min && onSave(value - 1)}
        disabled={value <= min}
        style={{
          width: 22, height: 22, borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
          background: value <= min ? 'transparent' : 'var(--bg-surface)', cursor: value <= min ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          color: value <= min ? 'var(--text-muted)' : 'var(--text-secondary)',
        }}
      >−</button>
      <span style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', minWidth: 16, textAlign: 'center' }}>{value}</span>
      <button
        onClick={() => value < max && onSave(value + 1)}
        disabled={value >= max}
        style={{
          width: 22, height: 22, borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
          background: value >= max ? 'transparent' : 'var(--bg-surface)', cursor: value >= max ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          color: value >= max ? 'var(--text-muted)' : 'var(--text-secondary)',
        }}
      >+</button>
    </div>
  )
}

// ─── Row Expand ─────────────────────────────────────

function RowExpand({ guest, onSave }: { guest: Guest; onSave: (patch: Partial<Guest>) => void }) {
  return (
    <tr>
      <td colSpan={9} style={{ background: 'var(--bg-primary)', padding: '12px 16px 12px 48px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>別名</div>
            <div>{guest.aliases.length > 0 ? guest.aliases.join('、') : '—'}</div>
          </div>
          <div style={{ minWidth: 120 }}>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>關係分數</div>
            <div style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  onClick={() => onSave({ relationScore: s })}
                  style={{ cursor: 'pointer', fontSize: 16, color: s <= guest.relationScore ? 'var(--accent)' : 'var(--border)' }}
                >★</span>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>飲食備註</div>
            <EditableText value={guest.dietaryNote || ''} onSave={(v) => onSave({ dietaryNote: v })} placeholder="無" maxLength={100} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>特殊備註</div>
            <EditableText value={guest.specialNote || ''} onSave={(v) => onSave({ specialNote: v })} placeholder="無" maxLength={100} />
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── Delete Confirm Modal ───────────────────────────

function DeleteConfirmModal({ guestName, tableName, onConfirm, onCancel }: {
  guestName: string; tableName: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 12px)', padding: 24, maxWidth: 400, width: '90%', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>確定要刪除？</h3>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
          {guestName} 目前在{tableName}，刪除後該座位會空出。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}
          >取消</button>
          <button
            onClick={onConfirm}
            style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm, 4px)', border: 'none', background: 'var(--error)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500 }}
          >刪除</button>
        </div>
      </div>
    </div>
  )
}

// ─── Stats Bar ──────────────────────────────────────

function StatsBar({
  guests, tables, activeFilter, onFilterClick,
}: { guests: Guest[]; tables: { id: string; name: string }[]; activeFilter: CategoryFilter; onFilterClick: (status: string) => void }) {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed').length
  const pending = guests.filter((g) => g.rsvpStatus === 'pending').length
  const declined = guests.filter((g) => g.rsvpStatus === 'declined').length
  const totalSeats = guests.filter((g) => g.rsvpStatus === 'confirmed').reduce((s, g) => s + g.attendeeCount, 0)
  const assigned = guests.filter((g) => g.assignedTableId && g.rsvpStatus === 'confirmed')
  const avgSat = assigned.length > 0 ? assigned.reduce((s, g) => s + g.satisfactionScore, 0) / assigned.length : 0

  const statStyle = (active?: boolean) => ({
    display: 'flex', alignItems: 'baseline', gap: 4, cursor: 'pointer',
    padding: '4px 8px', borderRadius: 'var(--radius-sm, 4px)',
    background: active ? 'var(--accent-light)' : 'transparent',
  })

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '12px 0',
      fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={statStyle()} onClick={() => onFilterClick('confirmed')}>
        <span style={{ fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 20, color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{confirmed}</span>
        <span>確認</span>
      </div>
      <div style={statStyle()} onClick={() => onFilterClick('pending')}>
        <span style={{ fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 20, color: 'var(--warning)', fontVariantNumeric: 'tabular-nums' }}>{pending}</span>
        <span>未回覆</span>
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
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────

export default function GuestManagementPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const loadEvent = useSeatingStore((s) => s.loadEvent)
  const loading = useSeatingStore((s) => s.loading)
  const guests = useSeatingStore((s) => s.guests)
  const tables = useSeatingStore((s) => s.tables)
  const eventName = useSeatingStore((s) => s.eventName)
  const updateGuest = useSeatingStore((s) => s.updateGuest)
  const deleteGuest = useSeatingStore((s) => s.deleteGuest)
  const addGuest = useSeatingStore((s) => s.addGuest)

  // UI state
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('全部')
  const [rsvpFilter, setRsvpFilter] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ guestId: string; guestName: string; tableName: string } | null>(null)
  const [addingGuest, setAddingGuest] = useState(false)
  const [newGuestName, setNewGuestName] = useState('')
  const newGuestRef = useRef<HTMLInputElement>(null)
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Load event data
  useEffect(() => {
    if (eventId) loadEvent(eventId)
  }, [eventId, loadEvent])

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

  // Table name lookup
  const tableNameMap = new Map(tables.map((t) => [t.id, t.name]))

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
          // Restore by re-adding (simplified: reload event)
          if (eventId) loadEvent(eventId)
          setToast(null)
        },
      })
    }
  }, [deleteGuest, eventId, loadEvent, tableNameMap])

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

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const sortArrow = (field: SortField) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const handleRsvpFilterClick = (status: string) => {
    setRsvpFilter((prev) => prev === status ? null : status)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>載入中...</p>
      </div>
    )
  }

  // ─── Empty state ────────────────────────────────────
  if (guests.length === 0 && !addingGuest) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
        <Toolbar page="guests" />
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 24px', width: '100%' }}>
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>尚無賓客</h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>點擊下方新增或返回匯入名單</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setAddingGuest(true)} style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm, 4px)', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500 }}>
                <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> 新增賓客
              </button>
              <button onClick={() => navigate('/import')} style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}>
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
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      <Toolbar page="guests" />
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 24px', width: '100%' }}>

        {/* Stats Bar */}
        <StatsBar guests={guests} tables={tables} activeFilter={categoryFilter} onFilterClick={handleRsvpFilterClick} />

        {/* Search + Filter + Sort */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋姓名/暱稱..."
              style={{
                width: '100%', padding: '6px 10px 6px 30px', borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 13,
                fontFamily: 'var(--font-body)', color: 'var(--text-primary)', outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category segment */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm, 4px)', overflow: 'hidden' }}>
            {['全部', ...categories].map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategoryFilter(cat as CategoryFilter); setRsvpFilter(null) }}
                style={{
                  padding: '5px 12px', border: 'none', fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 500,
                  cursor: 'pointer',
                  background: categoryFilter === cat ? 'var(--accent)' : 'var(--bg-surface)',
                  color: categoryFilter === cat ? '#fff' : 'var(--text-secondary)',
                }}
              >{cat}</button>
            ))}
          </div>

          {/* RSVP filter badge */}
          {rsvpFilter && (
            <button
              onClick={() => setRsvpFilter(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)',
                background: 'var(--accent-light)', fontSize: 12, fontFamily: 'var(--font-ui)',
                cursor: 'pointer', color: 'var(--text-primary)',
              }}
            >
              {RSVP_LABELS[rsvpFilter] || rsvpFilter} <X size={12} />
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ width: 28 }} />
                <th onClick={() => handleSort('name')} style={thStyle}>姓名{sortArrow('name')}</th>
                <th onClick={() => handleSort('category')} style={thStyle}>分類{sortArrow('category')}</th>
                <th style={thStyle}>標籤</th>
                <th onClick={() => handleSort('assignedTableId')} style={thStyle}>桌次{sortArrow('assignedTableId')}</th>
                <th onClick={() => handleSort('satisfactionScore')} style={{ ...thStyle, textAlign: 'right' }}>滿意度{sortArrow('satisfactionScore')}</th>
                <th onClick={() => handleSort('rsvpStatus')} style={{ ...thStyle, textAlign: 'center' }}>出席{sortArrow('rsvpStatus')}</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>人數</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest) => {
                const expanded = expandedRows.has(guest.id)
                const tableName = guest.assignedTableId ? tableNameMap.get(guest.assignedTableId) || '—' : '未排座'
                const satColor = guest.assignedTableId ? getSatisfactionColor(guest.satisfactionScore) : 'var(--text-muted)'
                const tags = guest.guestTags.map((gt) => gt.tag.name)

                return (
                  <GuestRow
                    key={guest.id}
                    guest={guest}
                    expanded={expanded}
                    tableName={tableName}
                    satColor={satColor}
                    tags={tags}
                    onToggleExpand={() => toggleExpand(guest.id)}
                    onSave={(patch) => handleSave(guest.id, patch)}
                    onRsvpToggle={() => handleRsvpToggle(guest)}
                    onDelete={() => handleDelete(guest)}
                  />
                )
              })}

              {/* Empty search result */}
              {filtered.length === 0 && guests.length > 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                  沒有符合的賓客
                </td></tr>
              )}

              {/* Add guest row */}
              {addingGuest && (
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ width: 28 }} />
                  <td colSpan={7} style={{ padding: '8px 12px' }}>
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
                        fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
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
              cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500, color: 'var(--accent)',
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

const GuestRow = ({ guest, expanded, tableName, satColor, tags, onToggleExpand, onSave, onRsvpToggle, onDelete }: {
  guest: Guest; expanded: boolean; tableName: string; satColor: string; tags: string[]
  onToggleExpand: () => void; onSave: (patch: Partial<Guest>) => void; onRsvpToggle: () => void; onDelete: () => void
}) => {
  const [hovered, setHovered] = useState(false)

  return (
    <>
      <tr
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)', background: hovered ? 'var(--accent-light)' : 'transparent', transition: 'background 50ms' }}
      >
        {/* Expand toggle */}
        <td style={{ width: 28, padding: '0 0 0 8px', cursor: 'pointer' }} onClick={onToggleExpand}>
          {expanded ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
        </td>

        {/* Name */}
        <td style={tdStyle}>
          <EditableText value={guest.name} onSave={(v) => onSave({ name: v })} />
          {guest.aliases.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {guest.aliases.slice(0, 2).join('、')}
              {guest.aliases.length > 2 && <span> +{guest.aliases.length - 2}</span>}
            </div>
          )}
        </td>

        {/* Category */}
        <td style={tdStyle}>
          {guest.category && (
            <span style={{ ...categoryBadgeStyle(guest.category), padding: '1px 8px', borderRadius: 'var(--radius-sm, 4px)', fontSize: 11, fontFamily: 'var(--font-ui)', fontWeight: 500 }}>
              {guest.category}
            </span>
          )}
        </td>

        {/* Tags */}
        <td style={tdStyle}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {tags.slice(0, 2).map((t) => (
              <span key={t} style={{ padding: '1px 6px', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>{t}</span>
            ))}
            {tags.length > 2 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{tags.length - 2}</span>}
          </div>
        </td>

        {/* Table */}
        <td style={tdStyle}>
          <span style={{ color: guest.assignedTableId ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 12 }}>{tableName}</span>
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
          <NumberStepper value={guest.attendeeCount} min={1} max={10} onSave={(v) => onSave({ attendeeCount: v })} />
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

      {/* Expanded row */}
      {expanded && <RowExpand guest={guest} onSave={(patch) => onSave(patch)} />}
    </>
  )
}

// ─── Styles ─────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--font-ui)',
  fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase' as const, cursor: 'pointer', userSelect: 'none',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px', verticalAlign: 'middle',
}
